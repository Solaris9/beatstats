import { Attachment, Base, ButtonBuilder, ButtonInteraction, ChatInputCommandInteraction, Client, Collection, Message, Role, StringSelectMenuBuilder, StringSelectMenuInteraction, User } from "discord.js";
import { User as DBUser } from "./database";
import { glob } from "glob";
import { Logger } from "./utils/logger.js";
import "reflect-metadata"
import { CreateUserMethod, createUser } from "./database/models/User.js";

const logger = new Logger("Loader");
const MessageCommandSym = Symbol("message command");
export const linkDiscordMessage = "Please link your Discord account with BeatLeader by going to <https://www.beatleader.xyz/signin/socials>.";

// declare module "./test.js" {
//     interface CustomOptions {}
// }

//#region types

type Class = new () => any;

export type CommandInstance = {
    __id: string;
    __custom: CustomOptions;
    __data: ChatInteractionOption;
    __handle(int: ChatInputCommandInteraction): Promise<Function>;
    onStringSelect(int: StringSelectMenuInteraction): Promise<void>;
    onButtonClick(int: ButtonInteraction): Promise<void>;
}

export class BaseCommand implements Omit<CommandInstance, "__handle" | "onStringSelect" | "onButtonClick"> {
    declare __id: string;
    declare __custom: CustomOptions;
    declare __data: ChatInteractionOption;
    declare static id: string;
    
    static get mention() {
        const data = Reflect.getMetadata("@data", this.prototype) as ChatInteractionOption;
        return (rest?: string) => `</${data.name}${rest ? ` ${rest}` : ""}:${this.id}>`
    }
    
}

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

//#endregion

//#region utils

enum ArgType {
    STRING = 3,
    NUMBER,
    BOOLEAN,
    USER,
    CHANNEL,
    ROLE,
    MENTIONABLE,
    DOUBLE,
    ATTACHMENT
}

Arg.Type = ArgType;

function typeFor(type: any, target: any, key: string, index: number, defaults?: ArgType) {
    if (type == Object && typeof defaults == "undefined")
        throw new Error(`${target.name}.${key} argument ${index} command type can't be found. Please specify as the last Arg() argument.`);

    if (typeof defaults == "number") return defaults;

    if (type == String) return 3;
    if (type == Number) return 4;
    if (type == Boolean) return 5;

    switch (type.constructor) {
        case User:
            return 6;
        case Role:
            return 8;
        case Attachment:
            return 11;
    }

    throw new Error(`${target.name}.${key} argument ${index} command type is not valid.`);
}

export function parseParams(fn: Function): [string, boolean][] {
    const str = fn.toString();

    return str
        .slice(0, str.indexOf("\n"))
        .slice(str.indexOf("(") + 1, str.lastIndexOf(")"))
        .replace(/\s+/g, "")
        .split(",")
        .map(p => p.match(/(\w+)(?:=(.+))?/)!)
        .slice(1)
        .map(r => [r[1], !!r[2]]);
}

//#endregion

//#region decorators

export function Command(name: string, description: string) {
    return function (target: any) {
        const data = { name, description, type: ChatInteractionOptionType.SUB_COMMAND, options: [] };
        Reflect.defineMetadata("@data", data, target.prototype);

        const cls = class extends target {
            declare __data: ChatInteractionOption;

            __handle(int: ChatInputCommandInteraction) {
                const group = int.options.getSubcommandGroup(false);
                const sub = int.options.getSubcommand(false);
                const ctx = new CommandContext(int);
        
                if (!group && !sub) {
                    const args = parseArguments(target, "execute", this.__data, int)
                    return this.execute(ctx, ...args);
                }
                
                let option = this.__data as ChatInteractionOption;
        
                if (group && sub) {
                    option = this.__data.options?.find(o =>
                        o.type == ChatInteractionOptionType.SUB_COMMAND_GROUP &&
                        o.name == group
                    )!;
                }

                option = this.__data.options?.find(o =>
                    o.type == ChatInteractionOptionType.SUB_COMMAND &&
                    o.name == sub
                )!;

                if ("_handle" in option && option._handle as string in this) {
                    const name = option._handle as string;
                    const args = parseArguments(target, name, option, int);
                    return this[name](ctx, ...args);
                }

                let name: string = "";
                if (group && sub) name = `${group}.${sub}`;
                else if (!group && sub) name = sub;

                throw new Error(`Unable to find handle method for ${name}`);
            }
        }

        Object.defineProperty(cls, "name", { get: () => target.name });

        return cls;
    } as any;
}

