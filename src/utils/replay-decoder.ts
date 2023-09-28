import JSZip from "jszip";

interface DataViewer extends DataView {
    pointer: number;
}

type Vector3 = {
    x: number;
    y: number;
    z: number;
};

type Quaternion = {
    x: number;
    y: number;
    z: number;
    w: number;
}

type Euler = {
    position: Vector3;
    rotation: Quaternion;
}

type ReplayFrame = {
    time: number;
    fps: number;
    head: Euler;
    left: Euler;
    right: Euler;
};

type ReplayNoteCutInfo = {
    speedOK: boolean;
    directionOK: boolean;
    saberTypeOK: boolean;
    wasCutTooSoon: boolean;
    saberSpeed: number;
    saberDir: Vector3;
    saberType: number;
    timeDeviation: number;
    cutDirDeviation: number;
    cutPoint: Vector3;
    cutNormal: Vector3;
    cutDistanceToCenter: number;
    cutAngle: number;
    beforeCutRating: number;
    afterCutRating: number;
}

type ReplayNote = {
    id: number;
    eventTime: number;
    spawnTime: number;
    eventType: number;
    noteCutInfo: ReplayNoteCutInfo;

    index: number;
    scoringType: number;
}

type ReplayInfo = {
    version: string;
    gameVersion: string;
    timestamp: string;

    playerID: string;
    playerName: string;
    platform: string;

    trackingSystem: string;
    hmd: string;
    controller: string;

    hash: string;
    songName: string;
    mapper: string;
    difficulty: string;

    score: number;
    mode: string;
    environment: string;
    modifiers: string;
    jumpDistance: number;
    leftHanded: boolean;
    height: number;

    startTime: number;
    failTime: number;
    speed: number;
};

type ReplayWall = {
    wallID: number;
    energy: number;
    time: number;
    spawnTime: number;
}

type ReplayHeight = {
    height: number;
    time: number;
}

type ReplayPause = {
    duration: bigint;
    time: number;
}

export type Replay = {
    info: ReplayInfo;
    frames: ReplayFrame[];
    notes: ReplayNote[];
    walls: ReplayWall[];
    heights: ReplayHeight[];
    pauses: ReplayPause[];
}

const StructType = {
	info: 0,
	frames: 1,
	notes: 2,
	walls: 3,
	heights: 4,
	pauses: 5,
};

const NoteEventType = {
	good: 0,
	bad: 1,
	miss: 2,
	bomb: 3,
};

export function decode(arrayBuffer: ArrayBuffer): Replay | null {
	const dataView = new DataView(arrayBuffer) as DataViewer;
	dataView.pointer = 0;

	const magic = DecodeInt(dataView);
	const version = DecodeUint8(dataView);

	if (version == 1 && magic == 0x442d3d69) {
		var replay = {} as Replay;

		for (var a = 0; a < StructType.pauses + 1; a++) {
			const type = DecodeUint8(dataView);
			switch (type) {
				case StructType.info:
					replay.info = DecodeInfo(dataView);
					break;
				case StructType.frames:
					replay.frames = DecodeFrames(dataView);
					break;
				case StructType.notes:
					replay.notes = DecodeNotes(dataView);
					break;
				case StructType.walls:
					replay.walls = DecodeWalls(dataView);
					break;
				case StructType.heights:
					replay.heights = DecodeHeight(dataView);
					break;
				case StructType.pauses:
					replay.pauses = DecodePauses(dataView);
					break;
			}
		}

        return replay;
	} else {
		return null;
	}
}

function DecodeInfo(dataView: DataViewer): Replay["info"] {
	var result = {} as Replay["info"];

	result.version = DecodeString(dataView);
	result.gameVersion = DecodeString(dataView);
	result.timestamp = DecodeString(dataView);

	result.playerID = DecodeString(dataView);
	result.playerName = DecodeName(dataView);
	result.platform = DecodeString(dataView);

	result.trackingSystem = DecodeString(dataView);
	result.hmd = DecodeString(dataView);
	result.controller = DecodeString(dataView);

	result.hash = DecodeString(dataView);
	result.songName = DecodeString(dataView);
	result.mapper = DecodeString(dataView);
	result.difficulty = DecodeString(dataView);

	result.score = DecodeInt(dataView);
	result.mode = DecodeString(dataView);
	result.environment = DecodeString(dataView);
	result.modifiers = DecodeString(dataView);
	result.jumpDistance = DecodeFloat(dataView);
	result.leftHanded = DecodeBool(dataView);
	result.height = DecodeFloat(dataView);

	result.startTime = DecodeFloat(dataView);
	result.failTime = DecodeFloat(dataView);
	result.speed = DecodeFloat(dataView);

	return result;
}

