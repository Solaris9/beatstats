const { Op, DataTypes } = require("sequelize");
const { DataType } = require("sequelize-typescript");
const { SongDifficulty, Song } = require("../dist/database");

const sequelize = require("../dist/database").sequelize;
const query = sequelize.getQueryInterface();

// query.removeColumn("Users", "membership");
// query.addColumn("Users", "clans", DataType.STRING);

// query.addColumn("Clans", "leaderboardsChannel", DataType.STRING);
// query.addColumn("Clans", "memberCount", DataType.NUMBER);
// query.addColumn("Stats", "live_scores", {
//     defaultValue: 0,
//     type: DataType.NUMBER
// });
// query.addColumn("Clans", "leaderboards", {
//     defaultValue: "",
//     type: DataType.STRING
// });

// (async () => {
//     await sequelize.query('CREATE TABLE IF NOT EXISTS `Difficulties_new` (`key` VARCHAR(255) NOT NULL REFERENCES `Songs` (`key`) ON DELETE CASCADE ON UPDATE CASCADE, `difficulty` INTEGER NOT NULL, `mode` INTEGER, `leaderboardId` VARCHAR(255) REFERENCES `Leaderboards` (`leaderboardId`) ON DELETE CASCADE ON UPDATE CASCADE, `njs` INTEGER, `nps` INTEGER, `notes` INTEGER, `bombs` INTEGER, `walls` INTEGER, `maxScore` INTEGER,  PRIMARY KEY (`key`, `difficulty`, `mode`));');
//     await sequelize.query('INSERT INTO `Difficulties_new` SELECT * FROM `Difficulties`');
//     await sequelize.query('DROP TABLE `Difficulties`');
//     await sequelize.query('ALTER TABLE `Difficulties_new` RENAME TO `Difficulties`');
// })();
