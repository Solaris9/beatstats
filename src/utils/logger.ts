const debugEnabled = process.argv.includes("--debug")

export class Logger {
    private name: string;

    constructor(name: string) {
        this.name = name;
        this.info = this.info.bind(this);
        this.error = this.error.bind(this);
        this.debug = this.debug.bind(this);
        this.warning = this.warning.bind(this);
    }

    public info(message: string, ...args: string[]) {
        const date = new Date().toISOString();
        console.log(`${date} [INFO ${this.name}] ${message}`, ...args);
    }

    public error(message: string, ...args: string[]) {
        const date = new Date().toISOString();
        console.log(`${date} [ERROR ${this.name}] ${message}`, ...args);
    }

    public debug(message: string, ...args: string[]) {
        if (!debugEnabled) return;
        const date = new Date().toISOString();
        console.log(`${date} [DEBUG ${this.name}] ${message}`, ...args);
    }

    public warning(message: string, ...args: string[]) {
        const date = new Date().toISOString();
        console.log(`${date} [WARNING ${this.name}] ${message}`, ...args);
    }
}
