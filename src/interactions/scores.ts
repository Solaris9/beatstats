import Discord, { GuildTextBasedChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuOptionBuilder, StringSelectMenuInteraction, Client, CommandInteraction, AttachmentBuilder, Guild, PermissionFlagsBits, Interaction, MessageResolvable } from "discord.js";
import { WebSocket } from "ws";
import { ScoreImprovement, Stats, User, sequelize } from "../database";
import { drawCard } from "../drawing/scores/index";
import Song, { createSong } from "../database/models/Song.js";
import Leaderboard, { LeaderboardType, createLeaderboard } from "../database/models/Leaderboard.js";
import Difficulty, { createSongDifficulty, getDifficultyName, getModeName } from "../database/models/SongDifficulty.js";
import ModifierValues, { createModifierValues, getModifier } from "../database/models/LeaderboardModifierValues.js";
import ModifierRatings, { createModifierRating } from "../database/models/LeaderboardModifierRatings.js";
import Score, { createScore } from "../database/models/Score.js";
import { Includeable, Op, QueryTypes, WhereOptions } from "sequelize";
import { checkPermission, timeAgo } from "../utils/utils.js";
import { Logger } from "../utils/logger.js";
import { beatleader } from "../api";
import { IScore } from "../types/beatleader";
import PlaylistUtils from "../utils/PlaylistUtils";
import { Query, _Difficulty, _Leaderboard, _Score, _Song, _User } from "../database/manual";
import Clan from "../database/models/Clan";
import { CreateUserMethod, createUser } from "../database/models/User.js";
import { Arg, Bounds, Choices, SubCommand, Command, ChoiceValueTuple, createStringSelect, CommandContext, linkDiscordMessage } from "../framework.js";

const logger = new Logger("Live-Scores");

// Live scores
export const onceReady = async (client: Client) => {    
    const connectLiveScores = () => {
        const socket = new WebSocket("wss://api.beatleader.xyz/scores");

        socket.on("error", logger.error);
        socket.on("open", async () => logger.info("Connected"));

        socket.on("close", async () => {
            logger.info("Closed, reconnecting in 10 seconds...");
            setTimeout(connectLiveScores, 10_000);
        });

        socket.on("message", async data => {
			const scoreData = JSON.parse(data.toString()) as IScore;

            const user = await User.findOne({
                where: { beatleader: scoreData.playerId }
            });
   
            if (user) { 
                await createSong(scoreData.leaderboard.song);
                await createLeaderboard(scoreData.leaderboard);
                await createSongDifficulty(scoreData.leaderboard);
                await createModifierValues(scoreData.leaderboardId, scoreData.leaderboard.difficulty);
                await createModifierRating(scoreData.leaderboardId, scoreData.leaderboard.difficulty);
                const score = await createScore(scoreData);
                if (!score) return;

                const clans = await Clan.findAll({ where: {
                    tag: { [Op.in]: user.clans.split(",") },
                    guild: { [Op.not]: null },
                    liveScoresChannel: { [Op.not]: null }
                }});

                for (let clan of clans) {

                    const guild = await client.guilds.fetch(clan.guild!) as Guild;
                    if (!guild) {
                        clan.guild = null
                        clan.liveScoresChannel = null
                        await clan.save();
                        continue;
                    }
        
                    const channel = await guild.channels.fetch(clan.liveScoresChannel!) as GuildTextBasedChannel;

                    const missing = await checkPermission([
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.SendMessagesInThreads,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ViewChannel
                    ], channel);

                    if (!channel || missing) {
                        clan.liveScoresChannel = null
                        await clan.save();
                        continue;
                    }
                    
                    await Stats.increment(["live_scores"], { by: 1, where: { id: 0 } });

                    await sendScoreCard([score.scoreId], channel, { isLive: true });
                }
            }
        });
    }

    connectLiveScores();
};

const contexts: ChoiceValueTuple = [
    ["No Mods", "4"],
    ["No Pause", "8"],
    ["Golf", "16"]
]

@Command("share", "Share your scores!")
export class ShareScoresCommand {
    #scores = {} as Record<string, IScore[]>;
    #interactions = {} as Record<string, CommandInteraction>;
    
