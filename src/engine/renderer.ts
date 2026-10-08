import type {
  AudioLayerProps,
  CaptionLayerProps,
  CaptionWord,
  Composition,
  GlassLayerProps,
  Layer,
  ImageLayerProps,
  OverlayLayerProps,
  PolygonLayerProps,
  ShapeLayerProps,
  StarLayerProps,
  TextLayerProps,
  VideoLayerProps,
} from "../types";
import { evaluateTransform } from "./evaluate";
import { getColorGrade } from "./colorGrade";

export interface RenderOptions {
  playing: boolean;
  session?: MediaSession;
}

/**
 * Holds the actual <img>/<video>/<audio> elements backing image/video/audio layers.
 * The live preview uses one shared, long-lived session. Export uses its own
 * throwaway session so it can safely tap into video/audio elements via the Web
 * Audio API (createMediaElementSource can only be called once per element)
 * without disrupting whatever the user is doing in the preview at the same time.
 */
export class MediaSession {
  images = new Map<string, HTMLImageElement>();
  videos = new Map<string, HTMLVideoElement>();
  audios = new Map<string, HTMLAudioElement>();

  getImage(src: string): HTMLImageElement | null {
    const cached = this.images.get(src);
    if (cached) return cached.complete ? cached : null;
    const img = new Image();
    img.src = src;
    this.images.set(src, img);
    return null;
  }

  getVideo(src: string): HTMLVideoElement {
    let video = this.videos.get(src);
    if (!video) {
      video = document.createElement("video");
      video.src = src;
      video.playsInline = true;
      video.preload = "auto";
      this.videos.set(src, video);
    }
    return video;
  }

  getAudio(src: string): HTMLAudioElement {
    let audio = this.audios.get(src);
    if (!audio) {
      audio = document.createElement("audio");
      audio.src = src;
      audio.preload = "auto";
      this.audios.set(src, audio);
    }
    return audio;
  }

  preloadImages(comp: Composition): Promise<void[]> {
    const sources = comp.layers
      .filter((l): l is Layer & { props: ImageLayerProps } => l.type === "image")
      .map((l) => (l.props as ImageLayerProps).src)
      .filter(Boolean);
    return Promise.all(
      sources.map(
        (src) =>
          new Promise<void>((resolve) => {
            const cached = this.images.get(src);
            if (cached && cached.complete) {
              resolve();
              return;
            }
            const img = cached ?? new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            if (!cached) {
              img.src = src;
              this.images.set(src, img);
            }
          })
      )
    );
  }

  preloadVideos(comp: Composition): Promise<void[]> {
    const sources = comp.layers
      .filter((l): l is Layer & { props: VideoLayerProps } => l.type === "video")
      .map((l) => (l.props as VideoLayerProps).src)
      .filter(Boolean);
    return Promise.all(sources.map((src) => waitForMediaReady(this.getVideo(src))));
  }

  preloadAudios(comp: Composition): Promise<void[]> {
    const sources = comp.layers
      .filter((l): l is Layer & { props: AudioLayerProps } => l.type === "audio")
      .map((l) => (l.props as AudioLayerProps).src)
      .filter(Boolean);
    return Promise.all(sources.map((src) => waitForMediaReady(this.getAudio(src))));
  }

  /** Pauses and rewinds every video/audio layer's element to its trim-in point. */
  resetMediaLayers(comp: Composition) {
    for (const layer of comp.layers) {
      if (layer.type === "video") {
        const p = layer.props as VideoLayerProps;
        if (!p.src) continue;
        seekAndPause(this.getVideo(p.src), p.trimIn);
      } else if (layer.type === "audio") {
        const p = layer.props as AudioLayerProps;
        if (!p.src) continue;
        seekAndPause(this.getAudio(p.src), p.trimIn);
      }
    }
  }

  dispose() {
    for (const video of this.videos.values()) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    for (const audio of this.audios.values()) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    this.images.clear();
    this.videos.clear();
    this.audios.clear();
  }
}

function seekAndPause(el: HTMLMediaElement, time: number) {
  el.pause();
  try {
    el.currentTime = time;
  } catch {
    // ignore seek errors before metadata is ready
  }
}

function waitForMediaReady(el: HTMLMediaElement): Promise<void> {
  if (el.readyState >= 2) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onReady = () => {
      el.removeEventListener("loadeddata", onReady);
      el.removeEventListener("error", onReady);
      resolve();
    };
    el.addEventListener("loadeddata", onReady);
    el.addEventListener("error", onReady);
  });
}

const defaultSession = new MediaSession();

