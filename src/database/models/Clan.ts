import { AllowNull, Column, Model, Table, Unique } from "sequelize-typescript";
import { beatleader } from "../../api.js";
import { IPlayer } from "../../types/beatleader.js";
import { DataTypes, Op } from "sequelize";
import Score from "./Score.js";
import User, { CreateUserMethod, createUser } from "./User.js";
import { logger } from "../../interactions/clan.js";

@Table
export default class Clan extends Model {
    @Unique
    @Column declare tag: string;
    @Column declare owner: string;

    @AllowNull @Column(DataTypes.STRING)
    declare guild: string | null;

    @AllowNull @Column(DataTypes.STRING)
    declare liveScoresChannel: string | null;

    @AllowNull @Column(DataTypes.STRING)
    declare leaderboardsChannel: string | null;

    @Column declare memberCount: number;

    async fetchMembers() {
        const members = [] as IPlayer[];
        let page = 1, pages: number = 0;
    
        do {
            const json = await beatleader.clan[this.tag].get_json({ query: { page } });
            members.push(...json.data);
            if (!pages) pages = Math.ceil(json.metadata.total / json.metadata.itemsPerPage);
        } while (page++ != pages);
    
        return members;
    }

    async refresh() {
        logger.info(`Refreshing clan ${this.tag} with ${this.memberCount} members.`);
        const members = await this.fetchMembers();

        this.memberCount = members.length;
        await this.save();
    
        // remove anyone not in the clan anymore
        const membersNotInClan = await User.findAll({
            where: {
                clans: { [Op.like]: `%${this.tag}%` },
                beatleader: { [Op.notIn]: members.map(m => m.id) },
            },
            include: {
                model: Score,
                as: "scores"
            }
        });

        for (let member of membersNotInClan) {
            const clans = member.clans.split(",");
            clans.splice(clans.indexOf(this.tag), 1);
            
            if (clans.length) {
                member.clans = clans.join(",");
                await member.save();
            } else {
                await Promise.all(member.scores.map(s => s.destroy()));
                await member.destroy();
                logger.info(`User ${member.name} (${member.beatleader}) no longer in any clans, deleting scores and profile...`);
            }
        }

        // update current clan members    
        for (let member of members) {
            let user = await User.find(member.id);

            if (user) {
                await user.refresh();
                continue;
            }
            // else user does not exist in the database

            const discordSocial = member.socials?.find(s => s.service == "Discord");
            if (!discordSocial) {
                logger.warning(`Clan member ${member.name} (${member.id}) does not have Discord linked!`);
                await createUser(CreateUserMethod.BeatLeader, member.id, member);
                continue;
            }

            // migrate any new profiles
            const existing = await User.findOne({
                where: {
                    discord: discordSocial.userId,
                    beatleader: { [Op.not]: member.id }
                },
                attributes: { exclude: ["createdAt", "updatedAt"] }
            }) as User;

            if (existing) {
                await User.destroy({ where: { beatleader: existing.beatleader } });

                const json = existing.toJSON();
                json.beatleader = member.id;

                user = await User.create(json);

                logger.info(`Migrated user ${member.name} to new id (${existing.beatleader} -> ${user.beatleader})`);
            }
        }
    }

    static async new(tag: string) {
        const clan = await Clan.findOne({ where: { tag } });
        if (clan) return clan;
     
        const data = await beatleader.clan[tag].get_json();

        return await Clan.create({
            tag,
            owner: data.container.leaderID
        });
    }
}