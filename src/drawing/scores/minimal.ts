import { KonvaImageFromURL, ModifiersList, cacheImage, centerText, getColour, shortDate } from "../utils";
import Konva from "konva";
import { Image, ImageConfig } from "konva/lib/shapes/Image";
import { basename } from "path";
import { TextConfig } from "konva/lib/shapes/Text";
import { Score } from "../../database";
import { LeaderboardType } from "../../database/models/Leaderboard";
import { Modifiers } from "../../database/models/Score";
import { logger } from "../utils";
import drawMinimalLeaderboard from "../components/minimal-leaderboard";
import drawSmallPlayer from "../components/small-player";
import { createImage, createGrid, diff, measure } from "../tools";

export default async (score: Score) => {
    const image = createImage({
        width: 1500,
        height: score.modifiers ? 620 : 550
    });

    //#region constants
    score.leaderboard = score.leaderboard!;

    const songCover = score.leaderboard.difficulty.song.coverImage;
    const playerAvatar = score.user!.avatar;
    const playerCountry = "https://flagsapi.com/" + score.user!.country + "/flat/64.png";

    const scoreScore = score.baseScore != score.modifiedScore ? score.modifiedScore : score.baseScore;
    const scorePoints = `${score.pp.toFixed(2)}pp`;
    const scoreAccuracy = `${(score.accuracy * 100).toFixed(2)}%`;
    const scoreLeft = (score.accLeft ?? 0).toFixed(2);
    const scoreRight = (score.accRight ?? 0).toFixed(2);
    const scoreCombo = score.fullCombo ? "FC" : `${score.missedNotes + score.badCuts}X`;

    //#region setup

    // @ts-ignore

    const [
        songCoverImage,
        playerAvatarImage,
        playerCountryImage
    ] = await Promise.allSettled([
        cacheImage(songCover, "covers", basename(songCover)),
        cacheImage(playerAvatar, "avatars", basename(playerAvatar)),
        cacheImage(playerCountry, "flags", `${score.user!.country}.png`)
    ]);

    if (songCoverImage.status == "rejected") {
        logger.error(`scores: Unable to fetch song cover: ${songCoverImage.reason}`);
        return null;
    }

    if (playerAvatarImage.status == "rejected") {
        logger.error(`scores: Unable to fetch player avatar: ${playerAvatarImage.reason}`);
        return null;
    }

    if (playerCountryImage.status == "rejected") {
        logger.error(`scores: Unable to fetch player country flag: ${playerCountryImage.reason}`);
        return null;
    }

    //#endregion

    //#region background
    const backgroundImage = songCoverImage.value.clone({
        x: 0, y: -(image.width - image.height) / 2,
        width: image.width,
        height: image.width,
        cornerRadius: 0
    } as ImageConfig) as Image;

    const backgroundEffects = new Konva.Rect({
        x: 0, y: 0,
        width: image.width,
        height: image.height,
        fill: "rgba(0, 0, 0, 0.8)"
    });
    
    backgroundImage.cache();
    backgroundImage.filters([Konva.Filters.Blur])
    backgroundImage.blurRadius(5);

    image.add(backgroundImage);
    image.add(backgroundEffects);

    //#endregion


    //#region leaderboard header

    const coverSize = 250;
    const padding = 20;

    await drawMinimalLeaderboard(image.layer, {
        songCoverImage,
        leaderboard: score.leaderboard
    });

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

            image.add(modImage, modText);
        }
    }

    //#endregion
    const isScoreImprovement = score.scoreImprovement && (score.scoreImprovement.score != 0 || score.scoreImprovement.pp != 0);

    const scoreGrid = createGrid({
        entryWidth: 230,
        entryHeight: 75,
        padding: 15,
        columns: 3,
        rows: 2,
        cornerRadius: 10,
        transform({ row, y, height }) {
            if (!isScoreImprovement) return;
            if (row == 0) return { y: y - 20, height: height + 40 }
            return { y: y + 20 }
        },
    }, (draw, opts) => {
        let colour: string;

        if (opts.column == 0 && opts.row == 0) colour = "#8992E8"
        else if (opts.column == 1 && opts.row == 0) colour = getColour(score.accuracy)!;
        else if (opts.column == 2 && opts.row == 0) colour = "#737373";
        else if (opts.column == 0 && opts.row == 1) colour = "#A82020";
        else if (opts.column == 1 && opts.row == 1) colour = "#2064A8";
        else colour = "#737373";
        
        image.add(draw({ colour }));

        if (opts.row == 0) {
            const offset = isScoreImprovement ? 25 : 0;
            // opts.y += 5;
            
            if (opts.column == 0 && score.leaderboard!.type != LeaderboardType.Unranked) {
                image.add(centerText(scorePoints, 40, diff(opts, 'y', offset)));

                if (isScoreImprovement) {
                    const ppChange = (isScoreImprovement && score.scoreImprovement!.pp > 0 ? "+" : "") +
                        `${score.scoreImprovement!.pp.toFixed(2)}pp`;
                    image.add(centerText(ppChange, 35, diff(opts, 'y', -offset)));
                }
            } else if (opts.column == 1) {
                image.add(centerText(scoreAccuracy, 40, diff(opts, 'y', offset)));

                if (isScoreImprovement && score.scoreImprovement) {
                    const accImprovement = (score.scoreImprovement.accuracy * 100).toFixed(2);
                    const accChange = score.scoreImprovement.accuracy > 0 ? "+" : "";
                    
                    image.add(centerText(`${accChange}${accImprovement}%`, 35, diff(opts, 'y', -offset)));
                }
            } else {
                const { format } = new Intl.NumberFormat("en");
                image.add(centerText(format(scoreScore), 40, diff(opts, 'y', offset)));

                if (isScoreImprovement && score.scoreImprovement) {
                    const scoreChange = score.scoreImprovement.score > 0 ? "+" : "";
                    image.add(centerText(`${scoreChange}${format(score.scoreImprovement.score)}`, 35, diff(opts, 'y', -offset)));
                }
            }
        } else {
            if (isScoreImprovement) opts.y += 22.5;

            let base: string;
            let improve: string | null = null;

            if (opts.column == 0) {
                base = scoreLeft;
                if (isScoreImprovement) improve = ` ${score.scoreImprovement!.accLeft > 0 ? "+" : ""}${score.scoreImprovement!.accLeft.toFixed(2)}`;
            } else if (opts.column == 1) {
                base = scoreRight;
                if (isScoreImprovement) improve = ` ${score.scoreImprovement!.accRight > 0 ? "+" : ""}${score.scoreImprovement!.accRight.toFixed(2)}`;
            } else {
                base = scoreCombo;
                if (isScoreImprovement) {
                    const mistakes = (score.badCuts + score.missedNotes) - score.scoreImprovement!.badCuts - score.scoreImprovement!.missedNotes;
                    improve = " vs " + (mistakes != 0 ? `${mistakes}X` : "FC");
                }
            }

            if (improve) {
                const baseWidth = measure(base, 37.5).width;

                image.add(centerText(improve, 32.5, {
                    ...opts,
                    width: scoreGrid.entryWidth - baseWidth,
                    x: opts.x + baseWidth,
                    y: opts.y + 2
                }));
            }
            
            const improveWidth = improve ? measure(improve, 32.5).width : 0;
            image.add(centerText(base, 37.5, { ...opts, width: scoreGrid.entryWidth - improveWidth }));
        }
    });

    scoreGrid.set("x", image.width - scoreGrid.maxWidth - 5);
    scoreGrid.set("y", image.height - scoreGrid.maxHeight - 5 - 30);

    scoreGrid.draw()

    //#region player

    await drawSmallPlayer(image.layer, {
        height: image.height,
        playerAvatarImage,
        playerCountryImage,
        score,
        leftCol: image.width - scoreGrid.maxWidth + padding
    });

    //#endregion

    return image.raw();
}