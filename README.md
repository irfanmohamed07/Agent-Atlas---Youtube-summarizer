# YouTube Storyteller Agent

An autonomous [Vercel Eve](https://eve.dev/) agent that watches YouTube RSS feeds, waits for captions, creates a concise narrative summary with GPT-4o mini, and sends it to Telegram.

## Setup

1. Create a Supabase project and run [supabase/schema.sql](/Users/irfanmd/Desktop/Youtube%20summarizer/supabase/schema.sql) in its SQL editor.
2. Copy `.env.example` to `.env.local` and fill in the Supabase service-role key, your OpenAI API key, and Telegram bot/chat details. Keep `.env.local` private.
3. Install dependencies: `npm install`. The agent uses your OpenAI API key directly, not AI Gateway.
4. Run locally: `npm run dev`.

Add a channel to `channels` using its YouTube channel ID (the `UC...` value):

```sql
insert into channels (channel_name, channel_url, channel_id)
values ('Example Channel', 'https://youtube.com/@example', 'UCxxxxxxxx');
```

## Schedules and delivery

- `agent/schedules/monitor.md` finds new uploads every 15 minutes.
- `agent/schedules/retry_transcripts.md` retries unavailable captions every 10 minutes, up to 24 attempts.
- A video is marked processed only after its summary has been saved and Telegram delivery succeeds, so failed deliveries can be retried without losing work.

Deploy as an Eve project with `vercel deploy` after configuring the same environment variables in Vercel.
