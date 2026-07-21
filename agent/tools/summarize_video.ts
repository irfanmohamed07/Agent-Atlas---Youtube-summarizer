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
  description: "Create a grounded, story-like structured summary from a YouTube transcript using GPT-4o mini. Call only after a transcript is available.",
  inputSchema: z.object({ title: z.string().min(1), transcript: z.string().min(1) }),
  outputSchema: summarySchema,
  async execute({ title, transcript }): Promise<VideoSummary> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You summarize YouTube transcripts faithfully. Return JSON only with: story, executiveSummary, bulletSummary, keyTakeaways, toolsMentioned, apisMentioned, frameworksMentioned, actionItems, watchRecommendation. Write for an 8th-grade reader: use common words, short sentences, short paragraphs, and explain any necessary technical term in plain language. story is 180-300 words and retells the video as a clear narrative with these parts: opening problem, key turns, evidence or examples, conclusion, and practical meaning. Never invent facts. Every list must contain only transcript-supported strings." },
          { role: "user", content: `Title: ${title}\n\nTranscript:\n${transcript}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no summary content");
    return summarySchema.parse(JSON.parse(content));
  },
});