    @SubCommand("Share a score by searching!")
    async search(
        ctx: CommandContext,
        @Choices(contexts)
        @Arg("The leaderboard context to use. Default: General ", Arg.Type.STRING) context: string | null,

        @Arg("The name search query.", Arg.Type.STRING) name: string | null,
        @Arg("The mapper search query.", Arg.Type.STRING) mapper: string | null,
        @Arg("The author search query.", Arg.Type.STRING) author: string | null,
    ) {
        await ctx.interaction.deferReply({ ephemeral: true });

        const player = await ctx.user();
        if (!player) return;

        const options = ["name", "mapper", "author"];
        const values = { name, mapper, author };
        const hasAny = options.find(o => values[o]);
        
        if (!hasAny) {
            await ctx.interaction.editReply("Please add either a `name`, `mapper` or `author` argument to the command.");
            return;
        }

        const query = new Query()
            .select(_Score.scoreId, _Score.accuracy, _Score.pp, _Score.timeSet)
            .select(_Leaderboard.type)
            .select(_Difficulty.difficulty)
            .select(_Song.name, _Song.mapper)
            .from(_Score)
            .join(_User)
            .where(_User.beatleader, "=", _Score.playerId)
            .where(_User.discord, "=", player.discord)
            .join(_Leaderboard)
            .where(_Leaderboard.leaderboardId, "=", _Score.leaderboardId)
            .join(_Difficulty)
            .where(_Difficulty.leaderboardId, "=", _Leaderboard.leaderboardId)
            .join(_Song)
            .where(_Song.key, "=", _Difficulty.key);

        let replacements = {} as Record<string, string>;

        for (let option of options) {
            const value = values[option];
            if (value != null) {
                query.where(_Song[option], "LIKE", Query.param(option));
                replacements[option] = `%${value}%`;
            }
        }

        query.limit(25);

        type Result = {
            scoreId: number,
            accuracy: number,
            pp: number,
            timeSet: string;
            type: number,
            difficulty: number,
            name: string
        };
       
        const results: Result[] = await sequelize.query(query.build(), {
            replacements,
            type: QueryTypes.SELECT
        });

        if (!results.length) {
            await ctx.interaction.editReply({
                content: "No scores found with that query.",
            });
            
            return;
        }

        if (results.length == 1) {
            await ctx.interaction.editReply("Sending...");
            await sendScoreCard([results[0].scoreId], ctx.interaction.channel as GuildTextBasedChannel);
            return;
        }

        const selectScores = results.map(row => {
            const difficulty = getDifficultyName(row.difficulty);
            const date = new Date(row.timeSet);

            let description = timeAgo(date.getTime());
            if (row.type == LeaderboardType.Ranked) description += ` - ${row.pp}pp`;
            description += ` - ${(row.accuracy * 100).toFixed(2)}%`;
            
            return new StringSelectMenuOptionBuilder({
                label: `[${difficulty}] ${row.name}`,
                value: row.scoreId.toString(),
                description
            });
        });

        const select = createStringSelect(ShareScoresCommand)
            .setPlaceholder("Select up to 3 scores to share.")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(selectScores);
    
        const row = new ActionRowBuilder({ components: [select] });
        
        await ctx.interaction.editReply({
            // @ts-ignore
            components: [row],
        });

        this.#interactions[player.discord] = ctx.interaction;
    }

    @SubCommand("Share your recent scores!")
    async recent(
        ctx: CommandContext,
        @Arg("A user to share their scores.", Arg.Type.USER)
        user: Discord.User | null = ctx.interaction.user,

        @Choices(contexts)
        @Arg("The leaderboard context to use. Default: General ", Arg.Type.STRING) context: string | null
    ) {
        await ctx.interaction.deferReply({ ephemeral: true });

        const player = await ctx.user(user!.id);
        if (!player) return;

        const sortBy = "date";
        const leaderboardContext = context ?? "2";
        
        this.topAndRecent(ctx, leaderboardContext, sortBy, player);
    }

    @SubCommand("Share your top scores!")
    async top(
        ctx: CommandContext,
        @Arg("A user to share their scores.", Arg.Type.USER)
        user: Discord.User | null = ctx.interaction.user,

        @Choices(contexts)
        @Arg("The leaderboard context to use. Default: General ", Arg.Type.STRING) context: string | null
    ) {
        await ctx.interaction.deferReply({ ephemeral: true });

        const player = await ctx.user(user!.id);
        if (!player) return;

        const sortBy = "pp";
        const leaderboardContext = context ?? "2";

        this.topAndRecent(ctx, leaderboardContext, sortBy, player);
    }

