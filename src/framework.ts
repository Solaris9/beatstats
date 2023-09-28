import { Client, ChatInputCommandInteraction, Message, Collection, Interaction, StringSelectMenuInteraction, StringSelectMenuBuilder, ButtonInteraction, ButtonBuilder, PermissionsBitField } from "discord.js";
import { glob } from "glob";
import { Logger } from "./utils/logger.js";

const logger = new Logger("Loader");

export enum ChatInteractionOptionType {
    SUB_COMMAND = 1,
    SUB_COMMAND_GROUP,
    STRING,
    NUMBER,
    BOOLEAN,
    USER,
    CHANNEL,
    ROLE,
    MENTIONABLE,
    DOUBLE,
    ATTACHMENT
}

export type ChatInteractionOptionChoice = {
    name: string;
    value: string | number;
}

export type ChatInteractionOption = {
    type: ChatInteractionOptionType;
    name: string;
    description: string;
    required?: boolean;
    choices?: ChatInteractionOptionChoice[];
    options?: ChatInteractionOption[];
    min_value?: number;
    max_value?: number;
    min_length?: number;
    max_length?: number;
    autocomplete?: boolean;
};

export type ChatInteractionOptions = {
    name: string;
    description: string;
    options?: ChatInteractionOption[];
    default_member_permission?: number;
    dm_permission?: boolean;
    nsfw?: boolean;
};

export class Command {
    constructor(
        public options: ChatInteractionOptions,
        public config?: {
            dev?: boolean,
            permissions?: bigint[]
        }
    ) { }
    
    async test?(interaction: Interaction): Promise<void>;
    async execute?(interaction: ChatInputCommandInteraction): Promise<void>;
    async onStringSelect?(interaction: StringSelectMenuInteraction): Promise<void>;
    async onButtonClick?(interaction: ButtonInteraction): Promise<void>;

    createStringSelect(id?: string) {
        return new StringSelectMenuBuilder()
            .setCustomId(this.options.name + (id ? `-${id}` : ""));
    };

    createButton(id?: string) {
        return new ButtonBuilder()
            .setCustomId(this.options.name + (id ? `-${id}` : ""));
    }
}

const MessageCommandSym = Symbol("message command");

export default (client?: Client) => {
    const events = [] as [boolean, string, (client: Client, ...args: unknown[]) => Promise<void>][];
    const interactions = new Collection<string, Command>();
    const commands = new Collection<string, (client: Client, message: Message, ...args: unknown[]) => Promise<void>>();

    logger.info(`Starting load...`);
    const files = glob.sync("./dist/interactions/*.js");

    for (let file of files) {
        logger.debug(`Reading ${file}`);
        const mod = require(`./${file.slice(5)}`);
        const entries = Object.keys(mod);

        for (let entry of entries) {
            if (!mod[entry]) continue;
            
            if (entry.startsWith("on")) {
                const once = entry.startsWith("once");

                let name = entry.slice(once ? 4 : 2);
                name = name[0].toLowerCase() + name.slice(1);
                logger.info(`Loading event ${entry}`);

                events.push([once, name, (mod[entry] as Function).bind(null, client)]);
            } else if (mod[entry].prototype instanceof Command) {
                const inst = new mod[entry] as Command;
                interactions.set(inst.options.name, inst);
                logger.info(`Loading command ${inst.options.name}`);
            } else if (typeof mod[entry] == "object" && JSON.stringify(mod[entry]).at(0) == "{" && "type" in mod[entry] && mod[entry].type == MessageCommandSym) {
                const name = (mod[entry].name ?? entry).toLowerCase();
                commands.set(name, mod[entry].handle);
                logger.info(`Loading message command ${name}`);
            }
        }
    }
    
    logger.info(`Finished loading`);

    return {
        interactions,
        events,
        commands
    }
}

type CommandFunction = (client: Client, message: Message, args: string[]) => Promise<void>;
type MessageCommand = {
    type: Symbol;
    name: string | null;
    handle: CommandFunction;
}

