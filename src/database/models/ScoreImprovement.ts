import { Table, Column, Model, BelongsTo, Unique } from "sequelize-typescript";
import { Score } from "../index.js";

@Table({ timestamps: false })
export default class ScoreImprovement extends Model {
	@Unique @Column
	declare scoreId: number;
    
	@Column declare timeSet: Date;
	@Column declare score: number;
	@Column declare accuracy: number;
	@Column declare accLeft: number;
    @Column declare accRight: number;
    
	@Column declare pp: number;
	@Column declare bonusPP: number;
    @Column declare totalPP: number;
	@Column declare rank: number;
    @Column declare totalRank: number;
    
	@Column declare badCuts: number;
	@Column declare missedNotes: number;
	@Column declare bombCuts: number;
	@Column declare wallsHit: number;
    @Column declare pauses: number;

    @BelongsTo(() => Score, 'scoreId')
    declare scoreRef: Score;
}