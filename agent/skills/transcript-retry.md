---
name: transcript-retry
description: Retry YouTube transcripts safely.
---

When a transcript is not available, persist PENDING with a retry count and a retry time ten minutes later. The maximum is 24 attempts. At attempt 24, mark it FAILED and move on; never let a missing transcript stop other channels.
