import { ChatInputCommandInteraction, CacheType } from "discord.js";
import { ChatInteractionOptionType, Command } from "../framework";
import { trim } from "../utils/utils";
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
            description: "Shows info about the bot.",
            options: [
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "info",
                    description: "Shows info about the bot."
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const sub = interaction.options.getSubcommand();
        if (sub == "info") this.info(interaction);
    }

    async info(interaction: ChatInputCommandInteraction) {
        const stats = await Stats.findOne({ where: { id: 0 }}) as Stats;
        const cachedScores = await Score.count();
        const cachedUsers = await User.count();

        const parts = {
            "BeatLeader Requests": stats.beatleader_requests,
            "Live Scores Set": stats.live_scores,
            "Cached Scores": cachedScores,
            "Cached Users": cachedUsers
        };

        const content = Object.entries(parts)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n");

        await interaction.reply({
            content: `\`\`\`prolog\n${content}\`\`\``
        })
    }
}