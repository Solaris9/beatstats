import { MessageCommand } from "../framework";
import { PREFIX, ownerId } from "../../config.json";
import { beatleader } from "../api";
import { Leaderboard, createLeaderboard, createSong, createSongDifficulty } from "../database";
import ModifierRatings, { createModifierRating } from "../database/models/LeaderboardModifierRatings";
import ModifierValues, { createModifierValues } from "../database/models/LeaderboardModifierValues";

export const evaluate = MessageCommand("eval", async (client, message, args) => {
    if (message.author.id != ownerId) return;
    
    // evaluation variables
    const models = require("../database/index");
    const { Op } = require("sequelize");

    try {
        const content = message.content.slice(PREFIX.length + 8, -3);
        const result = await eval(`(async () => {\n${content}})()`);
        await message.channel.send(result ? `\`\`\`${result}\`\`\`` : "No result from evaluation.");
    } catch (err) {
        const content = `${err}`.slice(0, 1994);
        await message.channel.send(`\`\`\`${content}\`\`\``);
    }
});

export const refreshLeaderboards = MessageCommand("refreshLeaderboards", async (client, message, args) => {
    if (message.author.id != ownerId) return;

    if (args[0]) {
        const leaderboard = await beatleader.leaderboard[args[0]].get_json();
        const dbLeaderboard = await Leaderboard.findOne({ where: { leaderboardId: leaderboard.id } });

        if (!dbLeaderboard) {
            await createSong(leaderboard.song);
            await createLeaderboard(leaderboard);
            await createSongDifficulty(leaderboard);
        }

        await createModifierRating(leaderboard.id, leaderboard.difficulty, true);
        await createModifierValues(leaderboard.id, leaderboard.difficulty, true);

        await message.reply(`Created leaderboard info for ${args[0]}`);
        return;
    }
   
    const msg = await message.reply("Fetching ranked leaderboards...");
    const start = Date.now();

    const leaderboards = await Leaderboard.fetch();

    for (let leaderboard of leaderboards) {
        const { id: leaderboardId } = leaderboard;
        const dbLeaderboard = await Leaderboard.findOne({
            where: { leaderboardId },
            include: [
                ModifierRatings,
                ModifierValues,
            ]
        });
        
        if (!dbLeaderboard) {
            await createSong(leaderboard.song);
            await createLeaderboard(leaderboard);
            await createSongDifficulty(leaderboard);
        }

        await createModifierRating(leaderboard.id, leaderboard.difficulty, true);
        await createModifierValues(leaderboard.id, leaderboard.difficulty, true);
    }

    const time = ((Date.now() - start) / 1000).toFixed(2);
    await msg.edit(`Finishing syncing leaderboards. Took ${time} seconds...`)
});