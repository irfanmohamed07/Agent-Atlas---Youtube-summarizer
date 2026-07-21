# YouTube Channel Monitor Agent (Eve Framework)

## Goal

Build an autonomous YouTube monitoring agent using the Eve framework.

The agent continuously monitors a list of YouTube channels.

Whenever a new video is uploaded, it should:

1. Detect the new upload
2. Wait until the transcript becomes available
3. Download the transcript
4. Summarize the video using GPT
5. Send a formatted Telegram message
6. Store the video as processed
7. Never summarize the same video twice

---

# Tech Stack

Framework
- Eve

Language
- TypeScript

Database
- Supabase PostgreSQL

LLM
- OpenAI GPT-5.5

Source
- YouTube RSS Feeds

Messaging
- Telegram Bot API

---

# Folder Structure

agent/

    agent.ts

    instructions.md

    schedules/

        monitor.ts

    tools/

        loadChannels.ts

        fetchLatestVideo.ts

        isProcessed.ts

        fetchTranscript.ts

        summarizeVideo.ts

        saveSummary.ts

        sendTelegram.ts

        updateLastVideo.ts

    skills/

        youtube-monitor.md

        transcript-retry.md

        summarizer.md

        telegram-format.md

    memory/

        prompts.md

---

# Database Schema

## channels

id
channel_name
channel_url
channel_id
last_video_id
active
created_at

---

## videos

id
video_id
channel_id
title
published_at
transcript
summary
processed
created_at

---

# Agent Responsibilities

The agent must:

- Monitor all active channels
- Process one channel at a time
- Detect newly uploaded videos
- Ignore already processed videos
- Retry transcript retrieval if unavailable
- Generate structured summaries
- Send Telegram notification
- Save results to database

---

# Schedule

Run automatically every 15 minutes.

Pseudo Flow

Load Channels

↓

Loop Channels

↓

Get Latest Upload

↓

Compare with last_video_id

↓

If same

Skip

↓

If different

Fetch transcript

↓

Transcript available?

↓

No

Retry every 10 minutes

Maximum 24 retries

↓

Yes

Generate summary

↓

Save summary

↓

Update last_video_id

↓

Send Telegram message

↓

Continue next channel

---

# Tool Specifications

## loadChannels()

Returns all active channels.

Output

[
    {
        "id":1,
        "channelId":"UCxxxxx",
        "lastVideoId":"abc123"
    }
]

---

## fetchLatestVideo(channelId)

Returns

{
    "videoId":"",
    "title":"",
    "publishedAt":"",
    "url":""
}

---

## isProcessed(videoId)

Returns

true

or

false

---

## fetchTranscript(videoId)

Returns

{
    "transcript":"..."
}

If unavailable

throw TranscriptNotReady

---

## summarizeVideo(transcript)

Prompt

Summarize the transcript.

Return JSON only.

{
    "summary":"",
    "keyTakeaways":[],
    "toolsMentioned":[],
    "actionItems":[],
    "watchRecommendation":""
}

---

## saveSummary()

Store

video

summary

transcript

created_at

---

## updateLastVideo()

Update

channels.last_video_id

---

## sendTelegram()

Send Markdown formatted message.

Template

🎥 New YouTube Video

📺 Channel:
{{channel}}

🎬 Title:
{{title}}

━━━━━━━━━━━━━━

📝 Summary

{{summary}}

━━━━━━━━━━━━━━

💡 Key Takeaways

• item 1

• item 2

• item 3

━━━━━━━━━━━━━━

🛠 Tools Mentioned

{{tools}}

━━━━━━━━━━━━━━

✅ Watch?

{{watchRecommendation}}

━━━━━━━━━━━━━━

🔗 Video

{{url}}

---

# Retry Strategy

If transcript is unavailable

Retry every 10 minutes

Maximum retries

24

After retry limit

Mark status

FAILED

Continue monitoring

---

# Agent Rules

Never summarize duplicate videos.

Never process inactive channels.

Continue after failures.

Do not stop if one channel fails.

Always update the database after successful processing.

Always include the original YouTube URL in Telegram.

Return structured JSON from every tool.

---

# Skills

youtube-monitor.md

Explains how channel monitoring works.

---

transcript-retry.md

Explains retry strategy.

---

summarizer.md

Contains summarization best practices.

Return

- Executive Summary

- Bullet Summary

- Key Takeaways

- Tools Mentioned

- APIs Mentioned

- Frameworks Mentioned

- Action Items

- Watch Recommendation

---

telegram-format.md

Always use Markdown.

Keep messages under Telegram limits.

Always include

Title

Channel

Summary

Key Takeaways

Video URL

---

# Success Criteria

The agent should run unattended.

Adding a new channel to the database automatically includes it in monitoring.

Duplicate videos are never summarized.

Telegram messages are delivered successfully.

Every processed video is stored in the database.

The agent is resilient to failures and resumes automatically after retries.