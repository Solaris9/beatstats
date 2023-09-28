import { Sequelize } from 'sequelize-typescript';

import LeaderboardModifierValues, { createModifierValues } from "./models/LeaderboardModifierValues.js";
import LeaderboardModifierRatings, { createModifierRating } from "./models/LeaderboardModifierRatings.js";
import Leaderboard, { createLeaderboard } from "./models/Leaderboard.js";
import ScoreOffsets from "./models/ScoreOffsets.js";
import ScoreImprovement from "./models/ScoreImprovement.js";
import Score, { createScore } from "./models/Score.js";
import SongDifficulty, { createSongDifficulty } from "./models/SongDifficulty.js";
import Song, { createSong } from "./models/Song.js";
import User from "./models/User.js";
import Clan from "./models/Clan.js";

export {
    Clan,
    User,
    Song,
    SongDifficulty,
    Score,
    ScoreImprovement,
    ScoreOffsets,
    Leaderboard,
    LeaderboardModifierRatings,
    LeaderboardModifierValues,
    createSong,
    createSongDifficulty,
    createModifierRating,
    createModifierValues,
    createLeaderboard,
    createScore
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

export const sequelize = new Sequelize({
    logging: false,
    storage: 'database.sqlite',
    dialect: 'sqlite',
    username: 'root',
    password: '',
    models: [
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