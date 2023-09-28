import { CacheType, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { ChatInteractionOptionType, Command } from "../framework";
import { Leaderboard, Score, User } from "../database";
import { beatleader } from "../api";
import { EmbedBuilder } from "@discordjs/builders";
import { trim } from "../utils/utils";
import { linkDiscordMessage } from "./clan";
import { CreateUserMethod, createUser } from "../database/models/User";

export class RefreshMeCommand extends Command {
    constructor() {
        super({
            name: "refresh",
            description: "Refresh your profile to where it was last cached.",
            options: [
                {
                    type: ChatInteractionOptionType.BOOLEAN,
                    name: "full",
                    description: "Sync all scores from your profile.",
                    required: false
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
        let user = await User.findOne({ where: { discord: interaction.user.id } });
        let isNewUser = false;
        if (!user) {
            user = await createUser(CreateUserMethod.Discord, interaction.user.id);
            isNewUser = true;
            
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
        await user.refresh(true, force, !isNewUser);

        await resp.edit("Synced your profile!");
    }
}

export class ProfileCommand extends Command {
    constructor() {
        super({
            name: "profile",
            description: "Show your BeatLeader profile information.",
            options: [
                {
                    type: ChatInteractionOptionType.USER,
                    name: "user",
                    description: "A user to view their profile."
                }
            ]
        },
        {
            permissions: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.SendMessagesInThreads,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ViewChannel
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        await interaction.deferReply({ ephemeral: true });
        const option = interaction.options.getUser("user", false);
        const discord = (option ?? interaction.user).id;
        const user = await createUser(CreateUserMethod.Discord, discord);

        if (!user) {
            await interaction.editReply({
                content: linkDiscordMessage,
            });
            
            return;
        }

        await interaction.editReply("Loading...");

        const scores = await Score.findAll({
            include: [
              { model: User, where: { discord } },
              { model: Leaderboard, where: { type: 3 } }
            ]
        });
        
        const sum = scores.reduce((a, c) => a + c.pp, 0);
        const average = (sum / scores.length) || 0;

        const profile = await beatleader.player[user.beatleader].get_json();
        const number = Intl.NumberFormat("en", { maximumFractionDigits: 2 });

        const embed = new EmbedBuilder()
            .setAuthor({
                name: profile.name,
                url: `https://beatleader.xyz/u/${user.beatleader}`,
            })
            .setThumbnail(profile.avatar)
            .addFields([
                {
                    name: "Rank:",
                    value: `#${number.format(profile.rank)} (#${number.format(profile.countryRank)} ${profile.country})`
                },
                {
                    name: "PP:",
                    inline: true,
                    value: trim`Total: ${number.format(profile.pp)}pp
                            Avg: ${number.format(average)}pp
                            Acc: ${number.format(profile.accPp)}pp
                            Tech: ${number.format(profile.techPp)}pp
                            Pass: ${number.format(profile.passPp)}pp`
                },
                {
                    name: "Top PP:",
                    inline: true,
                    value: trim`Top: ${number.format(profile.scoreStats.topPp)}pp
                            Pass: ${number.format(profile.scoreStats.topPassPP)}pp
                            Acc: ${number.format(profile.scoreStats.topAccPP)}pp
                            Tech: ${number.format(profile.scoreStats.topTechPP)}pp`
                },
                {
                    name: "Accuracy:",
                    inline: false,
                    value: trim`Top: ${number.format(profile.scoreStats.topAccuracy * 100)}%
                                Avg: ${number.format(profile.scoreStats.averageAccuracy * 100)}%
                                Avg Ranked: ${number.format(profile.scoreStats.averageRankedAccuracy * 100)}%
                                Avg Weighted Ranked: ${number.format(profile.scoreStats.averageWeightedRankedAccuracy * 100)}%`
                },
                {
                    name: "Scores:",
                    inline: true,
                    value: trim`SS+: ${profile.scoreStats.sspPlays}
                            SS: ${profile.scoreStats.ssPlays}
                            S+: ${profile.scoreStats.spPlays}
                            S: ${profile.scoreStats.sPlays}
                            A: ${profile.scoreStats.aPlays}`
                }
            ]);

        await interaction.editReply({
            content: null,
            embeds: [embed]
        });
    }
}