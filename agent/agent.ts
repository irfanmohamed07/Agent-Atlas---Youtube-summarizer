import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";

const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
  name: "deepseek",
});

export default defineAgent({
  model: deepseek.chat(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"),
});
