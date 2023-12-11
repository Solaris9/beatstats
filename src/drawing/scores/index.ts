import { AttachmentBuilder } from "discord.js";
import { Leaderboard, LeaderboardType, Score, ScoreImprovement, Song, User } from "../../database";
import { writeFile, readFile, mkdir } from "fs/promises";
import { exists } from "../../utils/utils";
import minimal from "./minimal";
import { Op, col } from "sequelize";
import Difficulty from "../../database/models/SongDifficulty";

const types = ["minimal"] as const;
type Types = typeof types[number];
type Draw = (score: Score) => Promise<string | null>;

const map: Record<Types, Draw> = {
    minimal
};

export const drawCard = async (type: Types, score: Score) => {
    const leaderboardPath = `./image-cache/cards/${score.leaderboardId}`;
    const cardPath = `${leaderboardPath}/${score.scoreId}.png`;
    const cardExists = false;//await exists(cardPath);

    let buffer: Buffer;

    if (!cardExists) {
        const draw = map[type] ?? minimal;
        const dataUrl = await draw(score);
        if (dataUrl == null) return null;
        const data = dataUrl.split(",")[1];
        if (!await exists(leaderboardPath)) await mkdir(leaderboardPath);

        await writeFile(cardPath, data, "base64");
        buffer = Buffer.from(data, "base64");
    } else {
        const content = await readFile(cardPath, "base64");
        buffer = Buffer.from(content, "base64");
    }
    
    return new AttachmentBuilder(buffer, {
        name: `${score.playerId}-${score.leaderboardId}-${score.scoreId}.png`
    });
}

// Score.findAll({
//     limit: 1,
//     include: [
//         {
//             model: ScoreImprovement,
//             as: "scoreImprovement",
//             where: {
//                 pp: { [Op.gt]: 0 }
//             }
//         },
//         {
//             model: User,
//             as: "user"
//         },
//         {
//             model: Leaderboard,
//             as: "leaderboard",
//             include: [{
//                 model: Difficulty,
//                 include: [ Song ]
//             }],
//             where: {
//                 type: LeaderboardType.Ranked
//             }
//         }
//     ]
// }).then(async scores => {
//     // console.log(scores[0].toJSON());
//     await drawCard("minimal", scores[0]);
// });