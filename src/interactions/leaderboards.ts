import { Client, Guild, GuildTextBasedChannel, PermissionFlagsBits } from "discord.js";
import drawLeaderboard from "../drawing/leaderboards";
import cron from "node-cron";
import { Clan, User } from "../database";
import { Op } from "sequelize";

export const leaderboards = {
    "totalPP": "Total PP",
    "passPP": "Pass PP",
    "accPP": "Accuracy PP",
    "techPP": "Tech PP",
    "topPP": "Top PP",
    "accuracyRankedAverage": "Ranked Accuracy",
    "accuracyRankedWeightedAverage": "Weighted Ranked Accuracy",
} as const;

export const leaderboardKV = {
    "totalPP": "total-pp",
    "passPP": "pass-pp",
    "accPP": "accuracy-pp",
    "techPP": "tech-pp",
    "topPP": "top-pp",
    "accuracyRankedAverage": "ranked-accuracy",
    "accuracyRankedWeightedAverage": "weighted-ranked-accuracy",
} as const;

export const leaderboardVK = {
    "total-pp": "totalPP",
    "pass-pp": "passPP",
    "accuracy-pp": "accPP",
    "tech-pp": "techPP",
    "top-pp": "topPP",
    "ranked-accuracy": "accuracyRankedAverage",
    "weighted-ranked-accuracy": "accuracyRankedWeightedAverage",
} as const;

let nameCache = {} as Record<string, string>;

export const leaderboardFunction = async (client: Client) => {
    const clans = await Clan.findAll({
        where: {
            guild: { [Op.not]: null },
            leaderboardsChannel: { [Op.not]: null }
        }
    });

    clan: for (let clan of clans) {
        const guild = await client.guilds.fetch(clan.guild!).catch(() => null) as Guild;
        if (!guild) {
            clan.guild = null
            clan.leaderboardsChannel = null
            await clan.save();
            continue;
        }
        
        const channel = await guild.channels.fetch(clan.leaderboardsChannel!).catch(() => null) as GuildTextBasedChannel;
        if (!channel) {
            clan.leaderboardsChannel = null
            await clan.save();
            continue;
        }

        const perms = channel.permissionsFor(guild.members.me!)

        if (!perms.has(PermissionFlagsBits.SendMessages) || !perms.has(PermissionFlagsBits.AttachFiles)) {
            clan.leaderboardsChannel = null
            await clan.save();
            continue;
        }

        const messages = await channel.messages.fetch();
        let entries = Object.keys(leaderboards);

        if (clan.leaderboards != "") {
            const lbs = clan.leaderboards.split(",").filter(l => !!l);
            entries = entries.filter(e => lbs.includes(leaderboardKV[e]));
        }

        for (let leaderboard of entries) {
            const users = await User.findAll({
                order: [[leaderboard, "DESC"]],
                where: { clans: { [Op.like]: `%${clan.tag}%` }},
                limit: 10
            });

            // // remove previous leader roles if they have one
            // const previous = members.find(m => m.roles.cache.has(leaderboardRoles[leaderboard]));
            // if (previous && previous.id != users[0].discord) {
            //     await previous.roles.remove([leaderboardRole, leaderboardRoles[leaderboard]]);
            // }

            // // update new leader roles
            // const leader = members.get(users[0].discord);
            // if (leader) {
            //     await leader.roles.add([leaderboardRole, leaderboardRoles[leaderboard]]);
            // }

            for (let user of users) {
                if (!nameCache[user.discord]) {
                    const u = !user.discord ? null : await client.users.fetch(user.discord).catch(() => null);
                    nameCache[user.discord] = u?.username ?? "N/A";
                }
            }

            const file = await drawLeaderboard(leaderboard, leaderboards[leaderboard], users, nameCache);
            const existing = messages.find(m => m.attachments.find(f => f.name.includes(leaderboard)));

            if (existing) await existing.edit({ files: [file] });
            else try {
                await channel.send({ files: [file] });
            } catch (err) {
                clan.leaderboardsChannel = null
                await clan.save();
                continue clan;
            }
        }
    }
}

export const onceReady = async (client: Client) => {
    cron.schedule("0 */2 * * *", leaderboardFunction.bind(null, client));
    cron.schedule("0 0 * * *", () => nameCache = {});
};