function DecodeFrames(dataView: DataViewer) {
	const length = DecodeInt(dataView);
	var result = [] as ReplayFrame[];
	for (var i = 0; i < length; i++) {
		var frame = DecodeFrame(dataView);
		if (frame.time != 0 && (result.length == 0 || frame.time != result[result.length - 1].time)) {
			result.push(frame);
		}
	}
	return result;
}

function DecodeFrame(dataView: DataViewer) {
	var result = {} as ReplayFrame;
	result.time = DecodeFloat(dataView);
	result.fps = DecodeInt(dataView);
	result.head = DecodeEuler(dataView);
	result.left = DecodeEuler(dataView);
	result.right = DecodeEuler(dataView);

	return result;
}

function DecodeNotes(dataView: DataViewer) {
	const length = DecodeInt(dataView);
	var result = [] as ReplayNote[];
	for (var i = 0; i < length; i++) {
		result.push(DecodeNote(dataView));
	}
	return result;
}

function DecodeWalls(dataView: DataViewer) {
	const length = DecodeInt(dataView);
	var result = [] as ReplayWall[];
	for (var i = 0; i < length; i++) {
		var wall = {} as ReplayWall;
		wall.wallID = DecodeInt(dataView);
		wall.energy = DecodeFloat(dataView);
		wall.time = DecodeFloat(dataView);
		wall.spawnTime = DecodeFloat(dataView);
		result.push(wall);
	}
	return result;
}

function DecodeHeight(dataView: DataViewer) {
	const length = DecodeInt(dataView);
	var result = [] as ReplayHeight[];
	for (var i = 0; i < length; i++) {
		var height = {} as ReplayHeight;
		height.height = DecodeFloat(dataView);
		height.time = DecodeFloat(dataView);
		result.push(height);
	}
	return result;
}

function DecodePauses(dataView: DataViewer) {
	const length = DecodeInt(dataView);
    var result = [] as ReplayPause[];
	for (var i = 0; i < length; i++) {
		var pause = {} as ReplayPause;
		pause.duration = DecodeLong(dataView);
		pause.time = DecodeFloat(dataView);
		result.push(pause);
	}
	return result;
}

function DecodeNote(dataView: DataViewer) {
	var result = {} as ReplayNote;

	result.id = DecodeInt(dataView);
	result.eventTime = DecodeFloat(dataView);
	result.spawnTime = DecodeFloat(dataView);
	result.eventType = DecodeInt(dataView);
	if (result.eventType == NoteEventType.good || result.eventType == NoteEventType.bad) {
		result.noteCutInfo = DecodeCutInfo(dataView);
	}

	return result;
}

function DecodeCutInfo(dataView: DataViewer) {
	var result = {} as ReplayNoteCutInfo;

	result.speedOK = DecodeBool(dataView);
	result.directionOK = DecodeBool(dataView);
	result.saberTypeOK = DecodeBool(dataView);
	result.wasCutTooSoon = DecodeBool(dataView);
	result.saberSpeed = DecodeFloat(dataView);
	result.saberDir = DecodeVector3(dataView);
	result.saberType = DecodeInt(dataView);
	result.timeDeviation = DecodeFloat(dataView);
	result.cutDirDeviation = DecodeFloat(dataView);
	result.cutPoint = DecodeVector3(dataView);
	result.cutNormal = DecodeVector3(dataView);
	result.cutDistanceToCenter = DecodeFloat(dataView);
	result.cutAngle = DecodeFloat(dataView);
	result.beforeCutRating = DecodeFloat(dataView);
	result.afterCutRating = DecodeFloat(dataView);

	return result;
}

function DecodeEuler(dataView: DataViewer) {
	var result = {} as Euler;
	result.position = DecodeVector3(dataView);
	result.rotation = DecodeQuaternion(dataView);

	return result;
}

