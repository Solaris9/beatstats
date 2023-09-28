import { Client, Guild, GuildTextBasedChannel } from "discord.js";
import drawLeaderboard from "../drawing/leaderboards";
import cron from "node-cron";
import { Clan, User } from "../database";
import { Op } from "sequelize";

export const leaderboardFunction = async (client: Client) => {
    const leaderboards = {
        "totalPP": "Total PP",
        "passPP": "Pass PP",
        "accPP": "Accuracy PP",
        "techPP": "Tech PP",
        "topPP": "Top PP",
        "accuracyRankedAverage": "Ranked Accuracy",
        "accuracyRankedWeightedAverage": "Weighted Ranked Accuracy",
    } as const;

    const clans = await Clan.findAll({
        where: {
            guild: { [Op.not]: null },
            leaderboardsChannel: { [Op.not]: null }
        }
    });

    for (let clan of clans) {
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

        const members = await guild.members.fetch()
        const messages = await channel.messages.fetch();
        const entries = Object.entries(leaderboards);
        const nameCache = {} as Record<string, string>;

        for (let [leaderboard, name] of entries) {
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
                const name = members.get(user.discord)?.user.username ?? "N/A";
                nameCache[user.discord] ??= name;
            }

            const file = await drawLeaderboard(leaderboard, name, users, nameCache);
            const existing = messages.find(m => m.attachments.find(f => f.name.includes(leaderboard)));

            if (existing) await existing.edit({ files: [file] });
            else await channel.send({ files: [file] });
        }
    }
}

export const onceReady = async (client: Client) => {
    cron.schedule("0 * * * *", leaderboardFunction.bind(null, client));
};