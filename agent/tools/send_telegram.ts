import { defineTool } from "eve/tools";
import { z } from "zod";
import { escapeTelegram, trimTelegram } from "../lib/telegram.js";

const summary = z.object({ story: z.string(), keyTakeaways: z.array(z.string()), toolsMentioned: z.array(z.string()), watchRecommendation: z.string() });
const list = (items: string[]) => items.length ? items.map((item) => `• ${escapeTelegram(item)}`).join("\n") : "• None mentioned";

export default defineTool({
  description: "Send a completed video summary to the configured Telegram chat. Call only once per successfully saved, unnotified video.",
  inputSchema: z.object({ channelName: z.string(), title: z.string(), videoUrl: z.string().url(), summary }),
  outputSchema: z.object({ delivered: z.boolean(), messageId: z.number() }),
  async execute({ channelName, title, videoUrl, summary }) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
    const text = trimTelegram(`🎥 *New YouTube Video*\n\n📺 *Channel:* ${escapeTelegram(channelName)}\n🎬 *Title:* ${escapeTelegram(title)}\n\n━━━━━━━━━━━━━━\n\n📝 *The story*\n\n${escapeTelegram(summary.story)}\n\n━━━━━━━━━━━━━━\n\n💡 *Key takeaways*\n${list(summary.keyTakeaways)}\n\n━━━━━━━━━━━━━━\n\n🛠 *Tools mentioned*\n${list(summary.toolsMentioned)}\n\n━━━━━━━━━━━━━━\n\n✅ *Watch?*\n${escapeTelegram(summary.watchRecommendation)}\n\n━━━━━━━━━━━━━━\n\n🔗 [Watch on YouTube](${escapeTelegram(videoUrl)})`);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2", disable_web_page_preview: false }) });
    const body = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!response.ok || !body.ok || !body.result) throw new Error(`Telegram delivery failed: ${body.description ?? response.status}`);
    return { delivered: true, messageId: body.result.message_id };
  },
});
