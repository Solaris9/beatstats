import { Table, Column, Model, BelongsTo, PrimaryKey, Unique } from "sequelize-typescript";
import { Song, Leaderboard }from "../index.js";
import { ILeaderboard } from "../../types/beatleader.js";

@Table({ timestamps: false })
export default class Difficulty extends Model {
    @PrimaryKey
    @Column declare key: string;
    
    @PrimaryKey
    @Column declare difficulty: number;

    @PrimaryKey
    @Column declare mode: number;
    
    @Column declare leaderboardId: string;
    
	@Column declare njs: number;
	@Column declare nps: number;
	@Column declare notes: number;
	@Column declare bombs: number;
	@Column declare walls: number;
	@Column declare maxScore: number;

    @BelongsTo(() => Song, 'key')
    declare song: Song;

    @BelongsTo(() => Leaderboard, 'key')
    declare leaderboard: Leaderboard;
}

export const getDifficultyName = (difficulty: number, old = false) => {
    switch (difficulty) {
        case 1:
            return old ? "easy" : "Easy";
        case 3:
            return old ? "normal" : "Normal";
        case 5:
            return old ? "hard" : "Hard";
        case 7:
            return old ? "expert" : "Expert";
        case 9:
            return old ? "expertPlus" : "Expert+";
        default:
            return "Unknown"
    }
}

export const getModeName = (mode: number) => {
    switch (mode) {
        case 1:
            return "Standard";
        default:
            return "Unknown"
    }
}

export const createSongDifficulty = async (leaderboard: ILeaderboard) => {
    const exists = await Difficulty.findOne({
        where: {
            key: leaderboard.song.id,
            difficulty: leaderboard.difficulty.value,
            mode: leaderboard.difficulty.mode,
        }
    });

    if (exists) return;

    return Difficulty.create({
        key: leaderboard.song.id,
        leaderboardId: leaderboard.id,
        
        difficulty: leaderboard.difficulty.value,
        mode: leaderboard.difficulty.mode,

        njs: leaderboard.difficulty.njs,
        nps: leaderboard.difficulty.nps,
        notes: leaderboard.difficulty.notes,
        bombs: leaderboard.difficulty.bombs,
        walls: leaderboard.difficulty.walls,
        maxScores: leaderboard.difficulty.maxScore,
    }).catch(e => {
        if (e.name !== "SequelizeUniqueConstraintError") throw e;
    });
}
