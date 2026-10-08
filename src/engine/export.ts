import type { AudioLayerProps, Composition, VideoLayerProps } from "../types";
import { MediaSession, renderComposition } from "./renderer";
import { ensureFontsLoaded } from "./fonts";

// MP4 first: it's what phones, Instagram, TikTok and WhatsApp accept directly.
// WebM is the fallback for browsers whose MediaRecorder can't write MP4.
const CANDIDATE_MIME_TYPES = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,opus",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

function pickMimeType(): string | undefined {
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** File extension for an exported blob, from the container the browser actually produced. */
export function extensionForBlob(blob: Blob): string {
  return blob.type.startsWith("video/mp4") ? "mp4" : "webm";
}

export function canExportVideo(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "captureStream" in HTMLCanvasElement.prototype
  );
}

export class ExportCancelledError extends Error {
  constructor() {
    super("Export cancelled.");
  }
}

/**
 * Records the composition in real time: a 30-second project takes about 30 seconds.
 * Keep the tab in front while exporting — browsers throttle background tabs.
 */
export async function exportCompositionToVideo(
  comp: Composition,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  if (!canExportVideo()) {
    throw new Error("This browser can't record video. Please use a recent Chrome or Edge.");
  }

  // A dedicated session, isolated from the live preview: export needs exclusive access to
  // its own <video>/<audio> elements so it can tap their audio via the Web Audio API
  // (createMediaElementSource can only ever be called once per element).
  const session = new MediaSession();
  let audioCtx: AudioContext | null = null;
  const mediaSources: MediaElementAudioSourceNode[] = [];
  let combinedStream: MediaStream | null = null;

  const cleanup = () => {
    combinedStream?.getTracks().forEach((t) => t.stop());
    mediaSources.forEach((s) => s.disconnect());
    audioCtx?.close().catch(() => {});
    session.dispose();
  };

  try {
    await Promise.all([
      ensureFontsLoaded(comp),
      session.preloadImages(comp),
      session.preloadVideos(comp),
      session.preloadAudios(comp),
    ]);
    if (signal?.aborted) throw new ExportCancelledError();
    session.resetMediaLayers(comp);

    const canvas = document.createElement("canvas");
    canvas.width = comp.width;
    canvas.height = comp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create a 2D rendering context for export.");

    // Render the first frame before capturing so the stream starts with real content.
    renderComposition(ctx, comp, 0, { playing: false, session });

    const videoStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(
      comp.fps
    );
    const stream = new MediaStream(videoStream.getVideoTracks());
    combinedStream = stream;

    // Mix in audio from every unmuted video/audio layer (each layer has its own element).
    const audible = comp.layers.filter((l) => {
      const p = l.props as VideoLayerProps | AudioLayerProps;
      return (l.type === "video" || l.type === "audio") && p.src && !p.muted;
    });
    if (audible.length > 0) {
      const AudioCtxCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtxCtor();
      const dest = audioCtx.createMediaStreamDestination();
      for (const layer of audible) {
        const p = layer.props as VideoLayerProps | AudioLayerProps;
        const el = layer.type === "video" ? session.getVideo(p.src, layer.id) : session.getAudio(p.src, layer.id);
        try {
          const source = audioCtx.createMediaElementSource(el);
          source.connect(dest);
          mediaSources.push(source);
        } catch (err) {
          console.warn(`Skipping audio for layer "${layer.name}".`, err);
        }
      }
      if (mediaSources.length > 0) {
        for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
      }
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 8_000_000,
    });
    const chunks: Blob[] = [];

    const blob = await new Promise<Blob>((resolve, reject) => {
      let cancelled = false;
      const onAbort = () => {
        cancelled = true;
        if (recorder.state !== "inactive") recorder.stop();
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = (e) => reject((e as unknown as { error?: Error }).error ?? new Error("Recording failed."));
      recorder.onstop = () => {
        signal?.removeEventListener("abort", onAbort);
        if (cancelled) reject(new ExportCancelledError());
        else resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }));
      };

      recorder.start(1000);
      const startTs = performance.now();
      const frameMs = 1000 / comp.fps;

      const frame = () => {
        if (cancelled) return;
        const elapsed = (performance.now() - startTs) / 1000;
        const t = Math.min(elapsed, comp.duration);
        renderComposition(ctx, comp, t, { playing: true, session });
        onProgress?.(t / comp.duration);
        if (elapsed < comp.duration) {
          // rAF stops entirely in background tabs; a timer at least keeps the clock moving.
          if (document.hidden) setTimeout(frame, frameMs);
          else requestAnimationFrame(frame);
        } else {
          // Hold the final frame for a few frames so the capture stream records it before stopping.
          let held = 0;
          const hold = () => {
            if (cancelled) return;
            renderComposition(ctx, comp, comp.duration, { playing: false, session });
            if (++held < 3) setTimeout(hold, frameMs);
            else if (recorder.state !== "inactive") recorder.stop();
          };
          hold();
        }
      };
      requestAnimationFrame(frame);
    });
    return blob;
  } finally {
    cleanup();
  }
}
