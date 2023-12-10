import { EmbedBuilder, GuildTextBasedChannel, PermissionFlagsBits} from "discord.js";
import { User } from "../database";
import { Logger } from "../utils/logger";
import Clan from "../database/models/Clan";
import { Op } from "sequelize";
import { leaderboardFunction, leaderboardKV, leaderboards } from "./leaderboards";
import { checkPermission } from "../utils/utils";
import { Arg, BaseCommand, ChoiceValueObject, Choices, Command, CommandContext, SubCommand, parseParams } from "../framework";
import { RefreshMeCommand } from "./user";

export const logger = new Logger("Clan");

const channelTypes = [
    {
        name: "Live Scores",
        value: "liveScoresChannel"
    },
    {
        name: "Leaderboards",
        value: "leaderboardsChannel"
    }
] as const;

type ChannelTypes = typeof channelTypes[number]["value"]

@Command("clan", "Manage your clan.")
export class ClanCommands extends BaseCommand {
    async _checkClan(ctx: CommandContext) {
        const clan = await Clan.findOne({
            where: {
                guild: ctx.interaction.guild?.id ?? ctx.interaction.guildId
            }
        });
        
        if (!clan) {
            await ctx.edit(`Please run ${ClanCommands.mention("setup")} first.`);
            return false;
        }

        return clan;
    }

    async _checkOwner(clan: Clan, player: User, ctx: CommandContext) {
        if (clan.owner != player.beatleader) {
            await ctx.edit("You are not the clan owner.");
            return false;
        }

        return true;
    }


    @SubCommand("Setup your clan to work with the bot.")
    async setup(ctx: CommandContext) {
        await ctx.defer(true);

        const player = await ctx.user();
        if (!player) return;

        if (player.discord != ctx.interaction.guild?.ownerId) {
            await ctx.edit("This command requires the guild's owner to run it.");
            return;
        }
        
        const exists = await Clan.findOne({ where: {
            guild: ctx.interaction.guild?.id ?? ctx.interaction.guildId
        }});

        if (exists) {
            await ctx.interaction.reply(exists.owner != player.beatleader ?
                "You are not the clan owner." :
                "This clan was already linked to this guild."
            );

            return;
        }

        for (let clan of player.clans.split(",")) await Clan.new(clan);

        const clan = await Clan.findOne({ where: { owner: player.beatleader } });

        if (clan) {
            clan.guild = (ctx.interaction.guild?.id ?? ctx.interaction.guildId) as string;
            await clan.save();

            const linkMessage = `Linked this guild to clan ${clan.tag} and user <@${ctx.interaction.user.id}>.`;

            await ctx.edit(`${linkMessage} Fetching clan members now...`);
            await clan.refresh();
            await ctx.edit(`${linkMessage} Fetched all clan members now!`);
        } else {
            await ctx.edit(`You do not own any clans. If this is an mistake, please run ${RefreshMeCommand.mention()}`);
        }
    }

    @SubCommand("Refresh the clan data.")
    async refresh(ctx: CommandContext) {
        await ctx.defer(true);

        const player = await ctx.user();
        if (!player) return;

        const clan = await this._checkClan(ctx)
        if (!clan) return;

        if (!await this._checkOwner(clan, player, ctx)) return;

        await ctx.edit("Refreshing clan... please wait.");
        await clan.refresh();
        await ctx.edit("Refreshed clan!");
    }

    @SubCommand("Configure a channel to work with the bot feature.")
    async channel(
        ctx: CommandContext,
        @Choices(channelTypes as unknown as ChoiceValueObject)
        @Arg("The type of channel to configure.", Arg.Type.STRING) type: ChannelTypes,
        @Arg("Set a channel or omit to remove it.", Arg.Type.CHANNEL) channel: GuildTextBasedChannel | null
    ) {
        await ctx.defer(true);

        const player = await ctx.user();
        if (!player) return;

        const clan = await this._checkClan(ctx)
        if (!clan) return;

        if (!await this._checkOwner(clan, player, ctx)) return;

        const { name } = channelTypes.find(t => t.value == type)!;

        if (channel == null) {
            await ctx.edit(`Reset the **${name}** channel.`);

            clan[type] = null;
            await clan.save();

            return;
        }

        const missing = await checkPermission([
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.AttachFiles,
        ], channel);

        if (missing) {
            await ctx.edit(missing);
            return;
        }

        clan[type] = channel?.id;
        await clan.save();

        let content = `Set the **${name}** channel to: ${channel}`;
        if (type == "leaderboardsChannel") content += "\nThere are no leaderboards enabled by default, run "
            + `${ClanCommands.mention("leaderboards")} with any of the leaderboards as options to enable them.`

        await ctx.edit(content);
    }