function DecodeVector3(dataView: DataViewer) {
	var result = {} as Vector3;

	result.x = DecodeFloat(dataView);
	result.y = DecodeFloat(dataView);
	result.z = DecodeFloat(dataView);

	return result;
}

function DecodeQuaternion(dataView: DataViewer) {
	var result = {} as Quaternion;

	result.x = DecodeFloat(dataView);
	result.y = DecodeFloat(dataView);
	result.z = DecodeFloat(dataView);
	result.w = DecodeFloat(dataView);

	return result;
}

function DecodeLong(dataView: DataViewer) {
	const result = dataView.getBigInt64(dataView.pointer, true);
	dataView.pointer += 8;
	return result;
}

function DecodeInt(dataView: DataViewer) {
	const result = dataView.getInt32(dataView.pointer, true);
	dataView.pointer += 4;
	return result;
}

function DecodeUint8(dataView: DataViewer) {
	const result = dataView.getUint8(dataView.pointer);
	dataView.pointer++;
	return result;
}

function DecodeString(dataView: DataViewer) {
	const length = dataView.getInt32(dataView.pointer, true);
	if (length < 0 || length > 300) {
		dataView.pointer += 1;
		return DecodeString(dataView);
	}
	var enc = new TextDecoder('utf-8');
	const string = enc.decode(new Int8Array(dataView.buffer.slice(dataView.pointer + 4, length + dataView.pointer + 4)));
	dataView.pointer += length + 4;
	return string;
}

function DecodeName(dataView: DataViewer) {
	const length = dataView.getInt32(dataView.pointer, true);
	var enc = new TextDecoder('utf-8');
	let lengthOffset = 0;
	if (length > 0) {
		while (
			dataView.getInt32(length + dataView.pointer + 4 + lengthOffset, true) != 6 &&
			dataView.getInt32(length + dataView.pointer + 4 + lengthOffset, true) != 5 &&
			dataView.getInt32(length + dataView.pointer + 4 + lengthOffset, true) != 8
		) {
			lengthOffset++;
		}
	}

	const string = enc.decode(new Int8Array(dataView.buffer.slice(dataView.pointer + 4, length + dataView.pointer + 4 + lengthOffset)));
	dataView.pointer += length + 4 + lengthOffset;
	return string;
}

function DecodeFloat(dataView: DataViewer) {
	const result = dataView.getFloat32(dataView.pointer, true);
	dataView.pointer += 4;
	return result;
}

function DecodeBool(dataView: DataViewer) {
	const result = dataView.getUint8(dataView.pointer) != 0;
	dataView.pointer++;
	return result;
}

function CutScoresForNote(cut, scoringType) {
	var beforeCutRawScore = 0;
	if (scoringType != ScoringType.BurstSliderElement) {
		if (scoringType == ScoringType.SliderTail) {
			beforeCutRawScore = 70;
		} else {
			beforeCutRawScore = clamp(Math.round(70 * cut.beforeCutRating), 0, 70);
		}
	}
	var afterCutRawScore = 0;
	if (scoringType != ScoringType.BurstSliderElement) {
		if (scoringType == ScoringType.BurstSliderHead) {
			afterCutRawScore = 0;
		} else if (scoringType == ScoringType.SliderHead) {
			afterCutRawScore = 30;
		} else {
			afterCutRawScore = clamp(Math.round(30 * cut.afterCutRating), 0, 30);
		}
	}
	var cutDistanceRawScore = 0;
	if (scoringType == ScoringType.BurstSliderElement) {
		cutDistanceRawScore = 20;
	} else {
		var num = 1 - clamp(cut.cutDistanceToCenter / 0.3, 0, 1);
		cutDistanceRawScore = Math.round(15 * num);
	}

	return [beforeCutRawScore, afterCutRawScore, cutDistanceRawScore];
}

export function ScoreForNote(eventType, cutInfo, scoringType) {
	if (eventType == NoteEventType.good) {
		const scores = CutScoresForNote(cutInfo, scoringType);
		const result = scores[0] + scores[1] + scores[2];

		return result > 115 ? -2 : result;
	} else {
		switch (eventType) {
			case NoteEventType.bad:
				return -2;
			case NoteEventType.miss:
				return -3;
			case NoteEventType.bomb:
				return -4;
		}
	}
}

