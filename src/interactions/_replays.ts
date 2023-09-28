// import { ChatInputCommandInteraction, CacheType, ActionRowBuilder, StringSelectMenuOptionBuilder, CommandInteraction, StringSelectMenuInteraction } from "discord.js";
// import { ChatInteractionOptionType, Command } from "../framework";
// import { timeAgo } from "../utils";
// import { LeaderboardType } from "../database/models/Leaderboard";
// import { IScore, IScoreResult } from "../draw-scores";
// import { User } from "../database";
// import { LevelMap, ScoreForNote, decode, fetchMap, processMap } from "../utils/replay-decoder";
// import { scaleLinear } from "d3-scale";
// import Konva from "konva";

// export class ReplayInfoCommand extends Command {
//     constructor() {
//         super({
//             name: "replay",
//             description: "Show information about a score's replay!",
//             options: [
//                 {
//                     type: ChatInteractionOptionType.SUB_COMMAND,
//                     name: "recent",
//                     description: "Share your recent scores!",
//                 },
//                 {
//                     type: ChatInteractionOptionType.SUB_COMMAND,
//                     name: "top",
//                     description: "Share your top scores!",
//                 }
//             ]
//         });
//     }
    
//     async execute(interaction: ChatInputCommandInteraction<CacheType>) {
//         const sub = interaction.options.getSubcommand(true);
//         const discord = interaction.user.id;
    
//         const user = await User.findOne({ where: { discord } });
    
//         if (!user) {
//             await interaction.reply({
//                 content: "You aren't linked to a BeatLeader profile.",
//                 ephemeral: true
//             });
//             return;
//         }
    
//         const sortBy = sub == "recent" ? "date" : "pp";
//         const res = await fetch(`https://api.beatleader.xyz/player/${user.beatleader}/scores?sortBy=${sortBy}&count=25`);
//         const json = await res.json() as IScoreResult;

//         const player = json.data[0].player;
//         user.name = player.name;
//         user.country = player.country;
//         user.avatar = player.avatar;
//         await user.save();

//         const selectScores = json.data.map(score => {
//             const difficulty = score.leaderboard.difficulty;
//             const difficultyName = difficulty.difficultyName.replace("Plus", "+");
    
//             let description = timeAgo(Number(score.timeset));
//             if (score.leaderboard.difficulty.status == LeaderboardType.Ranked) {
//                 description += ` - ${score.pp}pp - ${(score.accuracy * 100).toFixed(2)}%`;
//             }
            
//             return new StringSelectMenuOptionBuilder({
//                 label: `${score.leaderboard.song.name} [${difficultyName}]`,
//                 value: `${score.id}-${score.replay.slice(35, -5)}`,
//                 description
//             });
//         });
    
//         const select = this.createStringSelect()
//             .setPlaceholder("Select up to 3 scores to share.")
//             .setMinValues(1)
//             .setMaxValues(1)
//             .addOptions(selectScores);    
    
//         const row = new ActionRowBuilder({ components: [select] });
        
//         await interaction.reply({
//             // @ts-ignore
//             components: [row],
//             ephemeral: true
//         });
//     }

//     async onStringSelect(interaction: StringSelectMenuInteraction<CacheType>) {
//         await interaction.deferReply({ ephemeral: true });
//         const [scoreId, playerId, difficulty, mode, hash] = interaction.values[0].split("-");

//         const mapInfoURL = `https://api.beatsaver.com/maps/hash/${hash}`;
//         const mapInfo = await fetch(mapInfoURL).then(r => r.json());
//         const bpm = mapInfo.metadata.bpm as number;
//         const duration = mapInfo.metadata.duration as number;
//         const beatDuration = (duration / 60) * bpm;

//         // const statisticsURL = `https://api.beatleader.xyz/score/statistic/${scoreId}`;
//         // const statistics = await fetch(statisticsURL).then(r => r.json());

//         // const replayName = `${playerId}-${difficulty}-${mode}-${hash}`;
//         // const replayURL = `https://cdn.replays.beatleader.xyz/${replayName}.bsor`;
//         // const replayFile = await fetch(replayURL).then(r => r.arrayBuffer());
//         // const replay = decode(replayFile)!;

//         const map = await fetchMap(hash, difficulty, mode);
//         // processMap(map, replay);

//         const difficultyChart = getDifficultyData(map, beatDuration);
//         // const accuracy = statistics.scoreGraphTracker.graph;
//         // const mistakes = replay.notes.filter(n => n.eventType != 0).map(n => ({
//         //     type: n.eventType,
//         //     time: n.eventTime
//         // }));
       
        
//         // @ts-ignore
//         const stage = new Konva.Stage({
//             width: 1000,
//             height: 500,
//             listening: false,
//         });

//         const layer = new Konva.Layer({ listening: false });
//         stage.add(layer);

//         const scaleY = scaleLinear()
//             .domain([0, beatDuration])
//             .range([0, 1000]);
        
//         const scaleX = scaleLinear()
//             .domain([0, difficultyChart.reduce((a, c) => c.nps > a ? c.nps : a, 0)])
//             .range([0, 500]);
        
//         for (let nps of difficultyChart) {
//             const line = new Konva.Line({
//                 // x: scaleX(nps.nps),
//                 // x: scaleX(nps.nps),
//             })
//         }

//         await interaction.editReply({ content: "done" });
//     }
// }

// function getDifficultyData(map: LevelMap, duration: number) {
//     type NpsInfo = {
//         nps: number;
//         from: number;
//         to: number;
//     }

//     const npsSections = [] as NpsInfo[];

//     if (duration < 0) return npsSections;

//     const notes = [...map._notes, ...(map._chains || [])]
//         .filter(n => n._type != 3)
//         .sort(n => n._time)

//     if (!notes.length) return npsSections;

//     let tempNoteCount = 0;
//     let startingTime = notes[0]._time;
//     npsSections.push({ nps: 0, from: 0, to: startingTime });

//     for (let i = 0; i < notes.length; ++i) {
//         tempNoteCount += 1;
//         if (i <= 0 || (i % 25 != 0 && i + 1 != notes.length)) continue;

//         let nps;
//         if (tempNoteCount >= 25) {
//             nps = tempNoteCount / (notes[i]._time - startingTime);
//         } else  {
//             // end of a map or a map with notes.Count < 25
//             // if total notes count < 25 - do the usual way
//             // if there are more than 25 notes - try to normalize nps with data from tempNoteCount and (25 - tempNoteCount) notes from a section before
//             nps = notes.length < 25
//                 ? tempNoteCount / (notes[i]._time - notes[0]._time)
//                 : 25 / (notes[i]._time - notes[i - 25]._time);
//         }

//         npsSections.push({ nps, from: startingTime, to: notes[i]._time });

//         tempNoteCount = 0;
//         startingTime = notes[i]._time;
//     }

//     npsSections.push({ nps: 0, from: startingTime, to: duration });

//     return npsSections;
// }