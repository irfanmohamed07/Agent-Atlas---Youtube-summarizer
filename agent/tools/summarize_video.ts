import { defineTool } from "eve/tools";
import { z } from "zod";
import type { VideoSummary } from "../lib/types.js";

const summarySchema = z.object({
  story: z.string(), executiveSummary: z.string(), bulletSummary: z.array(z.string()),
  keyTakeaways: z.array(z.string()), toolsMentioned: z.array(z.string()),
  apisMentioned: z.array(z.string()), frameworksMentioned: z.array(z.string()),
  actionItems: z.array(z.string()), watchRecommendation: z.string(),
});

export default defineTool({
  description: "Create a grounded, story-like structured summary from a YouTube transcript using DeepSeek v4 Flash. Call only after a transcript is available.",
  inputSchema: z.object({ title: z.string().min(1), transcript: z.string().min(1) }),
  outputSchema: summarySchema,
  async execute({ title, transcript }): Promise<VideoSummary> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required for summarize_video");

    const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
    const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
    const endpoint = `${baseUrl}/chat/completions`;

    console.log(`[summarize-video] title="${title}" transcriptChars=${transcript.length} starting DeepSeek summary model=${model}`);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You summarize YouTube transcripts faithfully. Return JSON only with: story, executiveSummary, bulletSummary, keyTakeaways, toolsMentioned, apisMentioned, frameworksMentioned, actionItems, watchRecommendation. Write for an 8th-grade reader: use common words, short sentences, short paragraphs, and explain any necessary technical term in plain language. story is 180-300 words and retells the video as a clear narrative with these parts: opening problem, key turns, evidence or examples, conclusion, and practical meaning. Never invent facts. Every list must contain only transcript-supported strings." },
          { role: "user", content: `Title: ${title}\n\nTranscript:\n${transcript}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`DeepSeek request failed (${response.status}): ${await response.text()}`);
    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    if (body.usage) {
      console.log(`[summarize-video] DeepSeek usage prompt=${body.usage.prompt_tokens ?? "?"} completion=${body.usage.completion_tokens ?? "?"} total=${body.usage.total_tokens ?? "?"}`);
    }
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek returned no summary content");
    const summary = summarySchema.parse(JSON.parse(content));
    console.log(`[summarize-video] title="${title}" storyChars=${summary.story.length} takeaways=${summary.keyTakeaways.length}`);
    return summary;
  },
});
