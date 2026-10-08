import type { Composition, Layer, ImageLayerProps, ShapeLayerProps, TextLayerProps, VideoLayerProps } from "../types";
import { evaluateTransform } from "./evaluate";

export interface RenderOptions {
  playing: boolean;
}

const imageCache = new Map<string, HTMLImageElement>();
const videoCache = new Map<string, HTMLVideoElement>();

function getImage(src: string): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached) return cached.complete ? cached : null;
  const img = new Image();
  img.src = src;
  imageCache.set(src, img);
  return null;
}

function getVideo(src: string): HTMLVideoElement {
  let video = videoCache.get(src);
  if (!video) {
    video = document.createElement("video");
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    videoCache.set(src, video);
  }
  return video;
}

export function preloadImages(comp: Composition): Promise<void[]> {
  const sources = comp.layers
    .filter((l): l is Layer & { props: ImageLayerProps } => l.type === "image")
    .map((l) => (l.props as ImageLayerProps).src)
    .filter(Boolean);
  return Promise.all(
    sources.map(
      (src) =>
        new Promise<void>((resolve) => {
          const cached = imageCache.get(src);
          if (cached && cached.complete) {
            resolve();
            return;
          }
          const img = cached ?? new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          if (!cached) {
            img.src = src;
            imageCache.set(src, img);
          }
        })
    )
  );
}

export function preloadVideos(comp: Composition): Promise<void[]> {
  const sources = comp.layers
    .filter((l): l is Layer & { props: VideoLayerProps } => l.type === "video")
    .map((l) => (l.props as VideoLayerProps).src)
    .filter(Boolean);
  return Promise.all(
    sources.map(
      (src) =>
        new Promise<void>((resolve) => {
          const video = getVideo(src);
          if (video.readyState >= 2) {
            resolve();
            return;
          }
          const onReady = () => {
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("error", onReady);
            resolve();
          };
          video.addEventListener("loadeddata", onReady);
          video.addEventListener("error", onReady);
        })
    )
  );
}

/** Pauses and rewinds every video layer's element to its trim-in point. Call before starting playback from a known time, e.g. export. */
export function resetVideoLayers(comp: Composition) {
  for (const layer of comp.layers) {
    if (layer.type !== "video") continue;
    const p = layer.props as VideoLayerProps;
    if (!p.src) continue;
    const video = getVideo(p.src);
    video.pause();
    try {
      video.currentTime = p.trimIn;
    } catch {
      // ignore seek errors before metadata is ready
    }
  }
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, time: number, opts: RenderOptions) {
  if (time < layer.startTime || time > layer.endTime) return;
  const t = evaluateTransform(layer.transform, time);
  if (t.opacity <= 0) return;

  ctx.save();
  ctx.translate(t.position.x, t.position.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale.x, t.scale.y);
  ctx.globalAlpha = Math.max(0, Math.min(1, t.opacity));

  switch (layer.type) {
    case "rect": {
      const p = layer.props as ShapeLayerProps;
      ctx.fillStyle = p.color;
      const r = p.radius ?? 0;
      const w = p.width;
      const h = p.height;
      if (r > 0) {
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, r);
        ctx.fill();
      } else {
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      break;
    }
    case "ellipse": {
      const p = layer.props as ShapeLayerProps;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.width / 2, p.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "text": {
      const p = layer.props as TextLayerProps;
      ctx.fillStyle = p.color;
      ctx.font = `${p.fontSize}px ${p.fontFamily}`;
      ctx.textAlign = p.align;
      ctx.textBaseline = "middle";
      ctx.fillText(p.content, 0, 0);
      break;
    }
    case "image": {
      const p = layer.props as ImageLayerProps;
      const img = getImage(p.src);
      if (img) {
        ctx.drawImage(img, -p.width / 2, -p.height / 2, p.width, p.height);
      }
      break;
    }
    case "video": {
      const p = layer.props as VideoLayerProps;
      if (!p.src) break;
      const video = getVideo(p.src);
      const desired = p.trimIn + (time - layer.startTime);

      if (opts.playing) {
        if (video.paused) video.play().catch(() => {});
        // Let the video free-run in sync with real time; only hard-seek if it has drifted noticeably.
        if (Math.abs(video.currentTime - desired) > 0.35) {
          try {
            video.currentTime = desired;
          } catch {
            // ignore
          }
        }
      } else {
        if (!video.paused) video.pause();
        if (Math.abs(video.currentTime - desired) > 0.03) {
          try {
            video.currentTime = desired;
          } catch {
            // ignore
          }
        }
      }

      if (video.readyState >= 2) {
        ctx.drawImage(video, -p.width / 2, -p.height / 2, p.width, p.height);
      }
      break;
    }
  }

  ctx.restore();
}

export function renderComposition(
  ctx: CanvasRenderingContext2D,
  comp: Composition,
  time: number,
  opts: RenderOptions = { playing: false }
) {
  ctx.save();
  ctx.clearRect(0, 0, comp.width, comp.height);
  ctx.fillStyle = comp.backgroundColor;
  ctx.fillRect(0, 0, comp.width, comp.height);

  // index 0 = topmost/front layer, so draw from the back (last) to the front (first).
  for (let i = comp.layers.length - 1; i >= 0; i--) {
    drawLayer(ctx, comp.layers[i], time, opts);
  }
  ctx.restore();
}
