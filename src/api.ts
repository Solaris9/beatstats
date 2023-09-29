import { Op, Sequelize } from "sequelize";
import Stats from "./database/models/Stats";
import { IClanContainer, ILeaderboard, IPlayer, IResultPagination, IScore } from "./types/beatleader";
import { Logger } from "./utils/logger";

const logger = new Logger("HTTP")

type Dynamic<O, V> = { [k: string]: (O extends false ? {} : APIRequest<O>) & V}

type RequestData = Omit<RequestInit, "method"> & { query?: NodeJS.Dict<unknown> }

type ResponseData<T> = { json: Promise<T> } & Response;

type APIRequest<T = unknown> = {
    get: (options?: RequestData) => Promise<ResponseData<T>>;
    post: (options?: RequestData) => Promise<ResponseData<T>>;
    get_json: (options?: RequestData) => Promise<T>;
    post_json: (options?: RequestData) => Promise<T>;
}

const delay = (time: number) => {
    const then = Date.now() + time;
    while (Date.now() < then) { };
}

const create = <T>(url: string): T => {
    return new Proxy({}, {
        get(_, p: string) {
            if (/(get|post)/.test(p)) return async (options) => {
                if (options && "query" in options) url += "?" + new URLSearchParams(options.query)
                
                logger.debug(`Fetching ${url}`);

                const res = await fetch(url, {
                    method: p.startsWith("get") ? "GET" : "POST",
                    ...options
                });
                
                if (res.headers.get("x-rate-limit-remaining") == "0") {
                    const reset = new Date(res.headers.get("x-rate-limit-reset")!)
                    await delay(reset.getTime() - Date.now() + 1);
                }

                if (res.status >= 400) return await Promise.reject(res.status);

                await Stats.increment(["beatleader_requests"], { by: 1, where: { id: 0 } });

                return p.endsWith("json") ? await res.json() : res;
            }

            return create(`${url}/${p}`);
        }
    }) as T;
}

type BeatLeaderAPI = {
    player: {
        discord: Dynamic<false, APIRequest<IPlayer>>
    } & Dynamic<IPlayer, {
        scores: APIRequest<IResultPagination<IScore>>;
    }>;
    oauth: {
        identity: APIRequest<{ id: string }>;
        token: APIRequest<{ access_token: string }>;
    };
    clan: {
        invite: APIRequest;
    } & Dynamic<false, APIRequest<IResultPagination<IPlayer, { container: IClanContainer }>>>;
    leaderboards: APIRequest<IResultPagination<ILeaderboard>>;
    leaderboard: Dynamic<false, APIRequest<ILeaderboard>>;
}
 
export const beatleader = create<BeatLeaderAPI>("https://api.beatleader.xyz");