export function MessageCommand(fn: CommandFunction): MessageCommand;
export function MessageCommand(name: string, fn: CommandFunction): MessageCommand;
export function MessageCommand(nameOrFn: string | CommandFunction, fn?: CommandFunction): MessageCommand {
    return {
        type: MessageCommandSym,
        name: fn ? nameOrFn as string : null,
        handle: (fn ?? nameOrFn) as CommandFunction
    };
}

// export enum InteractionType {
//     Raw,
//     Event,
//     Message,
//     User,
//     Chat
// }

// export type BaseInteractionOptions = {
//     name?: string;
// }

// export type CommandData<T = BaseInteractionOptions> = {
//     type: InteractionType;
//     options: T;
//     handler: Function;
// }

// export type MessageInteractionOptions = BaseInteractionOptions & {
//     localizations?: ContextMenuCommandBuilder["name_localizations"];
//     permissions?: string;
//     dm?: boolean;
// }

// export type EventOptions = BaseInteractionOptions & {
//     once?: boolean;
// };

// export type RawOptions = BaseInteractionOptions & {};
// export type UserInteractionOptions = BaseInteractionOptions & {};

// type InteractionCommand = {
//     (type: InteractionType.Raw, options: RawOptions, handler: (this: Client, message: Message, args: string[]) => Promise<void>): CommandData;
//     (type: InteractionType.Raw, handler: (this: Client, message: Message, args: string[]) => Promise<void>): CommandData;

//     (type: InteractionType.User, options: UserInteractionOptions, handler: (this: Client, interaction: UserContextMenuCommandInteraction) => Promise<void>): CommandData;
//     (type: InteractionType.User, handler: (this: Client, interaction: UserContextMenuCommandInteraction) => Promise<void>): CommandData;

//     (type: InteractionType.Chat, options: ChatInteractionOptions, handler: (this: Client, interaction: ChatInputCommandInteraction) => Promise<void>): CommandData;
//     (type: InteractionType.Chat, handler: (this: Client, interaction: ChatInputCommandInteraction) => Promise<void>): CommandData;
    
//     (type: InteractionType.Event, options: EventOptions, handler: (this: Client, event?: any) => Promise<void>): CommandData;
//     (type: InteractionType.Event, handler: (this: Client, event?: any) => Promise<void>): CommandData;

//     (type: InteractionType.Message, options: MessageInteractionOptions, handler: (this: Client, interaction: MessageContextMenuCommandInteraction) => Promise<void>): CommandData;
//     (type: InteractionType.Message, handler: (this: Client, interaction: MessageContextMenuCommandInteraction) => Promise<void>): CommandData;
// };

// export const Command: InteractionCommand = (
//     type,
//     optionsOrHandler: BaseInteractionOptions | Function,
//     handler?: Function
// ) => ({
//     __command: true,
//     type,
//     options: handler ? optionsOrHandler : {},
//     handler: (handler ?? optionsOrHandler) as Function
// });

// export default (client?: Client) => {
//     const interactions = [] as (CommandData & { name: string })[];
//     const events = [] as (CommandData<EventOptions> & { name: string })[];
//     const commands = new Collection<string, CommandData["handler"]>();

//     const files = glob.sync("./dist/{events,interactions}/*.js");
//     for (let file of files) {
//         const mod = require(`./${file.slice(5)}`);
//         const entries = Object.entries(mod)
//             .filter(([, data]) => "__command" in (data as any));
        
//         for (let [name, data] of entries as [string, CommandData][]) {
//             let interactionName = file.slice(file.lastIndexOf("/") + 1, -3);
//             if (name != "default") interactionName = name;
//             if (data.options.name) interactionName = data.options.name;

//             if (client) data.handler = data.handler.bind(client);

//             switch (data.type) {
//                 case InteractionType.Event:
//                     events.push({ name: interactionName, ...data });
//                     break;
//                 case InteractionType.Raw:
//                     commands.set(interactionName.toLowerCase(), data.handler);
//                     break;
//                 case InteractionType.Message:
//                 case InteractionType.User:
//                 case InteractionType.Chat:
//                     interactions.push({
//                         name: interactionName.replace(/[A-Z]/g, m => "-" + m.toLowerCase()),
//                         ...data
//                     });
//                     break;
//             }
//         }
//     }

//     return {
//         interactions,
//         events,
//         commands
//     }
// }