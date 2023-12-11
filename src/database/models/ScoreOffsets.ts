import { Table, BelongsTo, Model, Column, Unique } from "sequelize-typescript";
import { Score } from "../index";

@Table({ timestamps: false })
export default class Offsets extends Model {
	@Unique @Column
	declare scoreId: number;
	
	@Column declare frames: number;
	@Column declare notes:   number;
	@Column declare walls:   number;
	@Column declare heights: number;
	@Column declare pauses:  number;

    @BelongsTo(() => Score, "scoreId")
    declare scoreRef: Score;
}