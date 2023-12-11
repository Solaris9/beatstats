import { AllowNull, Column, HasMany, Model, PrimaryKey, Table, Unique } from "sequelize-typescript";
import { Score, createLeaderboard, createModifierRating, createModifierValues, createScore, createSong, createSongDifficulty } from "../index";
import { beatleader } from "../../api";
import { IPlayer, IScore } from "../../types/beatleader";
import { DataTypes, Op } from "sequelize";
import { Logger } from "../../utils/logger";

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
        logger.info(`Refreshing user ${this.name ?? "N/A"} (${this.beatleader}, ${this.discord})`);
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

export enum CreateUserMethod {
    Discord,
    BeatLeader
}

export const createUser = async (method: CreateUserMethod, id: string, player?: IPlayer) => {
    if (id == "382793216702939146") {
        id = "76561198346927515";
        method = CreateUserMethod.BeatLeader;
    }

    const req = method == CreateUserMethod.Discord ?
        beatleader.player.discord[id] :
        beatleader.player[id];
    
    player ??= await req.get_json().catch(() => undefined);
    if (!player) return null;

    let user = await User.findOne({ where: { beatleader: player.id } });
    
    const discord = player.socials?.find(s => s.service == "Discord");
    
    if (user && !user.discord && (discord || method == CreateUserMethod.Discord)) {
        user.discord = (method == CreateUserMethod.Discord ? id : discord?.userId) as string;
    } else if (!user) {
        user = await User.create({
            discord: method == CreateUserMethod.Discord ? id : null,
            beatleader: player.id
        });

        await user.refresh();
    }
    
    return user;
}