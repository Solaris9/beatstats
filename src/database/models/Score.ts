import { Table, Column, BelongsTo, Model, HasOne, PrimaryKey, Unique, Default } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { ScoreOffsets, Leaderboard, ScoreImprovement, User } from "../index";
import { IScore } from "../../types/beatleader";

@Table({ timestamps: false })
export default class Score extends Model {
    @Default(false) @Column
    declare old: boolean;

    @Column declare playerId: string;
    @PrimaryKey @Unique
    @Column declare scoreId: number;
    @PrimaryKey
    @Column declare leaderboardId: string;

    @Column declare hmd: number;
    @Column declare baseScore: number;
    @Column declare modifiedScore: number;
    @Column declare accLeft: number;
    @Column declare accRight: number;
    @Column declare pp: number;
    @Column declare bonusPP: number;
    @Column declare passPP: number;
    @Column declare accPP: number;
    @Column declare techPP: number;
    @Column declare fcPP: number;
    @Column declare accuracy: number;
    @Column declare fcAccuracy: number;
    @Column declare rank: number;
    @Column declare modifiers: number;
    @Column declare badCuts: number;
    @Column declare missedNotes: number;
    @Column declare bombCuts: number;
    @Column declare wallsHit: number;
    @Column declare pauses: number;
    @Column declare fullCombo: boolean;
    @Column declare maxCombo: number;
    @Column declare maxStreak: number;
    @Column declare timeSet: Date;
    @Column declare playCount: number;

    @HasOne(() => ScoreImprovement, 'scoreId')
    declare scoreImprovement: ScoreImprovement | null;
    
    @HasOne(() => ScoreOffsets, 'scoreId')
    declare offsets: ScoreOffsets | null;

    @BelongsTo(() => Leaderboard, 'leaderboardId')
    declare leaderboard: Leaderboard | null;

    @BelongsTo(() => User, 'playerId')
    declare user: User | null;
}

export const createScore = async (s: IScore) => {
    const existing = await Score.findOne({
        where: {
            playerId: s.playerId,
            leaderboardId: s.leaderboardId,
            [Op.not]: {
                scoreId: s.id
            }
        }
    });

    if (existing) await existing.destroy();

    const modifiers = s.modifiers.split(",")
        .filter(m => !!m)
        .map(m => Modifiers[m as any] as unknown as number)
        .reduce((a, c) => a + c, 0);

    const score = await Score.create({
        playerId: s.playerId,
        scoreId: s.id,

        hmd: s.hmd,
        leaderboardId: s.leaderboardId,
        baseScore: s.baseScore,
        modifiedScore: s.modifiedScore,
        accLeft: s.accLeft,
        accRight: s.accRight,
        pp: s.pp,
        bonusPP: s.bonusPp,
        passPP: s.passPP,
        accPP: s.accPP,
        techPP: s.techPP,
        fcPP: s.fcPp,
        accuracy: s.accuracy,
        fcAccuracy: s.fcAccuracy,
        rank: s.rank,
        modifiers,
        badCuts: s.badCuts,
        missedNotes: s.missedNotes,
        bombCuts: s.bombCuts,
        wallsHit: s.wallsHit,
        pauses: s.pauses,
        fullCombo: s.fullCombo,
        maxCombo: s.maxCombo,
        maxStreak: s.maxStreak,
        timeSet: new Date(Number(s.timeset)),
        playCount: s.playCount
    }).catch(e => {
        if (e.name !== "SequelizeUniqueConstraintError") throw e;
    });

    if (s.offsets)
        await ScoreOffsets.create({
            scoreId: s.id,

            frames: s.offsets.frames,
            notes: s.offsets.notes,
            walls: s.offsets.walls,
            heights: s.offsets.heights,
            pauses: s.offsets.pauses,
        }).catch(e => {
            if (e.name !== "SequelizeUniqueConstraintError") throw e;
        });

    if (s.scoreImprovement && s.scoreImprovement.timeset != "")
        await ScoreImprovement.create({
            scoreId: s.id,

            timeSet: new Date(Number(s.scoreImprovement.timeset)),
            score: s.scoreImprovement.score,
            accuracy: s.scoreImprovement.accuracy,
            accLeft: s.scoreImprovement.accLeft,
            accRight: s.scoreImprovement.accRight,

            pp: s.scoreImprovement.pp,
            bonusPP: s.scoreImprovement.bonusPp,
            totalPP: s.scoreImprovement.totalPp,
            rank: s.scoreImprovement.rank,
            totalRank: s.scoreImprovement.totalRank,

            badCuts: s.scoreImprovement.badCuts,
            missedNotes: s.scoreImprovement.missedNotes,
            bombCuts: s.scoreImprovement.bombCuts,
            wallsHit: s.scoreImprovement.wallsHit,
            pauses: s.scoreImprovement.pauses,
        }).catch(e => {
            if (e.name !== "SequelizeUniqueConstraintError") throw e;
        });

    return score;
}

export enum Modifiers {
    DA = 1,
    FS = 2,
    SF = 4,
    SS = 8,
    GN = 16,
    NA = 32,
    NB = 64,
    NF = 128,
    NO = 256,
    PM = 512,
    SC = 1024,
    SA = 2048,
    OP = 4096
}