import wasmLoaderPath from "../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?url";
import wasmBinaryPath from "../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

// On-device person segmentation (MediaPipe). Everything — the WASM runtime and the models — is
// served by the app itself, so it works offline and no video leaves the computer.
//
// Raw model masks are 256×256 and blobby, which is what makes home footage look "cut out".
// Each frame's mask is therefore cleaned up before use:
//   1. temporal smoothing — blends with the previous frame so edges don't shimmer;
//   2. edge-aware upsampling — a joint-bilateral filter guided by the real frame's colors, so the
//      edge snaps to hair and shoulders instead of the model's coarse grid;
//   3. an edge curve — tightens the soft edge, optionally shrinking it to drop the old background's halo.

export type MaskQuality = "fast" | "high";

export interface MaskOptions {
  quality?: MaskQuality;
  /** -1 (shrink the person, removes halos) … +1 (grow, keeps more hair). */
  edge?: number;
}

const MODELS: Record<MaskQuality, string> = {
  fast: `${import.meta.env.BASE_URL}models/selfie_segmenter.tflite`,
  // Multiclass: background / hair / body / face / clothes / other — noticeably better on hair and clothes.
  high: `${import.meta.env.BASE_URL}models/selfie_multiclass_256x256.tflite`,
};

const segmenters: Partial<Record<MaskQuality, ImageSegmenter | null>> = {};
const loading: Partial<Record<MaskQuality, Promise<ImageSegmenter | null>>> = {};
const failed = new Set<MaskQuality>();
const readyListeners = new Set<() => void>();

export function onSegmenterReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

export function segmenterFailed(quality: MaskQuality = "fast"): boolean {
  return failed.has(quality);
}

export function ensureSegmenter(quality: MaskQuality = "fast"): Promise<ImageSegmenter | null> {
  const ready = segmenters[quality];
  if (ready) return Promise.resolve(ready);
  if (!loading[quality]) {
    loading[quality] = (async () => {
      const { ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fileset = { wasmLoaderPath, wasmBinaryPath };
      const make = (delegate: "GPU" | "CPU") =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS[quality], delegate },
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      let seg: ImageSegmenter | null = null;
      try {
        seg = await make("GPU").catch(() => make("CPU"));
      } catch (err) {
        console.warn("Person segmentation unavailable:", err);
        failed.add(quality);
      }
      segmenters[quality] = seg;
      readyListeners.forEach((l) => l());
      return seg;
    })();
  }
  return loading[quality]!;
}

interface MaskState {
  key: string; // currentTime + options the canvas was made for
  time: number;
  canvas: HTMLCanvasElement;
  prev: Float32Array | null; // previous low-res person probability, for temporal smoothing
  prevTime: number;
  guide: HTMLCanvasElement;
  lastCost: number; // ms the last mask took
  lastAt: number; // performance.now() when it was made
}
const states = new WeakMap<HTMLVideoElement, Partial<Record<MaskQuality, MaskState>>>();

/** Person probability (0–1) at the model's resolution. */
function personProbability(seg: ImageSegmenter, video: HTMLVideoElement, quality: MaskQuality): { p: Float32Array; w: number; h: number } | null {
  const result = seg.segment(video);
  try {
    const masks = result.confidenceMasks;
    if (!masks?.length) return null;
    const w = masks[0].width;
    const h = masks[0].height;
    const first = masks[0].getAsFloat32Array();
    const p = new Float32Array(first.length);
    // The selfie model's single mask is the person; the multiclass model's first mask is background.
    if (quality === "high") for (let i = 0; i < p.length; i++) p[i] = 1 - first[i];
    else p.set(first);
    return { p, w, h };
  } finally {
    result.close();
  }
}

const COLOR_SIGMA = 18;
const colorWeight = new Float32Array(3 * 255 * 255 + 1);
for (let d = 0; d < colorWeight.length; d++) colorWeight[d] = Math.exp(-d / (2 * COLOR_SIGMA * COLOR_SIGMA));

