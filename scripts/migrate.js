const { Op } = require("sequelize");
const { DataType } = require("sequelize-typescript");

const sequelize = require("../dist/database").sequelize;
const query = sequelize.getQueryInterface();

// query.removeColumn("Users", "membership");
// query.addColumn("Users", "clans", DataType.STRING);

// query.addColumn("Clans", "leaderboardsChannel", DataType.STRING);
// query.addColumn("Clans", "memberCount", DataType.NUMBER);
query.addColumn("Stats", "live_scores", {
    defaultValue: 0,
    type: DataType.NUMBER
});