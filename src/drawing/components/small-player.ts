import { join } from "path";
import { readFileSync } from "fs";
import Konva from "konva";
import { Image, ImageConfig } from "konva/lib/shapes/Image";
import { HMDs, KonvaImageFromURL, shortDate, truncate } from "../utils";
import { Layer } from "konva/lib/Layer";
import { Score } from "../../database";

const path = join(process.cwd(), "assets", "images");

const HMDIconRaw = readFileSync(join(path, "HMD.png"), "base64");
const GlobeIconRaw = readFileSync(join(path, "Globe.png"), "base64");

type Options = {
    x?: number;
    y?: number;
    height: number;
    score: Score,
    playerAvatarImage: PromiseFulfilledResult<Image>;
    playerCountryImage: PromiseFulfilledResult<Image>;
    remaining: number;
}

export default async (layer: Layer, {
    x = 0,
    y = 0,
    height,
    score,
    playerAvatarImage,
    playerCountryImage,
    remaining
}: Options) => {
    const width = 1500;
    const padding = 20;
    const avatarSize = 175;

    const playerName = score.user!.name;
    const playerHmd = HMDs[score.hmd] ?? HMDs[0];

    let scoreDate = shortDate(score.timeSet);
    if (score.scoreImprovement && score.scoreImprovement.score != 0) {
        scoreDate += ` vs ${shortDate(score.scoreImprovement.timeSet)}`
    }
    
    const playerRect = new Konva.Rect({
        x: x + padding,
        y: y + height - (padding * 3) - avatarSize,
        height: avatarSize + (padding * 2),
        width: width - remaining,
        fill: "rgba(0, 0, 0, 0.5)",
        cornerRadius: 20
    });

    playerAvatarImage.value.setAttrs({
        x: x + padding * 2,
        y: y + height - avatarSize - (padding * 2),
        width: avatarSize,
        height: avatarSize,
        cornerRadius: 10
    } as ImageConfig);

    playerCountryImage.value.setAttrs({
        x: x + avatarSize - (padding * 2),
        y: y + height - 75 - (padding * 2) + 5,
        width: 75,
        height: 75
    } as ImageConfig);

    const playerNameText = new Konva.Text({
        x: x + padding * 3 + avatarSize,
        y: y + height - (padding * 2) - avatarSize,
        fontFamily: "SF-Compact",
        fill: "white",
        fontSize: 50
    });

    const playerRemaining = remaining - ((padding * 2) + avatarSize)
    truncate(playerNameText, playerName, playerRemaining);

    const playerHMDImage = await KonvaImageFromURL(`data:image/png;base64,${HMDIconRaw}`);
    playerHMDImage.setAttrs({
        width: 40,
        height: 40,
        y: x + height - (padding * 2) - 120,
        x: y + padding * 3 + avatarSize,
    } as ImageConfig);
    
    const playerHMDText = new Konva.Text({
        x: x + padding * 3 + avatarSize + 50,
        y: y + height - (padding * 2) - 120,
        text: playerHmd.name,
        fontFamily: "SF-Compact",
        fill: "white",
        fontSize: 40
    });
    
    const playerRankImage = await KonvaImageFromURL(`data:image/png;base64,${GlobeIconRaw}`);
    playerRankImage.setAttrs({
        width: 40,
        height: 40,
        y: x + height - (padding * 2) - 80,
        x: y + padding * 3 + avatarSize,
    } as ImageConfig);

    const scoreRankText = new Konva.Text({
        x: x + padding * 3 + avatarSize + 50,
        y: y + height - (padding * 2) - 80,
        text: `Rank #${score.rank}`,
        fontFamily: "SF-Compact",
        fill: "white",
        fontSize: 40
    });

    const scoreDateText = new Konva.Text({
        x: x + padding * 3 + avatarSize,
        y: y + height - (padding * 2) - 35,
        text: scoreDate,
        fontFamily: "SF-Compact",
        fill: "grey",
        fontSize: 35
    });

    layer.add(playerRect, playerAvatarImage.value, playerNameText, playerHMDImage, playerHMDText, playerRankImage, scoreRankText, scoreDateText, playerCountryImage.value);
}