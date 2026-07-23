import { defineTool } from "eve/tools";
import { z } from "zod";

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1].trim()) : null;
}

export default defineTool({
  description: "Fetch the newest upload from a YouTube channel's official RSS feed. Use after loading an active channel.",
  inputSchema: z.object({ channelId: z.string().min(1) }),
  outputSchema: z.object({ found: z.boolean(), video: z.object({ videoId: z.string(), title: z.string(), publishedAt: z.string(), url: z.string() }).nullable() }),
  async execute({ channelId }) {
    const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
    if (response.status === 404) {
      console.warn(`[fetch-latest-video] ${channelId} RSS returned 404. Check that this is the real YouTube channel ID.`);
      return { found: false, video: null };
    }
    if (!response.ok) throw new Error(`YouTube RSS request failed (${response.status})`);
    const entry = (await response.text()).match(/<entry>[\s\S]*?<\/entry>/)?.[0];
    if (!entry) return { found: false, video: null };
    const videoId = tag(entry, "yt:videoId");
    const title = tag(entry, "title");
    const publishedAt = tag(entry, "published");
    const url = entry.match(/<link[^>]+href=["']([^"']+)["']/)?.[1];
    if (!videoId || !title || !publishedAt || !url) throw new Error("YouTube RSS entry was missing required fields");
    return { found: true, video: { videoId, title, publishedAt, url } };
  },
});
