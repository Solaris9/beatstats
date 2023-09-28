import { AttachmentBuilder } from "discord.js";
import { Leaderboard, User } from "../database";
import { getDifficultyName, getModeName } from "../database/models/SongDifficulty";

export type PlaylistSongDifficulty = {
    name: string;
    characteristic: string;
};

export type PlaylistSong = {
    hash: string;
    songName: string;
    levelAuthorName: string;
    difficulties: PlaylistSongDifficulty[]
};

export default {
    build(leaderboards: Leaderboard[], name: string, user: User | null) {
        const songs = [] as PlaylistSong[];

        for (let leaderboard of leaderboards) {
            const difficulty = leaderboard.difficulty;
            if (!difficulty) continue;

            const existing = songs.find(s => s.hash == difficulty.song.hash);

            const songDifficulty: PlaylistSongDifficulty = {
                name: getDifficultyName(difficulty.difficulty, true),
                characteristic: getModeName(difficulty.mode)
            }

            if (existing) {
                existing.difficulties.push(songDifficulty);
                continue;
            }

            songs.push({
                hash: difficulty.song.hash,
                songName: difficulty.song.name,
                levelAuthorName: difficulty.song.mapper,
                difficulties: [songDifficulty]
            });
        }

        const playlist = {
            playlistTitle: name,
            playlistAuthor: user ? user.name : "FurriesBot",
            songs
        }

        const buffer = Buffer.from(JSON.stringify(playlist), "utf-8");
        return new AttachmentBuilder(buffer, { name: "playlist.bplist" })
    }
}