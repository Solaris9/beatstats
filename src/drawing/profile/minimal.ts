import Konva from "konva";
import { Image, ImageConfig } from "konva/lib/shapes/Image";
import { User } from "../../database";
import { cacheImage, truncate, logger, KonvaImageFromURL, hexToRgb, capitalize, HMDs } from "../utils";
import { basename, join } from "path";
import { readFileSync } from "fs";
import { IPlayer } from "../../types/beatleader";

const path = join(process.cwd(), "assets", "images");
// const MapperIconRaw = readFileSync(join(path, "Note.png"), "base64");
// const ArtistIconRaw = readFileSync(join(path, "Music.png"), "base64");
const HMDIconRaw = readFileSync(join(path, "HMD.png"), "base64");
const GlobeIconRaw = readFileSync(join(path, "Globe.png"), "base64");

export default async (user: User, player: IPlayer) => {
    const height = 400;
    const width = 1400;
    const avatarSize = 325;

    const playerName = player.name;
    const playerCountry = "https://flagsapi.com/" + player.country + "/flat/64.png";
    const playerAvatar = player.avatar;
    const playerBanner = player.profileSettings.profileCover;

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
    
    // playerBannerImage is nullable but i can't figure out how to make it show in types
    const [
        playerAvatarImage,
        playerBannerImage,
        playerCountryImage
    ] = await Promise.allSettled([
        cacheImage(playerAvatar, "avatars", basename(playerAvatar)),
        cacheImage(playerBanner, "banners", basename(playerBanner ?? "")),
        cacheImage(playerCountry, "flags", `${user.country}.png`)
    ]);

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

    if (playerBanner) {
        if (playerBannerImage.status == "rejected") {
            logger.error(`scores: Unable to fetch player banner: ${playerBannerImage.reason}`);
            return null;
        }

        const bannerHeight = playerBannerImage.value.height();
        const bannerWidth = playerBannerImage.value.width();

        let w = bannerWidth * height / bannerHeight;
        let h = bannerHeight * width / bannerWidth;
        let x: number = 0;
        let y: number = 0;

        if (w < width) {
            w = width;
            y = -(h - height) / 2;
        } else {
            h = height;
            x = -(w - width) / 2;
        }

        const bannerImage = playerBannerImage.value.clone({
            x, y, width: w, height: h, cornerRadius: 0
        } as ImageConfig) as Image;

        bannerImage.cache();
        bannerImage.filters([Konva.Filters.Blur])
        bannerImage.blurRadius(2.5);

        const bannerEffects = new Konva.Rect({
            x: 0, y: 0,
            width, height,
            fillLinearGradientStartPoint: { x: 0, y: 100 },
            fillLinearGradientEndPoint: { x: 0, y: height - 100 },
            fillLinearGradientColorStops: [
                0, "rgba(0, 0, 0, 0.55)",
                2, "rgba(0, 0, 0, 0.90)"
            ],
        });
    
        layer.add(bannerImage);
        layer.add(bannerEffects);
    } else {
        const background = new Konva.Rect({
            x: 0, y: 0,width, height,
            fill: "rgba(70, 70, 70)",
        });
    
        layer.add(background);
    }

    //#endregion

    //#region player

    playerAvatarImage.value.setAttrs({
        x: 37.5,
        y: 37.5,
        width: avatarSize,
        height: avatarSize,
        cornerRadius: 1000,
    } as ImageConfig);

    layer.add(playerAvatarImage.value);

    const playerNameText = new Konva.Text({
        x: (37.5 * 2) + avatarSize,
        y: 37.5,
        fontFamily: "SF-Compact",
        fontVariant: "bold",
        fill: "#72a8ff",
        fontSize: 80
    });

    const playerRemaining = width - (37.5 * 3) - avatarSize;
    truncate(playerNameText, playerName, playerRemaining);
    layer.add(playerNameText);

    const playerNameHeight = playerNameText.height();

    const formatter = Intl.NumberFormat("en")

    const playerStats = [
        [GlobeIconRaw, `#${formatter.format(player.rank)}`, "#72a8ff"],
        [playerCountryImage.value, `#${formatter.format(player.countryRank)}`, "#72a8ff"],
        [null, `${formatter.format(player.pp)}pp`, "#8992e8"],
    ] as [icon: string | null | Image, Text: string, colour: string][];

    let statusLastWidth = (37.5 * 2) + avatarSize;

    for (const [icon, text, colour] of playerStats) {
        if (icon) {
            const isImage = typeof icon != "string";
            const iconImage = isImage ? icon :
                await KonvaImageFromURL(`data:image/png;base64,${icon}`);
    
            iconImage.setAttrs({
                width: 60,
                height: 60,
                x: statusLastWidth,
                y: 50 + playerNameHeight,
            } as ImageConfig);

            if (!isImage) {
                iconImage.cache();
                iconImage.filters([Konva.Filters.RGB]);
                
                const { r, g, b } = hexToRgb(colour)!;
                iconImage.red(r);
                iconImage.green(g);
                iconImage.blue(b);
            }

            layer.add(iconImage);
        }
        
        const statusText = new Konva.Text({
            x: statusLastWidth + (icon ? 70 : 0),
            y: 50 + playerNameHeight,
            fontFamily: "SF-Compact",
            fontSize: 55,
            fill: colour,
            text
        });

        const size = statusText.measureSize(text)
        statusLastWidth += size.width + 20 + (icon ? 70 : 0);
        layer.add(statusText);
    }
    
    //#endregion
   
    //#region stats

    const stats = [
        [`Top PP | ${player.scoreStats.topPp.toFixed(2)}`, "#8992e8"],
        [`Median Acc | ${(player.scoreStats.medianAccuracy * 100).toFixed(2)}%`, "#3273dc"],
        [`Platform | ${capitalize(player.scoreStats.topPlatform)}`, "#3273dc"],
        [`Headset | ${(HMDs[player.scoreStats.topHMD] ?? { name: "Unknown" }).name}`, "#3273dc"],
    ] as [name: string, colour: string][];

    const startGridX = (37.5 * 2) + avatarSize;
    const gap = 15;

    let currentGridX = startGridX;
    let currentGridY = 37.5 + playerNameHeight + 100;

    for (let [text, colour] of stats) {
        const statText = new Konva.Text({
            x: currentGridX + 10,
            y: currentGridY + 5,
            text,
            fontFamily: "SF-Compact",
            fontSize: 45,
            fill: "white"
        });

        const statRect = new Konva.Rect({
            cornerRadius: 10,
            fill: colour,
            x: currentGridX,
            y: currentGridY,
            height: 55,
            width: statText.measureSize(text).width + 20
        });

        currentGridX += statRect.width() + gap;
        if (currentGridX > width - 50) {
            currentGridX = startGridX;
            currentGridY += 55 + gap;

            statRect.x(currentGridX);
            statRect.y(currentGridY);
            statText.x(currentGridX + 10);
            statText.y(currentGridY + 5);

            currentGridX += statRect.width() + gap;
        }

        layer.add(statRect, statText);
    }

    //#endregion

    const data = stage.toDataURL();
    stage.destroy();

    return data;
}