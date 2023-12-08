const { TOKEN, applicationId } = require("../../config.json");
const { REST, Routes } = require("discord.js");
const { join } = require("path");
const { inspect } = require("util");

const removeExtra = (obj) => {
    if ("group" in obj) delete obj.group;
    if ("_handle" in obj) delete obj._handle;
    if ("options" in obj) obj.options.map(removeExtra);

    return obj;
};

module.exports.removeExtra = removeExtra;

(async () => {
    require(join(process.cwd(), "dist/database/index"));
    const rest = new REST().setToken(TOKEN);
    const { interactions } = require(join(process.cwd(), "dist/framework")).default();
    
    const commands = interactions.map(v => removeExtra(v.__data));
    
    if (process.argv.includes("test")) {
        console.log(inspect(commands, { depth: 10 }));
        return;
    }

    await rest.put(
        Routes.applicationCommands(applicationId),
        { body: commands }
    );
})();