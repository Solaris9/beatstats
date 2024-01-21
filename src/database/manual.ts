function fixTable(name: string) {
    if (name.endsWith("y")) return name.slice(0, -1) + "ies";
    return name + "s";
}

function fixAttribute(name: string) {
    if (name == "key") return `\`${name}\``;
    return name;
}

export class Literal {
    constructor(private name: string) {}
    toString = () => this.name;
}

const types = {
    string: "VARCHAR(255)",
    number: "NUMBER",
    boolean: "TINYINT(1)",
    date: "DATETIME",
    buffer: "BLOB",
} as const;

type Types = keyof typeof types;

type ModelAttribute = {
    type: Types;
    primary?: boolean;
    unique?: boolean;
    nonNull?: boolean;
    default?: unknown;
}

type ModelAttributes = { [key: string]: Types | ModelAttribute };

type Model<A extends ModelAttributes> = {
    _name: string;
    _table: string;
    _attributes: A;
} & Record<keyof A, Literal & {
    col: Literal;
    as: Literal;
}>;

export function model<A extends ModelAttributes>(
    name: string,
    attributes: A
): Model<A> {
    const model = {
        _name: name,
        _table: fixTable(name),
        _attributes: attributes
    };

    for (let key of Object.keys(attributes)) {
        model[key] = new Literal(`${model._name}.${fixAttribute(key)}`);
        model[key].col = new Literal(key);
        model[key].as = new Literal(`${model[key]} AS '${model._name}.${key}'`);
    }

    return model as Model<A>;
}

type ExecuteKeys = "all" | "get" | "run";

export class Query {
    static param = (name: string) => new Literal(`:${name}`);

    static create = <A extends ModelAttributes>(model: Model<A>) => {
        const attributes = Object.entries(model._attributes).map(([key, value]) => {
            const options: ModelAttribute = typeof value != "string" ? value : { type: value };

            let part = `\`${key}\` ${types[options.type]}`;
            if (options.unique) part += " UNIQUE";
            if (options.nonNull) part += " NOT NULL";
            if (options.primary) part += " PRIMARY KEY";
            if (options.default) part += ` DEFAULT ${options.default}`;

            return part;
        });
        
        return `CREATE TABLE IF NOT EXISTS ${model._table} (\n${attributes.join(",\n")}\n)`;
    }

    // constructor(private db: sqlite.Database) {}

    private query: [string, string][] = [];

    select(...attributes: Literal[]): Omit<Query, "join" | "where" | ExecuteKeys> {
        const attrs = attributes.map(a => a.toString()).join(",\n") || "*";
        this.query.push(["select", attrs]);
        return this;
    };

    from(model: Model<{}>): Omit<Query, "from" | "select"> {
        if (this.query.at(-1)![1].endsWith(",")) {
            const part = this.query.pop()!;
            part[1] = part[1].slice(0, -1)
            this.query.push(part);
        }
        
        this.query.push(["from", `FROM ${model._table} AS ${model._name}`]);
        return this;
    }

    join(model: Model<{}>): Omit<Query, "join" | "select" | "from" | ExecuteKeys> {
        this.query.push(["join", `INNER JOIN ${model._table} AS ${model._name} ON`]);
        return this;
    }

    where(
        left: Literal,
        operator: string,
        right: Literal | string | number | boolean
    ): Omit<Query, "select" | "from"> {
        right = typeof right == "string" ? `'${right}'` : right;
        this.query.push(["where", `${left} ${operator} ${right}`]);
        return this;
    }

    limit(value: number): Omit<Query, "select" | "from" | "where"> {
        this.query.push(["limit", `${value}`]);
        return this;
    }

    build() {
        let statements = ["SELECT"];

        for (let i = 0; i < this.query.length; i++) {
            const [previousName] = this.query[i -1 ] ?? [];
            const [currentName, currentValue] = this.query[i];
            const [nextName] = this.query[i + 1] ?? [];

            if (currentName == "where" && !nextName) {
                statements.push(`WHERE ${currentValue}`);
            } else if (previousName == "from" && currentName == "where") {
                statements.push(`WHERE ${currentValue}`);
            } else if (currentName == "select" && nextName == "select") {
                statements.push(currentValue + ",");
            } else if (previousName == "where" && currentName == "where") {
                statements.push(`AND ${currentValue}`);
            } else if (previousName == "where" && currentName == "limit") {
                statements.push(`LIMIT ${currentValue}`);
            } else {
                statements.push(currentValue);
            }
        }

        return statements.join("\n") + ";";
    }

    // all(...params: unknown[]) {
    //     const query = this.build();
    //     return this.db.prepare(query).all(...params);
    // }

    // get(...params: unknown[]) {
    //     const query = this.build();
    //     return this.db.prepare(query).get(...params);
    // }

    // run(...params: unknown[]) {
    //     const query = this.build();
    //     return this.db.prepare(query).run(...params);
    // }
}

export const _User = model("User", {
    beatleader: "string",
    discord: "string"
});

export const _Score = model("Score", {
    scoreId: "number",
    playerId: "number",
    leaderboardId: "number",
    accuracy: "number",
    pp: "number",
    timeSet: "date",
    context: "number",
});

export const _Leaderboard = model("Leaderboard", {
    leaderboardId: "string",
    type: "number"
});

export const _Difficulty = model("Difficulty", {
    key: "string",
    leaderboardId: "string",
    difficulty: "number"
});

export const _Song = model("Song", {
    key: "string",
    name: "string",
    mapper: "string",
    author: "string"
});

//#region sql templating
// function sql(template: TemplateStringsArray, ...strings: unknown[]) {
//     return template.reduce((a, c, i) => {
//         const arg = strings[i];

//         if (Array.isArray(arg)) return a + c + arg.join(", ");
//         else if (arg) return a + c + arg;
//         else return a + c;
//     }, "").trim();
// }

// sql.as = function(model: any) {
//     return `${model._name} AS ${fixTable(model._name)}`;
// }

// let q = sql`
// SELECT ${[
//     _Score.scoreId, _Score.accuracy, _Score.pp, _Score.timeSet,
//     _Leaderboard.type,
//     _Difficulty.difficulty,
//     _Song.name, _Song.mapper
// ]}
// FROM ${sql.as(_Score)}
// JOIN ${sql.as(_User)} ON 
// ${_User.beatleader} = ${_Score.playerId}
// AND ${_User.discord} = '289232137570222083'
// JOIN ${sql.as(_Leaderboard)} ON
// ${_Leaderboard.leaderboardId} = ${_Score.leaderboardId}
// JOIN ${sql.as(_Difficulty)} ON
// ${_Difficulty.leaderboardId} = ${_Leaderboard.leaderboardId}
// JOIN ${sql.as(_Song)} ON
// ${_Song.key} = ${_Difficulty.key}
// `;
//#endregion