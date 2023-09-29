import { Client, Events, IntentsBitField, Partials } from "discord.js";
import { Leaderboard, createLeaderboard, createSong, createSongDifficulty, sequelize } from "./database/index.js";
import ModifierRatings, { createModifierRating } from "./database/models/LeaderboardModifierRatings.js";
import ModifierValues, { createModifierValues } from "./database/models/LeaderboardModifierValues.js";
import { registerFont } from "canvas";
import { rmdir, mkdir } from "fs/promises";
import { join } from "path";
import { Logger } from "./utils/logger.js";
import load from "./framework.js";
import cron from "node-cron";

// @ts-ignore
import { TOKEN, PREFIX, ownerId } from "../config.json";
import { checkPermission, exists } from "./utils/utils.js";
import Stats from "./database/models/Stats.js";

export const logger = new Logger("Bot");
logger.info("Starting...");

cron.schedule("0 0 * * *", async () => {
    const dir = join(process.cwd(), "cards");
    await rmdir(dir);
    await mkdir(dir);
});

cron.schedule("0 0 * * 0", async () => {
    const leaderboards = await Leaderboard.fetch();

    for (let leaderboard of leaderboards) {
        const { id: leaderboardId } = leaderboard;
        const dbLeaderboard = await Leaderboard.findOne({
            where: { leaderboardId },
            include: [
                ModifierRatings,
                ModifierValues,
            ]
        });
        
        if (!dbLeaderboard) {
            await createSong(leaderboard.song);
            await createLeaderboard(leaderboard);
            await createSongDifficulty(leaderboard);
        }

        await createModifierRating(leaderboard.id, leaderboard.difficulty, true);
        await createModifierValues(leaderboard.id, leaderboard.difficulty, true);
    }
});

const path = join(process.cwd(), "assets", "fonts");
// registerFont(join(path, "NotoSans-Regular.ttf"), { family: "NotoSans" });
registerFont(join(path, "SF-Compact-Text-Regular.ttf"), { family: "SF-Compact" });

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildVoiceStates
    ],
    partials: [
        Partials.Channel,
        Partials.Reaction,
        Partials.ThreadMember,
        Partials.GuildScheduledEvent
    ]
});

const {
    events,
    commands,
    interactions
} = load(client);

for (let [once, name, handle] of events) {
    client[once ? "once" : "on"](name, handle);
}

if (interactions.size) {
    client.on(Events.InteractionCreate, async interaction => {
        try {
            if (interaction.isChatInputCommand()) {
                const command = interactions.get(interaction.commandName);
                if (command) {
                    if (command.config?.permissions) {
                        const missing = await checkPermission(command.config.permissions, interaction);
                        
                        if (missing) {
                            await interaction.reply({
                                ephemeral: true,
                                content: missing
                            });

                            return;
                        }
                    }

                    if (command.config?.dev && interaction.user.id != ownerId) {
                        await interaction.reply({
                            ephemeral: true,
                            content: "You do not have permission to run this command."
                        });
                        return;
                    }

                    await command.execute!(interaction);
                }
            }

            if (interaction.isStringSelectMenu()) {
                const command = interactions.find(i => interaction.customId.startsWith(i.options.name));
                if (command) try {
                    await command.onStringSelect!(interaction);
                } catch (err: any) {
                    await interaction.channel?.send(logError(err));
                }
            }

            if (interaction.isButton()) {
                const command = interactions.find(i => interaction.customId.startsWith(i.options.name));
                if (command) try {
                    await command.onButtonClick!(interaction);
                } catch (err: any) {
                    await interaction.channel?.send(logError(err));
                }
            }
        } catch (err: any) {
            try {
                await interaction.channel?.send(logError(err));
            } catch (err: any) {
                logger.error("Fatal error:");
                console.error(err);
            }
        }
    });
}

if (commands.size) {
    client.on(Events.MessageCreate, async message => {
        if (
            !message.content.startsWith(PREFIX) ||
            message.author.bot ||
            message.channel.isDMBased()
        ) return;

        const [name, ...args] = message.content.slice(PREFIX.length).split(/\s+/);
        const command = commands.get(name.toLowerCase());
        if (command) {
            try {
                await command(client, message, args);
            } catch (err: any) {
                await message.channel.send(logError(err));
            }
        }
    });
}

// bot initialization
sequelize.sync()
    .then(async () => {
        const cardsDir = join(process.cwd(), "cards");
        if (!await exists(cardsDir)) await mkdir(cardsDir);

        const stats = await Stats.findOne();
        if (!stats) await Stats.create({ id: 0 });
    })
    .then(() => client.login(TOKEN))
    .then(() => logger.info("Ready"));

process.on("unhandledRejection", logger.error.bind(null));
process.on("uncaughtException", logger.error.bind(null));

function logError(err: Error) {
    const id = Math.random().toString(16).slice(2);

    logger.error(`An error occurred while executing a command (${id}):`);
    console.error(err);

    return `An error occurred while executing this command. (\`${id}\`)`;
}

// import { createServer } from "http";
// const server = createServer();

// server.on("request", async (req, res) => {
//     res.setHeader("Content-Type", "text/plain");
//     const url = new URL(`http://localhost:8080${req.url!}`);

//     if (req.method == "POST" && url.pathname == "/feed") {
//         console.log("post")
//         let body = '';
//         req.on('data', chunk => body += chunk);
//         req.on('end', () => {
//             console.log(body);
//             res.write('OK'); 
//             res.end(); 
//         });

//         return;
//     }
// });

// server.listen(8080, () => console.log("listing"));