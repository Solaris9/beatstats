import Discord, { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { beatleader } from "../api";
import { drawProfile } from "../drawing/profile";
import { Arg, BaseCommand, Command, CommandContext } from "../framework";

@Command("refresh", "Refresh your profile to where it was last cached.")
export class RefreshMeCommand extends BaseCommand {
    async execute(
        ctx: CommandContext,
        @Arg("Force sync all of your scores from your profile.", Arg.Type.BOOLEAN)
        force: boolean | null
    ) {
        await ctx.interaction.deferReply({ ephemeral: true });

        const player = await ctx.user();
        if (!player) return;

        await ctx.edit("Updating...");
        await player.refresh(true, !!force);
        await ctx.edit("Synced your profile!");
    }
}

@Command("profile", "Show your BeatLeader profile information.")
export class ProfileCommand {
    async execute(
        ctx: CommandContext,
        @Arg("A user to view their profile.", Arg.Type.USER)
        user: Discord.User | null = ctx.interaction.user
    ) {
        await ctx.interaction.deferReply();

        const player = await ctx.user(user?.id);
        if (!player) return;

        const profile = await beatleader.player[player.beatleader].get_json();

        const file = await drawProfile("minimal", player, profile);
        if (!file) {
            await ctx.edit("Failed to generate image.");
            return;
        }

        const profileButton = new ButtonBuilder()
            .setLabel("View Profile")
            .setURL(`https://beatleader.xyz/u/${profile.id}`)
            .setStyle(ButtonStyle.Link)

        const row = new ActionRowBuilder()
            .addComponents(profileButton)

        await ctx.edit({
            files: [file],
            content: "",
            // @ts-ignore
            components: [row]
        });

        // const scores = await Score.findAll({
        //     include: [
        //       { model: User, where: { discord } },
        //       { model: Leaderboard, where: { type: 3 } }
        //     ]
        // });
        
        // const sum = scores.reduce((a, c) => a + c.pp, 0);
        // const average = (sum / scores.length) || 0;

        // const profile = await beatleader.player[user.beatleader].get_json();
        // const number = Intl.NumberFormat("en", { maximumFractionDigits: 2 });

        // const embed = new EmbedBuilder()
        //     .setAuthor({
        //         name: profile.name,
        //         url: `https://beatleader.xyz/u/${user.beatleader}`,
        //     })
        //     .setThumbnail(profile.avatar)
        //     .addFields([
        //         {
        //             name: "Rank:",
        //             value: `#${number.format(profile.rank)} (#${number.format(profile.countryRank)} ${profile.country})`
        //         },
        //         {
        //             name: "PP:",
        //             inline: true,
        //             value: trim`Total: ${number.format(profile.pp)}pp
        //                     Avg: ${number.format(average)}pp
        //                     Acc: ${number.format(profile.accPp)}pp
        //                     Tech: ${number.format(profile.techPp)}pp
        //                     Pass: ${number.format(profile.passPp)}pp`
        //         },
        //         {
        //             name: "Top PP:",
        //             inline: true,
        //             value: trim`Top: ${number.format(profile.scoreStats.topPp)}pp
        //                     Pass: ${number.format(profile.scoreStats.topPassPP)}pp
        //                     Acc: ${number.format(profile.scoreStats.topAccPP)}pp
        //                     Tech: ${number.format(profile.scoreStats.topTechPP)}pp`
        //         },
        //         {
        //             name: "Accuracy:",
        //             inline: false,
        //             value: trim`Top: ${number.format(profile.scoreStats.topAccuracy * 100)}%
        //                         Avg: ${number.format(profile.scoreStats.averageAccuracy * 100)}%
        //                         Avg Ranked: ${number.format(profile.scoreStats.averageRankedAccuracy * 100)}%
        //                         Avg Weighted Ranked: ${number.format(profile.scoreStats.averageWeightedRankedAccuracy * 100)}%`
        //         },
        //         {
        //             name: "Scores:",
        //             inline: true,
        //             value: trim`SS+: ${profile.scoreStats.sspPlays}
        //                     SS: ${profile.scoreStats.ssPlays}
        //                     S+: ${profile.scoreStats.spPlays}
        //                     S: ${profile.scoreStats.sPlays}
        //                     A: ${profile.scoreStats.aPlays}`
        //         }
        //     ]);

        // await interaction.editReply({
        //     content: null,
        //     embeds: [embed]
        // });
    }
}