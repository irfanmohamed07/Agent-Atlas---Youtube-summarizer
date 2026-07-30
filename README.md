# YouTube Storyteller Agent

An autonomous [Vercel Eve](https://eve.dev/) agent that watches YouTube RSS feeds, downloads new-video audio with `yt-dlp`, transcribes locally with `faster-whisper`, creates a concise narrative summary with DeepSeek v4 Flash, and sends it to Telegram.

## Setup

1. Create a Supabase project and run [supabase/schema.sql](/Users/irfanmd/Desktop/Youtube%20summarizer/supabase/schema.sql) in its SQL editor.
2. Install server tools: `ffmpeg`, `yt-dlp`, and Python `faster-whisper`.
3. Copy `.env.example` to `.env.local` and fill in the Supabase service-role key, your OpenAI API key for Eve, your DeepSeek API key for summaries, Telegram bot/chat details, and optional Apify API token. Keep `.env.local` private.
4. Install Node dependencies: `npm install`. The agent uses your own API keys directly, not AI Gateway.
5. Run locally: `npm run dev`.

Add a channel to `channels` using its YouTube channel ID (the `UC...` value):

```sql
insert into channels (channel_name, channel_url, channel_id)
values ('Example Channel', 'https://youtube.com/@example', 'UCxxxxxxxx');
```

## Schedules and delivery

- `agent/schedules/monitor.md` finds new uploads every 5 minutes.
- `agent/schedules/retry_transcripts.md` retries unavailable local transcription/captions every 5 hours for about 24 hours, then tries Apify once per day for two more days before marking the video failed.
- A video is marked processed only after its summary has been saved and Telegram delivery succeeds, so failed deliveries can be retried without losing work.
- Transcript creation tries local audio transcription first. Direct YouTube captions are used as backup. If those fail and `APIFY_API_TOKEN` is set, it runs Apify Actor `zPumutvB61fpEsglh` as the final fallback.

Optional environment variables for local transcription:

```text
TRANSCRIPT_WORK_DIR=/tmp/youtube-summarizer-transcripts
WHISPER_MODEL=base
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

Deploy as an Eve project with `vercel deploy` after configuring the same environment variables in Vercel.
