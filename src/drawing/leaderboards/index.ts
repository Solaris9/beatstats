import { AttachmentBuilder, Client } from "discord.js";
import Konva from "konva";
import { User } from "../../database";
import { writeFile } from "fs/promises";
import { KonvaImageFromURL } from "../utils";
import { ImageConfig } from "konva/lib/shapes/Image";

const formatter = new Intl.NumberFormat("en");

const width = 1000;
const height = 525;
const fontSize = 25;
const avatarSize = 40;

const rankColours = {
    0: "gold",
    1: "silver",
    2: "brown"
}

const handle = async (
    leaderboard: string,
    name: string,
    users: User[],
    nameCache: Record<string, string>
) => {
    // @ts-ignore
    const stage = new Konva.Stage({
        x: 0, y: 0,
        width, height
    });

    stage.listening(false);

    const layer = new Konva.Layer();
    layer.listening(false);
    stage.add(layer);

    //#region drawing

    const background = new Konva.Rect({
        width, height,
        x: 0, y: 0,
        fill: "rgba(0, 0, 0, 0.8)"
    });

    layer.add(background);

    const leaderboardName = new Konva.Text({
        x: 20, y: 20,
        fontSize: 25,
        text: name,
        fill: "white"
    });

    layer.add(leaderboardName);

    let startY = 60;
   
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const text = leaderboard.includes("accuracy") ?
            `${(user[leaderboard] * 100).toFixed(2)}%` :
            `${formatter.format(user[leaderboard])}PP`;

        const playerRankText = new Konva.Text({
            x: 15, y: startY + 7.5,
            fontSize,
            text: `#${i + 1}`,
            fill: rankColours[i] ?? "white"
        });

        const avatar = await KonvaImageFromURL(user.avatar);
        avatar.setAttrs({
            x: 80, y: startY,
            width: avatarSize,
            height: avatarSize,
            cornerRadius: 20
        } as ImageConfig);

        const playerNameText = new Konva.Text({
            x: 125, y: startY + 7.5,
            fontSize,
            text: `${user.name} (${nameCache[user.discord]})`,
            fill: "white"
        });

        const playerValueText = new Konva.Text({
            y: startY  + 7.5,
            fontSize,
            fill: rankColours[i] ?? "white",
            text
        });

        const rect = playerNameText.measureSize(text);
        playerValueText.x(width - 20 - rect.width);

        layer.add(playerRankText, avatar, playerNameText, playerValueText);

        startY += 45;
    };

    //#endregion
   
    const data = stage.toDataURL().split(",")[1];

    stage.clear();
    stage.destroy();

    const buffer = Buffer.from(data, "base64");

    // await writeFile(`./leaderboard.png`, buffer, "base64");

    return new AttachmentBuilder(buffer, {
        name: `${leaderboard}.png`
    });
};

// const leaderboards = {
//     "totalPP": "Total PP",
//     // "passPP": "Pass PP",
//     // "accPP": "Accuracy PP",
//     // "techPP": "Tech PP",
//     // "topPP": "Top PP",
//     // "accuracyRankedAverage": "Ranked Accuracy",
//     // "accuracyRankedWeightedAverage": "Weighted Ranked Accuracy",
// } as const;

// for (let leaderboard of Object.keys(leaderboards))
//     handle(null as any, leaderboard, leaderboards[leaderboard]);

export default handle;