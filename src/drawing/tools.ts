import Konva from "konva";

export const measure = (content: string, fontSize: number) => {
    const text = new Konva.Text({ fontFamily: "SF-Compact", fontSize });
    return text.measureSize(content);
}

export const diff = <T extends Record<string, number>, K extends keyof T>(
    obj: T, key: K, value: T[K]
) => ({ ...obj, [key]: obj[key] - value });

type BaseOptions = {
    width: number;
    height: number;
}

type PositionOptions = {
    x: number;
    y: number;
}

type ExtraOptions = {
    colour: string;
    cornerRadius: number
}

// const createComponent = (opts: BaseOptions) => {
//     return {
//         ...opts,

//         draw: (opts: PositionOptions & ExtraOptions) => {

//         }
//     }
// }

type GridCallbackOptions = {
    column: number;
    row: number;
}

type GridOptions = {
    entryWidth: number;
    entryHeight: number;
    columns: number;
    rows: number;
    padding: number;
    transform?: (
        opts: PositionOptions & BaseOptions & GridCallbackOptions
    ) => Partial<PositionOptions & BaseOptions> | void;
}

export const createGrid = (
    opts: GridOptions & Partial<PositionOptions & Omit<ExtraOptions, 'colour'>>,
    fn: (
        draw: (offset: Partial<PositionOptions & ExtraOptions>) => Konva.Shape,
        opts: BaseOptions & PositionOptions & GridCallbackOptions
    ) => void
) => {
    const draw = (
        def: PositionOptions & GridCallbackOptions,
        offset: Partial<PositionOptions & ExtraOptions>
    ) => {
        const transform = Object.assign({
            width: opts.entryWidth,
            height: opts.entryHeight,
            x: def.x,
            y: def.y,
        }, opts.transform?.({
            ...def,
            height: opts.entryHeight,
            width: opts.entryWidth
        }) ?? {});

        return new Konva.Rect({
            width: transform.width,
            height: transform.height,

            x: transform.x + (offset.x ?? 0),
            y: transform.y + (offset.y ?? 0),

            fill: offset.colour,
            cornerRadius: opts.cornerRadius ?? offset.cornerRadius
        });
    };

    return {
        ...opts,
        maxWidth: (opts.entryWidth + opts.padding) * opts.columns,
        maxHeight: (opts.entryHeight + opts.padding) * opts.rows,

        set(key: keyof (PositionOptions & BaseOptions), value: number) {
            opts[key] = value;
        },

        draw() {
            for (let r = 0; r < opts.rows; r++) {
                for (let c = 0; c < opts.columns; c++) {
                    const x = (opts.entryWidth * c) + (opts.padding * c) + (opts.x ?? 0);
                    const y = (opts.entryHeight * r) + (opts.padding * r) + (opts.y ?? 0);
       
                    const drawOpts = { x, y, row: r, column: c };
                    fn(draw.bind(null, drawOpts), {
                        ...drawOpts,
                        height: opts.entryHeight,
                        width: opts.entryWidth
                    });
                }
            }
        }
    }
}

export const createImage = (opts: BaseOptions) => {
    // @ts-ignore
    const stage = new Konva.Stage({
        x: 0, y: 0,
        ...opts
    });

    stage.listening(false);

    const layer = new Konva.Layer();
    layer.listening(false);
    stage.add(layer);

    return {
        ...opts,
        layer,

        add: function () {
            layer.add(...arguments)
        } as typeof layer.add,
        raw() {
            const data = stage.toDataURL();
            stage.destroy();
            return data;
        }
    }
}