import { Table, Unique, Column, Model, BelongsTo } from "sequelize-typescript";
import { LeaderboardType } from "./Leaderboard.js";
import { Leaderboard } from "../index.js";
import { IDifficulty } from "../../types/beatleader.js";

@Table({ timestamps: false })
export default class ModifierValues extends Model {
    @Unique @Column
    declare leaderboardId: string;
    
    @Column declare da: number;
    @Column declare fs: number;
    @Column declare sf: number;
    @Column declare ss: number;
    @Column declare gn: number;
    @Column declare na: number;
    @Column declare nb: number;
    @Column declare nf: number;
	@Column declare no: number;
	@Column declare pm: number;
	@Column declare sc: number;
	@Column declare sa: number;
    @Column declare op: number;

    @BelongsTo(() => Leaderboard, 'leaderboardId')
    declare leaderboard: Leaderboard;
}

export const createModifierValues = async (id: string, difficulty: IDifficulty, replace = false) => {
    if (
        difficulty.status != LeaderboardType.Ranked ||
        difficulty.modifierValues == null ||
        difficulty.modifierValues?.modifierId == 0
    ) return;

    if (replace) await ModifierValues.destroy({ where: { leaderboardId: id } });

    const modValues = difficulty.modifierValues;
    delete modValues.modifierId;

    return ModifierValues.create({
        leaderboardId: id,
        ...modValues
    }).catch(e => {
        if (e.name !== "SequelizeUniqueConstraintError") throw e;
    });
}

export const defaultValues = {
    "da": 0,
    "fs": 0.2,
    "sf": 0.36,
    "ss": -0.3,
    "gn": 0.04,
    "na": -0.3,
    "nb": -0.2,
    "nf": -0.5,
    "no": -0.2,
    "pm": 0,
    "sc": 0,
    "sa": 0,
    "op": -0.5
};

export const getModifier = (modifiers: ModifierValues | null, modifier: string) => {
    if (modifiers) return modifiers[modifier];
    return defaultValues[modifier];
}