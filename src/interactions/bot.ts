import { ChatInputCommandInteraction, CacheType } from "discord.js";
import { ChatInteractionOptionType, Command } from "../framework";
import { Score, Stats, User } from "../database";

export class InviteCommand extends Command {
    constructor() {
        super({
            name: "invite",
            description: "Sends the invite link for the bot."
        });
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        await interaction.reply({
            content: "Click on this link to invite the bot!\n<https://discord.com/api/oauth2/authorize?client_id=1156310849439400047&scope=bot>"
        });
    }
}

export class BotCommand extends Command {
    constructor() {
        super({
            name: "bot",
            description: "Shows information about the bot.",
            options: [
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "stats",
                    description: "Shows stats about the bot."
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const sub = interaction.options.getSubcommand();
        if (sub == "stats") this.stats(interaction);
    }

    async stats(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const stats = await Stats.findOne({ where: { id: 0 }}) as Stats;
        const cachedScores = await Score.count();
        const cachedUsers = await User.count();

        const botUsers = interaction.client.guilds.cache
            .reduce((a, c) => a + c.memberCount, 0);

        const parts = {
            "BeatLeader Requests": stats.beatleader_requests,
            "Live Scores Set": stats.live_scores,
            "Cached Scores": cachedScores,
            "Cached Users": cachedUsers,
            "Bot Users": botUsers,
            "Bot Guilds": interaction.client.guilds.cache.size,
        };

        const content = Object.entries(parts)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n");

        await interaction.editReply({
            content: `\`\`\`prolog\n${content}\`\`\``
        })
    }
}