/** Syncs a video/audio element's play/pause/seek state to the composition clock. Returns the element, or null if inactive/unavailable. */
function syncMediaElement(
  el: HTMLMediaElement,
  active: boolean,
  desiredTime: number,
  muted: boolean,
  playing: boolean
): void {
  el.muted = muted;
  if (!active) {
    if (!el.paused) el.pause();
    return;
  }
  if (playing) {
    if (el.paused) el.play().catch(() => {});
    if (Math.abs(el.currentTime - desiredTime) > 0.35) {
      try {
        el.currentTime = desiredTime;
      } catch {
        // ignore
      }
    }
  } else {
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - desiredTime) > 0.03) {
      try {
        el.currentTime = desiredTime;
      } catch {
        // ignore
      }
    }
  }
}

function drawPolygon(ctx: CanvasRenderingContext2D, w: number, h: number, sides: number) {
  const n = Math.max(3, Math.round(sides));
  const rx = w / 2;
  const ry = h / 2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = rx * Math.cos(angle);
    const y = ry * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawStar(ctx: CanvasRenderingContext2D, w: number, h: number, points: number, innerRatio: number) {
  const n = Math.max(3, Math.round(points));
  const rx = w / 2;
  const ry = h / 2;
  const ratio = Math.max(0.05, Math.min(0.95, innerRatio));
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 === 0 ? 1 : ratio;
    const x = rx * r * Math.cos(angle);
    const y = ry * r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function findNearestPastWordIndex(words: CaptionWord[], t: number): number {
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= t) idx = i;
    else break;
  }
  return idx;
}

/** Splits a flat word list into "lines" (sentence-ish chunks) by gaps between words. */
function groupCaptionWordsIntoLines(words: CaptionWord[], gapThreshold = 0.6, maxWordsPerLine = 7): CaptionWord[][] {
  const lines: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  for (const word of words) {
    if (current.length > 0) {
      const prev = current[current.length - 1];
      if (word.start - prev.end > gapThreshold || current.length >= maxWordsPerLine) {
        lines.push(current);
        current = [];
      }
    }
    current.push(word);
  }
  if (current.length) lines.push(current);
  return lines;
}

/** Splits "plain [emphasized] plain" content into words, flagging which ones were bracketed. */
function parseEmphasisWords(content: string): { text: string; emphasis: boolean }[] {
  const segments: { text: string; emphasis: boolean }[] = [];
  const re = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > lastIndex) segments.push({ text: content.slice(lastIndex, m.index), emphasis: false });
    segments.push({ text: m[1], emphasis: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < content.length) segments.push({ text: content.slice(lastIndex), emphasis: false });

  const words: { text: string; emphasis: boolean }[] = [];
  for (const seg of segments) {
    for (const w of seg.text.split(/\s+/)) {
      if (w) words.push({ text: w, emphasis: seg.emphasis });
    }
  }
  return words;
}