    async topAndRecent(
        ctx: CommandContext,
        leaderboardContext: string,
        sortBy: string,
        user: User,
    ) {
        const old = this.#interactions[user.discord];
        try { await old.deleteReply() } catch { }
    
        const json = await beatleader.player[user.beatleader].scores.get_json({
            query: {
                sortBy,
                count: 25,
                leaderboardContext
            }
        });

        this.#scores[user.discord] = json.data;

        const selectScores = json.data.map(score => {
            const difficulty = score.leaderboard.difficulty;
            const difficultyName = difficulty.difficultyName.replace("Plus", "+");
    
            let description = timeAgo(Number(score.timeset));
            if (score.leaderboard.difficulty.status == LeaderboardType.Ranked) {
                description += ` - ${score.pp}pp`;
            }

            description += ` - ${(score.accuracy * 100).toFixed(2)}%`;

            const difficultyText = `[${difficultyName}]`;
            let songText = score.leaderboard.song.name;

            const length = songText.length + 1 + difficultyText.length;
            if (length > 100) {
                const difference = 96 - difficultyText.length;
                songText = songText.slice(0, difference) + "...";
            }

            return new StringSelectMenuOptionBuilder({
                label: `${songText} ${difficultyText}`,
                value: score.id.toString(),
                description
            });
        });
    
        const select = createStringSelect(ShareScoresCommand, "regular")
            .setPlaceholder("Select up to 3 scores to share.")
            .setMinValues(1)
            .setMaxValues(3)
            .addOptions(selectScores);
    
        const row = new ActionRowBuilder({ components: [select] });
        
        await ctx.interaction.editReply({
            // @ts-ignore
            components: [row],
            ephemeral: true
        });

        this.#interactions[user.discord] = ctx.interaction;
    }

    async onStringSelect(interaction: StringSelectMenuInteraction) {
        const ids = interaction.values.map(Number);

        if (interaction.customId.endsWith("regular")) {
            const scores = this.#scores[interaction.user.id];

            if (!scores) {
                await interaction.update("This interaction is invalid. Please run the command again.");
                return;
            }

            for (let id of ids) {
                const score = scores.find(s => s.id == id)!;

                await createSong(score.leaderboard.song);
                await createLeaderboard(score.leaderboard);
                await createSongDifficulty(score.leaderboard);
                await createModifierValues(score.leaderboardId, score.leaderboard.difficulty);
                await createModifierRating(score.leaderboardId, score.leaderboard.difficulty);
                await createScore(score);
            }

            delete this.#scores[interaction.user.id];
        }

        const int = this.#interactions[interaction.user.id];
        try { await int.deleteReply() } catch { }

        await sendScoreCard(ids, interaction.channel as GuildTextBasedChannel, { isLive: false });
    }
}

type SendScoreOptions = Partial<{
    isLive: boolean;
    reply: MessageResolvable;
}>;

