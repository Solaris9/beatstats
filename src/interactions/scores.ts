import { GuildTextBasedChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChatInputCommandInteraction, TextBasedChannel, StringSelectMenuOptionBuilder, StringSelectMenuInteraction, CacheType, Client, CommandInteraction, AttachmentBuilder, Message, EmbedBuilder, Guild } from "discord.js";
import { ChatInteractionOptionType, Command } from "../framework.js";
import { WebSocket } from "ws";
import { ScoreImprovement, User, sequelize } from "../database";
import { drawCard } from "../drawing/scores/index";
import Song, { createSong } from "../database/models/Song.js";
import Leaderboard, { LeaderboardType, createLeaderboard } from "../database/models/Leaderboard.js";
import Difficulty, { createSongDifficulty, getDifficultyName } from "../database/models/SongDifficulty.js";
import ModifierValues, { createModifierValues, getModifier } from "../database/models/LeaderboardModifierValues.js";
import ModifierRatings, { createModifierRating } from "../database/models/LeaderboardModifierRatings.js";
import Score, { createScore } from "../database/models/Score.js";
import { Op, QueryTypes, WhereOptions } from "sequelize";
import { timeAgo } from "../utils/utils.js";
import { Logger } from "../utils/logger.js";
import { beatleader } from "../api";
import { IScore } from "../types/beatleader";
import PlaylistUtils from "../utils/PlaylistUtils";
import { Query, _Difficulty, _Leaderboard, _Score, _Song, _User } from "../database/manual";
import Clan from "../database/models/Clan";
import { createUser } from "../database/models/User.js";
import { linkDiscordMessage } from "./clan.js";

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
                    if (!channel) {
                        clan.liveScoresChannel = null
                        await clan.save();
                        continue;
                    }

                    await sendScoreCard([score.scoreId], channel, true);
                }
            }
        });
    }

    connectLiveScores();
};