export interface CustomOptions {
    dev?: bigint[];
    permissions?: bigint[];
}

export function Custom(opts: CustomOptions) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const data: CustomOptions = Reflect.getMetadata("@custom", target) ?? {};
        Reflect.defineMetadata("@custom", { ...data, [propertyKey]: opts }, target);
    }
}

export function SubCommand(description: string);
export function SubCommand(group: string, description: string);
export function SubCommand(group: string, name: string, description: string);
export function SubCommand(groupOrDescription: string, descriptionOrName?: string, description?: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        let group: string | undefined = undefined, name: string;

        if (groupOrDescription && descriptionOrName && description) {
            group = groupOrDescription;
            name = descriptionOrName;
        } else if (groupOrDescription && descriptionOrName && !description) {
            group = groupOrDescription;
            name = propertyKey;
            description = descriptionOrName;
        } else {
            name = propertyKey
            description = groupOrDescription
        }

        const option = { group, name, description, type: ChatInteractionOptionType.SUB_COMMAND, _handle: propertyKey };
        const data = Reflect.getMetadata(propertyKey, target);
        Reflect.defineMetadata(propertyKey, data ? { ...data, ...option } : option, target);
    } as any;
}

export function Group(description: string);
export function Group(name: string, description: string);

export function Group(descriptionOrName: string, description?: string) {
    return function (target: any, propertyKey: PropertyKey, descriptor: PropertyDescriptor) {
        target.constructor[propertyKey] = propertyKey;

        const name = description ? descriptionOrName : propertyKey;
        description = description ?? descriptionOrName;
        const data = { name, description, type: ChatInteractionOptionType.SUB_COMMAND_GROUP, options: [] };

        const groups = Reflect.getMetadata("@groups", target) ?? [];
        groups.push(data);
        Reflect.defineMetadata("@groups", groups, target);
    } as any;
}

export function Arg(description: string);
export function Arg(description: string, type: ArgType);

export function Arg(description: string, type?: ArgType) {
    return function (target: any, propertyKey: string, parameterIndex: number) {
        const params = parseParams(target[propertyKey]);

        const types = Reflect.getMetadata("design:paramtypes", target, propertyKey);
        type = typeFor(types[parameterIndex], target, propertyKey, parameterIndex, type);
        const required = types[parameterIndex] != Object; // string | undefined = Object

        const name = params[parameterIndex - 1][0].replace(/_/g, '-');
        const option = { name, description, type, required };

        const data = Reflect.getMetadata(propertyKey, target) ?? {};
        if (!data.options) data.options = [];
        data.options.push(option);

        Reflect.defineMetadata(propertyKey, data, target);
    } as any;
}

export type ChoiceValueTuple = [string, string | number][];
export type ChoiceValueObject = { name: string; value: string }[];

export function Choices(choices: ChoiceValueTuple);
export function Choices(choices: ChoiceValueObject);
export function Choices(choices: ChoiceValueTuple | ChoiceValueObject) {
    return function (target: any, propertyKey: string, parameterIndex: number) {
        const params = parseParams(target[propertyKey]);
        const name = params[parameterIndex - 1][0].replace(/_/g, '-');

        const data = Reflect.getMetadata(propertyKey, target) as ChatInteractionOption;
        
        const option = data.options!.find(o => o.name == name) ;
        if (!option) throw new Error("Decorator Choices must be called before Arg.");

        if (!Array.isArray(choices[0])) option.choices = choices as ChoiceValueObject;
        else option.choices = (choices as ChoiceValueTuple).map(([name, value]) => ({ name, value }));

        Reflect.defineMetadata(propertyKey, data, target);
    } as any;
}

type BoundsOptions = {
    min?: number;
    max?: number;
}

export function Bounds(opts: BoundsOptions) {
    return function (target: any, propertyKey: string, parameterIndex: number) {
        const params = parseParams(target[propertyKey]);
        const name = params[parameterIndex - 1][0].replace(/_/g, '-');

        const data = Reflect.getMetadata(propertyKey, target);
        
        const option = data.options.find(o => o.name == name) as ChatInteractionOption;
        if (!option) throw new Error("Decorator Bounds must be called before Arg.");
        
        if (opts.min != null) option.min_value = opts.min;
        if (opts.max != null) option.max_value = opts.max;

        Reflect.defineMetadata(propertyKey, data, target);
    } as any;
}

//#endregion

//#region logic

export function createStringSelect(cmd: Class, id?: string) {
    const data = Reflect.getMetadata("@data", cmd.prototype) as ChatInteractionOption;

    return new StringSelectMenuBuilder()
        .setCustomId(data.name + (id ? `-${id}` : ""));
}

