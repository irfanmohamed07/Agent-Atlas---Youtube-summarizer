import { defineTool } from "eve/tools";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";

export default defineTool({
  description: "Create or update a pending video when its transcript is unavailable. At 24 retries it marks the video FAILED. Use only after fetch_transcript reports unavailable.",
  inputSchema: z.object({ channelId: z.number().int().positive(), videoId: z.string(), title: z.string(), videoUrl: z.string().url(), publishedAt: z.string(), retryCount: z.number().int().min(1).max(24) }),
  outputSchema: z.object({ status: z.enum(["PENDING", "FAILED"]), retryCount: z.number().int() }),
  async execute({ channelId, videoId, title, videoUrl, publishedAt, retryCount }) {
    const failed = retryCount >= 24;
    const record = {
      channel_id: channelId, video_id: videoId, title, video_url: videoUrl, published_at: publishedAt,
      status: failed ? "FAILED" : "PENDING", processed: false, transcript_retry_count: retryCount,
      next_transcript_retry_at: failed ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      failure_reason: failed ? "Transcript unavailable after 24 attempts" : null,
    };
    await supabase("videos?on_conflict=video_id", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record) });
    return { status: failed ? "FAILED" : "PENDING", retryCount };
  },
});
