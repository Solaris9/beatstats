import Konva from "konva";
import * as DB from "../../database";
import { IScoreStatistic } from "../../types/beatleader";
import drawMinimalLeaderboard from "../components/minimal-leaderboard";
import drawSmallPlayer from "../components/small-player";
import { cacheImage } from "../utils";
import { basename } from "path";
import { logger } from "../utils";

export default async (leaderboard: DB.Leaderboard, me: [DB.Score, IScoreStatistic], compare: [DB.Score, IScoreStatistic]) => {
    const width = 1500;
    const height = 1500;

    const songCover = leaderboard.difficulty.song.coverImage;
    const mePlayerAvatar = me[0].user!.avatar;
    const comparePlayerAvatar = compare[0].user!.avatar;
    const mePlayerCountry = me[0].user!.country;
    const comparePlayerCountry = compare[0].user!.country;
    const isSameCountry = mePlayerCountry == comparePlayerCountry;

    const [
        songCoverImage,
        mePlayerAvatarImage,
        comparePlayerAvatarImage,
        mePlayerCountryImage,
        comparePlayerCountryImage,
    ] = await Promise.allSettled([
        cacheImage(songCover, "covers", basename(songCover)),
        cacheImage(mePlayerAvatar, "avatars", basename(mePlayerAvatar)),
        cacheImage(comparePlayerAvatar, "avatars", basename(comparePlayerAvatar)),
        cacheImage(mePlayerCountry, "flags", `${mePlayerCountry}.png`),
        !isSameCountry ? cacheImage(comparePlayerCountry, "flags", `${comparePlayerCountry}.png`) : null
    ]);

    //#region errors

    if (songCoverImage.status == "rejected") {
        logger.error(`scores: Unable to fetch song cover: ${songCoverImage.reason}`);
        return null;
    }

    if (mePlayerAvatarImage.status == "rejected") {
        logger.error(`scores: Unable to fetch player avatar: ${mePlayerAvatarImage.reason}`);
        return null;
    }

    if (mePlayerCountryImage.status == "rejected") {
        logger.error(`scores: Unable to fetch player country flag: ${mePlayerCountryImage.reason}`);
        return null;
    }

    if (comparePlayerAvatarImage.status == "rejected") {
        logger.error(`scores: Unable to fetch player avatar: ${comparePlayerAvatarImage.reason}`);
        return null;
    }

    if (comparePlayerCountryImage.status == "rejected") {
        logger.error(`scores: Unable to fetch player country flag: ${comparePlayerCountryImage.reason}`);
        return null;
    }

    //#endregion

    // @ts-ignore
    const stage = new Konva.Stage({
        x: 0, y: 0,
        width, height
    });

    stage.listening(false);

    const layer = new Konva.Layer();
    layer.listening(false);
    stage.add(layer);

    await drawMinimalLeaderboard(layer, {
        leaderboard,
        songCoverImage,
    });

    await drawSmallPlayer(layer, {
        score: me[0],
        height,
        playerAvatarImage: mePlayerAvatarImage,
        playerCountryImage: mePlayerCountryImage,
        leftCol: 0
    });

    await drawSmallPlayer(layer, {
        score: me[0],
        height,
        playerAvatarImage: mePlayerAvatarImage,
        playerCountryImage: mePlayerCountryImage,
        leftCol: 0
    });

    const data = stage.toDataURL();
    stage.destroy();

    return data;
}