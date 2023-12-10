import { Includeable, Op, WhereOptions } from "sequelize";
import Discord from "discord.js";
import * as DB from "../database";
import { Command, SubCommand, CommandContext, Arg, Choices, Bounds, linkDiscordMessage } from "../framework";
import PlaylistUtils from "../utils/PlaylistUtils";

@Command("playlist", "Generate a playlist")
export class PlaylistCommand {
    curve = [
        [1.0, 7.424],
        [0.999, 6.241],
        [0.9975, 5.158],
        [0.995, 4.010],
        [0.9925, 3.241],
        [0.99, 2.700],
        [0.9875, 2.303],
        [0.985, 2.007],
        [0.9825, 1.786],
        [0.98, 1.618],
        [0.9775, 1.490],
        [0.975, 1.392],
        [0.9725, 1.315],
        [0.97, 1.256],
        [0.965, 1.167],
        [0.96, 1.094],
        [0.955, 1.039],
        [0.95, 1.000],
        [0.94, 0.931],
        [0.93, 0.867],
        [0.92, 0.813],
        [0.91, 0.768],
        [0.9, 0.729],
        [0.875, 0.650],
        [0.85, 0.581],
        [0.825, 0.522],
        [0.8, 0.473],
        [0.75, 0.404],
        [0.7, 0.345],
        [0.65, 0.296],
        [0.6, 0.256],
        [0.0, 0.000]
    ];

    inflate(pp: number) {
        return (650 * Math.pow(pp, 1.3)) / Math.pow(650, 1.3);
    }

    getStars(passRating: number, accRating: number, techRating: number) {
        let passPP = 15.2 * Math.exp(Math.pow(passRating, 1 / 2.62)) - 30;
        if (!isFinite(passPP) || isNaN(passPP) || passPP < 0) passPP = 0;
    
        const accPP = 1.094 * accRating * 34;
        const techPP = Math.exp(1.9 * 0.96) * 1.08 * techRating;

        return this.inflate(passPP + accPP + techPP) / 52;
    }

