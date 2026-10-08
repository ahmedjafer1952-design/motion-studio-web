import type { Composition } from "../types";
import { preloadImages, preloadVideos, renderComposition, resetVideoLayers } from "./renderer";

const CANDIDATE_MIME_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

function pickMimeType(): string {
  for (const type of CANDIDATE_MIME_TYPES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

export async function exportCompositionToVideo(
  comp: Composition,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser does not support in-browser video recording (MediaRecorder).");
  }

  await Promise.all([preloadImages(comp), preloadVideos(comp)]);
  resetVideoLayers(comp);

  const canvas = document.createElement("canvas");
  canvas.width = comp.width;
  canvas.height = comp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a 2D rendering context for export.");

  // Render the first frame before capturing so the stream starts with real content.
  renderComposition(ctx, comp, 0, { playing: false });

  const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(
    comp.fps
  );
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];

  return new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = (e) => reject(e);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resetVideoLayers(comp);
      resolve(new Blob(chunks, { type: mimeType }));
    };

    recorder.start();
    const startTs = performance.now();

    const frame = () => {
      const elapsed = (performance.now() - startTs) / 1000;
      const t = Math.min(elapsed, comp.duration);
      renderComposition(ctx, comp, t, { playing: true });
      onProgress?.(t / comp.duration);
      if (elapsed < comp.duration) {
        requestAnimationFrame(frame);
      } else {
        recorder.stop();
      }
    };
    requestAnimationFrame(frame);
  });
}
