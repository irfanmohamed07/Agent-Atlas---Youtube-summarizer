import { spawn } from "node:child_process";
import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";

const DEFAULT_WORK_DIR = "/tmp/youtube-summarizer-transcripts";
const DEFAULT_AUDIO_DIR = "audio";
const DEFAULT_RAPIDAPI_HOST = "youtube-mp36.p.rapidapi.com";
let whisperQueue: Promise<void> = Promise.resolve();
let whisperQueueSize = 0;
let rapidApiQueue: Promise<void> = Promise.resolve();
let rapidApiQueueSize = 0;
const PYTHON_TRANSCRIBE_SCRIPT = `
import json
import sys
from faster_whisper import WhisperModel

audio_path = sys.argv[1]
model_size = sys.argv[2]
device = sys.argv[3]
compute_type = sys.argv[4]

model = WhisperModel(model_size, device=device, compute_type=compute_type)
segments, info = model.transcribe(audio_path, vad_filter=True)

rows = []
for segment in segments:
    text = segment.text.strip()
    if text:
        rows.append({"start": segment.start, "end": segment.end, "text": text})

print(json.dumps({
    "language": info.language,
    "duration": info.duration,
    "segments": rows,
}, ensure_ascii=False))
`;

function runProcess(
  command: string,
  args: string[],
  logPrefix: string,
  logFile?: string,
  mirrorStderrToConsole = true,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
      const text = chunk.toString("utf8").trim();
      if (text) {
        const line = `${new Date().toISOString()} ${logPrefix} ${text}\n`;
        if (mirrorStderrToConsole) console.log(`${logPrefix} ${text}`);
        if (logFile) void appendFile(logFile, line).catch(() => undefined);
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve({ stdout: out, stderr: err });
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}: ${err || out}`));
    });
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueWhisper<T>(videoId: string, job: () => Promise<T>): Promise<T> {
  whisperQueueSize += 1;
  const position = whisperQueueSize;
  console.log(`[whisper-queue] ${videoId} queued position=${position}`);

  const run = whisperQueue.then(async () => {
    whisperQueueSize -= 1;
    console.log(`[whisper-queue] ${videoId} started remaining=${whisperQueueSize}`);
    return job();
  });

  whisperQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function extractDownloadLink(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["link", "url", "download_url", "downloadUrl", "audio", "audio_url", "audioUrl"]) {
    const value = record[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}

async function fetchRapidApiAudioNow(videoId: string, audioPath: string) {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error("RAPIDAPI_KEY is required for RapidAPI audio download");

  const host = process.env.RAPIDAPI_HOST || DEFAULT_RAPIDAPI_HOST;
  const maxPolls = Number.parseInt(process.env.RAPIDAPI_AUDIO_MAX_POLLS || "12", 10);
  const pollDelayMs = Number.parseInt(process.env.RAPIDAPI_AUDIO_POLL_DELAY_MS || "5000", 10);
  const endpoint = `https://${host}/dl?id=${encodeURIComponent(videoId)}`;

  let downloadLink: string | null = null;
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    console.log(`[rapidapi-audio] ${videoId} requesting audio link attempt=${attempt}/${maxPolls} host=${host}`);
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": host,
        "x-rapidapi-key": apiKey,
      },
    });

    const text = await response.text();
    if (!response.ok) throw new Error(`RapidAPI link request failed (${response.status}): ${text}`);

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`RapidAPI returned non-JSON response: ${text.slice(0, 300)}`);
    }

    downloadLink = extractDownloadLink(payload);
    const status = typeof payload === "object" && payload ? String((payload as Record<string, unknown>).status ?? "unknown") : "unknown";
    const progress = typeof payload === "object" && payload ? String((payload as Record<string, unknown>).progress ?? "unknown") : "unknown";
    console.log(`[rapidapi-audio] ${videoId} response status=${status} progress=${progress} hasLink=${String(Boolean(downloadLink))}`);

    if (downloadLink) break;
    if (attempt < maxPolls) await sleep(pollDelayMs);
  }

  if (!downloadLink) throw new Error("RapidAPI did not return an audio download link");

  console.log(`[rapidapi-audio] ${videoId} downloading mp3 from RapidAPI link`);
  const audioResponse = await fetch(downloadLink);
  if (!audioResponse.ok) throw new Error(`RapidAPI audio download failed (${audioResponse.status}): ${await audioResponse.text()}`);
  const audioBytes = Buffer.from(await audioResponse.arrayBuffer());
  if (audioBytes.length === 0) throw new Error("RapidAPI audio download returned an empty file");
  await writeFile(audioPath, audioBytes);
  console.log(`[rapidapi-audio] ${videoId} saved audio path=${audioPath} bytes=${audioBytes.length}`);
}

