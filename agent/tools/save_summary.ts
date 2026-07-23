import { defineTool } from "eve/tools";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";

const summary = z.object({ story: z.string(), executiveSummary: z.string(), bulletSummary: z.array(z.string()), keyTakeaways: z.array(z.string()), toolsMentioned: z.array(z.string()), apisMentioned: z.array(z.string()), frameworksMentioned: z.array(z.string()), actionItems: z.array(z.string()), watchRecommendation: z.string() });

export default defineTool({
  description: "Persist a completed transcript and its structured summary. Call after summarize_video and before sending Telegram.",
  inputSchema: z.object({ channelId: z.number().int().positive(), videoId: z.string(), title: z.string(), videoUrl: z.string().url(), publishedAt: z.string(), transcript: z.string(), summary }),
  outputSchema: z.object({ saved: z.literal(true) }),
  async execute(input) {
    console.log(`[save-summary] ${input.videoId} saving summary before Telegram delivery`);
    await supabase("videos?on_conflict=video_id", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ channel_id: input.channelId, video_id: input.videoId, title: input.title, video_url: input.videoUrl, published_at: input.publishedAt, transcript: input.transcript, summary: input.summary, processed: false, status: "PENDING", transcript_retry_count: 0, next_transcript_retry_at: null, failure_reason: null, processed_at: null }),
    });
    console.log(`[save-summary] ${input.videoId} saved`);
    return { saved: true };
  },
});
