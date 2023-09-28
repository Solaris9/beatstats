import { IntentsBitField } from "discord.js";

export const COLOURS = {
    Orange: "1113974802827448360",
    Red: "1113974846024589342",
    Blue: "1113975709728247849",
    PureBlue: "1140865512860028978",
    Cyan: "1113975627872215070",
    Purple: "1113975590177996843",
    Green: "1113975549174480966",
    Lime: "1113975485890830336",
    Maroon: "1113975353715724378",
    Pink: "1113975251789959209",
    HotPink: "1140864989352177716",
    Grey: "1113974982851174601",
    White: "1113975135368658985",
    Black: "1113975176313446410",
}

export const intents = [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildVoiceStates
]