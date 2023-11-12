import Konva from "konva";
import { join } from "path";
import { writeFile } from "fs/promises"
import { Logger } from "../utils/logger";
import { Image } from "konva/lib/shapes/Image";
import sharp from "sharp";
import { loadImage } from "canvas";

export const logger = new Logger("Drawing");

export const KonvaImageFromURL = (url: string): Promise<Konva.Image> =>
	new Promise((resolve, reject) => Konva.Image.fromURL(url, resolve, reject));

export const cacheImage = async (
	url: string | null,
	type: string,
	key: string
): Promise<Image> => {
	// @ts-ignore
	if (!url) return null;

	const path = join(process.cwd(), "image-cache", type, key.replace(".webp", ".png"));

	try {
		return await KonvaImageFromURL(path);
	} catch {
		if (url.endsWith(".webp")) {
			const res = await fetch(url);
			const arrayBuffer = await res.arrayBuffer();
			const buffer = await sharp(arrayBuffer).toFormat("png").toBuffer();
			url = `data:base64,${buffer.toString("base64")}`;
		}

		const image = await KonvaImageFromURL(url);
		const dataURL = image.toDataURL();
		await writeFile(path, dataURL.split(",")[1], "base64");
		return image;
	}
};

export function getColour(value: string | number) {
    if (typeof value == "string") {
        if (value == "Expert+") return "#8F48DB";
        if (value == "Expert") return "#BF2A42";
        if (value == "Hard") return "#FF6347";
        if (value == "Normal") return "#59B0F4";
        if (value == "Easy") return "#3CB371";
    } else {
        if (value >= 0.95) return "#8F48DB";;
        if (value >= 0.90) return "#BF2A42";
        if (value >= 0.85) return "#FF6347";
        if (value >= 0.80) return "#59B0F4";
        if (value >= 0) return "#3CB371";
    }
}

export function centerText(
    content: string,
    fontSize: number,
    opts: {
        width: number,
        height: number,
        x: number,
        y: number,
    }
) {
    const text = new Konva.Text({
        fontFamily: "SF-Compact",
        fill: "white",
        text: content,
        fontSize,
    });

    const { width } = text.measureSize(content);
    text.setAttrs({
        x: opts.x + (opts.width / 2) - (width / 2),
        y: opts.y! + (opts.height / 2) - 20
    });

    return text;
}

export const shortDate = (date: Date) => {
	return new Date(date.getTime() * 1000).toDateString().slice(4);
}

export function hexToRgb(hex: string) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? {
	  r: parseInt(result[1], 16),
	  g: parseInt(result[2], 16),
	  b: parseInt(result[3], 16)
	} : null;
  }

export function truncate(text: Konva.Text, content: string, remaining: number) {
    let size = text.measureSize(content);

    if (size.width > remaining) {
        while (true) {
            content = content.slice(0, -1);
            size = text.measureSize(content);
            if (size.width < remaining) {
                content = content.slice(0, -3).trimEnd() + "...";
                break;
            }
        }
    }

    text.setText(content);

    return size;
}

