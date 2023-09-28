import { Table, Unique, Column, Model, BelongsTo } from "sequelize-typescript";
import { LeaderboardType } from "./Leaderboard.js";
import { Leaderboard } from "../index.js";
import { IDifficulty } from "../../types/beatleader.js";

@Table({ timestamps: false })
export default class ModifierRatings extends Model {
    @Unique @Column
    declare leaderboardId: string;
    
    @Column declare fsPassRating: number;
    @Column declare fsAccRating: number;
    @Column declare fsTechRating: number;
    @Column declare fsStars: number;

    @Column declare ssPassRating: number;
    @Column declare ssAccRating: number;
    @Column declare ssTechRating: number;
    @Column declare ssStars: number;

    @Column declare sfPassRating: number;
    @Column declare sfAccRating: number;
    @Column declare sfTechRating: number;
    @Column declare sfStars: number;

    @BelongsTo(() => Leaderboard, 'leaderboardId')
    declare leaderboard: Leaderboard;
}

export const createModifierRating = async (id: string, difficulty: IDifficulty, replace = false) => {
    if (
        difficulty.status != LeaderboardType.Ranked ||
        !difficulty.modifiersRating
    ) return;

    if (replace) await ModifierRatings.destroy({ where: { leaderboardId: id } });
    
     await ModifierRatings.create({
        leaderboardId: id,
        
        fsPassRating: difficulty.modifiersRating.fsPassRating,
        fsAccRating: difficulty.modifiersRating.fsAccRating,
        fsTechRating: difficulty.modifiersRating.fsTechRating,
        fsStars: difficulty.modifiersRating.fsStars,

        ssPassRating: difficulty.modifiersRating.ssPassRating,
        ssAccRating: difficulty.modifiersRating.ssAccRating,
        ssTechRating: difficulty.modifiersRating.ssTechRating,
        ssStars: difficulty.modifiersRating.ssStars,

        sfPassRating: difficulty.modifiersRating.sfPassRating,
        sfAccRating: difficulty.modifiersRating.sfAccRating,
        sfTechRating: difficulty.modifiersRating.sfTechRating,
        sfStars: difficulty.modifiersRating.sfStars,
    }).catch(e => {
        if (e.name !== "SequelizeUniqueConstraintError") throw e;
    });
}