/**
 * Joint-bilateral upsampling: each output pixel averages the 3×3 nearest low-res mask samples,
 * weighted by distance and by how close each sample's frame color is to this pixel's color.
 * Only the edge band needs it — where the 3×3 neighborhood is clearly person or clearly
 * background the value is copied — which keeps this to a few milliseconds per frame.
 */
export function refine(p: Float32Array, lw: number, lh: number, guide: Uint8ClampedArray, gw: number, gh: number): Float32Array {
  // Which low-res cells sit in a uniform neighborhood (no edge nearby).
  const uniform = new Uint8Array(lw * lh);
  for (let j = 0; j < lh; j++) {
    for (let i = 0; i < lw; i++) {
      let mn = 1;
      let mx = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = Math.min(lh - 1, Math.max(0, j + dj));
        for (let di = -1; di <= 1; di++) {
          const v = p[jj * lw + Math.min(lw - 1, Math.max(0, i + di))];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      uniform[j * lw + i] = mn > 0.96 || mx < 0.04 ? 1 : 0;
    }
  }
  // Frame color at each low-res sample's center.
  const cr = new Float32Array(lw * lh);
  const cg = new Float32Array(lw * lh);
  const cb = new Float32Array(lw * lh);
  for (let j = 0; j < lh; j++) {
    const gy = Math.min(gh - 1, Math.floor(((j + 0.5) * gh) / lh));
    for (let i = 0; i < lw; i++) {
      const gx = Math.min(gw - 1, Math.floor(((i + 0.5) * gw) / lw));
      const o = (gy * gw + gx) * 4;
      const k = j * lw + i;
      cr[k] = guide[o];
      cg[k] = guide[o + 1];
      cb[k] = guide[o + 2];
    }
  }
  const out = new Float32Array(gw * gh);
  const sx = lw / gw;
  const sy = lh / gh;
  const maxD = colorWeight.length - 1;
  for (let y = 0; y < gh; y++) {
    const v = (y + 0.5) * sy - 0.5;
    const j0 = Math.min(lh - 1, Math.max(0, Math.round(v)));
    for (let x = 0; x < gw; x++) {
      const u = (x + 0.5) * sx - 0.5;
      const i0 = Math.min(lw - 1, Math.max(0, Math.round(u)));
      const k0 = j0 * lw + i0;
      if (uniform[k0]) {
        out[y * gw + x] = p[k0];
        continue;
      }
      const o = (y * gw + x) * 4;
      const r = guide[o];
      const g = guide[o + 1];
      const b = guide[o + 2];
      let sum = 0;
      let wsum = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const j = Math.min(lh - 1, Math.max(0, j0 + dj));
        const wy = 1.5 - Math.abs(v - j);
        if (wy <= 0) continue;
        for (let di = -1; di <= 1; di++) {
          const i = Math.min(lw - 1, Math.max(0, i0 + di));
          const wx = 1.5 - Math.abs(u - i);
          if (wx <= 0) continue;
          const k = j * lw + i;
          const dr = r - cr[k];
          const dg = g - cg[k];
          const db = b - cb[k];
          const d = dr * dr + dg * dg + db * db;
          const wgt = wx * wy * colorWeight[d > maxD ? maxD : d];
          sum += p[k] * wgt;
          wsum += wgt;
        }
      }
      out[y * gw + x] = wsum > 0 ? sum / wsum : p[k0];
    }
  }
  return out;
}

/**
 * A person mask for the video's current frame: a canvas whose alpha is the person — scale it over
 * the frame with "destination-in". Returns the last mask while the model loads or the frame isn't
 * decodable yet, or null if there's nothing usable.
 */
