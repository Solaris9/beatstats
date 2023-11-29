const { TOKEN, applicationId } = require("../../config.json");
const { REST, Routes } = require("discord.js");
const { join } = require("path");
const { inspect } = require("util");

(async () => {
    require(join(process.cwd(), "dist/database/index"));
    const rest = new REST().setToken(TOKEN);
    const { interactions } = require(join(process.cwd(), "dist/framework")).default();
    
    const commands = interactions.map(v => ({
        type: 1,
        ...v.options
    }));

    if (process.argv.includes("test")) {
        console.log(inspect(commands, { depth: 10 }));
        return;
    }

    await rest.put(
        Routes.applicationCommands(applicationId),
        { body: commands }
    );
})();