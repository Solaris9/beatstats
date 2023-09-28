import { lstat } from "fs/promises";

export const store = <T>() => {
    let value: T;

    return {
        set: (newValue: T) => value = newValue,
        get: () => value
    }
};

export function trim(template: TemplateStringsArray, ...args: any[]) {
    return template
        .reduce((acc, cur, i) => {
            let arg = args[i];

            if (typeof arg === 'function') arg = arg();
            if (Array.isArray(arg)) arg = arg.join('');

            return acc + cur + (arg ?? '');
        }, '')
        .split("\n")
        .map(s => s.trim())
        .join("\n");
}

export function timeAgo(time: number) {
    const difference = (Date.now() / 1000) - time;

    const intl = new Intl.RelativeTimeFormat("en");

    let value: number;
    let format: Intl.RelativeTimeFormatUnit;

    if (difference < 3_600) {
        format = "minutes";
        value = difference / 60;
    } else if (difference < 86_400) {
        format = "hours";
        value = difference / 3_600;
    } else if (difference < (31 * 86_400)) {
        format = "days";
        value = difference / 86_400;
    } else {
        format = "months";
        value = difference / (31 * 84_400);
    }

    return intl.format(-Math.floor(value), format);
}

export const exists = async (dir: string) => {
    try {
        await lstat(dir);
        return true;
    } catch {
        return false;
    }
}