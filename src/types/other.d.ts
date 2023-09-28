export type YoutubeVideo = {
    id: string;
    title: string;
    description: string;
    link: string;
    created: number;
}

export type YoutubeFeed = {
    title: string;
    items: YoutubeVideo[];
}