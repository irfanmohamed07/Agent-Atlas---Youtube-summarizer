import { defineTool } from "eve/tools";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import type { Channel } from "../lib/types.js";

export default defineTool({
  description: "Load active YouTube channels, one at a time, before checking RSS feeds.",
  inputSchema: z.object({}),
  outputSchema: z.object({ channels: z.array(z.object({ id: z.number(), channelName: z.string(), channelId: z.string(), lastVideoId: z.string().nullable() })) }),
  async execute() {
    console.log("[load-channels] loading active channels");
    const rows = await supabase<Channel[]>("channels?active=eq.true&select=id,channel_name,channel_id,last_video_id&order=id.asc");
    const channels = rows.map((row) => ({ id: row.id, channelName: row.channel_name, channelId: row.channel_id, lastVideoId: row.last_video_id }));
    console.log(`[load-channels] loaded count=${channels.length} ids=${channels.map((channel) => channel.id).join(",") || "none"}`);
    return { channels };
  },
});