export class ShareScoresCommand extends Command {
    constructor() {
        const options = [
            {
                type: ChatInteractionOptionType.USER,
                name: "user",
                description: "A user to share their scores."
            }
        ];

        super({
            name: "share",
            description: "Share your scores!",
            options: [
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "recent",
                    description: "Share your recent scores!",
                    options
                },
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "top",
                    description: "Share your top scores!",
                    options
                },
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "search",
                    description: "Share a score by searching!",
                    options: [
                        {
                            type: ChatInteractionOptionType.STRING,
                            name: "name",
                            description: "The name search query."
                        },
                        {
                            type: ChatInteractionOptionType.STRING,
                            name: "mapper",
                            description: "The mapper search query."
                        },
                        {
                            type: ChatInteractionOptionType.STRING,
                            name: "author",
                            description: "The author search query."
                        }
                    ]
                }
            ]
        })
    }

    #scores = {} as Record<string, IScore[]>;
    #interactions = {} as Record<string, CommandInteraction>;

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const sub = interaction.options.getSubcommand(true);
        if (sub == "search") return await this.search(interaction);

        const int = this.#interactions[interaction.user.id];
        try { await int.deleteReply() } catch { }

        const discord = (interaction.options.getUser("user", false) ?? interaction.user).id;
        const user = await createUser(discord, undefined, true);
    
        if (!user) {
            await interaction.reply({
                content: "You aren't linked to a BeatLeader profile. Please run /refresh",
                ephemeral: true
            });
            return;
        }
    
        const sortBy = sub == "recent" ? "date" : "pp";

        const json = await beatleader.player[user.beatleader].scores.get_json({
            query: {
                sortBy,
                count: 25
            }
        });

        this.#scores[interaction.user.id] = json.data;

        const selectScores = json.data.map(score => {
            const difficulty = score.leaderboard.difficulty;
            const difficultyName = difficulty.difficultyName.replace("Plus", "+");
    
            let description = timeAgo(Number(score.timeset));
            if (score.leaderboard.difficulty.status == LeaderboardType.Ranked) {
                description += ` - ${score.pp}pp - ${(score.accuracy * 100).toFixed(2)}%`;
            }

            const difficultyText = `[${difficultyName}]`;
            let songText = score.leaderboard.song.name;

            const length = songText.length + 1 + difficultyText.length;
            if (length > 100) {
                const difference = 96 - difficultyText.length;
                songText = songText.slice(0, difference) + "...";
            }
                        
            return new StringSelectMenuOptionBuilder({
                label: `${songText} [${difficultyText}]`,
                value: score.id.toString(),
                description
            });
        });
    
        const select = this.createStringSelect("regular")
            .setPlaceholder("Select up to 3 scores to share.")
            .setMinValues(1)
            .setMaxValues(3)
            .addOptions(selectScores);
    
        const row = new ActionRowBuilder({ components: [select] });
        
        await interaction.reply({
            // @ts-ignore
            components: [row],
            ephemeral: true
        });

        this.#interactions[interaction.user.id] = interaction;
    }

    async search(interaction: ChatInputCommandInteraction) {
        const options = ["name", "mapper", "author"];
        const hasAny = options.find(o => interaction.options.getString(o, false))
        if (!hasAny) {
            await interaction.reply({
                content: "Please add either a `name`, `mapper` or `author` argument to the command.",
                ephemeral: true
            });

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
            .where(_User.discord, "=", interaction.user.id)
            .join(_Leaderboard)
            .where(_Leaderboard.leaderboardId, "=", _Score.leaderboardId)
            .join(_Difficulty)
            .where(_Difficulty.leaderboardId, "=", _Leaderboard.leaderboardId)
            .join(_Song)
            .where(_Song.key, "=", _Difficulty.key);

        let replacements = {} as Record<string, string>;

        for (let option of options) {
            const value = interaction.options.getString(option, false);
            if (value != null) {
                query.where(_Song[option], "LIKE", Query.param(option));
                replacements[option] = `%${value}%`;
            }
        }

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
            await interaction.reply({
                content: "No scores found with that query.",
                ephemeral: true
            });
            
            return;
        }

        if (results.length == 1) {
            await interaction.reply({
                content: "Sending...",
                ephemeral: true
            });

            await sendScoreCard([results[0].scoreId], interaction.channel as GuildTextBasedChannel);
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

        const select = this.createStringSelect()
            .setPlaceholder("Select up to 3 scores to share.")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(selectScores);
    
        const row = new ActionRowBuilder({ components: [select] });
        
        await interaction.reply({
            // @ts-ignore
            components: [row],
            ephemeral: true
        });

        this.#interactions[interaction.user.id] = interaction;
    }

    async onStringSelect(interaction: StringSelectMenuInteraction<CacheType>) {
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

        await sendScoreCard(ids, interaction.channel as GuildTextBasedChannel, false);
    }
}

