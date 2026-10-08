import { pipeline, env } from "@xenova/transformers";

// Runs Whisper off the main thread: inference takes seconds to minutes and would otherwise
// freeze the whole editor (and a long clip could crash the tab).
env.allowLocalModels = false;

const MODEL_IDS = {
  tiny: "Xenova/whisper-tiny",
  base: "Xenova/whisper-base",
  small: "Xenova/whisper-small",
} as const;
type ModelSize = keyof typeof MODEL_IDS;

interface AsrPipeline {
  (audio: Float32Array, options: Record<string, unknown>): Promise<{
    chunks?: { text: string; timestamp: [number, number | null] }[];
  }>;
}

const cache = new Map<ModelSize, Promise<AsrPipeline>>();

self.onmessage = async (e: MessageEvent<{ id: number; pcm: Float32Array; modelSize: ModelSize; language: string }>) => {
  const { id, pcm, modelSize, language } = e.data;
  const post = (msg: Record<string, unknown>) => self.postMessage({ id, ...msg });
  try {
    let asr = cache.get(modelSize);
    if (!asr) {
      asr = pipeline("automatic-speech-recognition", MODEL_IDS[modelSize], {
        progress_callback: (d: { status: string; progress?: number; file?: string }) => {
          if (d.status === "progress" && typeof d.progress === "number") {
            post({ type: "progress", progress: { phase: "loading-model", progress: d.progress / 100, detail: d.file } });
          }
        },
      }) as unknown as Promise<AsrPipeline>;
      cache.set(modelSize, asr);
      asr.catch(() => cache.delete(modelSize));
    }
    const model = await asr;
    post({ type: "progress", progress: { phase: "transcribing" } });
    const result = await model(pcm, {
      language,
      task: "transcribe",
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    post({ type: "done", chunks: result.chunks ?? [] });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
