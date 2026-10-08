import { pipeline, env } from "@xenova/transformers";

// Model weights are fetched from the Hugging Face Hub at runtime and cached by the
// browser (IndexedDB/Cache Storage) — nothing is bundled into the app itself.
env.allowLocalModels = false;

export type ModelSize = "tiny" | "base" | "small";

const MODEL_IDS: Record<ModelSize, string> = {
  tiny: "Xenova/whisper-tiny",
  base: "Xenova/whisper-base",
  small: "Xenova/whisper-small",
};

export interface TranscribedWord {
  text: string;
  start: number;
  end: number;
}

export interface TranscribeProgress {
  phase: "loading-model" | "decoding-audio" | "transcribing";
  progress?: number; // 0..1, when known
  detail?: string;
}

interface AsrPipeline {
  (audio: Float32Array, options: Record<string, unknown>): Promise<{
    chunks?: { text: string; timestamp: [number, number | null] }[];
  }>;
}

const pipelineCache = new Map<ModelSize, Promise<AsrPipeline>>();

interface TransformersProgressEvent {
  status: string;
  progress?: number;
  file?: string;
}

async function getAsrPipeline(modelSize: ModelSize, onProgress?: (p: TranscribeProgress) => void) {
  let cached = pipelineCache.get(modelSize);
  if (!cached) {
    cached = pipeline("automatic-speech-recognition", MODEL_IDS[modelSize], {
      progress_callback: (data: TransformersProgressEvent) => {
        if (data.status === "progress" && typeof data.progress === "number") {
          onProgress?.({ phase: "loading-model", progress: data.progress / 100, detail: data.file });
        } else if (data.status === "initiate" || data.status === "download") {
          onProgress?.({ phase: "loading-model", detail: data.file });
        }
      },
    }) as unknown as Promise<AsrPipeline>;
    pipelineCache.set(modelSize, cached);
  }
  return cached;
}

async function decodeTo16kMono(src: string): Promise<Float32Array> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not read the source media (HTTP ${res.status}).`);
  const arrayBuffer = await res.arrayBuffer();
  const AudioCtxCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtxCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close().catch(() => {});
  }
  const targetRate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Transcribes the audio of a video/audio layer's source (an object URL or data URL)
 * into word-level timestamps, entirely in the browser.
 */
export async function transcribeMediaSource(
  src: string,
  opts: { modelSize?: ModelSize; language?: string; onProgress?: (p: TranscribeProgress) => void } = {}
): Promise<TranscribedWord[]> {
  const { modelSize = "base", language = "arabic", onProgress } = opts;

  onProgress?.({ phase: "decoding-audio" });
  const pcm = await decodeTo16kMono(src);

  const asr = await getAsrPipeline(modelSize, onProgress);

  onProgress?.({ phase: "transcribing" });
  const result = await asr(pcm, {
    language,
    task: "transcribe",
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  const chunks = result.chunks ?? [];
  const words: TranscribedWord[] = [];
  for (const c of chunks) {
    const text = c.text.trim();
    if (!text) continue;
    const start = c.timestamp[0] ?? (words.length ? words[words.length - 1].end : 0);
    const end = c.timestamp[1] ?? start + 0.3;
    words.push({ text, start, end });
  }
  return words;
}