    @SubCommand("Shows info about the clan.")
    async info(ctx: CommandContext) {
        await ctx.defer(true);

        const clan = await this._checkClan(ctx);
        if (!clan) return;

        const embed = new EmbedBuilder();
        embed.setTitle("Guild clan settings");

        const lbs = clan.leaderboards.split(",").filter(l => !!l);

        const settingsField = [
            ...channelTypes.map(t => `${t.name}: ${clan[t.value] ? `<#${clan[t.value]}>` : "N/A"}`),
            `Leaderboards: ${!lbs.length ? "None" : `\`${lbs.map(l => leaderboards[leaderboardKV.get(l)!]).join("`, `")}\``}`
        ];

        const hasAnySettings = channelTypes.find(t => clan[t.value] != null);
        if (!hasAnySettings) settingsField.push(`**Tip:** Run ${ClanCommands.mention("channel")} and ${ClanCommands.mention("leaderboards")} to configure this.`);

        embed.addFields({
            name: "Settings",
            value: settingsField.join("\n")
        });

        const cachedMembers = await User.count({
            where: {
                clans: { [Op.like]: `%${clan.tag}%` }
            }
        });

        const statsField = [
            `Clan Members: ${clan.memberCount}`,
            `Cached Members: ${cachedMembers}`,
            `Missing Members: ${clan.memberCount - cachedMembers}`
        ];

        embed.addFields({
            name: "Stats",
            value: statsField.join("\n")
        });

        await ctx.edit({ embeds: [embed] });
    }

    @SubCommand("Enable or disable a leaderboard from showing.")
    async leaderboards(
        ctx: CommandContext,
        @Arg("Total PP", Arg.Type.BOOLEAN) total_pp: boolean | null,
        @Arg("Pass PP", Arg.Type.BOOLEAN) pass_pp: boolean | null,
        @Arg("Accuracy PP", Arg.Type.BOOLEAN) accuracy_pp: boolean | null,
        @Arg("Tech PP", Arg.Type.BOOLEAN) tech_pp: boolean | null,
        @Arg("Top PP", Arg.Type.BOOLEAN) top_pp: boolean | null,
        @Arg("Ranked Accuracy", Arg.Type.BOOLEAN) ranked_accuracy: boolean | null,
        @Arg("Weighted Ranked Accuracy", Arg.Type.BOOLEAN) weighted_ranked_accuracy: boolean | null,
        @Arg("Weighted Stars for 99%", Arg.Type.BOOLEAN) weighted_stars_average_99: boolean | null,
        @Arg("Weighted Stars for 98%", Arg.Type.BOOLEAN) weighted_stars_average_98: boolean | null,
        @Arg("Weighted Stars for 97%", Arg.Type.BOOLEAN) weighted_stars_average_97: boolean | null,
        @Arg("Weighted Stars for 96%", Arg.Type.BOOLEAN) weighted_stars_average_96: boolean | null,
        @Arg("Weighted Stars for 95%", Arg.Type.BOOLEAN) weighted_stars_average_95: boolean | null
    ) {
        await ctx.defer(true);

        const player = await ctx.user();
        if (!player) return;

        const clan = await this._checkClan(ctx)
        if (!clan) return;

        if (!await this._checkOwner(clan, player, ctx)) return;

        const clanLbs = clan.leaderboards.split(",").filter(l => !!l);
        
        const _args = Array.from(arguments)
        const lbs = parseParams(this.leaderboards)
            .map((p, i) => [p[0].replace(/_/g, '-'), _args[i + 1]])
            .filter(([, o]) => o != null) as [string, boolean][];
        
        for (let [name, bool] of lbs) {
            const contains = clanLbs.includes(name);

            if (!bool && contains) {
                const i = clanLbs.indexOf(name);
                clanLbs.splice(i, 1);
            } else if (bool && !contains) {
                clanLbs.push(name);
            }
        }

        clan.leaderboards = clanLbs.join(",");
        await clan.save();

        if (!clanLbs.length) {
            await ctx.edit("Updated leaderboards list, no leaderboards to display.");
            return;
        }
        
        const list = clanLbs.map(l => leaderboards[leaderboardKV.get(l)!]).join("`, `");
        await ctx.edit(`Updated leaderboards list, now displaying:\n\`${list}\``);

        if (clan.leaderboards != "") await leaderboardFunction(ctx.interaction.client);
    }
}