export function createButton(cmd: Class, id?: string) {
    const data = Reflect.getMetadata("@data", cmd.prototype) as ChatInteractionOption;
    
    return new ButtonBuilder()
        .setCustomId(data.name + (id ? `-${id}` : ""));
}

const converterMap = {
    3: "getString",
    4: "getNumber",
    5: "getBoolean",
    6: "getUser",
    7: "getChannel",
    8: "getRole",
    9: "getMentionable",
    10: "getNumber",
    11: "getAttachment",
}

function parseArguments(
    target: Class,
    name: string,
    data: ChatInteractionOption,
    int: ChatInputCommandInteraction
) {
    const params = parseParams(target.prototype[name]);
    const parsed = [] as any[];

    for (let i = 0; i < params.length; i++) {
        const param_fixed = params[i][0].replace(/_/g, '-');

        const types = Reflect.getMetadata("design:paramtypes", target.prototype, name);
        const required = types[i + 1] != Object; // string | undefined = Object

        const option = data.options!.find(o => o.name == param_fixed)!;

        const converter = converterMap[option.type];
        const value = int.options[converter](param_fixed, required);
        
        parsed.push(params[i][1] ? undefined : value);
    }

    return parsed;
}

function loadCommand(cls: Class): CommandInstance {
    const keys = Reflect.getMetadataKeys(cls.prototype).filter(k => !k.startsWith("@"));
    const data = Reflect.getMetadata("@data", cls.prototype) as ChatInteractionOptions;
    const groups = Reflect.getMetadata("@groups", cls.prototype) as ChatInteractionOption[];
    const custom = (Reflect.getMetadata("@custom", cls.prototype) ?? {}) as CustomOptions;

    if (!keys.length && "execute" in cls.prototype) keys.push("execute");
    
    if (!keys.length) {
        throw new Error(`${cls.name} requires an 'execute' function if no subcommands exist.`);
    } else if (keys.length == 1 && keys[0] == "execute") {
        const option = Reflect.getMetadata("execute", cls.prototype);
        if (option) data.options = option.options;

        const inst = new cls();
        inst.__custom = custom;
        inst.__data = data;

        return inst;
    }

    for (let key of keys) {
        const option = Reflect.getMetadata(key, cls.prototype);
        if (!option.name) continue;
        
        if (option.group) {
            let group = data.options!.find(o => o.type == 2 && o.name == option.group);
            if (!group) {
                group = groups.find(o => o.name == option.group)!;
                data.options!.push(group);
            }

            group.options!.push(option);
            delete option.group;
        } else {
            data.options!.push(option);
        }
    }

    const inst = new cls();
    inst.__custom = custom;
    inst.__data = data;

    return inst;
}

//#endregion

export class CommandContext {
    constructor(public interaction: ChatInputCommandInteraction) {}

    get user() {
        let discord = this.interaction.user!.id;
        const that = this;

        return async (id?: string | false) => {
            if (id) discord = id;

            let player = await DBUser.findOne({ where: {  discord } });
            if (!player) {
                if (id == false) return;
                player = await createUser(CreateUserMethod.Discord, discord);

                if (!player) {
                    await that.interaction.editReply(linkDiscordMessage);
                    return;
                }
            }

            return player;
        }
    }

    defer(ephemeral: boolean = false) {
        return this.interaction.deferReply({ ephemeral });
    }

    edit: ChatInputCommandInteraction["editReply"] = (options: any) =>
        this.interaction.editReply(options);   
}

export default (client?: Client) => {
    const events = [] as [boolean, string, (client: Client, ...args: unknown[]) => Promise<void>][];
    const interactions = new Collection<string, CommandInstance>();
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
            } else if (
                typeof mod[entry] == "function" &&
                mod[entry].toString().startsWith("class") &&
                Reflect.getMetadata("@data", mod[entry]?.prototype)
            ) {
                const cmd = loadCommand(mod[entry])
                interactions.set(cmd.__data.name, cmd);
                logger.info(`Loading command ${cmd.__data.name}`);
            } else if (
                typeof mod[entry] == "object" &&
                JSON.stringify(mod[entry]).at(0) == "{" &&
                "type" in mod[entry] &&
                mod[entry].type == MessageCommandSym
            ) {
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

// @Command("events", "Manage Events")
// class events {
//     @Group("Manage event maps")
//     static declare maps;

//     @SubCommand(events.maps, "add", "Add a map to the event.")
//     add(int: ChatInputCommandInteraction) {

//     }
// }
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