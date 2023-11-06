// @ts-ignore
import { CacheType, ChatInputCommandInteraction, Client, EmbedBuilder, GuildTextBasedChannel, PermissionFlagsBits} from "discord.js";
import { ChatInteractionOptionChoice, ChatInteractionOptionType, Command } from "../framework";
import { User } from "../database";
import { Logger } from "../utils/logger";
import Clan from "../database/models/Clan";
import { Op } from "sequelize";
import { CreateUserMethod, createUser } from "../database/models/User";
import { leaderboardFunction, leaderboardKV, leaderboardVK, leaderboards } from "./leaderboards";
import { checkPermission } from "../utils/utils";

export const linkDiscordMessage = "Please link your Discord account with BeatLeader by going to <https://www.beatleader.xyz/signin/socials>.";

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

export class ClanCommands extends Command {
    constructor() {
        super({
            name: "clan",
            description: "Manage your clan link.",
            options: [
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "refresh",
                    description: "Refresh the clan data."
                },
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "setup",
                    description: "Setup your clan to work with the bot."
                },
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "info",
                    description: "Shows info about the clan."
                },
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "channel",
                    description: "Configure a channel to work with the bot feature.",
                    options: [
                        {
                            type: ChatInteractionOptionType.STRING,
                            name: "type",
                            description: "The type of channel to configure.",
                            required: true,
                            choices: channelTypes as unknown as ChatInteractionOptionChoice[]
                        },
                        {
                            type: ChatInteractionOptionType.CHANNEL,
                            name: "channel",
                            description: "Set a channel or omit to remove it."
                        }
                    ]
                },
                {
                    type: ChatInteractionOptionType.SUB_COMMAND,
                    name: "leaderboards",
                    description: "Enable or disable a leaderboard from showing.",
                    options: Object.entries(leaderboards).map(([key, desc]) => ({
                        name: leaderboardKV[key],
                        description: desc,
                        type: ChatInteractionOptionType.BOOLEAN,
                    }))
                },
            ]
        })
    }

    async _checkClan(interaction: ChatInputCommandInteraction) {
        const clan = await Clan.findOne({
            where: {
                guild: interaction.guild?.id ?? interaction.guildId
            }
        });
        
        if (!clan) {
            await interaction.reply({
                ephemeral: true,
                content: "Please run `/clan setup` first."
            });

            return false;
        }

        return clan;
    }

    async _checkOwner(clan: Clan, interaction: ChatInputCommandInteraction) {
        const user = await User.find(interaction.user.id);
        if (clan.owner != user?.beatleader) {
            await interaction.reply({
                ephemeral: true,
                content: "You are not the clan owner."
            });
            return false;
        }

        return user;
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>) {
        const sub = interaction.options.getSubcommand();

        if (sub == "refresh") this.refresh(interaction);
        else if (sub == "setup") this.setup(interaction);
        else if (sub == "channel") this.channel(interaction);
        else if (sub == "info") this.info(interaction);
        else if (sub == "leaderboards") this.leaderboards(interaction);
    }

    async setup(interaction: ChatInputCommandInteraction) {        
        const discord = interaction.user.id;

        let user = await User.findOne({ where: { discord } });
        if (!user) {
            user = await createUser(CreateUserMethod.Discord, discord);
            
            if (!user) {
                await interaction.reply({
                    ephemeral: true,
                    content: linkDiscordMessage
                });

                return;
            }
        }

        if (discord != interaction.guild?.ownerId) {
            await interaction.reply({
                content: "This command requires the guild's owner to run it.",
                ephemeral: true
            });

            return;
        }
        
        const exists = await Clan.findOne({ where: {
            guild: interaction.guild?.id ?? interaction.guildId
        }});

        if (exists) {
            await interaction.reply({
                ephemeral: true,
                content: exists.owner != user?.beatleader ?
                    "You are not the clan owner." :
                    "This clan was already linked to this guild."
            });

            return;
        }

        for (let clan of user.clans.split(",")) await Clan.new(clan);

        const clan = await Clan.findOne({ where: { owner: user.beatleader } });

        if (clan) {
            clan.guild = (interaction.guild?.id ?? interaction.guildId) as string;
            await clan.save();

            const linkMessage = `Linked this guild to clan ${clan.tag} and user <@${interaction.user.id}>.`;

            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply(`${linkMessage} Fetching clan members now...`);

            await clan.refresh();
            await interaction.editReply(`${linkMessage} Fetched all clan members now!`);
        } else {
            await interaction.reply({
                ephemeral: true,
                content: `You do not own any clans. If this is an mistake, please run \`/refresh full=True\``
            });
        }
    }

    async refresh(interaction: ChatInputCommandInteraction) {
        const clan = await this._checkClan(interaction)
        if (!clan) return;

        const user = this._checkOwner(clan, interaction);
        if (!user) return;

        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply("Refreshing clan... please wait.");
     
        await clan.refresh();
     
        await interaction.editReply("Refreshed clan!");
    }

    async channel(interaction: ChatInputCommandInteraction) {
        const clan = await this._checkClan(interaction)
        if (!clan) return;

        const user = await this._checkOwner(clan, interaction);
        if (!user) return;

        const type = interaction.options.getString("type", true) as ChannelTypes;
        const { name } = channelTypes.find(t => t.value == type)!;

        const channel = interaction.options.getChannel("channel", false) as GuildTextBasedChannel;

        if (channel == null) {
            await interaction.reply({
                ephemeral: true,
                content: `Reset the **${name}** channel.`
            });

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
            await interaction.reply({
                ephemeral: true,
                content: missing
            });

            return;
        }

        clan[type] = channel?.id;
        await clan.save();

        let content = `Set the **${name}** channel to: ${channel}`;
        if (type == "leaderboardsChannel") content += "\nThere are no leaderboards enabled by default, run "
            + "`/clan leaderboards` with any of the leaderboards as options to enable them."

        await interaction.reply({
            ephemeral: true,
            content
        });
    }

    async info(interaction: ChatInputCommandInteraction) {
        const clan = await this._checkClan(interaction);
        if (!clan) return;

        const embed = new EmbedBuilder();
        embed.setTitle("Guild clan settings");

        const lbs = clan.leaderboards.split(",").filter(l => !!l);

        const settingsField = [
            ...channelTypes.map(t => `${t.name}: ${clan[t.value] ? `<#${clan[t.value]}>` : "N/A"}`),
            `Leaderboards: ${!lbs.length ? "None" : `\`${lbs.map(l => leaderboards[leaderboardVK[l]]).join("`, `")}\``}`
        ];

        const hasAnySettings = channelTypes.find(t => clan[t.value] != null);
        if (!hasAnySettings) settingsField.push(`**Tip:** Run \`/clan channel|leaderboards\` to configure this.`);

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

        await interaction.reply({
            ephemeral: true,
            embeds: [embed]
        });
    }

    async leaderboards(interaction: ChatInputCommandInteraction) {
        const clan = await this._checkClan(interaction)
        if (!clan) return;

        const user = await this._checkOwner(clan, interaction);
        if (!user) return;

        await interaction.deferReply({ ephemeral: true });

        const lbs = Object.keys(leaderboardVK)
            .map(k => [k, interaction.options.getBoolean(k, false)])
            .filter(([, o]) => o != null) as [string, boolean][];
        
        const clanLbs = clan.leaderboards.split(",").filter(l => !!l);
        
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
        
        await interaction.editReply(
            `Updated leaderboards list, now displaying:\n\`${clanLbs.map(l => leaderboards[leaderboardVK[l]]).join("`, `")}\``
        );

        if (clan.leaderboards != "") await leaderboardFunction(interaction.client);
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