---
name: youtube-monitor
description: Monitor YouTube RSS feeds without duplicate processing.
---

RSS is the source for upload detection. Treat the database as the durable record: `videos.processed` prevents duplicate summaries and `channels.last_video_id` records the last successfully delivered upload. A pending video may be retried; it is not processed until its Telegram notification has been sent.