export function getPersonMask(video: HTMLVideoElement, opts: MaskOptions = {}): HTMLCanvasElement | null {
  const quality = opts.quality ?? "fast";
  const edge = Math.max(-1, Math.min(1, opts.edge ?? 0));
  let perVideo = states.get(video);
  if (!perVideo) {
    perVideo = {};
    states.set(video, perVideo);
  }
  const state = perVideo[quality];
  const seg = segmenters[quality];
  if (!seg) {
    if (!failed.has(quality)) ensureSegmenter(quality);
    // While the high-quality model loads, fall back to the fast one if it's ready.
    if (quality === "high" && !state) return getPersonMask(video, { ...opts, quality: "fast" });
    return state?.canvas ?? null;
  }
  if (video.readyState < 2 || video.videoWidth === 0 || video.seeking) return state?.canvas ?? null;
  const key = `${video.currentTime}|${edge}`;
  if (state && state.key === key) return state.canvas;
  // Adaptive: on a slow machine, while the video plays, reuse the last mask until a new one
  // fits in the time budget, so playback and export keep their frame rate.
  if (state && !video.paused && performance.now() - state.lastAt < state.lastCost * 1.5) return state.canvas;
  const startedAt = performance.now();

  let prob: ReturnType<typeof personProbability>;
  try {
    prob = personProbability(seg, video, quality);
  } catch {
    return state?.canvas ?? null;
  }
  if (!prob) return state?.canvas ?? null;

  const s: MaskState = state ?? {
    key: "",
    time: -1,
    canvas: document.createElement("canvas"),
    prev: null,
    prevTime: -1,
    guide: document.createElement("canvas"),
    lastCost: 0,
    lastAt: 0,
  };

  // 1. Temporal smoothing while playing forward; a seek (or big jump) starts fresh.
  const dt = video.currentTime - s.prevTime;
  if (s.prev && s.prev.length === prob.p.length && dt > 0 && dt < 0.25) {
    for (let i = 0; i < prob.p.length; i++) prob.p[i] = prob.p[i] * 0.7 + s.prev[i] * 0.3;
  }
  s.prev = prob.p.slice();
  s.prevTime = video.currentTime;

  // 2. Edge-aware upsampling at a working resolution guided by the frame itself.
  const longSide = quality === "high" ? 640 : 512;
  const scale = Math.min(1, longSide / Math.max(video.videoWidth, video.videoHeight));
  const gw = Math.max(2, Math.round(video.videoWidth * scale));
  const gh = Math.max(2, Math.round(video.videoHeight * scale));
  if (s.guide.width !== gw || s.guide.height !== gh) {
    s.guide.width = gw;
    s.guide.height = gh;
  }
  const gctx = s.guide.getContext("2d", { willReadFrequently: true });
  if (!gctx) return s.canvas;
  gctx.drawImage(video, 0, 0, gw, gh);
  const guide = gctx.getImageData(0, 0, gw, gh).data;
  const refined = refine(prob.p, prob.w, prob.h, guide, gw, gh);

  // 3. Edge curve: a tight smoothstep around a threshold that `edge` shifts (shrink ↔ grow).
  const center = 0.5 - edge * 0.22;
  const lo = center - 0.14;
  const hi = center + 0.14;
  if (s.canvas.width !== gw || s.canvas.height !== gh) {
    s.canvas.width = gw;
    s.canvas.height = gh;
  }
  const c = s.canvas.getContext("2d");
  if (c) {
    const img = c.createImageData(gw, gh);
    for (let i = 0; i < refined.length; i++) {
      const t = Math.min(1, Math.max(0, (refined[i] - lo) / (hi - lo)));
      const o = i * 4;
      img.data[o] = 255;
      img.data[o + 1] = 255;
      img.data[o + 2] = 255;
      img.data[o + 3] = t * t * (3 - 2 * t) * 255;
    }
    c.putImageData(img, 0, 0);
  }
  s.key = key;
  s.time = video.currentTime;
  s.lastAt = performance.now();
  s.lastCost = s.lastAt - startedAt;
  perVideo[quality] = s;
  return s.canvas;
}