    @SubCommand("Generate a playlist of maps for potential scores.")
    async potential(
        ctx: CommandContext,

        @Arg("Whether to use all leaderboards") all: boolean,
        @Arg("The PP target to achieve", Arg.Type.DOUBLE) pp: number,
    
        @Arg("Shows the increase needed, only works with all:False", Arg.Type.BOOLEAN)
        comparison: boolean | undefined,

        @Choices([
            ["High -> Low", ">"],
            ["Low -> High", "<"],
        ])
        @Arg("The direction to sort scores", Arg.Type.STRING)
        direction: string | null,

        @Choices([
            ["Accuracy", "acc"],
            ["Stars", "stars"],
            ["Increase (requires comparison:True)", "increase"],
        ])
        @Arg("The order to sort the scores", Arg.Type.STRING) sort: string | null,

        @Arg("Whether to filter using modified stars", Arg.Type.BOOLEAN) modified_stars: boolean | null,
        
        @Bounds({ min: 0, max: 100 })
        @Arg("The minimum accuracy set", Arg.Type.DOUBLE)
        min_acc: number | null,
        
        @Bounds({ min: 0, max: 100 })
        @Arg("The maximum accuracy set", Arg.Type.DOUBLE)
        max_acc: number | null,
        
        @Bounds({ min: 0 })
        @Arg("The minimum stars set", Arg.Type.DOUBLE)
        min_stars: number | null = 0,
        
        @Bounds({ min: 0 })
        @Arg("The maximum stars set", Arg.Type.DOUBLE)
        max_stars: number | null = 100,

        @Arg("Include Super Fast Song modifier", Arg.Type.BOOLEAN) sf: boolean | null,
        @Arg("Include Faster Song modifier", Arg.Type.BOOLEAN) fs: boolean | null,
        @Arg("Include Slower Song modifier", Arg.Type.BOOLEAN) ss: boolean | null,
        @Arg("Include Ghost Notes modifier", Arg.Type.BOOLEAN) gn: boolean | null,
        @Arg("Include No Bombs modifier", Arg.Type.BOOLEAN) nb: boolean | null,
        @Arg("Include No Walls modifier", Arg.Type.BOOLEAN) no: boolean | null,
        @Arg("Include No Arrows modifier", Arg.Type.BOOLEAN) na: boolean | null,
    ) {
        await ctx.defer();

        const player = await ctx.user(false);
        
        if (!all && !player) {
            await ctx.edit(`Unable to use \`all:False\` option without a Discord linked.\n${linkDiscordMessage}`);
            return;
        }

        const mods: string[] = [];

        if (sf) mods.push("SF");
        else if (fs) mods.push("FS");
        else if (ss) mods.push("SS");

        if (gn) mods.push("GN");
        if (na) mods.push("NA");
        if (nb) mods.push("NB");
        if (no) mods.push("NO");

        const include: Includeable[] = [
            {
                model: DB.SongDifficulty,
                include: [DB.Song]
            },
            {
                model: DB.LeaderboardModifierValues,
                as: "modifierValues"
            },
            {
                model: DB.LeaderboardModifierRatings,
                as: "modifierRating"
            }
        ];

        if (!all && player) {
            const opts: any = {
                model: DB.Score,
                as: "scores",
                where: {
                    playerId: player.beatleader,
                }
            };

            if (comparison) opts.where!.pp = { [Op.lt]: pp }

            include.push(opts);
        };

        const where: WhereOptions = {
            type: DB.LeaderboardType.Ranked
        };

        if (!modified_stars) {
            where.stars = {
                [Op.gte]: min_stars,
                [Op.lte]: max_stars,
            }
        }

        const leaderboards = await DB.Leaderboard.findAll({ where, include });

        type PotentialLeaderboard = {
            leaderboard: DB.Leaderboard,
            requiredAcc: number,
            currentAcc: number,
            stars: number;
        };

        let scores = leaderboards
            .map(l => {
                let acc: number = 0;
                let multiplier = 1;

                if (!l.modifierRating && (sf || fs || ss)) {
                    if (sf) multiplier += DB.getModifier(l.modifierValues, "sf");
                    else if (fs) multiplier += DB.getModifier(l.modifierValues, "fs");
                    else if (ss) multiplier += DB.getModifier(l.modifierValues, "ss");
                }

                if (gn) multiplier += DB.getModifier(l.modifierValues, "gn");
                if (na) multiplier += DB.getModifier(l.modifierValues, "na");
                if (nb) multiplier += DB.getModifier(l.modifierValues, "nb");
                if (no) multiplier += DB.getModifier(l.modifierValues, "no");

                const speed = sf ? "sf" : fs ? "fs" : ss ? "ss" : null;

                const passRating = ((l.modifierRating && speed) ? l.modifierRating[`${speed}PassRating`] : l.passRating!) * multiplier;
                const accRating = ((l.modifierRating && speed) ? l.modifierRating[`${speed}AccRating`] : l.accRating!) * multiplier;
                const techRating = ((l.modifierRating && speed) ? l.modifierRating[`${speed}TechRating`] : l.techRating!) * multiplier;

                let passPP = 15.2 * Math.exp(Math.pow(passRating, 1 / 2.62)) - 30;
                if (!isFinite(passPP) || isNaN(passPP) || passPP < 0) passPP = 0;

                for (let i = 0; i < this.curve.length; i++) {
                    const [cacc, weight] = this.curve[i];
                    
                    const accPP = weight * accRating * 34;
                    const techPP = Math.exp(1.9 * cacc) * 1.08 * techRating;
                    const total = this.inflate(passPP + accPP + techPP);
                
                    if (total <= pp) {
                        if (i == 0) {
                            acc = 0;
                            break;
                        }

                        const [pacc, pweight] = this.curve[i - 1];

                        const accPP = pweight * accRating! * 34;
                        const techPP = Math.exp(1.9 * pacc) * 1.08 * techRating;
                        const ptotal = this.inflate(passPP + accPP + techPP);
                    
                        const middle_dis = (pp - ptotal) / (total - ptotal);
                        acc = pacc + middle_dis * (cacc - pacc);
                        break;
                    }
                }

                if ((max_acc && (max_acc / 100) < acc) || (min_acc && (min_acc / 100) > acc)) acc = 0;
                if (acc > 1) acc = 0;

                const res = {
                    leaderboard: l,
                    requiredAcc: acc * 100,
                    currentAcc: all ? 0 : l.scores[0].accuracy * 100,
                    stars: this.getStars(passRating, accRating, techRating)
                }

                if (modified_stars && (
                    (res.stars! < min_stars!) ||
                    (res.stars! > max_stars!)
                )) return null;

                return res;
            })
            .filter(s => s != null && s.requiredAcc && s.leaderboard.difficulty) as PotentialLeaderboard[];

        if (scores.length == 0) {
            await ctx.edit("0 leaderboards found with that criteria, please try again with a different parameter.",);
            return;
        }
    
        if (sort) scores.sort((a, b) => {
            if (direction == "<") {
                let temp = a;
                a = b;
                b = temp;
            }

            if (sort == "stars") return b.stars - a.stars;
            else if (sort == "acc") return b.requiredAcc - a.requiredAcc;
            else return (b.requiredAcc - b.currentAcc) - (a.requiredAcc - a.currentAcc);
        });

        const maps = scores.map(s => [
            s.requiredAcc.toFixed(4),
            comparison ? `+${(s.requiredAcc - s.currentAcc).toFixed(4)}%` : null,
            s.stars.toFixed(2),
            DB.getDifficultyName(s.leaderboard.difficulty.difficulty),
            s.leaderboard.difficulty.song.name,
            `(${s.leaderboard.difficulty.key}:${s.leaderboard.leaderboardId})`
        ].filter(v => v != null).join(" "));

        maps.unshift(`Accuracy${comparison ? ` (+ comparison)` : ''}, Stars (w/ Mods), Difficulty, Name, (Map Key, Leaderboard ID)`);

        const buffer = Buffer.from(maps.join("\n"), "utf-8");
        const text = new Discord.AttachmentBuilder(buffer, { name: "maps.txt" });

        const lbs = [...new Set(scores.map(s => s.leaderboard))];
        const playlist = PlaylistUtils.build(lbs, `plays-for-${pp}-pp`, player);

        const content = [`leaderboards each worth ${pp}pp`];
        if (mods.length) content.push(`with ${mods.join("/")}`);

        if (min_acc) content.push(`higher than ${min_acc}%`);
        if (max_acc) content.push(`lower than ${max_acc}%`);

        if (min_stars != 0) content.push(`higher than ${min_stars}\\*`);
        if (max_stars != 100) content.push(`lower than ${max_stars}\\*`);

        const intl = new Intl.ListFormat("en", { style: "long" });

        await ctx.edit({
            content: [lbs.length, content.length ? intl.format(content) : ""].join(" "),
            files: [text, playlist]
        });
    }