export function capitalize(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

type HMD = {
    name: string;
    icon: string;
    color: string;
    priority: number;
};

export const HMDs: Record<number, HMD> = {
	256: {
		name: 'Quest 2',
		icon: 'oculus.svg',
		color: 'invert(49%) sepia(26%) saturate(5619%) hue-rotate(146deg) brightness(93%) contrast(86%)',
		priority: 1,
	},
	512: {
		name: 'Quest 3',
		icon: 'meta.svg',
		color: 'invert(49%) sepia(26%) saturate(5619%) hue-rotate(260deg) brightness(93%) contrast(86%)',
		priority: 2,
	},
	64: {
		name: 'Valve Index',
		icon: 'index.svg',
		color: 'invert(81%) sepia(27%) saturate(6288%) hue-rotate(344deg) brightness(103%) contrast(103%)',
		priority: 2,
	},
	1: {
		name: 'Rift CV1',
		icon: 'oculus.svg',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 3,
	},
	2: {
		name: 'Vive',
		icon: 'vive.svg',
		color: 'invert(54%) sepia(78%) saturate(2598%) hue-rotate(157deg) brightness(97%) contrast(101%)',
		priority: 4,
	},
	60: {
		name: 'Pico 4',
		icon: 'piconeo.png',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 5,
	},
	61: {
		name: 'Quest Pro',
		icon: 'meta.svg',
		color: '',
		priority: 6,
	},
	8: {
		name: 'Windows Mixed Reality',
		icon: 'wmr.svg',
		color: 'invert(34%) sepia(67%) saturate(7482%) hue-rotate(193deg) brightness(103%) contrast(101%)',
		priority: 7,
	},
	16: {
		name: 'Rift S',
		icon: 'oculus.svg',
		color: 'invert(96%) sepia(9%) saturate(5456%) hue-rotate(170deg) brightness(100%) contrast(107%)',
		priority: 8,
	},
	65: {
		name: 'Controllable',
		icon: 'controllable.svg',
		color: '',
		priority: 8,
	},
	32: {
		name: 'Quest',
		icon: 'oculus.svg',
		color: 'invert(73%) sepia(55%) saturate(5479%) hue-rotate(271deg) brightness(106%) contrast(107%)',
		priority: 9,
	},
	4: {
		name: 'Vive Pro',
		icon: 'vive.svg',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 10,
	},
	35: {
		name: 'Vive Pro 2',
		icon: 'vive.svg',
		color: 'invert(79%) sepia(68%) saturate(5755%) hue-rotate(232deg) brightness(90%) contrast(109%)',
		priority: 11,
	},
	128: {
		name: 'Vive Cosmos',
		icon: 'vive.svg',
		color: 'invert(11%) sepia(100%) saturate(7426%) hue-rotate(297deg) brightness(85%) contrast(109%)',
		priority: 12,
	},
	36: {
		name: 'Vive Elite',
		icon: 'vive.svg',
		color: 'invert(25%) sepia(89%) saturate(5057%) hue-rotate(278deg) brightness(108%) contrast(85%)',
		priority: 13,
	},
	47: {
		name: 'Vive Focus',
		icon: 'vive.svg',
		color: 'invert(48%) sepia(91%) saturate(4410%) hue-rotate(340deg) brightness(94%) contrast(97%)',
		priority: 14,
	},
	38: {
		name: 'Pimax 8K',
		icon: 'pimax.png',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 15,
	},
	39: {
		name: 'Pimax 5K',
		icon: 'pimax.png',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 16,
	},
	40: {
		name: 'Pimax Artisan',
		icon: 'pimax.png',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 17,
	},
	33: {
		name: 'Pico Neo 3',
		icon: 'piconeo.png',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 18,
	},
	34: {
		name: 'Pico Neo 2',
		icon: 'piconeo.png',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 19,
	},
	41: {
		name: 'HP Reverb',
		icon: 'hp.png',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 20,
	},
	42: {
		name: 'Samsung WMR',
		icon: 'samsung.png',
		color: '',
		priority: 21,
	},
	43: {
		name: 'Qiyu Dream',
		icon: 'iqiyi.png',
		color: '',
		priority: 22,
	},
	45: {
		name: 'Lenovo Explorer',
		icon: 'lenovo.png',
		color: '',
		priority: 23,
	},
	46: {
		name: 'Acer WMR',
		icon: 'acer.svg',
		color: '',
		priority: 24,
	},
	48: {
		name: 'Arpara',
		icon: 'arpara.png',
		color: '',
		priority: 25,
	},
	49: {
		name: 'Dell Visor',
		icon: 'dell.svg',
		color: '',
		priority: 26,
	},
	55: {
		name: 'Huawei VR',
		icon: 'huawei.png',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 27,
	},
	56: {
		name: 'Asus WMR',
		icon: 'asus.svg',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 28,
	},
	51: {
		name: 'Vive DVT',
		icon: 'vive.svg',
		color: 'invert(69%) sepia(52%) saturate(501%) hue-rotate(107deg) brightness(98%) contrast(86%)',
		priority: 29,
	},
	52: {
		name: 'glasses20',
		icon: 'unknown.svg',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 30,
	},
	53: {
		name: 'Varjo',
		icon: 'varjo.svg',
		color: '',
		priority: 14,
	},
	54: {
		name: 'Vaporeon',
		icon: 'unknown.svg',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 32,
	},
	57: {
		name: 'Cloud XR',
		icon: 'unknown.svg',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 33,
	},
	58: {
		name: 'VRidge',
		icon: 'unknown.svg',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 34,
	},
	50: {
		name: 'e3',
		icon: 'unknown.svg',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 35,
	},
	59: {
		name: 'Medion Eraser',
		icon: 'unknown.svg',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 36,
	},

	37: {
		name: 'Miramar',
		icon: 'unknown.svg',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 37,
	},
	0: {
		name: 'Unknown headset',
		icon: 'unknown.svg',
		color: 'invert(70%) sepia(65%) saturate(4492%) hue-rotate(354deg) brightness(96%) contrast(91%)',
		priority: 38,
	},
	44: {
		name: 'Disco',
		icon: 'disco.png',
		color: 'invert(99%) sepia(3%) saturate(82%) hue-rotate(58deg) brightness(118%) contrast(100%)',
		priority: 39,
	},
};

export const ModifiersList: Record<string, string> = {
    NF: 'NoFailIcon.png',
    OL: 'OneLifeIcon.png',
    BE: 'FourLivesIcon.png',
    NB: 'NoBombsIcon.png',
    NO: 'NoObstaclesIcon.png',
    NA: 'NoArrowsIcon.png',
    GN: 'GhostNotes.png',
    DA: 'DisappearingArrows.png',
    SC: 'SmallNotesIcon.png',
    PM: 'ProModeIcon.png',
    SA: 'PreciseAnglesIcon.png',
    OD: 'OldDotsIcon.png',
    SS: 'SlowerSongIcon.png',
    FS: 'FasterSongIcon.png',
    SF: 'SuperFastSongIcon.png',
    OP: 'OutsidePlatformIcon.png',
};