// const createPlayer = async (member: GuildMember | string, isJoinEvent = true) => {
//     const isMember = typeof member != "string"; 
//     const discord = typeof member == "string" ? member : member.id;
//     const player = await beatleader.player.discord[discord].get_json().catch(() => null);
    
//     if (!isJoinEvent && !player) return false;

//     if (player) {
//         let user = await User.findOne({ where: { beatleader: player.id } });
//         if (!user) user = await User.create({
//             discord,
//             beatleader: player.id,
//         });

//         user.name = player.name;
//         user.country = player.country;
//         user.avatar = player.avatar;

//         if (player.clans.find(c => c.tag == "FURS")) {
//             user.membership |= UserStatus.ClanMember;
//             if (isMember) await member?.roles.add(memberRoleId);
//         } else {
//             user.membership &= (~UserStatus.ClanMember);
//             if (isMember) await member?.roles.add(guestRoleId);
//         }

//         user.membership |= UserStatus.DiscordMember;
//         await user.save();
//     } else {
//         if (isMember) await member?.roles.add(guestRoleId);
//     }

//     return true;
// };

// export const onGuildMemberAdd = async (client: Client, member: GuildMember) => {
//     if (member.guild.id != guildId) return;

//     await createPlayer(member);

//     const guild = await client.guilds.fetch(guildId)!;
//     const general = await guild.channels.fetch(generalChannelId)! as GuildTextBasedChannel;

//     await general.send(`Welcome ${member} to BeatLeader Furries Discord!`); 
// }

// export const showWelcomeMessage = MessageCommand(async (client, message, args) => {
//     if (message.author.id !== ownerId) return;
//     if (message.guild?.id != guildId) return;


//     const verifyButton = new ButtonBuilder()
//         .setCustomId("verify-user")
//         .setStyle(ButtonStyle.Primary)
//         .setLabel("Verify");
    
//     const verifyButtonWithInvite = new ButtonBuilder()
//         .setCustomId("verify-user-with-invite")
//         .setStyle(ButtonStyle.Primary)
//         .setLabel("Verify & Request Invite");

//     const row = new ActionRowBuilder()
//         .addComponents(verifyButton, verifyButtonWithInvite);

//     // @ts-ignore
//     await message.channel.send({ components: [row] });
// });

// export const onInteractionCreate = async (client: Client, interaction: Interaction) => {
//     if (interaction.guildId != guildId) return;

//     if (interaction.isButton() && interaction.customId.startsWith("verify-user")) {
//         // verify

//         const guild = await client.guilds.fetch(guildId)!;
//         const member = await guild.members.fetch(interaction.user.id)!;
//         const linked = await createPlayer(member, false);

//         if (!linked) {
//             await interaction.reply({
//                 ephemeral: true,
//                 content: `You do not have Discord linked on BeatLeader, please refer to *Getting Verified* in this channel.`
//             });
//         } else if (linked && !interaction.customId.endsWith("with-invite")) {
//             await interaction.reply({
//                 ephemeral: true,
//                 content: `Verified successfully!`
//             });
//         }

//         // invite

//         if (linked && interaction.customId.endsWith("with-invite")) {
//             const player = await beatleader.player.discord[member.id].get_json();

//             if (player.clans.length == 3) {
//                 await interaction.reply({
//                     content: "You are in the maximum amount of clans, please leave one to join this clan.",
//                     ephemeral: true
//                 });
//             } else {
//                 await member.roles.remove(guestRoleId);
//                 await member.roles.add(memberRoleId);

//                 const user = await User.find(member.id) as User;
//                 user.membership |= UserStatus.ClanMember;
//                 await user.save();

//                 const invited = await user.invite();
//                 await interaction.reply({
//                     content: invited ?
//                         `Please accept it by going to <https://beatleader.xyz/clans> and clicking "Accept invitation" where it says "Furries"!` :
//                         `Unable to invite you, please try again in a few minutes.`,
//                     ephemeral: true
//                 });
//             }
//         }
//     }
// };