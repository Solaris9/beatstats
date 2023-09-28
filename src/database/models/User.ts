import { AllowNull, Column, HasMany, Model, PrimaryKey, Table, Unique } from "sequelize-typescript";
import { Score, createLeaderboard, createModifierRating, createModifierValues, createScore, createSong, createSongDifficulty } from "../index.js";
import { beatleader } from "../../api.js";
import { YoutubeFeed } from "../../types/other.js";
import { IPlayer, IScore } from "../../types/beatleader.js";
import { DataTypes, Op } from "sequelize";
// @ts-ignore
import { BL_COOKIE } from "../../../config.json";
import parse from "rss-to-json";
import { Logger } from "../../utils/logger.js";

const logger = new Logger("User");

@Table
export default class User extends Model {
    @Unique
    @Column declare discord: string;

    @Unique
    @PrimaryKey
    @Column declare beatleader: string;

    @Column declare avatar: string;
    @Column declare name: string;
    @Column declare country: string;
    @Column declare clans: string;

    @Column declare totalPP: number;
    @Column declare passPP: number;
    @Column declare accPP: number;
    @Column declare techPP: number;
    @Column declare topPP: number;

    @Column declare accuracyRankedAverage: number;
    @Column declare accuracyRankedWeightedAverage: number;
    @AllowNull @Column(DataTypes.NUMBER)
    declare lastFullCache: number | null;

    @HasMany(() => Score, "playerId")
    declare scores: Score[];

    @Column declare twitchLast: number;
    @Column declare twitch: string;
    @AllowNull @Column
    declare twitchEnabled: boolean;

    @Column declare youtubeLast: string;
    @Column declare youtube: string;
    @AllowNull @Column
    declare youtubeEnabled: boolean;

    async refresh(full = false, force = false) {
        logger.info(`Refreshing user ${this.name} (${this.beatleader}, ${this.discord})`);
        const profile = await beatleader.player[this.beatleader].get_json();

        this.name = profile.name;
        this.country = profile.country;
        this.avatar = profile.avatar;
        this.clans = profile.clans.map(c => c.tag).join(",");
        
        this.totalPP = profile.pp;
        this.passPP = profile.passPp;
        this.accPP = profile.accPp;
        this.techPP = profile.techPp;
        this.topPP = profile.scoreStats.topPp;

        this.accuracyRankedAverage = profile.scoreStats.averageRankedAccuracy;
        this.accuracyRankedWeightedAverage = profile.scoreStats.averageWeightedRankedAccuracy;

        const twitch = profile.socials?.find(s => s.service == "Twitch");
        if (twitch) {
            this.twitch = twitch.link.slice(twitch.link.lastIndexOf("/") + 1);
            if (!this.twitchLast) this.twitchLast = Date.now();
        }
        
        const youtube = profile.socials?.find(s => s.service == "YouTube");
        if (youtube) {
            this.youtube = youtube.link.slice(youtube.link.lastIndexOf("/") + 1);

            if (!this.youtubeLast) {
                const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${this.youtube}`;
                const feed = await parse(url) as YoutubeFeed;
                
                if (feed.items.length) this.youtubeLast = feed.items[0].id;
            }
        }

        if (full) {
            if (force) await Score.destroy({ where: { playerId: this.beatleader } });
            const lastCache = force ? null : this.lastFullCache;

            const scores = await this.fetchScores(lastCache);
            await Promise.all(scores.map(async s => {
                await createSong(s.leaderboard.song);
                await createLeaderboard(s.leaderboard);
                await createSongDifficulty(s.leaderboard);
                await createModifierValues(s.leaderboardId, s.leaderboard.difficulty);
                await createModifierRating(s.leaderboardId, s.leaderboard.difficulty);
                await createScore(s);
            }));

            if (scores.length) {
                this.lastFullCache = Number(scores.at(0)!.timepost) + 1;
                logger.info(`Fetching ${scores.length} scores for user ${this.name} (${this.beatleader}, ${this.discord})`);
            }
        }

        await this.save();
    }

    async invite() {
        try {
            const res = await beatleader.clan.invite.post({
                query: { player: this.beatleader },
                headers: {
                    cookie: `.AspNetCore.Cookies=${BL_COOKIE}`
                }
            });

            return res.ok;
        } catch {
            return false;
        }
    }

    async fetchScores(lastScoreDate?: number | null) {
        const scores = [] as IScore[];
        let page = 1, pages: number = 0;
    
        do {
            const query = { sortBy: "date", count: 100, page } as Record<string, unknown>;
            if (lastScoreDate) query.time_from = lastScoreDate;
    
            const json = await beatleader.player[this.beatleader].scores.get_json({ query });
            if (!json.data.length) break;
            scores.push(...json.data);
    
            if (!pages) pages = Math.ceil(json.metadata.total / json.metadata.itemsPerPage);
        } while (page++ != pages);
    
        return scores;
    }

    static find(id: string) {
        return User.findOne({
            where: {
                [Op.or]: [
                    { beatleader: id },
                    { discord: id }
                ]
            }
        });
    }
}

export const createUser = async (discord: string, player?: IPlayer, update = false) => {
    player ??= await beatleader.player.discord[discord].get_json().catch(() => undefined);
    if (!player) return null;

    let user = await User.findOne({ where: { beatleader: player.id } });
    if (!user) user = await User.create({ discord, beatleader: player.id });
    
    if (update) {
        user.name = player.name;
        user.country = player.country;
        user.avatar = player.avatar;
        user.clans = player.clans.map(c => c.tag).join(",");

        await user.save();
    }
    
    return user;
}