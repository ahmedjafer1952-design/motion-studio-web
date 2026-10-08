import { resolveMediaUrl } from "./mediaStore";

export type ModelSize = "tiny" | "base" | "small";

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

type Chunk = { text: string; timestamp: [number, number | null] };
type WorkerMsg =
  | { id: number; type: "progress"; progress: TranscribeProgress }
  | { id: number; type: "done"; chunks: Chunk[] }
  | { id: number; type: "error"; message: string };

let worker: Worker | null = null;
let nextId = 1;

/** Runs Whisper in a Web Worker (kept alive so the loaded model is reused between runs). */
function runInWorker(
  pcm: Float32Array,
  modelSize: ModelSize,
  language: string,
  onProgress?: (p: TranscribeProgress) => void
): Promise<Chunk[]> {
  if (!worker) worker = new Worker(new URL("./transcribe.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    const onMessage = (e: MessageEvent<WorkerMsg>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "progress") onProgress?.(m.progress);
      else {
        cleanup();
        if (m.type === "done") resolve(m.chunks);
        else reject(new Error(`Speech recognition failed: ${m.message}`));
      }
    };
    const onError = () => {
      cleanup();
      // The worker died (usually out of memory) — start a fresh one next time.
      w.terminate();
      if (worker === w) worker = null;
      reject(new Error("Speech recognition ran out of memory. Try the Tiny model or a shorter clip."));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, pcm, modelSize, language }, [pcm.buffer]);
  });
}

async function decodeTo16kMono(src: string): Promise<Float32Array> {
  const url = await resolveMediaUrl(src);
  if (!url) throw new Error("The source media file is missing — re-attach it to the video/audio layer.");
  const res = await fetch(url);
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

  onProgress?.({ phase: "loading-model" });
  const chunks = await runInWorker(pcm, modelSize, language, onProgress);
  const words: TranscribedWord[] = [];
  for (const c of chunks) {
    const text = c.text.trim();
    if (!text) continue;
    const start = c.timestamp[0] ?? (words.length ? words[words.length - 1].end : 0);
    const end = c.timestamp[1] ?? start + 0.3;
    words.push({ text, start, end: Math.max(end, start + 0.05) });
  }
  // Chunk boundaries can yield slightly out-of-order timestamps; captions assume sorted words.
  return words.sort((a, b) => a.start - b.start);
}
