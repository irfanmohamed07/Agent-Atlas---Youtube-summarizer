import { spawn } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { defineTool } from "eve/tools";
import { z } from "zod";

const DEFAULT_WORK_DIR = "/tmp/youtube-summarizer-transcripts";
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

function runProcess(command: string, args: string[], logPrefix: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
      const text = chunk.toString("utf8").trim();
      if (text) console.log(`${logPrefix} ${text}`);
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

export default defineTool({
  description: "Download YouTube audio with yt-dlp and transcribe it locally with faster-whisper. Use this as the main transcript path when YouTube captions are missing or unreliable.",
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
  }),
  async execute({ videoId, videoUrl }) {
    const workDir = process.env.TRANSCRIPT_WORK_DIR || DEFAULT_WORK_DIR;
    const modelSize = process.env.WHISPER_MODEL || "base";
    const device = process.env.WHISPER_DEVICE || "cpu";
    const computeType = process.env.WHISPER_COMPUTE_TYPE || "int8";
    const outputTemplate = join(workDir, `${videoId}.%(ext)s`);
    const audioPath = join(workDir, `${videoId}.mp3`);

    await mkdir(workDir, { recursive: true });
    console.log(`[transcribe-video] ${videoId} downloading audio with yt-dlp`);

    try {
      await runProcess("yt-dlp", [
        "--no-playlist",
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "5",
        "-o",
        outputTemplate,
        videoUrl,
      ], `[yt-dlp] ${videoId}`);
      const audioStat = await stat(audioPath);
      console.log(`[transcribe-video] ${videoId} audio downloaded path=${audioPath} bytes=${audioStat.size}`);

      console.log(`[transcribe-video] ${videoId} transcribing with faster-whisper model=${modelSize} device=${device} compute=${computeType}`);
      const result = await runProcess("python3", ["-c", PYTHON_TRANSCRIBE_SCRIPT, audioPath, modelSize, device, computeType], `[faster-whisper] ${videoId}`);
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
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[transcribe-video] ${videoId} failed: ${message}`);
      return { transcriptReady: false, transcript: null, language: null, duration: null, segmentCount: 0 };
    } finally {
      await rm(audioPath, { force: true });
      console.log(`[transcribe-video] ${videoId} cleaned audio path=${audioPath}`);
    }
  },
});
