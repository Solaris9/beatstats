import { Sequelize } from 'sequelize-typescript';

import LeaderboardModifierValues, { createModifierValues, getModifier } from "./models/LeaderboardModifierValues";
import LeaderboardModifierRatings, { createModifierRating } from "./models/LeaderboardModifierRatings";
import Leaderboard, { createLeaderboard, LeaderboardType } from "./models/Leaderboard";
import ScoreOffsets from "./models/ScoreOffsets";
import ScoreImprovement from "./models/ScoreImprovement";
import Score, { createScore } from "./models/Score";
import SongDifficulty, { createSongDifficulty, getDifficultyName, getModeName } from "./models/SongDifficulty";
import Song, { createSong } from "./models/Song";
import User, { createUser, CreateUserMethod } from "./models/User";
import Clan from "./models/Clan";
import Stats from "./models/Stats";

export {
    Stats,
    Clan,

    User,
    createUser,
    CreateUserMethod,

    Song,
    createSong,
    
    SongDifficulty,
    createSongDifficulty,
    getDifficultyName,
    getModeName,
    
    Score,
    createScore,
    
    ScoreImprovement,
    ScoreOffsets,
    
    Leaderboard,
    createLeaderboard,
    LeaderboardType,
    
    LeaderboardModifierRatings,
    createModifierRating,

    LeaderboardModifierValues,
    createModifierValues,
    getModifier
}

// class BitField {
//     declare bits: number;

//     static from(bits: number) {
//         const bitField = new this;
//         bitField.bits = bits;
//         return bitField;
//     }

//     // total() {
//     //     return Object.values(this).reduce((a, c) => a | c, 0);
//     // }

//     has(bit: number) {
//         return (this.bits & bit) == bit;
//     }

//     add(bit: number) {
//         if (!this.has(bit)) this.bits += bit;
//     }

//     remove(bit: number) {
//         if (this.has(bit)) this.bits -= bit;
//     }
// }

// export class UserStatus extends BitField {
//     static ClanMember = 1;
//     static DiscordMember = 2;
// }

export default new Sequelize({
    logging: false,
    storage: 'database.sqlite',
    dialect: 'sqlite',
    username: 'root',
    password: '',
    models: [
        Stats,
        Clan,
        User,
        Score,
        ScoreOffsets,
        ScoreImprovement,
        Song,
        SongDifficulty,
        Leaderboard,
        LeaderboardModifierValues,
        LeaderboardModifierRatings,
    ]
});