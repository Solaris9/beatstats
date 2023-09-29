import { Table, Column, Model, Default, PrimaryKey } from "sequelize-typescript";

@Table({ timestamps: false })
export default class Stats extends Model {
    @Default(0) @Column
    declare beatleader_requests: number;
    @Default(0) @Column
    declare live_scores: number;
}