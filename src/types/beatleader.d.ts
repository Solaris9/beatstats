// global
export type IResultPagination<T, E = {}> = {
	metadata: IResultMetadata;
	data: T[];
} & E;

export interface IResultMetadata {
    itemsPerPage: number;
    page:         number;
    total:        number;
}

// rest

export interface IScore {
	myScore:          null;
	leaderboard:      ILeaderboard;
	weight:           number;
	accLeft:          number;
	accRight:         number;
	id:               number;
	baseScore:        number;
	modifiedScore:    number;
	accuracy:         number;
	playerId:         string;
	pp:               number;
	bonusPp:          number;
	passPP:           number;
	accPP:            number;
	techPP:           number;
	rank:             number;
	country:          string;
	fcAccuracy:       number;
	fcPp:             number;
	replay:           string;
	modifiers:        string;
	badCuts:          number;
	missedNotes:      number;
	bombCuts:         number;
	wallsHit:         number;
	pauses:           number;
	fullCombo:        boolean;
	platform:         string;
	maxCombo:         number;
	maxStreak:        number;
	hmd:              number;
	controller:       number;
	leaderboardId:    string;
	timeset:          string;
	timepost:         number;
	replaysWatched:   number;
	playCount:        number;
	player:           IPlayer;
	scoreImprovement: IScoreImprovement;
	rankVoting:       null;
	metadata:         null;
	offsets:          IOffsets | null;
}

export interface IScoreImprovement {
	id:                    number;
    timeset:               string;
    score:                 number;
    accuracy:              number;
    accRight:              number;
    accLeft:               number;
    pp:                    number;
    bonusPp:               number;
    totalPp:               number;
    rank:                  number;
	averageRankedAccuracy: number;
    totalRank:             number;
    badCuts:               number;
    missedNotes:           number;
    bombCuts:              number;
    wallsHit:              number;
    pauses:                number;
}

export interface IOffsets {
	id:      number;
	frames:  number;
	notes:   number;
	walls:   number;
	heights: number;
	pauses:  number;
}

export interface ILeaderboard {
	id:               string;
	song:             ISong;
	difficulty:       IDifficulty;
	scores:           null;
	changes:          null;
	qualification:    null;
	reweight:         null;
	leaderboardGroup: null;
	plays:            number;
}

export interface IDifficulty {
	id:              number;
	value:           number;
	mode:            number;
	difficultyName:  string;
	modeName:        string;
	status:          number;
	modifierValues:  IModifierValues;
	modifiersRating: IModifierRating;
	nominatedTime:   number;
	qualifiedTime:   number;
	rankedTime:      number;
	stars:           number | null;
	predictedAcc:    number | null;
	passRating:      number | null;
	accRating:       number | null;
	techRating:      number | null;
	type:            number;
	njs:             number;
	nps:             number;
	notes:           number;
	bombs:           number;
	walls:           number;
	maxScore:        number;
	duration:        number;
	requirements:    number;
}

export interface IModifierValues {
	modifierId?: number;
	da:         number;
	fs:         number;
	sf:         number;
	ss:         number;
	gn:         number;
	na:         number;
	nb:         number;
	nf:         number;
	no:         number;
	pm:         number;
	sc:         number;
	sa:         number;
	op:         number;
}

export interface IModifierRating {
    fsPassRating: number;
    fsAccRating: number;
    fsTechRating: number;
    fsStars: number;

    ssPassRating: number;
    ssAccRating: number;
    ssTechRating: number;
    ssStars: number;

    sfPassRating: number;
    sfAccRating: number;
    sfTechRating: number;
    sfStars: number;
}

export interface ISong {
	id:             string;
	hash:           string;
	name:           string;
	subName:        string;
	author:         string;
	mapper:         string;
	mapperId:       number;
	coverImage:     string;
	fullCoverImage: string;
	downloadUrl:    string;
	bpm:            number;
	duration:       number;
	tags:           string | null;
	uploadTime:     number;
	difficulties:   IDifficulty[];
}

// player

export interface IPlayer {
	id:              string;
	name:            string;
	platform:        string;
	avatar:          string;
	country:         string;
	bot:             boolean;
	pp:              number;
	rank:            number;
	countryRank:     number;
	role:            string;
	socials?:        ISocial[];
	patreonFeatures: IPatreonFeatures;
	profileSettings: IProfileSettings;
    clans:           IPlayerClan[];
    
    externalProfileUrl: string;
    accPp: number;
    passPp: number;
    techPp: number;
    scoreStats: IScoreStats;
}

export interface IScoreStats {
    totalScore: number;
    totalUnrankedScore: number;
    totalRankedScore: number;
    lastScoreTime: number;
    lastUnrankedScoreTime: number;
    lastRankedScoreTime: number;
    averageRankedAccuracy: number;
    averageWeightedRankedAccuracy: number;
    averageUnrankedAccuracy: number;
    averageAccuracy: number;
    medianRankedAccuracy: number;
    medianAccuracy: number;
    topRankedAccuracy: number;
    topUnrankedAccuracy: number;
    topAccuracy: number;
    topPp: number;
    topBonusPP: number;
    topPassPP: number;
    topAccPP: number;
    topTechPP: number;
    peakRank: number;
    rankedMaxStreak: number;
    unrankedMaxStreak: number;
    maxStreak: number;
    averageLeftTiming: number;
    averageRightTiming: number;
    rankedPlayCount: number;
    unrankedPlayCount: number;
    totalPlayCount: number;
    rankedTop1Count: number;
    unrankedTop1Count: number;
    top1Count: number;
    rankedTop1Score: number;
    unrankedTop1Score: number;
    top1Score: number;
    averageRankedRank: number;
    averageWeightedRankedRank: number;
    averageUnrankedRank: number;
    averageRank: number;
    sspPlays: number;
    ssPlays: number;
    spPlays: number;
    sPlays: number;
    aPlays: number;
    topPlatform: string;
    topHMD: number;
    dailyImprovements: number;
    authorizedReplayWatched: number;
    anonimusReplayWatched: number;
    watchedReplays: number;
}

export interface IHistory implements IScoreStats {
	rank: number;
	countryRank: number;
	pp: number;
}

export interface IPlayerClan {
	id:    number;
	tag:   string;
	color: string;
}

export interface IPatreonFeatures {
	id:              number;
	bio:             string;
	message:         string;
	leftSaberColor:  string;
	rightSaberColor: string;
}

export interface IProfileSettings {
	id:                number;
	bio:               null;
	message:           null;
	effectName:        null;
	profileAppearance: string;
	hue:               number;
	saturation:        number;
	leftSaberColor:    null;
	rightSaberColor:   null;
	profileCover:      null;
	starredFriends:    string;
	showBots:          boolean;
	showAllRatings:    boolean;
}

export interface ISocial {
	id:       number;
	service:  string;
	link:     string;
	user:     string;
	userId:   string;
	playerId: string;
}

// clans

export interface IClanContainer {
	id:              number;
	name:            string;
	color:           string;
	icon:            string;
	tag:             string;
	leaderID:        string;
	description:     string;
	bio:             string;
	playersCount:    number;
	pp:              number;
	averageRank:     number;
	averageAccuracy: number;
	players:         IPlayer[];
}