/** Draws a "plain [emphasized] plain" line, right-to-left, honoring the layer's alignment. */
function drawEmphasisLine(ctx: CanvasRenderingContext2D, p: TextLayerProps, words: { text: string; emphasis: boolean }[]) {
  ctx.direction = "rtl";
  const gap = p.fontSize * 0.28;
  const widths = words.map((w) => ctx.measureText(w.text).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  let x = p.align === "left" ? -totalWidth + widths[0] : p.align === "right" ? 0 : totalWidth / 2;
  ctx.textAlign = "right";
  for (let i = 0; i < words.length; i++) {
    ctx.fillStyle = words[i].emphasis ? p.emphasisColor ?? "#ffd166" : p.color;
    ctx.fillText(words[i].text, x, 0);
    x -= widths[i] + gap;
  }
}

function drawText(ctx: CanvasRenderingContext2D, p: TextLayerProps, localTime: number) {
  ctx.font = `${p.fontSize}px ${p.fontFamily}`;
  ctx.textBaseline = "middle";

  if (p.countTo != null) {
    const dur = Math.max(0.05, p.countDuration ?? 1.5);
    const progress = Math.max(0, Math.min(1, localTime / dur));
    const n = Math.round(progress * p.countTo);
    ctx.fillStyle = p.color;
    ctx.textAlign = p.align;
    ctx.direction = "ltr";
    ctx.fillText(String(n), 0, 0);
    return;
  }

  let content = p.content;
  if (p.revealSpeed && p.revealSpeed > 0) {
    const maxChars = Math.max(0, Math.floor(Math.max(0, localTime) * p.revealSpeed));
    content = content.slice(0, maxChars);
    if (content.length === 0) return;
  }

  if (content.includes("[")) {
    const words = parseEmphasisWords(content);
    if (words.length > 0) {
      drawEmphasisLine(ctx, p, words);
      return;
    }
  }

  ctx.fillStyle = p.color;
  ctx.textAlign = p.align;
  ctx.fillText(content, 0, 0);
}

function drawCaption(ctx: CanvasRenderingContext2D, p: CaptionLayerProps, t: number) {
  if (p.words.length === 0) return;
  ctx.direction = "rtl";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${p.fontSize}px ${p.fontFamily}`;

  if (p.style === "bigWord") {
    const idx = t >= p.words[0].start ? findNearestPastWordIndex(p.words, t) : -1;
    if (idx < 0) return;
    const w = p.words[idx];
    const isActive = t >= w.start && t <= w.end;
    if (!isActive && t > w.end + 0.6) return; // don't linger too long on a stale word
    const pop = isActive ? 1 + 0.18 * Math.max(0, 1 - (t - w.start) / 0.15) : 1;
    ctx.save();
    ctx.scale(pop, pop);
    ctx.textAlign = "center";
    ctx.fillStyle = w.emphasis ? p.emphasisColor : p.color;
    ctx.fillText(w.text, 0, 0);
    ctx.restore();
    return;
  }

  const lines = groupCaptionWordsIntoLines(p.words);
  const line = lines.find((l) => t >= l[0].start - 0.05 && t <= l[l.length - 1].end + 0.4);
  if (!line) return;

  if (p.style === "pillWord") {
    const idx = line.findIndex((w) => t >= w.start && t <= w.end);
    const w = idx >= 0 ? line[idx] : null;
    if (!w) return;
    ctx.textAlign = "center";
    const metrics = ctx.measureText(w.text);
    const padX = 22;
    const padY = 14;
    const bw = metrics.width + padX * 2;
    const bh = p.fontSize + padY * 2;
    ctx.save();
    ctx.fillStyle = "rgba(15,15,18,0.55)";
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = w.emphasis ? p.emphasisColor : p.color;
    ctx.fillText(w.text, 0, 0);
    ctx.restore();
    return;
  }

  // karaokeLine and emphasisOnly: lay out the whole line, right-to-left (Arabic reading order).
  const gap = p.fontSize * 0.28;
  const widths = line.map((w) => ctx.measureText(w.text).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (line.length - 1);
  let x = totalWidth / 2;
  ctx.textAlign = "right";
  for (let i = 0; i < line.length; i++) {
    const w = line[i];
    const isActive = t >= w.start && t <= w.end;
    const highlight = p.style === "emphasisOnly" ? w.emphasis : isActive || w.emphasis;
    ctx.fillStyle = highlight ? p.emphasisColor : p.color;
    ctx.fillText(w.text, x, 0);
    x -= widths[i] + gap;
  }
}

/**
 * Draws a real frosted-glass panel: blurs whatever has already been painted onto the
 * canvas beneath this layer's bounds, then adds a translucent tint + border on top.
 * Drawn in absolute canvas space (rotation is not supported, only position/scale/opacity)
 * because the blur self-sample needs raw pixel coordinates, not the rotated/scaled local
 * space the generic per-layer transform block works in.
 */
function drawGlassPanel(ctx: CanvasRenderingContext2D, layer: Layer, time: number) {
  if (time < layer.startTime || time > layer.endTime) return;
  const t = evaluateTransform(layer.transform, time);
  if (t.opacity <= 0) return;
  const p = layer.props as GlassLayerProps;
  const w = Math.max(1, p.width * t.scale.x);
  const h = Math.max(1, p.height * t.scale.y);
  const x = t.position.x - w / 2;
  const y = t.position.y - h / 2;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, t.opacity));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(p.radius, w / 2, h / 2));
  ctx.save();
  ctx.clip();
  ctx.filter = `blur(${p.blur}px)`;
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.restore(); // drop the clip + filter, keep the rounded-rect path below

  ctx.fillStyle = p.tint;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = p.borderColor;
  ctx.stroke();
  ctx.restore();
}

/** Draws a full-bleed texture effect (grain/VHS/vignette/scanlines) in the layer's local, centered coordinate space. */
function drawOverlayEffect(ctx: CanvasRenderingContext2D, p: OverlayLayerProps) {
  const w = p.width;
  const h = p.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();

  if (p.effect === "vignette" || p.effect === "vhs") {
    const grad = ctx.createRadialGradient(0, 0, Math.min(w, h) * 0.25, 0, 0, Math.max(w, h) * 0.72);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${0.7 * p.intensity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }

  if (p.effect === "scanlines" || p.effect === "vhs") {
    ctx.fillStyle = `rgba(0,0,0,${0.3 * p.intensity})`;
    const lineH = 3;
    for (let y = -h / 2; y < h / 2; y += lineH * 2) ctx.fillRect(-w / 2, y, w, lineH);
  }

  if (p.effect === "grain" || p.effect === "vhs") {
    const dotCount = Math.floor((p.effect === "grain" ? 1400 : 700) * p.intensity);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < dotCount; i++) {
      const x = -w / 2 + Math.random() * w;
      const y = -h / 2 + Math.random() * h;
      ctx.globalAlpha = Math.random() * 0.5;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  if (p.effect === "vhs") {
    ctx.globalAlpha = 0.22 * p.intensity;
    ctx.fillStyle = "#ff2b6d";
    for (let i = 0; i < 2; i++) ctx.fillRect(-w / 2, -h / 2 + Math.random() * h, w, 2);
    ctx.fillStyle = "#2bd6ff";
    for (let i = 0; i < 2; i++) ctx.fillRect(-w / 2, -h / 2 + Math.random() * h, w, 2);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, time: number, opts: Required<RenderOptions>) {
  const active = time >= layer.startTime && time <= layer.endTime;

  // Video/audio elements must keep syncing (and stop) even when the layer isn't visible this frame.
  if (layer.type === "video") {
    const p = layer.props as VideoLayerProps;
    if (p.src) {
      const video = opts.session.getVideo(p.src);
      syncMediaElement(video, active, p.trimIn + (time - layer.startTime), p.muted, opts.playing);
    }
  } else if (layer.type === "audio") {
    const p = layer.props as AudioLayerProps;
    if (p.src) {
      const audio = opts.session.getAudio(p.src);
      syncMediaElement(audio, active, p.trimIn + (time - layer.startTime), p.muted, opts.playing);
    }
    return; // audio layers have nothing to draw
  } else if (layer.type === "glass") {
    drawGlassPanel(ctx, layer, time);
    return;
  }

  if (!active) return;
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
    case "polygon": {
      const p = layer.props as PolygonLayerProps;
      ctx.fillStyle = p.color;
      drawPolygon(ctx, p.width, p.height, p.sides);
      break;
    }
    case "star": {
      const p = layer.props as StarLayerProps;
      ctx.fillStyle = p.color;
      drawStar(ctx, p.width, p.height, p.points, p.innerRatio);
      break;
    }
    case "text": {
      drawText(ctx, layer.props as TextLayerProps, time - layer.startTime);
      break;
    }
    case "image": {
      const p = layer.props as ImageLayerProps;
      const img = opts.session.getImage(p.src);
      if (img) {
        ctx.drawImage(img, -p.width / 2, -p.height / 2, p.width, p.height);
      }
      break;
    }
    case "video": {
      const p = layer.props as VideoLayerProps;
      if (!p.src) break;
      const video = opts.session.getVideo(p.src);
      if (video.readyState >= 2) {
        ctx.drawImage(video, -p.width / 2, -p.height / 2, p.width, p.height);
      }
      break;
    }
    case "caption": {
      const p = layer.props as CaptionLayerProps;
      const localTime = time - layer.startTime + p.sourceTrimIn;
      drawCaption(ctx, p, localTime);
      break;
    }
    case "overlay": {
      drawOverlayEffect(ctx, layer.props as OverlayLayerProps);
      break;
    }
  }

  ctx.restore();
}

export function renderComposition(ctx: CanvasRenderingContext2D, comp: Composition, time: number, opts: RenderOptions = { playing: false }) {
  const resolvedOpts: Required<RenderOptions> = { playing: opts.playing, session: opts.session ?? defaultSession };
  ctx.save();
  ctx.clearRect(0, 0, comp.width, comp.height);
  ctx.fillStyle = comp.backgroundColor;
  ctx.fillRect(0, 0, comp.width, comp.height);

  // index 0 = topmost/front layer, so draw from the back (last) to the front (first).
  for (let i = comp.layers.length - 1; i >= 0; i--) {
    drawLayer(ctx, comp.layers[i], time, resolvedOpts);
  }
  ctx.restore();

  applyColorGrade(ctx, comp);
}

/** Cinematic color-grade "look", applied as a post-process pass over the whole composite (preview and export alike). */
function applyColorGrade(ctx: CanvasRenderingContext2D, comp: Composition) {
  const grade = getColorGrade(comp.colorGrade);
  if (grade.filter === "none" && !grade.tint) return;
  if (grade.filter !== "none") {
    ctx.save();
    ctx.filter = grade.filter;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = "none";
    ctx.restore();
  }
  if (grade.tint) {
    ctx.save();
    ctx.globalAlpha = grade.tint.alpha;
    ctx.globalCompositeOperation = grade.tint.blend;
    ctx.fillStyle = grade.tint.color;
    ctx.fillRect(0, 0, comp.width, comp.height);
    ctx.restore();
  }
}
