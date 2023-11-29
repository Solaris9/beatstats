import Discord, { ActionRowBuilder, ButtonBuilder, ButtonStyle, CacheType, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { User } from "../database";
import { beatleader } from "../api";
import { linkDiscordMessage } from "./clan";
import { CreateUserMethod, createUser } from "../database/models/User";
import { drawProfile } from "../drawing/profile";
import { Arg, Command } from "../framework";

@Command("refresh", "Refresh your profile to where it was last cached.")
export class RefreshMeCommand {
    async execute(
        interaction: ChatInputCommandInteraction,
        @Arg("Sync all of your scores from your profile.", Arg.Type.BOOLEAN) full: boolean | null
    ) {
        let user = await User.findOne({ where: { discord: interaction.user.id } });
        if (!user) {
            user = await createUser(CreateUserMethod.Discord, interaction.user.id);
            
            if (!user) {
                await interaction.reply({
                    ephemeral: true,
                    content: linkDiscordMessage
                });

                return;
            }
        }

        const resp = await interaction.reply({
            content: "Updating...",
            ephemeral: true
        });

        const force = !!interaction.options.getBoolean("force");
        await user.refresh(true, force);

        await resp.edit("Synced your profile!");
    }
}

@Command("profile", "Show your BeatLeader profile information.")
export class ProfileCommand {
    async execute(
        interaction: ChatInputCommandInteraction,
        @Arg("A user to view their profile.", Arg.Type.USER)
        user: Discord.User | null = interaction.user
    ) {
        await interaction.deferReply();

        let player = await User.findOne({ where: { discord: user!.id } });
        if (!player) {
            player = await createUser(CreateUserMethod.Discord, user!.id);

            if (!player) {
                await interaction.editReply({
                    content: linkDiscordMessage,
                });

                return;
            }
        }

        const profile = await beatleader.player[player.beatleader].get_json();

        const file = await drawProfile("minimal", player, profile);
        if (!file) {
            await interaction.editReply("Failed to generate image.");
            return;
        }

        const profileButton = new ButtonBuilder()
            .setLabel("View Profile")
            .setURL(`https://beatleader.xyz/u/${profile.id}`)
            .setStyle(ButtonStyle.Link)

        const row = new ActionRowBuilder()
            .addComponents(profileButton)

        await interaction.editReply({
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