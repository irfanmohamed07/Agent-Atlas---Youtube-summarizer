export type Channel = {
  id: number;
  channel_name: string;
  channel_id: string;
  last_video_id: string | null;
};

export type LatestVideo = {
  videoId: string;
  title: string;
  publishedAt: string;
  url: string;
};

export type VideoSummary = {
  story: string;
  executiveSummary: string;
  bulletSummary: string[];
  keyTakeaways: string[];
  toolsMentioned: string[];
  apisMentioned: string[];
  frameworksMentioned: string[];
  actionItems: string[];
  watchRecommendation: string;
};