export const NoteCutDirection = {
	Up: 0,
	Down: 1,
	Left: 2,
	Right: 3,
	UpLeft: 4,
	UpRight: 5,
	DownLeft: 6,
	DownRight: 7,
	Any: 8,
	None: 9,
};

export const ScoringType = {
	Ignore: -1,
	NoScore: 0,
	Normal: 1,
	SliderHead: 2,
	SliderTail: 3,
	BurstSliderHead: 4,
	BurstSliderElement: 5,
};

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

// map stuff

export type LevelBase = {
    _type: number;
    _time: number;
};

export type LevelObject = LevelBase & {
    _lineLayer: number;
    _lineIndex: number;
    _cutDirection: number;
};

export type LevelMap = {
    _version: string;
    _customData: {};
    _events: {}[];
    _notes: LevelObject[];
    _chains: LevelObject[];
    _obstacles: {}[];
};

export async function fetchMap(hash: string, difficulty: string, mode: string) {
    const songRes = await fetch(`https://api.beatsaver.com/maps/hash/${hash}`);
    const song = await songRes.json();

    const download = await fetch(song.versions[0].downloadURL).then(r => r.arrayBuffer());
    const zip = await JSZip.loadAsync(download);

    const file = zip.files[`${difficulty}${mode}.dat`] ?? zip.files[`${difficulty}.dat`]
    return JSON.parse(await file.async('string')) as LevelMap;
}

export function processMap(map: LevelMap, replay: Replay) {
    type LevelNote = {
        _id: number;
        _idWithScoring: number;
        _idWithAlternativeScoring: number;
        _scoringType: number;
    } & LevelObject;

    const mapNotes = [...map._notes.filter(n => n._type != 3), ...(map._chains || [])] as unknown as LevelNote[];

    // generate map ID's
    for (let note of mapNotes) {
        const lineIndex = note._lineIndex;
        const colorType = note._type;
        const cutDirection = colorType != 3 ? note._cutDirection : NoteCutDirection.Any;
        const lineLayer = note._lineLayer;
        const scoringType = note._scoringType !== undefined ? note._scoringType + 2 : colorType == 3 ? 2 : 3;

        note._id = lineIndex * 1000 + lineLayer * 100 + colorType * 10 + cutDirection;
        note._idWithScoring = note._id + scoringType * 10000;

        let altScoringType = scoringType;

        if (note._scoringType == ScoringType.BurstSliderHead) {
            altScoringType = ScoringType.SliderHead + 2;
        } else if (note._scoringType == ScoringType.SliderHead) {
            altScoringType = ScoringType.BurstSliderHead + 2;
        }

        note._idWithAlternativeScoring = note._id + altScoringType * 10000;
    };

    //  find note score type by grouping them
    let group: number[] | null = null;
    let groupIndex = 0;
    let groupTime = 0;
    let offset = 0;

    const processGroup = () => {
        for (var j = 0; j < group!.length; j++) {
            const mapNote = mapNotes[group![j]];
            for (var m = 0; m < group!.length; m++) {
                const replayNote = replay.notes[groupIndex + offset + m]                
                const scoringType = mapNote._scoringType ? mapNote._scoringType + 2 : 3;

                if (
                    replayNote.index == undefined &&
                    (replayNote.id == mapNote._id || replayNote.id == mapNote._idWithScoring || replayNote.id == mapNote._idWithAlternativeScoring)
                ) {
                    replayNote.index = group![j];
                    replayNote.scoringType = scoringType - 2;
                    break;
                }
            }
        }
    };

    for (var i = 0; i < mapNotes.length; i++) {
        if (!group) {
            if (i + offset == replay.notes.length) {
                group = [];
                break;
            }
            if (replay.notes[i].spawnTime < replay.notes[i + offset].spawnTime - 0.0001) {
                offset--;
                continue;
            }
            if (i > 0 && replay.notes.length > mapNotes.length && replay.notes[i + offset].spawnTime == replay.notes[i + offset - 1].spawnTime) {
                offset++;
                i--;
                continue;
            }

            group = [i];
            groupIndex = i;
            groupTime = mapNotes[i]._time;
        } else {
            if (Math.abs(groupTime - mapNotes[i]._time) < 0.0001) {
                group.push(i);
            } else {
                processGroup();
                group = null;
                i--;
            }
        }
    }

    if (group) processGroup();
}