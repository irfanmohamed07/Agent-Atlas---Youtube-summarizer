import { defineTool } from "eve/tools";
import { z } from "zod";
import { YoutubeTranscript } from "youtube-transcript";

export default defineTool({
  description: "Download a video's YouTube transcript. Returns transcriptReady false when captions are not available yet; this is expected for recent uploads.",
  inputSchema: z.object({ videoId: z.string().min(1) }),
  outputSchema: z.object({ transcriptReady: z.boolean(), transcript: z.string().nullable() }),
  async execute({ videoId }) {
    try {
      const lines = await YoutubeTranscript.fetchTranscript(videoId);
      const transcript = lines.map((line) => line.text.trim()).filter(Boolean).join(" ");
      return transcript ? { transcriptReady: true, transcript } : { transcriptReady: false, transcript: null };
    } catch {
      return { transcriptReady: false, transcript: null };
    }
  },
});