    @SubCommand("Generate a playlist of your scores with a query.")
    async scores(
        ctx: CommandContext,
        @Arg("The name of the playlist.") name: string,
        @Choices([
            ["Ranked", "3"],
            ["Unranked", "0"]
        ])
        @Arg("Filter to ranked or unranked scores, defaults to all.", Arg.Type.STRING) type: string | null,

        @Bounds({ min: 0.0, max: 100.0 })
        @Arg("The minimum accuracy.", Arg.Type.DOUBLE) min_acc: number | null,
        @Bounds({ min: 0.0, max: 100.0 })
        @Arg("The maximum accuracy.", Arg.Type.DOUBLE) max_acc: number | null,
        @Bounds({ min: 0.0 })
        @Arg("The minimum pp.", Arg.Type.DOUBLE) min_pp: number | null,
        @Bounds({ min: 0.0 })
        @Arg("The maximum pp.", Arg.Type.DOUBLE) max_pp: number | null,
    ) {
        await ctx.defer();

        const player = await ctx.user();
        if (!player) return;

        const content: string[] = [];
        const where: WhereOptions = {};
        
        const status = !type ? "" : type == "3" ? "ranked" : "unranked";

        const acc = [min_acc, max_acc];
        const pp = [min_pp, max_pp];

        if (acc[0] != null && acc[1] != null && acc[0] > acc[1]) {
            await ctx.edit("Minimum accuracy cannot be higher than maximum accuracy.");
            return;
        }

        if (pp[0] != null && pp[1] != null && pp[0] > pp[1]) {
            await ctx.edit("Minimum pp cannot be higher than maximum pp.");
            return;
        }

        if (acc[0] != null) {
            (where.accuracy = where.accuracy ?? {})[Op.gte] = (acc[0] / 100);
            content.push(`higher than ${acc[0]}%`);
        }

        if (acc[1] != null) {
            (where.accuracy = where.accuracy ?? {})[Op.lte] = (acc[1] / 100);
            content.push(`lower than ${acc[1]}%`);
        }

        if (pp[0] != null) {
            (where.pp = where.pp ?? {})[Op.gte] = pp[0];
            content.push(`higher than ${pp[0]}pp`);
        }
        
        if (pp[1] != null) {
            (where.pp = where.pp ?? {})[Op.lte] = pp[1];
            content.push(`lower than ${pp[1]}pp`);
        }

        const scores = await DB.Score.findAll({
            where,
            include: [
                {
                    model: DB.User,
                    where: { beatleader: player.beatleader }
                },
                {
                    model: DB.Leaderboard,
                    where: (type ? ({ type: Number(type) }) : {}),
                    include: [
                        {
                            model: DB.SongDifficulty,
                            include: [DB.Song]
                        }
                    ]
                }
            ]
        });

        const leaderboards = [...new Set(scores.map(s => s.leaderboard!))];
        const intl = new Intl.ListFormat("en", { style: "long" });

        const file = PlaylistUtils.build(leaderboards, name, player);
        await ctx.edit({
            content: [leaderboards.length, status, `leaderboards`, content.length ? intl.format(content) : ""].join(" "),
            files: [file]
        });
    }
};