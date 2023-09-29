const { TOKEN, applicationId } = require("../../config.json");
const { REST, Routes } = require("discord.js");

(async () => {
    const rest = new REST().setToken(TOKEN);
    const existing = await rest.get(Routes.applicationCommands(applicationId));
    await Promise.all(existing.map(e => rest.delete(Routes.applicationCommand(applicationId, e.id))));
})();