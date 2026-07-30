import { defineTool } from "eve/tools";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";

export default defineTool({
  description: "Check whether a video has already been fully processed and delivered. Always call this before processing a newly discovered upload.",
  inputSchema: z.object({ videoId: z.string().min(1) }),
  outputSchema: z.object({ processed: z.boolean(), status: z.enum(["PENDING", "PROCESSED", "FAILED", "NOT_FOUND"]) }),
  async execute({ videoId }) {
    console.log(`[is-processed] ${videoId} checking database`);
    const rows = await supabase<Array<{ processed: boolean; status: "PENDING" | "PROCESSED" | "FAILED" }>>(`videos?video_id=eq.${encodeURIComponent(videoId)}&select=processed,status&limit=1`);
    const video = rows[0];
    const result = video ? { processed: video.processed, status: video.status } : { processed: false, status: "NOT_FOUND" as const };
    console.log(`[is-processed] ${videoId} processed=${String(result.processed)} status=${result.status}`);
    return result;
  },
});
