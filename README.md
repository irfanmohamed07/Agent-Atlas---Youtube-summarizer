# YouTube Storyteller Agent

An autonomous Eve agent that monitors YouTube channels, downloads new-video audio through RapidAPI, transcribes it with a local `faster-whisper` model, creates an easy story-style summary with DeepSeek v4 Flash, saves everything in Supabase, and sends the result to Telegram.

## Important hosting requirement

Whisper runs locally on the machine running this agent. It is not a cloud transcription API. The machine must have Python, `faster-whisper`, `ffmpeg`, enough RAM, and persistent disk space for the Whisper model and downloaded audio.

This project is therefore not suitable for a normal Vercel or Render deployment. Vercel serverless functions cannot run the long-lived local Whisper process, and this setup is not configured to run Whisper as a managed cloud service there. Use a persistent VPS such as AWS Lightsail, EC2, or another Linux server instead.

## How the agent works

Every 5 minutes it reads the RSS feed of each active channel. New videos are processed one at a time: RapidAPI downloads the MP3, Whisper transcribes one audio file at a time, DeepSeek creates the summary, Supabase stores the result, and Telegram receives the notification. A completed video is marked `PROCESSED` so it is never transcribed again. Failed transcripts are stored with `failure_reason` and retried according to the retry schedule.

## Local development (Mac/Linux)

1. Install system dependencies:

```bash
# macOS
brew install ffmpeg python

# Ubuntu/Debian
sudo apt update
sudo apt install -y ffmpeg python3 python3-venv
```

2. Create a Python environment inside the project and install Whisper:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install faster-whisper
```

3. Install Node dependencies:

```bash
npm install
npm install --save-dev just-bash
```

4. Create `.env.local`:

```bash
cp .env.example .env.local
```

Set the Supabase, DeepSeek, RapidAPI, and Telegram values. Also set the Python executable:

```text
PYTHON_BIN=/absolute/path/to/project/.venv/bin/python
WHISPER_MODEL=tiny
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

5. In Supabase SQL Editor, run `supabase/schema.sql`. If the project already has the tables, run `supabase/add_audio_path.sql` as well.

6. Add channels using their YouTube `UC...` channel ID:

```sql
insert into channels (channel_name, channel_url, channel_id)
values ('Example Channel', 'https://youtube.com/@example', 'UCxxxxxxxx');
```

7. Start local development:

```bash
npm run dev
```

You can type a test request in Eve, or start one manually:

```bash
curl -X POST http://127.0.0.1:3000/eve/v1/session \
  -H "Content-Type: application/json" \
  -d '{"message":"Monitor all active YouTube channels now.","mode":"task"}'
```

## Cloud/VPS deployment

Use a persistent Linux VPS. The following example assumes the repository is in `/home/bitnami/atlas/Agent-Atlas---Youtube-summarizer`:

```bash
cd /home/bitnami/atlas/Agent-Atlas---Youtube-summarizer
sudo apt update
sudo apt install -y ffmpeg python3-venv
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install faster-whisper
npm install
npm install --save-dev just-bash
```

Create `.env.local` with production credentials. Use the real VPS path:

```text
PYTHON_BIN=/home/bitnami/atlas/Agent-Atlas---Youtube-summarizer/.venv/bin/python
WHISPER_MODEL=tiny
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WHISPER_LOG_FILE=logs/whisper.log
```

Build and run one production instance with PM2:

```bash
npm run build
pm2 delete youtube-summarizer
pm2 start npm --name youtube-summarizer -- start
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup`, then run `pm2 save` again. Check the service with:

```bash
pm2 status
pm2 logs youtube-summarizer
tail -f logs/whisper.log
```

Do not run `npm run dev` alongside PM2. Two Eve processes can process the same video twice. After pulling code updates:

```bash
git pull
npm install
npm run build
pm2 restart youtube-summarizer --update-env
```

## Environment variables

See `.env.example` for the complete list. Required values include:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
RAPIDAPI_KEY=
RAPIDAPI_HOST=youtube-mp36.p.rapidapi.com
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Keep `.env.local`, API keys, and downloaded audio private.

## Schedules

- `agent/schedules/monitor.md`: checks channels every 5 minutes.
- `agent/schedules/retry_transcripts.md`: retries pending transcripts every 5 hours, then uses the final Apify fallback before marking a video failed.