async function sendScoreCard(scoreIds: number[], channel: GuildTextBasedChannel, options?: SendScoreOptions) {
    const scores = await Score.findAll({
        where: {
            scoreId: { [Op.in]: scoreIds }
        },
        include: [
            User,
            ScoreImprovement,
            {
                model: Leaderboard,
                as: "leaderboard",
                include: [
                    {
                        model: Difficulty,
                        include: [ Song ]
                    }
                ]
            }
        ]
    });

    if (!scores.length) return;

    const user = scores[0].user!;
    if (!user.name) {
        const profile = await beatleader.player[user.beatleader].get_json();
    
        user.name = profile.name;
        user.country = profile.country;
        user.avatar = profile.avatar;
        await user.save();
    }        

    for (let score of scores) {
        const replayButton = new ButtonBuilder()
            .setLabel("Replay")
            .setStyle(ButtonStyle.Link)
            .setURL(`http://replay.beatleader.xyz/?scoreId=${score.scoreId}`)
        const playerButton = new ButtonBuilder()
            .setLabel("Profile")
            .setStyle(ButtonStyle.Link)
            .setURL(`http://beatleader.xyz/u/${score.playerId}`)
        const leaderboardButton = new ButtonBuilder()
            .setLabel("Leaderboard")
            .setStyle(ButtonStyle.Link)
            .setURL(`http://beatleader.xyz/leaderboard/global/${score.leaderboardId}`)
        const compareButton = new ButtonBuilder()
            .setCustomId(`compare-${score.leaderboardId}-${user.beatleader}`)
            .setLabel("Compare")
            .setStyle(ButtonStyle.Primary)

        const row = new ActionRowBuilder({ components: [
            replayButton, playerButton, leaderboardButton
        ]
        });
        
        if (!options?.isLive) row.addComponents(compareButton);
        
        const file = await drawCard("minimal", score);
        if (file == null) continue;

        const difficulty = getDifficultyName(score.leaderboard!.difficulty.difficulty);
        const song = score.leaderboard!.difficulty.song.name;
        const timeSet = score.timeSet.getTime();
    
        const inGuild = user.discord ? await channel.client.users.fetch(user.discord).catch(() => null) : null;
        const prefix = inGuild ? `<@${score.user!.discord}>` : score.user!.name;

        const content = options?.isLive ?
            `${prefix} set a new ${difficulty} score on ${song} <t:${timeSet}:R>!` :
            `${prefix}'s ${difficulty} score on ${song} set <t:${timeSet}:R>!`;
    
        await channel.send({
            content,
            reply: options?.reply ? { messageReference: options.reply } : undefined,
            files: [file],
            // @ts-ignore    
            components: [row],
            allowedMentions: {
                users: [],
                roles: []
            }
        });
    }
}

