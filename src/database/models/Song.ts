import { Table, Unique, PrimaryKey, Column, Model, HasMany, BelongsTo } from "sequelize-typescript";
import { SongDifficulty } from "../index";
import { ISong } from "../../types/beatleader";

@Table({ timestamps: false })
export default class Song extends Model {
    @PrimaryKey @Unique
    @Column declare key: string;
    
    @Column declare hash: string;
    @Column declare name: string;
    @Column declare subName: string;
    @Column declare author: string;
    @Column declare mapper: string;
    @Column declare mapperId: string;
    @Column declare coverImage: string;
    @Column declare fullCoverImage: string;
    @Column declare downloadURL: string;
    @Column declare uploadTime: number;
	@Column declare duration: number;
	@Column declare bpm: number;
    
    @HasMany(() => SongDifficulty, 'key')
    declare difficulties: SongDifficulty[];
}

export const createSong = (song: ISong) => {
    return Song.create({
        key: song.id,
        hash: song.hash,

        name: song.name,
        subName: song.subName,
        author: song.author,
        mapper: song.mapper,
        mapperId: song.mapperId,
        coverImage: song.coverImage,
        fullCoverImage: song.fullCoverImage,
        downloadURL: song.downloadUrl,
        duration: song.duration,
        bpm: song.bpm,
        uploadTime: song.uploadTime,
    }).catch(e => {
        if (e.name !== "SequelizeUniqueConstraintError") throw e;
    });
}