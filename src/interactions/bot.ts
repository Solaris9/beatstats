import { ChatInputCommandInteraction } from "discord.js";
import { Score, Stats, User } from "../database";
import { Arg, Command, SubCommand } from "../framework";

// declare module "../test.js" {
//     interface CustomOptions {
//         developer?: boolean;
//     }
// }

// @c("invite", "Sends the invite link to the bot.")
// export class botCommand {
//     @Custom({ developer: true, disabled: true })
//     async execute(
//         int: ChatInputCommandInteraction,
//     ) {
//         await int.reply("Test")
//     }
// }

@Command("invite", "Sends the invite for the bot.")
export class InviteCommand {
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply({
            content: "Click on this link to invite the bot!\n<https://discord.com/api/oauth2/authorize?client_id=1156310849439400047&scope=bot>"
        });
    }
}

@Command("bot", "Shows information about the bot.")
export class BotCommand {
    @SubCommand("Shows stats about the bot.")
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