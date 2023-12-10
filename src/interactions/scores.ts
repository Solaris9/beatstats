import Discord from "discord.js";
import { WebSocket } from "ws";
import { drawCard } from "../drawing/scores/index";
import sequelize, * as DB from "../database";
import { Op, QueryTypes } from "sequelize";
import { Query, _Difficulty, _Leaderboard, _Score, _Song, _User } from "../database/manual";
import { checkPermission, timeAgo } from "../utils/utils.js";
import { Logger } from "../utils/logger.js";
import { beatleader } from "../api";
import { IScore } from "../types/beatleader";
import { Arg, Choices, SubCommand, Command, ChoiceValueTuple, createStringSelect, CommandContext, linkDiscordMessage } from "../framework.js";

const logger = new Logger("Live-Scores");

// Live scores
export const onceReady = async (client: Discord.Client) => {    
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

            const user = await DB.User.findOne({
                where: { beatleader: scoreData.playerId }
            });
   
            if (user) { 
                await DB.createSong(scoreData.leaderboard.song);
                await DB.createLeaderboard(scoreData.leaderboard);
                await DB.createSongDifficulty(scoreData.leaderboard);
                await DB.createModifierValues(scoreData.leaderboardId, scoreData.leaderboard.difficulty);
                await DB.createModifierRating(scoreData.leaderboardId, scoreData.leaderboard.difficulty);
                const score = await DB.createScore(scoreData);
                if (!score) return;

                const clans = await DB.Clan.findAll({ where: {
                    tag: { [Op.in]: user.clans.split(",") },
                    guild: { [Op.not]: null },
                    liveScoresChannel: { [Op.not]: null }
                }});

                for (let clan of clans) {

                    const guild = await client.guilds.fetch(clan.guild!) as Discord.Guild;
                    if (!guild) {
                        clan.guild = null
                        clan.liveScoresChannel = null
                        await clan.save();
                        continue;
                    }
        
                    const channel = await guild.channels.fetch(clan.liveScoresChannel!).catch(() => null) as Discord.GuildTextBasedChannel | null;
                    
                    const missing = await checkPermission([
                        Discord.PermissionFlagsBits.SendMessages,
                        Discord.PermissionFlagsBits.SendMessagesInThreads,
                        Discord.PermissionFlagsBits.AttachFiles,
                        Discord.PermissionFlagsBits.ViewChannel
                    ], channel);

                    if (!channel || missing) {
                        clan.liveScoresChannel = null
                        await clan.save();
                        continue;
                    }
                    
                    await DB.Stats.increment(["live_scores"], { by: 1, where: { id: 0 } });

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
    #interactions = {} as Record<string, Discord.CommandInteraction>;
    
    @SubCommand("Share a score by searching!")
    async search(
        ctx: CommandContext,
        @Choices(contexts)
        @Arg("The leaderboard context to use. Default: General ", Arg.Type.STRING) context: string | null,

        @Arg("The name search query.", Arg.Type.STRING) name: string | null,
        @Arg("The mapper search query.", Arg.Type.STRING) mapper: string | null,
        @Arg("The author search query.", Arg.Type.STRING) author: string | null,
    ) {
        await ctx.defer(true);

        const player = await ctx.user();
        if (!player) return;

        const options = ["name", "mapper", "author"];
        const values = { name, mapper, author };
        const hasAny = options.find(o => values[o]);
        
        if (!hasAny) {
            await ctx.edit("Please add either a `name`, `mapper` or `author` argument to the command.");
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
            await ctx.edit({
                content: "No scores found with that query.",
            });
            
            return;
        }

        if (results.length == 1) {
            await ctx.edit("Sending...");
            await sendScoreCard([results[0].scoreId], ctx.interaction.channel as Discord.GuildTextBasedChannel);
            return;
        }

        const selectScores = results.map(row => {
            const difficulty = DB.getDifficultyName(row.difficulty);
            const date = new Date(row.timeSet);

            let description = timeAgo(date.getTime());
            if (row.type == DB.LeaderboardType.Ranked) description += ` - ${row.pp}pp`;
            description += ` - ${(row.accuracy * 100).toFixed(2)}%`;
            
            return new Discord.StringSelectMenuOptionBuilder({
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
    
        const row = new Discord.ActionRowBuilder({ components: [select] });
        
        await ctx.edit({
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
        await ctx.defer(true);
        
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
        await ctx.defer(true);

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
        user: DB.User,
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
            if (score.leaderboard.difficulty.status == DB.LeaderboardType.Ranked) {
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

            return new Discord.StringSelectMenuOptionBuilder({
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
    
        const row = new Discord.ActionRowBuilder({ components: [select] });
        
        await ctx.edit({
            // @ts-ignore
            components: [row],
            ephemeral: true
        });

        this.#interactions[user.discord] = ctx.interaction;
    }

    async onStringSelect(interaction: Discord.StringSelectMenuInteraction) {
        const ids = interaction.values.map(Number);

        if (interaction.customId.endsWith("regular")) {
            const scores = this.#scores[interaction.user.id];

            if (!scores) {
                await interaction.update("This interaction is invalid. Please run the command again.");
                return;
            }

            for (let id of ids) {
                const score = scores.find(s => s.id == id)!;

                await DB.createSong(score.leaderboard.song);
                await DB.createLeaderboard(score.leaderboard);
                await DB.createSongDifficulty(score.leaderboard);
                await DB.createModifierValues(score.leaderboardId, score.leaderboard.difficulty);
                await DB.createModifierRating(score.leaderboardId, score.leaderboard.difficulty);
                await DB.createScore(score);
            }

            delete this.#scores[interaction.user.id];
        }

        const int = this.#interactions[interaction.user.id];
        try { await int.deleteReply() } catch { }

        await sendScoreCard(ids, interaction.channel as Discord.GuildTextBasedChannel, { isLive: false });
    }
}

type SendScoreOptions = Partial<{
    isLive: boolean;
    reply: Discord.MessageResolvable;
}>;

async function sendScoreCard(scoreIds: number[], channel: Discord.GuildTextBasedChannel, options?: SendScoreOptions) {
    const scores = await DB.Score.findAll({
        where: {
            scoreId: { [Op.in]: scoreIds }
        },
        include: [
            DB.User,
            DB.ScoreImprovement,
            {
                model: DB.Leaderboard,
                as: "leaderboard",
                include: [
                    {
                        model: DB.SongDifficulty,
                        include: [ DB.Song ]
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
        const replayButton = new Discord.ButtonBuilder()
            .setLabel("Replay")
            .setStyle(Discord.ButtonStyle.Link)
            .setURL(`http://replay.beatleader.xyz/?scoreId=${score.scoreId}`)
        const playerButton = new Discord.ButtonBuilder()
            .setLabel("Profile")
            .setStyle(Discord.ButtonStyle.Link)
            .setURL(`http://beatleader.xyz/u/${score.playerId}`)
        const leaderboardButton = new Discord.ButtonBuilder()
            .setLabel("Leaderboard")
            .setStyle(Discord.ButtonStyle.Link)
            .setURL(`http://beatleader.xyz/leaderboard/global/${score.leaderboardId}`)
        const compareButton = new Discord.ButtonBuilder()
            .setCustomId(`compare-${score.leaderboardId}-${user.beatleader}`)
            .setLabel("Compare")
            .setStyle(Discord.ButtonStyle.Primary)

        const row = new Discord.ActionRowBuilder({ components: [
            replayButton, playerButton, leaderboardButton
        ]
        });
        
        if (!options?.isLive) row.addComponents(compareButton);
        
        const file = await drawCard("minimal", score);
        if (file == null) continue;

        const difficulty = DB.getDifficultyName(score.leaderboard!.difficulty.difficulty);
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

export const onInteractionCreate = async (client: Discord.Client, interaction: Discord.Interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith("compare")) {
        const discord = interaction.user.id;
        const leaderboardId = interaction.customId.split("-")[1];
        const compareBeatleader = interaction.customId.split("-")[2];

        const user = await DB.createUser(DB.CreateUserMethod.Discord, discord);

        if (!user) {
            await interaction.reply({
                ephemeral: true,
                content: linkDiscordMessage
            });

            return;
        }

        let id: number;

        const score = await DB.Score.findOne({
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
            const dbLeaderboard = await DB.Leaderboard.findOne({
                where: { leaderboardId },
                include: [
                    {
                        model: DB.SongDifficulty,
                        include: [DB.Song]
                    }
                ]
            });

            const hash = dbLeaderboard!.difficulty.song.hash;
            const difficulty = DB.getDifficultyName(dbLeaderboard!.difficulty.difficulty, true);
            const mode = DB.getModeName(dbLeaderboard!.difficulty.mode);
    
            let score = await beatleader.score[user.beatleader][hash][difficulty][mode].get_json().catch(() => null);

            if (!score) {
                await interaction.reply({
                    ephemeral: true,
                    content: "You do not have a score on this leaderboard."
                });

                return;
            }

            score = await beatleader.score[score.id].get_json();
            const leaderboard = await beatleader.leaderboard[score.leaderboardId].get_json();

            await DB.createSong(leaderboard.song);
            await DB.createLeaderboard(leaderboard);
            await DB.createSongDifficulty(leaderboard);
            await DB.createModifierValues(leaderboardId, leaderboard.difficulty);
            await DB.createModifierRating(leaderboardId, leaderboard.difficulty);
            await DB.createScore(score);

            id = score.id
        }

        await interaction.reply({
            ephemeral: true,
            content: `Comparing score...`,
        });


        await sendScoreCard([id], interaction.channel as Discord.GuildTextBasedChannel, {
            reply: interaction.message
        });
    }
}