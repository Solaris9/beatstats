import { HMDs, KonvaImageFromURL, ModifiersList, centerText, getColour, truncate } from "../utils";
import Konva from "konva";
import { Image, ImageConfig } from "konva/lib/shapes/Image";
import { RectConfig } from "konva/lib/shapes/Rect";
import { readFileSync } from "fs";
import { join } from "path";
import { TextConfig } from "konva/lib/shapes/Text";
import { Score } from "../../database";
import { getDifficultyName } from "../../database/models/SongDifficulty.js";
import { LeaderboardType } from "../../database/models/Leaderboard.js";
import { Modifiers } from "../../database/models/Score.js";

//#region extra

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
const HMDIconRaw = readFileSync(join(path, "HMD.png"), "base64");
const GlobeIconRaw = readFileSync(join(path, "Globe.png"), "base64");

//#endregion

export default async (score: Score) => {
    //#region constants

    const songName = score.leaderboard.difficulty.song.name;
    const songAuthor = score.leaderboard.difficulty.song.author;
    const songMapper = score.leaderboard.difficulty.song.mapper;
    const songCover = score.leaderboard.difficulty.song.coverImage;
    const songDifficulty = getDifficultyName(score.leaderboard.difficulty.difficulty);
    const songStars = (score.leaderboard.stars ?? 0).toFixed(2);
    const songNPS = score.leaderboard.difficulty.nps.toFixed(2);
    const songNotes = score.leaderboard.difficulty.notes.toString();
    const songBombs = score.leaderboard.difficulty.bombs.toString();
    const songWalls = score.leaderboard.difficulty.walls.toString();

    const duration = score.leaderboard.difficulty.song.duration;
    const minutes = Math.floor(duration / 60);
    const songDuration = `${minutes}:${(duration - (minutes * 60)).toString().padStart(2, "0")}`;

    const playerName = score.user.name;
    const playerAvatar = score.user.avatar;
    const playerHmd = HMDs[score.hmd] ?? HMDs[0];
    const playerCountry = "https://flagsapi.com/" + score.user.country + "/flat/64.png";

    const scoreDate = new Date(score.timeSet.getTime() * 1000).toDateString();
    const scoreScore = score.baseScore != score.modifiedScore ? score.modifiedScore : score.baseScore;
    const scorePoints = `${score.pp.toFixed(2)}pp`;
    const scoreAccuracy = `${(score.accuracy * 100).toFixed(2)}%`;
    const scoreLeft = score.accLeft.toFixed(2);
    const scoreRight = score.accRight.toFixed(2);
    const scoreCombo = score.fullCombo ? "FC" : `${score.missedNotes + score.badCuts}X`;

    // image config

    const width = 1500;
    const height = score.modifiers ? 620 : 550;
    
    const scorePadding = 15;
    const scoreWidth = 230;
    const scoreHeight = 75;
    
    const leftCol = width - ((scoreWidth + scorePadding) * 3) - 5;
    const middleCol = width - ((scoreWidth + scorePadding) * 2) - 5;
    const rightCol = width - scoreWidth - scorePadding - 5;
    
    const scoreOffset = 30;
    
    const topScoreConfig: RectConfig = {
        width: scoreWidth,
        height: scoreHeight,
        y: height - ((scoreHeight + scorePadding) * 2) - 5 - scoreOffset,
        cornerRadius: 10
    };
    
    const bottomScoreConfig: RectConfig = {
        width: scoreWidth,
        height: scoreHeight,
        y: height - scoreHeight - scorePadding - 5 - scoreOffset,
        cornerRadius: 10
    };

    //#endregion

    //#region setup

    // @ts-ignore
    const stage = new Konva.Stage({
        x: 0, y: 0,
        width, height
    });

    stage.listening(false);

    const layer = new Konva.Layer();
    layer.listening(false);
    stage.add(layer);

    const [
        songCoverImage,
        playerAvatarImage,
        playerCountryImage
    ] = await Promise.all([
        KonvaImageFromURL(songCover),
        KonvaImageFromURL(playerAvatar),
        KonvaImageFromURL(playerCountry)
    ]);

    //#endregion

    //#region background
    const backgroundImage = songCoverImage.clone({
        x: 0, y: -(width - height) / 2,
        width, height: width,
        cornerRadius: 0
    } as ImageConfig) as Image;

    const backgroundEffects = new Konva.Rect({
        x: 0, y: 0,
        width, height,
        fill: "rgba(0, 0, 0, 0.8)"
    });
    
    backgroundImage.cache();
    backgroundImage.filters([Konva.Filters.Blur])
    backgroundImage.blurRadius(5);

    layer.add(backgroundImage);
    layer.add(backgroundEffects);

    //#endregion

    //#region cover
    const coverSize = 250;
    const padding = 20;

    const headerEffects = new Konva.Rect({
        x: 0, y: 0,
        width, height: coverSize + padding * 2,
        fill: "rgba(0, 0, 0, 0.4)"
    });
    
    const headerImage = songCoverImage.clone({
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

    if (score.leaderboard.type != LeaderboardType.Ranked) difficultyMetadata.splice(0, 1);

    let metadataLastWidth = 15 + difficultyText.measureSize(songDifficulty).width;;

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

    //#region mods

    if (score.modifiers) {
        const modY = coverSize + (padding * 2) + 10;
        const mods = Object.entries(Modifiers)
            .filter(([, m]) => typeof m == "number" && score.modifiers & m)
            .map(([k]) => k);

        const modImages = await Promise.all(mods.map(m => KonvaImageFromURL(`https://www.beatleader.xyz/assets/${ModifiersList[m]}`)))
        const modTextBase = new Konva.Text({
            y: modY + 15,
            fontFamily: "SF-Compact",
            fontSize: 45,
            fill: "white"
        });

        let modX = padding;

        for (let i = 0; i < mods.length; i++) {
            const modImage = modImages[i];
            modImage.setAttrs({
                y: modY,
                x: modX,
                width: 70,
                height: 70,
            } as ImageConfig);

            const modText = modTextBase.clone({
                text: mods[i],
            } as TextConfig) as Konva.Text;

            const { width } = modText.measureSize(mods[i]);
            modText.x(modX + width + 15);
            modX += modImage.width() + modText.width() + 30;

            layer.add(modImage, modText);
        }
    }

    //#endregion

    //#region player

    const avatarSize = 175;
    
    const playerRect = new Konva.Rect({
        x: padding,
        y: height - (padding * 3) - avatarSize,
        height: avatarSize + (padding * 2),
        width: width - leftCol - padding,
        fill: "rgba(0, 0, 0, 0.5)",
        cornerRadius: 20
    });

    playerAvatarImage.setAttrs({
        x: padding * 2,
        y: height - avatarSize - (padding * 2),
        width: avatarSize,
        height: avatarSize,
        cornerRadius: 10
    } as ImageConfig);

    playerCountryImage.setAttrs({
        x: avatarSize - (padding * 2),
        y: height - 75 - (padding * 2) + 5,
        width: 75,
        height: 75
    } as ImageConfig);

    const playerNameText = new Konva.Text({
        x: padding * 3 + avatarSize,
        y: height - (padding * 2) - avatarSize,
        fontFamily: "SF-Compact",
        fill: "white",
        fontSize: 50
    });

    const playerRemaining = width - leftCol - (padding + avatarSize)
    truncate(playerNameText, playerName, playerRemaining);

    const playerHMDImage = await KonvaImageFromURL(`data:image/png;base64,${HMDIconRaw}`);
    playerHMDImage.setAttrs({
        width: 40,
        height: 40,
        y: height - (padding * 2) - 120,
        x: padding * 3 + avatarSize,
    } as ImageConfig);
    
    const playerHMDText = new Konva.Text({
        x: padding * 3 + avatarSize + 50,
        y: height - (padding * 2) - 120,
        text: playerHmd.name,
        fontFamily: "SF-Compact",
        fill: "white",
        fontSize: 40
    });
    
    const playerRankImage = await KonvaImageFromURL(`data:image/png;base64,${GlobeIconRaw}`);
    playerRankImage.setAttrs({
        width: 40,
        height: 40,
        y: height - (padding * 2) - 80,
        x: padding * 3 + avatarSize,
    } as ImageConfig);

    const scoreRankText = new Konva.Text({
        x: padding * 3 + avatarSize + 50,
        y: height - (padding * 2) - 80,
        text: `Rank #${score.rank}`,
        fontFamily: "SF-Compact",
        fill: "white",
        fontSize: 40
    });

    const scoreDateText = new Konva.Text({
        x: padding * 3 + avatarSize,
        y: height - (padding * 2) - 35,
        text: scoreDate,
        fontFamily: "SF-Compact",
        fill: "grey",
        fontSize: 35
    });

    layer.add(playerRect, playerAvatarImage, playerNameText, playerHMDImage, playerHMDText, playerRankImage, scoreRankText, scoreDateText, playerCountryImage);
    //#endregion

    //#region scores

    const isScoreImprovement = score.scoreImprovement && (score.scoreImprovement.score != 0 || score.scoreImprovement   .pp != 0);

    if (isScoreImprovement) {
        topScoreConfig.y! -= 20;
        topScoreConfig.height! += 40;
        bottomScoreConfig.y! += 20;
    }

    //#region top

    const ppRect = new Konva.Rect({
        ...topScoreConfig,
        x: leftCol,
        fill: "#8992E8"
    });

    const accuracyRect = new Konva.Rect({
        ...topScoreConfig,
        x: middleCol,
        fill: getColour(score.accuracy)
    });

    const scoreRect = new Konva.Rect({
        ...topScoreConfig,
        x: rightCol,
        fill: "#737373"
    });

    layer.add(accuracyRect, scoreRect);

    const topOpts = {
        height: scoreHeight,
        width: scoreWidth,
        y: topScoreConfig.y!
    }

    if (score.leaderboard.type != LeaderboardType.Unranked) {
        const ppChange = isScoreImprovement && score.scoreImprovement.pp > 0 ? "+" : "";

        layer.add(
            ppRect,
            centerText(scorePoints, 40, { ...topOpts, x: leftCol })
        );

        if (isScoreImprovement)
            layer.add(
                centerText(`${ppChange}${score.scoreImprovement.pp.toFixed(2)}pp`, 35, {
                    ...topOpts,
                    x: leftCol,
                    y: topScoreConfig.y! + 45
                })
            )
    }

    const { format } = new Intl.NumberFormat("en");

    layer.add(
        centerText(scoreAccuracy, 40, { ...topOpts, x: middleCol }),
        centerText(format(scoreScore), 40, { ...topOpts, x: rightCol })
    );

    if (isScoreImprovement) {
        const accImprovement = (score.scoreImprovement.accuracy * 100).toFixed(2);
        const accChange = score.scoreImprovement.accuracy > 0 ? "+" : "";
        const scoreChange = score.scoreImprovement.score > 0 ? "+" : "";
        
        layer.add(
            centerText(`${accChange}${accImprovement}%`, 35, {
                ...topOpts,
                x: middleCol,
                y: topScoreConfig.y! + 45
            }),
            centerText(`${scoreChange}${format(score.scoreImprovement.score)}`, 35, {
                ...topOpts,
                x: rightCol,
                y: topScoreConfig.y! + 45
            })
        );
    }

    //#endregion

    //#region bottom

    const leftAccRect = new Konva.Rect({
        ...bottomScoreConfig,
        x: leftCol,
        fill: "#A82020"
    });

    const rightAccRect = new Konva.Rect({
        ...bottomScoreConfig,
        x: middleCol,
        fill: "#2064A8"
    });

    const comboRect = new Konva.Rect({
        ...bottomScoreConfig,
        x: rightCol,
        fill: "#737373"
    });

    layer.add(leftAccRect, rightAccRect, comboRect);

    const bottomOpts = {
        height: scoreHeight,
        y: bottomScoreConfig.y! + 2
    }

    const baseText = new Konva.Text({ fontFamily: "SF-Compact", fontSize: 37.5 });
    const improvementText = new Konva.Text({ fontFamily: "SF-Compact", fontSize: 32.5 });

    const leftColBaseWidth =  baseText.measureSize(scoreLeft).width;
    const middleColBaseWidth = baseText.measureSize(scoreRight).width;
    const rightColBaseWidth = baseText.measureSize(scoreCombo).width;

    let leftColImproveWidth = 0;
    let middleColImproveWidth = 0;
    let rightColImproveWidth = 0;

    if (isScoreImprovement) {
        const leftAccImprovement = ` ${score.scoreImprovement.accLeft > 0 ? "+" : ""}${score.scoreImprovement.accLeft.toFixed(2)}`;
        const rightAccImprovement = ` ${score.scoreImprovement.accRight > 0 ? "+" : ""}${score.scoreImprovement.accRight.toFixed(2)}`;

        const mistakes = (score.badCuts + score.missedNotes) - score.scoreImprovement.badCuts - score.scoreImprovement.missedNotes;
        const comboImprovement = " vs " + (mistakes != 0 ? `${mistakes}X` : "FC");
        
        leftColImproveWidth = improvementText.measureSize(leftAccImprovement).width;
        middleColImproveWidth = improvementText.measureSize(rightAccImprovement).width;
        rightColImproveWidth = improvementText.measureSize(comboImprovement).width;
        
        layer.add(
            centerText(leftAccImprovement, 32.5, {
                ...bottomOpts,
                width: (scoreWidth - leftColBaseWidth),
                x: leftCol + leftColBaseWidth,
                y: bottomScoreConfig.y! + 3
            }),
            centerText(rightAccImprovement, 32.5, {
                ...bottomOpts,
                width: (scoreWidth - middleColBaseWidth),
                x: middleCol + middleColBaseWidth,
                y: bottomScoreConfig.y! + 3
            }),
            centerText(comboImprovement, 32.5, {
                ...bottomOpts,
                width: (scoreWidth - rightColBaseWidth),
                x: rightCol + rightColBaseWidth,
                y: bottomScoreConfig.y! + 4
            })
        );
    }
    
    layer.add(
        centerText(scoreLeft, 37.5, {
            ...bottomOpts,
            width: scoreWidth - leftColImproveWidth,
            x: leftCol
        }),
        centerText(scoreRight, 37.5, {
            ...bottomOpts,
            width: scoreWidth - middleColImproveWidth,
            x: middleCol
        }),
        centerText(scoreCombo, 37.5, {
            ...bottomOpts,
            width: scoreWidth - rightColImproveWidth,
            x: rightCol
        })
    );

    //#endregion

    //#endregion
   
    const data = stage.toDataURL();
    stage.destroy();

    return data;
}