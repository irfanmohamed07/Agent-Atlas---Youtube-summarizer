import { defineTool } from "eve/tools";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";

const DIRECT_RETRY_LIMIT = 5;
const FINAL_RETRY_LIMIT = 7;
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default defineTool({
  description: "Create or update a pending video when local transcription and caption transcript fetching are unavailable. Retry every 5 hours for about 24 hours, then try Apify once per day for two days. After retry 7 it marks the video FAILED.",
  inputSchema: z.object({ channelId: z.number().int().positive(), videoId: z.string(), title: z.string(), videoUrl: z.string().url(), publishedAt: z.string(), retryCount: z.number().int().min(1).max(FINAL_RETRY_LIMIT), audioPath: z.string().nullable().optional() }),
  outputSchema: z.object({ status: z.enum(["PENDING", "FAILED"]), retryCount: z.number().int() }),
  async execute({ channelId, videoId, title, videoUrl, publishedAt, retryCount, audioPath }) {
    const failed = retryCount >= FINAL_RETRY_LIMIT;
    const nextDelayMs = retryCount < DIRECT_RETRY_LIMIT ? FIVE_HOURS_MS : ONE_DAY_MS;
    const nextRetryAt = failed ? null : new Date(Date.now() + nextDelayMs).toISOString();
    const failureReason = failed ? "Transcript unavailable after 24 hours and 2 daily Apify attempts" : null;
    console.log(`[record-pending-video] ${videoId} retry=${retryCount}/${FINAL_RETRY_LIMIT} nextRetryAt=${nextRetryAt ?? "none"} failed=${String(failed)}`);
    const record = {
      channel_id: channelId, video_id: videoId, title, video_url: videoUrl, published_at: publishedAt,
      status: failed ? "FAILED" : "PENDING", processed: false, transcript_retry_count: retryCount,
      next_transcript_retry_at: nextRetryAt,
      failure_reason: failureReason,
      ...(audioPath ? { audio_path: audioPath } : {}),
    };
    await supabase("videos?on_conflict=video_id", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record) });
    return { status: failed ? "FAILED" : "PENDING", retryCount };
  },
});
