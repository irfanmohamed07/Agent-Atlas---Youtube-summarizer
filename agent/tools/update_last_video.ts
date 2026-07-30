import { defineTool } from "eve/tools";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";

export default defineTool({
  description: "Set a channel's last successfully delivered video ID. Call only after save_summary and send_telegram both succeeded.",
  inputSchema: z.object({ channelId: z.number().int().positive(), videoId: z.string().min(1) }),
  outputSchema: z.object({ updated: z.literal(true) }),
  async execute({ channelId, videoId }) {
    console.log(`[update-last-video] channel=${channelId} videoId=${videoId} updating`);
    await supabase(`channels?id=eq.${channelId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ last_video_id: videoId }) });
    console.log(`[update-last-video] channel=${channelId} videoId=${videoId} updated`);
    return { updated: true };
  },
});
