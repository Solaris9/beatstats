import { Client, Guild, GuildTextBasedChannel, PermissionFlagsBits } from "discord.js";
import drawLeaderboard from "../drawing/leaderboards";
import cron from "node-cron";
import { Clan, Leaderboard, Score, User } from "../database";
import { Op, col } from "sequelize";

const formatter = new Intl.NumberFormat("en");

export const leaderboards = {
    "totalPP": "Total PP",
    "passPP": "Pass PP",
    "accPP": "Accuracy PP",
    "techPP": "Tech PP",
    "topPP": "Top PP",
    "accuracyRankedAverage": "Ranked Accuracy",
    "accuracyRankedWeightedAverage": "Weighted Ranked Accuracy",
    "c_starsWeightedAverage99": "Weighted Stars for 99%",
    "c_starsWeightedAverage98": "Weighted Stars for 98%",
    "c_starsWeightedAverage97": "Weighted Stars for 97%",
    "c_starsWeightedAverage96": "Weighted Stars for 96%",
    "c_starsWeightedAverage95": "Weighted Stars for 95%",
} as const;

export const leaderboardKV = {
    "totalPP": "total-pp",
    "passPP": "pass-pp",
    "accPP": "accuracy-pp",
    "techPP": "tech-pp",
    "topPP": "top-pp",
    "accuracyRankedAverage": "ranked-accuracy",
    "accuracyRankedWeightedAverage": "weighted-ranked-accuracy",
    "c_starsWeightedAverage99": "stars-weighted-average-99",
    "c_starsWeightedAverage98": "stars-weighted-average-98",
    "c_starsWeightedAverage97": "stars-weighted-average-97",
    "c_starsWeightedAverage96": "stars-weighted-average-96",
    "c_starsWeightedAverage95": "stars-weighted-average-95",
} as const;

export const leaderboardVK = {
    "total-pp": "totalPP",
    "pass-pp": "passPP",
    "accuracy-pp": "accPP",
    "tech-pp": "techPP",
    "top-pp": "topPP",
    "ranked-accuracy": "accuracyRankedAverage",
    "weighted-ranked-accuracy": "accuracyRankedWeightedAverage",
    "stars-weighted-average-99": "c_starsWeightedAverage99",
    "stars-weighted-average-98": "c_starsWeightedAverage98",
    "stars-weighted-average-97": "c_starsWeightedAverage97",
    "stars-weighted-average-96": "c_starsWeightedAverage96",
    "stars-weighted-average-95": "c_starsWeightedAverage95",
} as const;

export const customLeaderboards = async (playerId: string, leaderboard: string) => {
    const accuracy = Number(leaderboard.slice(leaderboard.length - 2, leaderboard.length));

    const scores = await Score.findAll({
        where: {
            playerId,
            accuracy: { [Op.gt]: accuracy / 100 }
        },
        order: [[col("leaderboard.stars"), "DESC"]],
        limit: 100,
        include: {
            model: Leaderboard,
            where: {
                type: 3,
                stars: { [Op.not]: null }
            }
        }
    });

    let weights = 0, sum = 0;
    
    for (let i = 0; i < scores.length; i++) {
        let weight = Math.pow(0.965, i);
        if (i < scores.length) sum += scores[i].leaderboard!.stars! * weight;
        weights += weight;
    }
    
    return sum / weights;
}

const formats: Record<string, (v: number) => string> = {
    "accuracy": v => `${(v * 100).toFixed(2)}%`,
    "pp": v => `${formatter.format(v)}PP`,
    "stars": v => `${v.toFixed(2)}*`,
}

let nameCache = {} as Record<string, string>;

export const leaderboardFunction = async (client: Client) => {
    const clans = await Clan.findAll({
        where: {
            guild: { [Op.not]: null },
            leaderboardsChannel: { [Op.not]: null },
            leaderboards: { [Op.not]: "" }
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

        const messages = await channel.messages.fetch({ limit: 50 });
        const lbs = clan.leaderboards.split(",").filter(l => !!l);
        const entries = Object.keys(leaderboards).filter(e => lbs.includes(leaderboardKV[e]));

        for (let leaderboard of entries) {
            const lb = leaderboard.includes("accuracy") ? "accuracy" :
                leaderboard.includes("PP") ? "pp" : "stars";
            
            let rows: [string, string, string, number][] = [];

            if (leaderboard.startsWith("c_")) {
                const users = await User.findAll({
                    where: { clans: { [Op.like]: `%${clan.tag}%` }},
                });

                for (let u of users) {
                    const value = await customLeaderboards(u.beatleader, leaderboard);
                    rows.push([u.discord, `${u.name}`, u.avatar, value || 0]);
                }

                rows = rows.slice(0, 10)
            } else {
                const users = await User.findAll({
                    order: [[leaderboard, "DESC"]],
                    where: { clans: { [Op.like]: `%${clan.tag}%` }},
                    limit: 10
                });

                for (let u of users) {                    
                    rows.push([u.discord, `${u.name}`, u.avatar, u[leaderboard]]);
                }
            }

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

            for (let [discord] of rows) {
                if (!nameCache[discord]) {
                    const u = !discord ? null : await client.users.fetch(discord).catch(() => null);
                    nameCache[discord] = u?.username ?? "N/A";
                }
            }

            const final = (
                rows.sort((a, b) => b[3] - a[3])
                .map(v => [`${v[1]} (${nameCache[v[0]]})`, v[2], formats[lb](v[3])])
            ) as[string, string, string][];

            const file = await drawLeaderboard(leaderboard, final);
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