const { TOKEN, applicationId, guildId } = require("../config.json");
const { REST, Routes } = require("discord.js");
const { join } = require("path");

const uninstall = process.argv.includes("--uninstall");
const test = process.argv.includes("--test");
const global = process.argv.includes("--global");

(async () => {
    require(join(process.cwd(), "dist/database/index"));
    const rest = new REST().setToken(TOKEN);
    const { interactions } = require(join(process.cwd(), "dist/framework")).default();
    
    const commands = interactions.map(v => ({
        type: 1,
        ...v.options
    }));

    if (test) {
        console.log(commands);
        return;
    }

    const existing = await rest.get(Routes.applicationCommands(applicationId));
    await Promise.all(existing.map(e => rest.delete(Routes.applicationCommand(applicationId, e.id))));

    if (!uninstall) {
        await rest.put(
            global ? 
                Routes.applicationCommands(applicationId) :
                Routes.applicationGuildCommands(applicationId, guildId),
            { body: commands }
        );
    }
})();