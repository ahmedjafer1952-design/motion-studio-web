import wasmLoaderPath from "../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?url";
import wasmBinaryPath from "../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

// On-device person segmentation (MediaPipe selfie segmenter). Everything — the WASM runtime and
// the model — is served by the app itself, so it works offline and sends no video anywhere.

const MODEL_URL = `${import.meta.env.BASE_URL}models/selfie_segmenter.tflite`;

let segmenter: ImageSegmenter | null = null;
let loading: Promise<ImageSegmenter | null> | null = null;
let failed = false;
const readyListeners = new Set<() => void>();

export function onSegmenterReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

export function segmenterFailed(): boolean {
  return failed;
}

export function ensureSegmenter(): Promise<ImageSegmenter | null> {
  if (segmenter) return Promise.resolve(segmenter);
  if (!loading) {
    loading = (async () => {
      const { ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fileset = { wasmLoaderPath, wasmBinaryPath };
      const make = (delegate: "GPU" | "CPU") =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      try {
        segmenter = await make("GPU").catch(() => make("CPU"));
      } catch (err) {
        console.warn("Person segmentation unavailable:", err);
        failed = true;
        segmenter = null;
      }
      readyListeners.forEach((l) => l());
      return segmenter;
    })();
  }
  return loading;
}

interface MaskCache {
  time: number;
  canvas: HTMLCanvasElement;
}
const masks = new WeakMap<HTMLVideoElement, MaskCache>();

/**
 * Person mask for the video's current frame: a canvas whose alpha is the person (white) —
 * scale it over the frame with "destination-in". Returns the last mask while the model loads
 * or the frame isn't decodable yet, or null if there's nothing usable.
 */
export function getPersonMask(video: HTMLVideoElement): HTMLCanvasElement | null {
  const cached = masks.get(video);
  if (!segmenter) {
    if (!failed) ensureSegmenter();
    return cached?.canvas ?? null;
  }
  if (video.readyState < 2 || video.videoWidth === 0 || video.seeking) return cached?.canvas ?? null;
  if (cached && cached.time === video.currentTime) return cached.canvas;

  let result;
  try {
    result = segmenter.segment(video);
  } catch {
    return cached?.canvas ?? null;
  }
  const mask = result.confidenceMasks?.[0];
  if (!mask) {
    result.close();
    return cached?.canvas ?? null;
  }
  const w = mask.width;
  const h = mask.height;
  const values = mask.getAsFloat32Array();
  const entry = cached ?? { time: -1, canvas: document.createElement("canvas") };
  if (entry.canvas.width !== w || entry.canvas.height !== h) {
    entry.canvas.width = w;
    entry.canvas.height = h;
  }
  const c = entry.canvas.getContext("2d");
  if (c) {
    const img = c.createImageData(w, h);
    for (let i = 0; i < values.length; i++) {
      // Sharpen the soft confidence edge a little so hair/shoulders don't look ghostly.
      const a = Math.min(1, Math.max(0, (values[i] - 0.25) / 0.5));
      const o = i * 4;
      img.data[o] = 255;
      img.data[o + 1] = 255;
      img.data[o + 2] = 255;
      img.data[o + 3] = a * 255;
    }
    c.putImageData(img, 0, 0);
  }
  result.close();
  entry.time = video.currentTime;
  masks.set(video, entry);
  return entry.canvas;
}