function fetchRapidApiAudio(videoId: string, audioPath: string): Promise<void> {
  rapidApiQueueSize += 1;
  const position = rapidApiQueueSize;
  console.log(`[rapidapi-queue] ${videoId} queued position=${position}`);

  const run = rapidApiQueue.then(async () => {
    rapidApiQueueSize -= 1;
    console.log(`[rapidapi-queue] ${videoId} started remaining=${rapidApiQueueSize}`);
    return fetchRapidApiAudioNow(videoId, audioPath);
  });

  rapidApiQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export default defineTool({
  description: "Download YouTube audio with RapidAPI, save the MP3 path, and transcribe it locally with faster-whisper. Use this as the main transcript path when YouTube captions are missing or unreliable.",
  inputSchema: z.object({
    videoId: z.string().min(1),
    videoUrl: z.string().url(),
  }),
  outputSchema: z.object({
    transcriptReady: z.boolean(),
    transcript: z.string().nullable(),
    language: z.string().nullable(),
    duration: z.number().nullable(),
    segmentCount: z.number().int(),
    audioPath: z.string().nullable(),
  }),
  async execute({ videoId, videoUrl }) {
    const workDir = process.env.TRANSCRIPT_WORK_DIR || DEFAULT_WORK_DIR;
    const audioDir = process.env.AUDIO_DIR || process.env.RAPIDAPI_AUDIO_DIR || DEFAULT_AUDIO_DIR;
    const modelSize = process.env.WHISPER_MODEL || "base";
    const device = process.env.WHISPER_DEVICE || "cpu";
    const computeType = process.env.WHISPER_COMPUTE_TYPE || "int8";
    const pythonBin = process.env.PYTHON_BIN || "python3";
    const whisperLogFile = process.env.WHISPER_LOG_FILE || join("logs", "whisper.log");
    const audioPath = join(audioDir, `${videoId}.mp3`);

    await mkdir(workDir, { recursive: true });
    await mkdir(audioDir, { recursive: true });
    await mkdir(join(whisperLogFile, ".."), { recursive: true });
    console.log(`[transcribe-video] ${videoId} downloading audio with RapidAPI videoUrl=${videoUrl}`);

    try {
      await fetchRapidApiAudio(videoId, audioPath);
      const audioStat = await stat(audioPath);
      console.log(`[transcribe-video] ${videoId} audio ready path=${audioPath} bytes=${audioStat.size}`);

      try {
        await supabase(`videos?video_id=eq.${encodeURIComponent(videoId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ audio_path: audioPath }),
        });
        console.log(`[transcribe-video] ${videoId} saved audio_path to existing database row`);
      } catch (dbError) {
        const message = dbError instanceof Error ? dbError.message : String(dbError);
        console.warn(`[transcribe-video] ${videoId} could not update audio_path yet: ${message}`);
      }

      console.log(`[transcribe-video] ${videoId} transcribing with faster-whisper model=${modelSize} device=${device} compute=${computeType}`);
      await appendFile(whisperLogFile, `${new Date().toISOString()} [faster-whisper] ${videoId} started model=${modelSize} device=${device} compute=${computeType} python=${pythonBin}\n`);
      const result = await enqueueWhisper(videoId, () => runProcess(
          pythonBin,
          ["-c", PYTHON_TRANSCRIBE_SCRIPT, audioPath, modelSize, device, computeType],
          `[faster-whisper] ${videoId}`,
          whisperLogFile,
          false,
        ));
      await appendFile(whisperLogFile, `${new Date().toISOString()} [faster-whisper] ${videoId} completed stdoutChars=${result.stdout.length} stderrChars=${result.stderr.length}\n`);
      console.log(`[transcribe-video] ${videoId} faster-whisper stdoutChars=${result.stdout.length} stderrChars=${result.stderr.length}`);
      const parsed = JSON.parse(result.stdout) as { language?: string; duration?: number; segments?: Array<{ text?: string }> };
      const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
      const transcript = segments.map((segment) => segment.text?.trim() ?? "").filter(Boolean).join(" ");

      console.log(`[transcribe-video] ${videoId} transcriptChars=${transcript.length} segments=${segments.length}`);
      return {
        transcriptReady: transcript.length > 0,
        transcript: transcript || null,
        language: parsed.language ?? null,
        duration: typeof parsed.duration === "number" ? parsed.duration : null,
        segmentCount: segments.length,
        audioPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await appendFile(whisperLogFile, `${new Date().toISOString()} [faster-whisper] ${videoId} failed: ${message}\n`).catch(() => undefined);
      console.warn(`[transcribe-video] ${videoId} failed: ${message}`);
      return { transcriptReady: false, transcript: null, language: null, duration: null, segmentCount: 0, audioPath: null };
    }
  },
});