async function sendScoreCard(scoreIds: number[], channel: GuildTextBasedChannel, isLive?: boolean) {
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

    const user = scores[0].user;
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

        const row = new ActionRowBuilder({ components: [
            replayButton, playerButton, leaderboardButton
        ]});
        
        const file = await drawCard("minimal", score);

        const difficulty = getDifficultyName(score.leaderboard.difficulty.difficulty);
        const song = score.leaderboard.difficulty.song.name;
        const timeSet = score.timeSet.getTime();
    
        const inGuild = user.discord ? await channel.guild.members.fetch(user.discord).catch(() => null) : null;
        const prefix = inGuild ? `<@${score.user.discord}>` : score.user.name;

        const content = isLive ?
            `${prefix} set a new ${difficulty} score on ${song} <t:${timeSet}:R>!` :
            `${prefix}'s ${difficulty} score on ${song} set <t:${timeSet}:R>!`;
    
        await channel.send({
            content,
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

export class PlaylistCommand extends Command {
    constructor() {
        super({
            name: "playlist",
            description: "Generate a playlist",
            options: [
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "scores",
                    description: "Generate a playlist of your scores with a query.",
                    options: [
                        {
                            type: ChatInteractionOptionType.STRING,
                            name: "name",
                            description: "The name of this playlist.",
                            required: true
                        },
                        {
                            type: ChatInteractionOptionType.STRING,
                            name: "type",
                            description: "Filter to ranked or unranked scores, defaults to all.",
                            choices: [
                                {
                                    name: "Ranked",
                                    value: "3"
                                },
                                {
                                    name: "Unranked",
                                    value: "0"
                                }
                            ]
                        },
                        //#region acc
                        {
                            type: ChatInteractionOptionType.DOUBLE,
                            name: "min-acc",
                            description: "The minimum accuracy",
                            min_value: 0.0,
                            max_value: 100.0
                        },
                        {
                            type: ChatInteractionOptionType.DOUBLE,
                            name: "max-acc",
                            description: "The maximum accuracy",
                            min_value: 0.0,
                            max_value: 100.0
                        },
                        //#endregion acc
                        //#region pp
                        {
                            type: ChatInteractionOptionType.DOUBLE,
                            name: "min-pp",
                            description: "The minimum pp",
                            min_value: 0.0
                        },
                        {
                            type: ChatInteractionOptionType.DOUBLE,
                            name: "max-pp",
                            description: "The maximum pp",
                            min_value: 0.0
                        },
                        //#endregion
                    ]
                },
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "potential",
                    description: "Generate a playlist of maps for potential scores.",
                    options: [
                        {
                            type: ChatInteractionOptionType.DOUBLE,
                            name: "pp",
                            description: "The PP target to achieve",
                            required: true
                        },
                        {
                            type: ChatInteractionOptionType.DOUBLE,
                            name: "min-acc",
                            description: "The minimum accuracy set.",
                        },
                        {
                            type: ChatInteractionOptionType.DOUBLE,
                            name: "max-acc",
                            description: "The maximum accuracy set.",
                        },
                        {
                            type: ChatInteractionOptionType.DOUBLE,
                            name: "min-stars",
                            description: "The minimum stars set.",
                        },
                        {
                            type: ChatInteractionOptionType.DOUBLE,
                            name: "max-stars",
                            description: "The maximum stars set.",
                        },
                        {
                            type: ChatInteractionOptionType.BOOLEAN,
                            name: "sf",
                            description: "Include Super Fast modifier",
                        },
                        {
                            type: ChatInteractionOptionType.BOOLEAN,
                            description: "Include Faster Song modifier",
                            name: "fs"
                        },
                        {
                            type: ChatInteractionOptionType.BOOLEAN,
                            description: "Include Ghost Notes modifier",
                            name: "gn"
                        },
                        {
                            type: ChatInteractionOptionType.BOOLEAN,
                            description: "Include No Bombs modifier",
                            name: "nb"
                        },
                        {
                            type: ChatInteractionOptionType.BOOLEAN,
                            description: "Include No Walls modifier",
                            name: "no"
                        },
                        {
                            type: ChatInteractionOptionType.BOOLEAN,
                            description: "Include Slower Song modifier",
                            name: "ss"
                        },
                        {
                            type: ChatInteractionOptionType.BOOLEAN,
                            description: "Include No Arrows modifier",
                            name: "na"
                        }
                    ]
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const cmd = interaction.options.getSubcommand(true);
        if (cmd == "scores") this.userScores(interaction);
        else this.potentialScores(interaction);
    }

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

    async potentialScores(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        const user = await User.findOne({ where: { discord: interaction.user.id } });

        const pp = interaction.options.getNumber("pp", true);

        const minAcc = interaction.options.getNumber("min-acc", false);
        const maxAcc = interaction.options.getNumber("max-acc", false);

        const minStars = interaction.options.getNumber("min-stars", false);
        const maxStars = interaction.options.getNumber("max-stars", false);

        const sf = interaction.options.getBoolean("sf", false);
        const fs = interaction.options.getBoolean("fs", false);
        const ss = interaction.options.getBoolean("ss", false);
        const gn = interaction.options.getBoolean("gn", false);
        const nb = interaction.options.getBoolean("nb", false);
        const no = interaction.options.getBoolean("no", false);
        const na = interaction.options.getBoolean("na", false);

        const mods: string[] = [];

        if (sf || fs || ss) {
            if (sf) mods.push("SF");
            else if (fs) mods.push("FS");
            else mods.push("SS");
        }

        if (gn) mods.push("GN");
        if (na) mods.push("NA");
        if (nb) mods.push("NB");
        if (no) mods.push("NO");

        const leaderboards = await Leaderboard.findAll({
            where: { type: LeaderboardType.Ranked },
            include: [
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
            ]
        });

        const scores = leaderboards
            .filter(l => {
                if ((minStars && l.stars! < minStars) || (maxStars && l.stars! > maxStars)) return false;
                return true;
            })
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

                if ((maxAcc && (maxAcc / 100) < acc) || (minAcc && (minAcc / 100) > acc)) acc = 0;
                if (acc > 1) acc = 0;

                return {
                    leaderboard: l,
                    accuracy: acc * 100,
                    stars: this.getStars(passRating, accRating, techRating).toFixed(2)
                }
            })
            .filter(s => s.accuracy && s.leaderboard.difficulty)
            .sort((a, b) => a.accuracy - b.accuracy);
            
        const maps = scores.map(s => [
            s.accuracy.toFixed(4),
            s.stars,
            getDifficultyName(s.leaderboard.difficulty.difficulty),
            s.leaderboard.difficulty.song.name,
            `(${s.leaderboard.difficulty.key}:${s.leaderboard.leaderboardId})`
        ].join(" "));

        const buffer = Buffer.from(maps.join("\n"), "utf-8");
        const text = new AttachmentBuilder(buffer, { name: "maps.txt" });

        const lbs = [...new Set(scores.map(s => s.leaderboard))];
        const playlist = PlaylistUtils.build(lbs, `plays-for-${pp}-pp`, user);

        let content = `A list of maps that are worth ${pp}`;
        if (mods.length) content += ` with ${mods.join(", ")}`;

        if (minAcc) content += ` higher than ${minAcc}%`;
        if (maxAcc) {
            if (minAcc) content += ` and`;
            content += ` lower than ${maxAcc}%`;
        }

        await interaction.editReply({ content: `${content}.`, files: [text, playlist] });
    }

    async userScores(interaction: ChatInputCommandInteraction) {
        const option = interaction.options.getUser("user", false);
        const discord = (option ?? interaction.user).id;
        const user = await createUser(discord, undefined, true);

        if (!user) {
            await interaction.reply({
                content: linkDiscordMessage,
                ephemeral: true,
            });
            
            return;
        }

        await interaction.deferReply();

        const where: WhereOptions = {};
        const opts = interaction.options;

        const name = opts.getString("name", true);
        const type = opts.getString("type");

        const acc = [opts.getNumber("min-acc"), opts.getNumber("max-acc")];
        const pp = [opts.getNumber("pp-acc"), opts.getNumber("max-pp")];

        if (acc[0] != null && acc[1] != null && acc[0] > acc[1]) {
            await interaction.editReply("Minimum accuracy cannot be higher than maximum accuracy.")
            return;
        }

        if (pp[0] != null && pp[1] != null && pp[0] > pp[1]) {
            await interaction.editReply("Minimum pp cannot be higher than maximum pp.")
            return;
        }

        if (acc[0] != null) (where.accuracy = where.accuracy ?? {})[Op.gte] = (acc[0] / 100);
        if (acc[1] != null) (where.accuracy = where.accuracy ?? {})[Op.lte] = (acc[1] / 100);

        if (pp[0] != null) (where.pp = where.pp ?? {})[Op.gte] = pp[0];
        if (pp[1] != null) (where.pp = where.pp ?? {})[Op.lte] = pp[1];

        const scores = await Score.findAll({
            where,
            include: [
                {
                    model: User,
                    where: { beatleader: user.beatleader }
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

        const leaderboards = [...new Set(scores.map(s => s.leaderboard))];
        const file = PlaylistUtils.build(leaderboards, name, user);
        await interaction.editReply({ files: [file] });
    }
}