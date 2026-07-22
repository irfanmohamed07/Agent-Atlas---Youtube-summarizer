import { defineTool } from "eve/tools";
import { z } from "zod";
import { YoutubeTranscript } from "youtube-transcript";

export default defineTool({
  description: "Download a video's YouTube transcript. Returns transcriptReady false when captions are not available yet; this is expected for recent uploads.",
  inputSchema: z.object({ videoId: z.string().min(1) }),
  outputSchema: z.object({ transcriptReady: z.boolean(), transcript: z.string().nullable() }),
  async execute({ videoId }) {
    const attempts = [
      { label: "default", options: undefined },
      { label: "en", options: { lang: "en" } },
      { label: "en-US", options: { lang: "en-US" } },
    ] as const;

    const errors: string[] = [];
    for (const attempt of attempts) {
      try {
        const lines = await YoutubeTranscript.fetchTranscript(videoId, attempt.options);
        const transcript = lines.map((line) => line.text.trim()).filter(Boolean).join(" ");
        if (transcript) return { transcriptReady: true, transcript };
        errors.push(`${attempt.label}: empty transcript`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${attempt.label}: ${message}`);
      }
    }

    console.warn(`[youtube-transcript] ${videoId} not ready: ${errors.join(" | ")}`);
    return { transcriptReady: false, transcript: null };
  },
});
