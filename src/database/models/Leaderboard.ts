import { AllowNull, BelongsTo, Column, DataType, HasMany, HasOne, Model, PrimaryKey, Table, Unique } from "sequelize-typescript";
import { Score, SongDifficulty, LeaderboardModifierRatings, LeaderboardModifierValues } from "../index.js";
import { ILeaderboard } from "../../types/beatleader.js";
import { beatleader } from "../../api.js";

export enum LeaderboardType {
    Unranked = 0,
    Qualified = 2,
    Ranked = 3,
}

@Table({ timestamps: false })
export default class Leaderboard extends Model {
    @PrimaryKey @Unique
    @Column declare leaderboardId: string;

    @Column declare type: number;

    @AllowNull @Column(DataType.NUMBER)
    declare stars: number | null;
    @AllowNull @Column(DataType.NUMBER)
    declare passRating: number | null;
    @AllowNull @Column(DataType.NUMBER)
    declare accRating: number | null;
    @AllowNull @Column(DataType.NUMBER)
    declare techRating: number | null;

    @HasMany(() => Score, 'leaderboardId')
    declare scores: Score[];

    @HasOne(() => SongDifficulty, 'leaderboardId')
    declare difficulty: SongDifficulty;

    @HasOne(() => LeaderboardModifierValues, 'leaderboardId')
    declare modifierValues: LeaderboardModifierValues;

    @HasOne(() => LeaderboardModifierRatings, 'leaderboardId')
    declare modifierRating: LeaderboardModifierRatings;

    @BelongsTo(() => Score, 'leaderboardId')
    declare score: Score;

    static async fetch() {
        const data = [] as ILeaderboard[];
        let page = 1, pages: number = 0;

        do {
            const json = await beatleader.leaderboards.get_json({ query: { type: "ranked", count: 100, page } });
            data.push(...json.data);
            if (!pages) pages = Math.ceil(json.metadata.total / json.metadata.itemsPerPage);
        } while (page++ != pages);

        return data;
    }
}

export const createLeaderboard = (leaderboard: ILeaderboard) => {
    return Leaderboard.create({
        leaderboardId: leaderboard.id,

        type: leaderboard.difficulty.status,
        stars: leaderboard.difficulty.stars,
        passRating: leaderboard.difficulty.passRating,
        accRating: leaderboard.difficulty.accRating,
        techRating: leaderboard.difficulty.techRating,
    }).catch(e => {
        if (e.name !== "SequelizeUniqueConstraintError") throw e;
    });
}