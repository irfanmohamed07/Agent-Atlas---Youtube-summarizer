import { defineTool } from "eve/tools";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";

export default defineTool({
  description: "Load pending videos whose transcript retry time has arrived. Use for the transcript retry schedule.",
  inputSchema: z.object({}),
  async execute() {
    const now = new Date().toISOString();
    const rows = await supabase<Array<{ id: number; video_id: string; channel_id: number; title: string; video_url: string; published_at: string; transcript_retry_count: number }>>(
      `videos?status=eq.PENDING&next_transcript_retry_at=lte.${encodeURIComponent(now)}&select=id,video_id,channel_id,title,video_url,published_at,transcript_retry_count&order=next_transcript_retry_at.asc`,
    );
    return { videos: rows.map((row) => ({ id: row.id, videoId: row.video_id, channelId: row.channel_id, title: row.title, videoUrl: row.video_url, publishedAt: row.published_at, retryCount: row.transcript_retry_count })) };
  },
});