export const onInteractionCreate = async (client: Client, interaction: Interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith("compare")) {
        const discord = interaction.user.id;
        const leaderboardId = interaction.customId.split("-")[1];
        const compareBeatleader = interaction.customId.split("-")[2];

        const user = await createUser(CreateUserMethod.Discord, discord);

        if (!user) {
            await interaction.reply({
                ephemeral: true,
                content: linkDiscordMessage
            });

            return;
        }

        let id: number;

        const score = await Score.findOne({
            where: {
                playerId: user.beatleader,
                leaderboardId
            }
        });

        if (score) {
            if (score.playerId == compareBeatleader) {
                await interaction.reply({
                    ephemeral: true,
                    content: "Sorry, you can't compare against your own score."
                });

                return;
            }

            id = score.scoreId
        } else {
            const dbLeaderboard = await Leaderboard.findOne({
                where: { leaderboardId },
                include: [
                    {
                        model: Difficulty,
                        include: [Song]
                    }
                ]
            });

            const hash = dbLeaderboard!.difficulty.song.hash;
            const difficulty = getDifficultyName(dbLeaderboard!.difficulty.difficulty, true);
            const mode = getModeName(dbLeaderboard!.difficulty.mode);
    
            let score = await beatleader.score[user.beatleader][hash][difficulty][mode]
            .get_json().catch(() => null);

            if (!score) {
                await interaction.reply({
                    ephemeral: true,
                    content: "You do not have a score on this leaderboard."
                });

                return;
            }

            score = await beatleader.score[score.id].get_json();
            const leaderboard = await beatleader.leaderboard[score.leaderboardId].get_json();

            await createSong(leaderboard.song);
            await createLeaderboard(leaderboard);
            await createSongDifficulty(leaderboard);
            await createModifierValues(leaderboardId, leaderboard.difficulty);
            await createModifierRating(leaderboardId, leaderboard.difficulty);
            await createScore(score);

            id = score.id
        }

        await interaction.reply({
            ephemeral: true,
            content: `Comparing score...`,
        });


        await sendScoreCard([id], interaction.channel as GuildTextBasedChannel, {
            reply: interaction.message
        });
    }
}

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
        @Arg("Shows the increase needed, only works with all:False", Arg.Type.STRING)
        direction: string | null,

        @Choices([
            ["Accuracy", "acc"],
            ["Stars", "stars"],
            ["Increase", "increase"],
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
        await ctx.interaction.deferReply();
        const player = await ctx.user(false);
        
        if (all && !player) {
            await ctx.interaction.editReply(`Unable to use \`all\` option without a Discord linked.\n${linkDiscordMessage}`);
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
                model: Difficulty,
                include: [Song]
            },
            {
                model: ModifierValues,
                as: "modifierValues"
            },
            {
                model: ModifierRatings,
                as: "modifierRating"
            }
        ];

        if (!all && player) {
            const opts: any = {
                model: Score,
                as: "scores",
                where: {
                    playerId: player.beatleader,
                }
            };

            if (comparison) opts.where!.pp = { [Op.lt]: pp }

            include.push(opts);
        };

        const where: WhereOptions = {
            type: LeaderboardType.Ranked
        };

        if (!modified_stars) {
            where.stars = {
                [Op.gte]: min_stars,
                [Op.lte]: max_stars,
            }
        }

        const leaderboards = await Leaderboard.findAll({ where, include });

        type PotentialLeaderboard = {
            leaderboard: Leaderboard,
            requiredAcc: number,
            currentAcc: number,
            stars: number;
        };

        let scores = leaderboards
            .map(l => {
                let acc: number = 0;
                let multiplier = 1;

                if (!l.modifierRating && (sf || fs || ss)) {
                    if (sf) multiplier += getModifier(l.modifierValues, "sf");
                    else if (fs) multiplier += getModifier(l.modifierValues, "fs");
                    else if (ss) multiplier += getModifier(l.modifierValues, "ss");
                }

                if (gn) multiplier += getModifier(l.modifierValues, "gn");
                if (na) multiplier += getModifier(l.modifierValues, "na");
                if (nb) multiplier += getModifier(l.modifierValues, "nb");
                if (no) multiplier += getModifier(l.modifierValues, "no");

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
            await ctx.interaction.editReply("0 leaderboards found with that criteria, please try again with a different parameter.",);
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
            getDifficultyName(s.leaderboard.difficulty.difficulty),
            s.leaderboard.difficulty.song.name,
            `(${s.leaderboard.difficulty.key}:${s.leaderboard.leaderboardId})`
        ].filter(v => v != null).join(" "));

        maps.unshift(`Accuracy${comparison ? ` (+ comparison)` : ''}, Stars (w/ Mods), Difficulty, Name, (Map Key, Leaderboard ID)`);

        const buffer = Buffer.from(maps.join("\n"), "utf-8");
        const text = new AttachmentBuilder(buffer, { name: "maps.txt" });

        const lbs = [...new Set(scores.map(s => s.leaderboard))];
        const playlist = PlaylistUtils.build(lbs, `plays-for-${pp}-pp`, player);

        const content = [`leaderboards each worth ${pp}pp`];
        if (mods.length) content.push(`with ${mods.join("/")}`);

        if (min_acc) content.push(`higher than ${min_acc}%`);
        if (max_acc) content.push(`lower than ${max_acc}%`);

        if (min_stars != 0) content.push(`higher than ${min_stars}\\*`);
        if (max_stars != 100) content.push(`lower than ${max_stars}\\*`);

        const intl = new Intl.ListFormat("en", { style: "long" });

        await ctx.interaction.editReply({
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
        await ctx.interaction.deferReply();

        const player = await ctx.user();
        if (!player) return;

        const content: string[] = [];
        const where: WhereOptions = {};
        
        const status = !type ? "" : type == "3" ? "ranked" : "unranked";

        const acc = [min_acc, max_acc];
        const pp = [min_pp, max_pp];

        if (acc[0] != null && acc[1] != null && acc[0] > acc[1]) {
            await ctx.interaction.editReply("Minimum accuracy cannot be higher than maximum accuracy.");
            return;
        }

        if (pp[0] != null && pp[1] != null && pp[0] > pp[1]) {
            await ctx.interaction.editReply("Minimum pp cannot be higher than maximum pp.");
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

        const scores = await Score.findAll({
            where,
            include: [
                {
                    model: User,
                    where: { beatleader: player.beatleader }
                },
                {
                    model: Leaderboard,
                    where: (type ? ({ type: Number(type) }) : {}),
                    include: [
                        {
                            model: Difficulty,
                            include: [Song]
                        }
                    ]
                }
            ]
        });

        const leaderboards = [...new Set(scores.map(s => s.leaderboard!))];
        const intl = new Intl.ListFormat("en", { style: "long" });

        const file = PlaylistUtils.build(leaderboards, name, player);
        await ctx.interaction.editReply({
            content: [leaderboards.length, status, `leaderboards`, content.length ? intl.format(content) : ""].join(" "),
            files: [file]
        });
    }
};