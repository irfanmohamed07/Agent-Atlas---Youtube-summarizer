import { defineTool } from "eve/tools";
import { z } from "zod";
import { YtCaptionKit } from "yt-caption-kit";
import { YoutubeTranscript } from "youtube-transcript";

const captionKit = new YtCaptionKit();
const APIFY_TRANSCRIPT_ACTOR_ID = "zPumutvB61fpEsglh";

function logTranscript(videoId: string, message: string) {
  console.log(`[fetch-transcript] ${videoId} ${message}`);
}

function textFromSegments(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const text = value
    .map((segment) => {
      if (typeof segment === "string") return segment.trim();
      if (segment && typeof segment === "object" && "text" in segment && typeof segment.text === "string") return segment.text.trim();
      return "";
    })
    .filter(Boolean)
    .join(" ");
  return text || null;
}

function extractTranscriptText(items: unknown): string | null {
  const rows = Array.isArray(items) ? items : [items];
  const chunks: string[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;

    for (const key of ["transcript", "text", "content", "captions", "subtitles"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) chunks.push(value.trim());
      const segmentText = textFromSegments(value);
      if (segmentText) chunks.push(segmentText);
    }

    for (const key of ["snippets", "segments", "items"]) {
      const segmentText = textFromSegments(record[key]);
      if (segmentText) chunks.push(segmentText);
    }
  }

  return chunks.join(" ").trim() || null;
}

async function fetchWithApify(videoId: string): Promise<string | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");
  logTranscript(videoId, `apify token configured, starting actor ${APIFY_TRANSCRIPT_ACTOR_ID}`);

  const input = {
    youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
    languages: ["en"],
    transcript_type: "any",
    output_formats: [],
    preserve_formatting: false,
    list_only: false,
    include_metadata: true,
  };

  logTranscript(videoId, `apify input ${JSON.stringify(input)}`);
  const runResponse = await fetch(`https://api.apify.com/v2/actors/${APIFY_TRANSCRIPT_ACTOR_ID}/runs?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const runBody = await runResponse.json() as { data?: { id?: string; defaultDatasetId?: string; status?: string }; error?: { message?: string } };
  if (!runResponse.ok || !runBody.data?.id) throw new Error(runBody.error?.message ?? `Apify run failed to start (${runResponse.status})`);
  logTranscript(videoId, `apify run started id=${runBody.data.id} status=${runBody.data.status ?? "unknown"} dataset=${runBody.data.defaultDatasetId ?? "none-yet"}`);

  let datasetId = runBody.data.defaultDatasetId;
  let status = runBody.data.status;
  for (let attempt = 0; attempt < 60 && status !== "SUCCEEDED"; attempt += 1) {
    if (status && ["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) throw new Error(`Apify run ended with status ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runBody.data.id)}?token=${encodeURIComponent(token)}`);
    const statusBody = await statusResponse.json() as { data?: { defaultDatasetId?: string; status?: string }; error?: { message?: string } };
    if (!statusResponse.ok) throw new Error(statusBody.error?.message ?? `Apify run status failed (${statusResponse.status})`);
    datasetId = statusBody.data?.defaultDatasetId ?? datasetId;
    status = statusBody.data?.status ?? status;
    logTranscript(videoId, `apify poll ${attempt + 1}/60 status=${status ?? "unknown"} dataset=${datasetId ?? "none-yet"}`);
  }

  if (status !== "SUCCEEDED") throw new Error(`Apify run did not finish in time; last status ${status ?? "unknown"}`);
  if (!datasetId) throw new Error("Apify run finished without a dataset");
  logTranscript(videoId, `apify succeeded, fetching dataset ${datasetId}`);

  const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}&clean=true`);
  const items = await itemsResponse.json();
  if (!itemsResponse.ok) throw new Error(`Apify dataset fetch failed (${itemsResponse.status})`);
  const itemCount = Array.isArray(items) ? items.length : 1;
  const transcript = extractTranscriptText(items);
  logTranscript(videoId, `apify dataset items=${itemCount} transcriptChars=${transcript?.length ?? 0}`);
  return transcript;
}

export default defineTool({
  description: "Download a video's YouTube transcript. Returns transcriptReady false when captions are not available yet; this is expected for recent uploads.",
  inputSchema: z.object({ videoId: z.string().min(1), useApify: z.boolean().optional().default(false) }),
  outputSchema: z.object({ transcriptReady: z.boolean(), transcript: z.string().nullable() }),
  async execute({ videoId, useApify }) {
    const errors: string[] = [];
    logTranscript(videoId, `started useApify=${String(useApify)}`);

    try {
      logTranscript(videoId, "trying yt-caption-kit languages=en,en-US");
      const transcript = await captionKit.fetch(videoId, { languages: ["en", "en-US"] });
      const fullText = transcript.snippets.map((segment) => segment.text.trim()).filter(Boolean).join(" ");
      logTranscript(videoId, `yt-caption-kit returned snippets=${transcript.snippets.length} chars=${fullText.length}`);
      if (fullText) {
        logTranscript(videoId, "success via yt-caption-kit");
        return { transcriptReady: true, transcript: fullText };
      }
      errors.push("yt-caption-kit: empty transcript");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logTranscript(videoId, `yt-caption-kit failed: ${message}`);
      errors.push(`yt-caption-kit: ${message}`);
    }

    const attempts = [
      { label: "default", options: undefined },
      { label: "en", options: { lang: "en" } },
      { label: "en-US", options: { lang: "en-US" } },
    ] as const;

    for (const attempt of attempts) {
      try {
        logTranscript(videoId, `trying youtube-transcript ${attempt.label}`);
        const lines = await YoutubeTranscript.fetchTranscript(videoId, attempt.options);
        const transcript = lines.map((line) => line.text.trim()).filter(Boolean).join(" ");
        logTranscript(videoId, `youtube-transcript ${attempt.label} returned lines=${lines.length} chars=${transcript.length}`);
        if (transcript) {
          logTranscript(videoId, `success via youtube-transcript ${attempt.label}`);
          return { transcriptReady: true, transcript };
        }
        errors.push(`youtube-transcript ${attempt.label}: empty transcript`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logTranscript(videoId, `youtube-transcript ${attempt.label} failed: ${message}`);
        errors.push(`youtube-transcript ${attempt.label}: ${message}`);
      }
    }

    if (useApify) {
      try {
        logTranscript(videoId, "trying apify fallback");
        const transcript = await fetchWithApify(videoId);
        if (transcript) {
          logTranscript(videoId, "success via apify");
          return { transcriptReady: true, transcript };
        }
        errors.push("apify: empty transcript");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logTranscript(videoId, `apify failed: ${message}`);
        errors.push(`apify: ${message}`);
      }
    } else {
      logTranscript(videoId, "skipping apify because useApify=false");
    }

    console.warn(`[fetch-transcript] ${videoId} not ready: ${errors.join(" | ")}`);
    return { transcriptReady: false, transcript: null };
  },
});
