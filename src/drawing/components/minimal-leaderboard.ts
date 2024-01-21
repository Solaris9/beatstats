import Konva from "konva";
import { Image, ImageConfig } from "konva/lib/shapes/Image";
import { KonvaImageFromURL, getColour, truncate } from "../utils";
import { Leaderboard, LeaderboardType, getDifficultyName } from "../../database";
import { Layer } from "konva/lib/Layer";
import { join } from "path";
import { readFileSync } from "fs";

const path = join(process.cwd(), "assets", "images");
const icons: Record<string, string> = {
    bombs: readFileSync(join(path, "Bombs.png"), "base64"),
    duration: readFileSync(join(path, "Duration.png"), "base64"),
    notes: readFileSync(join(path, "Notes.png"), "base64"),
    nps: readFileSync(join(path, "NPS.png"), "base64"),
    stars: readFileSync(join(path, "Stars.png"), "base64"),
    walls: readFileSync(join(path, "Walls.png"), "base64")
}

const MapperIconRaw = readFileSync(join(path, "Note.png"), "base64");
const ArtistIconRaw = readFileSync(join(path, "Music.png"), "base64");

type Options = {
    songCoverImage: PromiseFulfilledResult<Image>;
    leaderboard: Leaderboard
}

export default async (layer: Layer, {
    songCoverImage,
    leaderboard
}: Options) => {
    const width = 1500;
    const coverSize = 250;
    const padding = 20;

    // #region setup

    const songName = leaderboard.difficulty.song.name;
    const songAuthor = leaderboard.difficulty.song.author;
    const songMapper = leaderboard.difficulty.song.mapper;
    const songDifficulty = getDifficultyName(leaderboard.difficulty.difficulty);
    const songStars = (leaderboard.stars ?? 0).toFixed(2);
    const songNPS = leaderboard.difficulty.nps.toFixed(2);
    const songNotes = leaderboard.difficulty.notes.toString();
    const songBombs = leaderboard.difficulty.bombs.toString();
    const songWalls = leaderboard.difficulty.walls.toString();

    const duration = leaderboard.difficulty.song.duration;
    const minutes = Math.floor(duration / 60);
    const songDuration = `${minutes}:${(duration - (minutes * 60)).toString().padStart(2, "0")}`;

    //#endregion

    //#region header

    const headerEffects = new Konva.Rect({
        x: 0, y: 0,
        width, height: coverSize + padding * 2,
        fill: "rgba(0, 0, 0, 0.4)"
    });
    
    const headerImage = songCoverImage.value.clone({
        x: padding, y: padding,
        width: coverSize, height: coverSize,
        cornerRadius: 10
    } as ImageConfig) as Image;

    layer.add(headerEffects, headerImage);

    //#endregion

    //#region metadata

    const songMetadata: [string, string, number, string?][] = [
        [songName, "white", 55],
        [songAuthor, "white", 40, ArtistIconRaw],
        [songMapper, "white", 40, MapperIconRaw]
    ];

    let metadataLastHeight = 15;

    for (const [text, fill, fontSize, icon] of songMetadata) {
        if (icon) {
            const iconImage = await KonvaImageFromURL(`data:image/png;base64,${icon}`);

            iconImage.setAttrs({
                width: 35,
                height: 35,
                x: coverSize + padding * 2,
                y: (padding * 1.25) + metadataLastHeight,
            } as ImageConfig);

            layer.add(iconImage);
        }
        
        const headerText = new Konva.Text({
            x: coverSize + padding * 2 + (icon ? 50 : 0),
            y: (padding * 1.25) + metadataLastHeight,
            fontFamily: "SF-Compact",
            fontSize,
            fill
        });

        metadataLastHeight += fontSize + (padding / 2);

        const remainingWidth = width - (padding * 3 + coverSize) + (icon ? 35 : 0);
        truncate(headerText, text, remainingWidth);
        layer.add(headerText);
    }

    const difficultyText = new Konva.Text({
        fontFamily: "SF-Compact",
        fontSize: 40,
        fill: getColour(songDifficulty),
        text: songDifficulty,
        y: metadataLastHeight + 35,
        x: (coverSize + padding * 2)
    });

    layer.add(difficultyText);

    const difficultyMetadata: [string, string, number?][] = [
        [songStars, "stars", 5],
        [songNPS, "nps", 5],
        [songNotes, "notes"],
        [songBombs, "bombs", 5],
        [songWalls, "walls", 5],
        [songDuration, "duration", 5],
    ];

    if (leaderboard.type != LeaderboardType.Ranked) difficultyMetadata.splice(0, 1);

    let metadataLastWidth = 15 + difficultyText.measureSize(songDifficulty).width;

    for (const [text, name, inc = 0] of difficultyMetadata) {
        const metadataIcon = await KonvaImageFromURL(`data:image/png;base64,${icons[name]}`);
        
        metadataIcon.setAttrs({
            width: 40 + inc,
            height: 40 + inc,
            y: metadataLastHeight + 35 - inc,
            x: (coverSize + padding * 2) + metadataLastWidth
        } as ImageConfig);
        
        const metadataText = new Konva.Text({
            x: metadataIcon.x(),
            y: metadataLastHeight + 35,
            fontFamily: "SF-Compact",
            fontSize: 40,
            fill: "#E4E4E4",
            text
        });

        metadataText.x(metadataText.x() + 50 + inc);
        
        metadataLastWidth += 40 + inc + metadataText.width() + 40;
        layer.add(metadataText, metadataIcon);
    }

    //#endregion
}