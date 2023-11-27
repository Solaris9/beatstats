import { GuildTextBasedChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChatInputCommandInteraction, TextBasedChannel, StringSelectMenuOptionBuilder, StringSelectMenuInteraction, CacheType, Client, CommandInteraction, AttachmentBuilder, Guild, PermissionFlagsBits, Interaction, MessageResolvable, DiscordAPIError } from "discord.js";
import { ChatInteractionOption, ChatInteractionOptionType, Command } from "../framework.js";
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

const contexts = [
    {
        name: "No Mods",
        value: "4"
    },
    {
        name: "No Pause",
        value: "8"
    },
    {
        name: "Golf",
        value: "16"
    }
];

export class ShareScoresCommand extends Command {
    constructor() {
        const context: ChatInteractionOption = {
            type: ChatInteractionOptionType.STRING,
            name: "context",
            description: "The leaderboard context to use. Default: General ",
            choices: contexts
        };

        const options = [
            context,
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
                        context,
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
        }, {
            permissions: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ViewChannel
            ]
        });
    }

    #scores = {} as Record<string, IScore[]>;
    #interactions = {} as Record<string, CommandInteraction>;

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        await interaction.deferReply({ ephemeral: true });
        const sub = interaction.options.getSubcommand(true);
        if (sub == "search") return await this.search(interaction);

        const int = this.#interactions[interaction.user.id];
        try { await int.deleteReply() } catch { }

        const discord = (interaction.options.getUser("user", false) ?? interaction.user).id;
        let user = await User.findOne({ where: { discord } });
        
        if (!user) {
            user = await createUser(CreateUserMethod.Discord, discord);

            if (!user) {
                await interaction.editReply({
                    content: linkDiscordMessage,
                });

                return;
            }
        }
    
        const leaderboardContext = interaction.options.getString("context", false) ?? "2";
        const sortBy = sub == "recent" ? "date" : "pp";

        const json = await beatleader.player[user.beatleader].scores.get_json({
            query: {
                sortBy,
                count: 25,
                leaderboardContext
            }
        });

        this.#scores[interaction.user.id] = json.data;

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
    
        const select = this.createStringSelect("regular")
            .setPlaceholder("Select up to 3 scores to share.")
            .setMinValues(1)
            .setMaxValues(3)
            .addOptions(selectScores);
    
        const row = new ActionRowBuilder({ components: [select] });
        
        await interaction.editReply({
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
            await interaction.editReply({
                content: "Please add either a `name`, `mapper` or `author` argument to the command.",
            });

            return;
        }

        const discord = (interaction.options.getUser("user", false) ?? interaction.user).id;

        const query = new Query()
            .select(_Score.scoreId, _Score.accuracy, _Score.pp, _Score.timeSet)
            .select(_Leaderboard.type)
            .select(_Difficulty.difficulty)
            .select(_Song.name, _Song.mapper)
            .from(_Score)
            .join(_User)
            .where(_User.beatleader, "=", _Score.playerId)
            .where(_User.discord, "=", discord)
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
            await interaction.editReply({
                content: "No scores found with that query.",
            });
            
            return;
        }

        if (results.length == 1) {
            await interaction.editReply("Sending...");
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
        
        await interaction.editReply({
            // @ts-ignore
            components: [row],
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
                            type: ChatInteractionOptionType.BOOLEAN,
                            name: "all",
                            description: "Whether to use all leaderboards",
                            required: true
                        },
                        {
                            type: ChatInteractionOptionType.DOUBLE,
                            name: "pp",
                            description: "The PP target to achieve",
                            required: true
                        },
                        {
                            type: ChatInteractionOptionType.BOOLEAN,
                            name: "comparison",
                            description: "Shows the increase needed, only works with all:False",
                        },
                        {
                            type: ChatInteractionOptionType.STRING,
                            name: "direction",
                            description: "The direction to sort",
                            choices: [
                                {
                                    name: "High -> Low",
                                    value: ">"
                                },
                                {
                                    name: "Low -> High",
                                    value: "<"
                                }
                            ]
                        },
                        {
                            type: ChatInteractionOptionType.STRING,
                            name: "sort",
                            description: "The order to sort the scores",
                            choices: [
                                {
                                    name: "Accuracy",
                                    value: "acc"
                                },
                                {
                                    name: "Stars",
                                    value: "stars"
                                },
                                {
                                    name: "Increase",
                                    value: "increase"
                                }
                            ]
                        },
                        {
                            type: ChatInteractionOptionType.BOOLEAN,
                            name: "modified-stars",
                            description: "Whether to filter using modified stars.",
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
        }, {
            permissions: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.SendMessagesInThreads,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ViewChannel
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

        const all = interaction.options.getBoolean("all", true);
        const pp = interaction.options.getNumber("pp", true);
        const comparison = interaction.options.getBoolean("comparison", false);
        const sort = interaction.options.getString("sort", false);
        const direction = interaction.options.getString("direction", false);
        const modifiedStars = interaction.options.getBoolean("modified-stars", false);

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

        if (!all) {
            const opts: any = {
                model: Score,
                as: "scores",
                where: {
                    playerId: user?.beatleader,
                }
            };

            if (comparison) opts.where!.pp = { [Op.lt]: pp }

            include.push(opts);
        };

        const leaderboards = await Leaderboard.findAll({
            where: { type: LeaderboardType.Ranked },
            include
        });

        type PotentialLeaderboard = {
            leaderboard: Leaderboard,
            requiredAcc: number,
            currentAcc: number,
            stars: number;
        };

        let scores = leaderboards
            .filter(l => {
                if (modifiedStars) return true;

                return (minStars && l.stars! > minStars) ||
                    (maxStars && l.stars! < maxStars)
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

                const res = {
                    leaderboard: l,
                    requiredAcc: acc * 100,
                    currentAcc: all ? 0 : l.scores[0].accuracy * 100,
                    stars: this.getStars(passRating, accRating, techRating)
                }

                if (modifiedStars && (
                    (minStars && res.stars! < minStars) ||
                    (maxStars && res.stars! > maxStars)
                )) return null;

                return res;
            })
            .filter(s => s != null && s.requiredAcc && s.leaderboard.difficulty)
            .sort((a, b) => a!.requiredAcc - b!.requiredAcc) as PotentialLeaderboard[];
        
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

        if (scores.length == 0) {
            await interaction.editReply("0 leaderboards found with that criteria, please try again with a different parameter.",);
            return;
        }
        
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
        const playlist = PlaylistUtils.build(lbs, `plays-for-${pp}-pp`, user);

        const content = [`leaderboards each worth ${pp}pp`];
        if (mods.length) content.push(`with ${mods.join("/")}`);

        if (minAcc) content.push(`higher than ${minAcc}%`);
        if (maxAcc) content.push(`lower than ${maxAcc}%`);

        if (minStars) content.push(`higher than ${minStars}\\*`);
        if (maxStars) content.push(`lower than ${maxStars}\\*`);

        const intl = new Intl.ListFormat("en", { style: "long" });

        await interaction.editReply({
            content: [lbs.length, content.length ? intl.format(content) : ""].join(" "),
            files: [text, playlist]
        });
    }

    async userScores(interaction: ChatInputCommandInteraction) {
        const option = interaction.options.getUser("user", false);
        const discord = (option ?? interaction.user).id;

        let user = await User.findOne({ where: { discord } });
        if (!user) {
            user = await createUser(CreateUserMethod.Discord, discord);

            if (!user) {
                await interaction.reply({
                    content: linkDiscordMessage,
                    ephemeral: true,
                });
                

                return;
            }
        }

        await interaction.deferReply();
        const content: string[] = [];

        const where: WhereOptions = {};
        const opts = interaction.options;

        const name = opts.getString("name", true);
        const type = opts.getString("type");
        
        const status = !type ? "" : type == "3" ? "ranked" : "unranked";

        const acc = [opts.getNumber("min-acc"), opts.getNumber("max-acc")];
        const pp = [opts.getNumber("min-pp"), opts.getNumber("max-pp")];

        if (acc[0] != null && acc[1] != null && acc[0] > acc[1]) {
            await interaction.editReply("Minimum accuracy cannot be higher than maximum accuracy.")
            return;
        }

        if (pp[0] != null && pp[1] != null && pp[0] > pp[1]) {
            await interaction.editReply("Minimum pp cannot be higher than maximum pp.")
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

        const leaderboards = [...new Set(scores.map(s => s.leaderboard!))];
        const intl = new Intl.ListFormat("en", { style: "long" });

        const file = PlaylistUtils.build(leaderboards, name, user);
        await interaction.editReply({
            content: [leaderboards.length, status, `leaderboards`, content.length ? intl.format(content) : ""].join(" "),
            files: [file]
        });
    }
}