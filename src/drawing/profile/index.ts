import { AttachmentBuilder } from "discord.js";
import { User } from "../../database";
import minimal from "./minimal";
import { IPlayer } from "../../types/beatleader";

type Draw = (user: User, player: IPlayer) => Promise<string | null>;

const map = {
    minimal
} satisfies Record<string, Draw>;

type Types = keyof typeof map;

export const drawProfile = async (type: Types, user: User, player: IPlayer) => {
    const draw = map[type] ?? minimal;
    const dataUrl = await draw(user, player);
    if (dataUrl == null) return null;
    const data = dataUrl.split(",")[1];
    const buffer = Buffer.from(data, "base64");
    
    return new AttachmentBuilder(buffer, {
        name: `${user.beatleader}.png`
    });
}
