import type {
  AudioLayerProps,
  CaptionLayerProps,
  CaptionWord,
  Composition,
  GlassLayerProps,
  Layer,
  ImageLayerProps,
  OverlayLayerProps,
  ChartLayerProps,
  CutoutLayerProps,
  ArrowLayerProps,
  Composition as Comp,
  PolygonLayerProps,
  ShapeLayerProps,
  StarLayerProps,
  TextLayerProps,
  VideoLayerProps,
} from "../types";
import { evaluateTransform } from "./evaluate";
import { drawChart } from "./chart";
import { getPersonMask } from "./segmentation";
import { getColorGrade } from "./colorGrade";
import { resolveMediaUrl } from "./mediaStore";

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
  /** Keyed per layer ("layerId|src"), so two layers using the same file never fight over one element. */
  videos = new Map<string, HTMLVideoElement>();
  audios = new Map<string, HTMLAudioElement>();
  /** Last successfully decoded frame per video, drawn while a seek is in flight so the canvas never flashes black. */
  frameCache = new Map<HTMLVideoElement, { canvas: HTMLCanvasElement; time: number; updatedAt: number }>();
  /** Called when media has a new frame available outside the playback loop (after load or a seek). */
  onFrameReady: (() => void) | null = null;
  private touched = new Set<string>();

  private attachSource(el: HTMLMediaElement | HTMLImageElement, src: string) {
    resolveMediaUrl(src).then((url) => {
      if (url) el.src = url;
      else el.dispatchEvent(new Event("error"));
    });
  }

  getImage(src: string): HTMLImageElement | null {
    let img = this.images.get(src);
    if (!img) {
      const el = new Image();
      el.addEventListener("load", () => this.onFrameReady?.());
      this.attachSource(el, src);
      this.images.set(src, el);
      img = el;
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  getVideo(src: string, layerId: string): HTMLVideoElement {
    const key = `${layerId}|${src}`;
    this.touched.add(key);
    let video = this.videos.get(key);
    if (!video) {
      const el = document.createElement("video");
      el.playsInline = true;
      el.preload = "auto";
      const notify = () => this.onFrameReady?.();
      el.addEventListener("loadeddata", notify);
      el.addEventListener("seeked", notify);
      this.attachSource(el, src);
      this.videos.set(key, el);
      video = el;
    }
    return video;
  }

  getAudio(src: string, layerId: string): HTMLAudioElement {
    const key = `${layerId}|${src}`;
    this.touched.add(key);
    let audio = this.audios.get(key);
    if (!audio) {
      audio = document.createElement("audio");
      audio.preload = "auto";
      this.attachSource(audio, src);
      this.audios.set(key, audio);
    }
    return audio;
  }

  /**
   * Draws the video's current frame, or its last good frame while it's seeking/buffering.
   * The fallback copy is small and refreshed only a few times a second: copying every full-size
   * phone frame (often 4K) on every tick made playback stutter badly.
   */
  drawVideoFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    let cache = this.frameCache.get(video);
    const ready = video.readyState >= 2 && video.videoWidth > 0 && !video.seeking;
    if (ready) {
      ctx.drawImage(video, x, y, w, h);
      const now = performance.now();
      if (!cache) {
        cache = { canvas: document.createElement("canvas"), time: -1, updatedAt: 0 };
        this.frameCache.set(video, cache);
      }
      if (cache.time !== video.currentTime && (video.paused || now - cache.updatedAt > 250)) {
        const scale = Math.min(1, 640 / video.videoWidth);
        cache.canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        cache.canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        cache.canvas.getContext("2d")?.drawImage(video, 0, 0, cache.canvas.width, cache.canvas.height);
        cache.time = video.currentTime;
        cache.updatedAt = now;
      }
      return;
    }
    if (cache && cache.time >= 0) ctx.drawImage(cache.canvas, x, y, w, h);
  }

  beginFrame() {
    this.touched.clear();
  }

  /**
   * Silences media no layer used this frame — a deleted layer, an undone one, or a replaced file —
   * and frees elements whose layer is gone, so audio never keeps playing on its own.
   */
  endFrame(comp: Composition) {
    const liveIds = new Set(comp.layers.map((l) => l.id));
    for (const map of [this.videos, this.audios] as Map<string, HTMLMediaElement>[]) {
      for (const [key, el] of map) {
        if (this.touched.has(key)) continue;
        if (!el.paused) el.pause();
        if (!liveIds.has(key.split("|")[0])) {
          releaseElement(el);
          this.frameCache.delete(el as HTMLVideoElement);
          map.delete(key);
        }
      }
    }
  }

  private mediaLayers(comp: Composition, type: "video" | "audio") {
    return comp.layers.filter((l) => l.type === type && (l.props as VideoLayerProps | AudioLayerProps).src);
  }

  preloadImages(comp: Composition): Promise<void[]> {
    const sources = comp.layers
      .filter((l) => l.type === "image")
      .map((l) => (l.props as ImageLayerProps).src)
      .filter(Boolean);
    return Promise.all(
      sources.map((src) => {
        this.getImage(src);
        const img = this.images.get(src)!;
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return waitForEvent(img, ["load", "error"]);
      })
    );
  }

  preloadVideos(comp: Composition): Promise<void[]> {
    return Promise.all(
      this.mediaLayers(comp, "video").map((l) => waitForMediaReady(this.getVideo((l.props as VideoLayerProps).src, l.id)))
    );
  }

  preloadAudios(comp: Composition): Promise<void[]> {
    return Promise.all(
      this.mediaLayers(comp, "audio").map((l) => waitForMediaReady(this.getAudio((l.props as AudioLayerProps).src, l.id)))
    );
  }

  /** Pauses and rewinds every video/audio layer's element to its trim-in point. */
  resetMediaLayers(comp: Composition) {
    for (const l of this.mediaLayers(comp, "video")) {
      const p = l.props as VideoLayerProps;
      seekAndPause(this.getVideo(p.src, l.id), p.trimIn);
    }
    for (const l of this.mediaLayers(comp, "audio")) {
      const p = l.props as AudioLayerProps;
      seekAndPause(this.getAudio(p.src, l.id), p.trimIn);
    }
  }

  dispose() {
    for (const el of [...this.videos.values(), ...this.audios.values()]) releaseElement(el);
    this.images.clear();
    this.frameCache.clear();
    this.videos.clear();
    this.audios.clear();
  }
}

function releaseElement(el: HTMLMediaElement) {
  el.pause();
  el.removeAttribute("src");
  el.load();
}

function seekAndPause(el: HTMLMediaElement, time: number) {
  el.pause();
  try {
    el.currentTime = time;
  } catch {
    // ignore seek errors before metadata is ready
  }
}

const MEDIA_LOAD_TIMEOUT_MS = 20000;

function waitForEvent(el: EventTarget, events: string[], timeoutMs = MEDIA_LOAD_TIMEOUT_MS): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      for (const ev of events) el.removeEventListener(ev, done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    for (const ev of events) el.addEventListener(ev, done);
  });
}

function waitForMediaReady(el: HTMLMediaElement): Promise<void> {
  if (el.readyState >= 2) return Promise.resolve();
  return waitForEvent(el, ["loadeddata", "error"]);
}

export const defaultSession = new MediaSession();

/** Syncs a video/audio element's play/pause/seek state to the composition clock. Returns the element, or null if inactive/unavailable. */
function syncMediaElement(
  el: HTMLMediaElement,
  active: boolean,
  desiredTime: number,
  muted: boolean,
  playing: boolean
): void {
  el.muted = muted;
  // Past the end of the clip: hold the last frame instead of play() restarting it from 0 every frame.
  const clipEnded = Number.isFinite(el.duration) && desiredTime >= el.duration - 0.05;
  if (!active || clipEnded) {
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

// Letters that never join the following letter, so a kashida (ـ) can't follow them.
const NON_JOINING = new Set("اأإآدذرزوؤةءى ".split(""));

/** Inserts `count` kashidas into the middle of each Arabic word — the stretched-letter look. */
function kashidaStretch(text: string, count: number): string {
  if (count <= 0) return text;
  return text
    .split(" ")
    .map((word) => {
      if (word.length < 3 || !/[\u0600-\u06FF]/.test(word)) return word;
      for (let i = Math.floor(word.length / 2) - 1; i >= 0; i--) {
        if (!NON_JOINING.has(word[i]) && /[\u0621-\u064A]/.test(word[i]) && /[\u0621-\u064A]/.test(word[i + 1] ?? "")) {
          return word.slice(0, i + 1) + "ـ".repeat(count) + word.slice(i + 1);
        }
      }
      return word;
    })
    .join(" ");
}

/** Words spring up one after another (right-to-left), each fading in as it rises. */
function drawStaggeredWords(ctx: CanvasRenderingContext2D, p: TextLayerProps, content: string, localTime: number) {
  const words = parseEmphasisWords(content);
  if (words.length === 0) return;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  const gap = p.fontSize * 0.28;
  const widths = words.map((w) => ctx.measureText(w.text).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  let x = p.align === "left" ? total : p.align === "right" ? 0 : total / 2;
  const stagger = p.wordStagger ?? 0.08;
  words.forEach((w, i) => {
    const k = Math.min(1, Math.max(0, (localTime - i * stagger) / 0.45));
    if (k > 0) {
      const spring = k >= 1 ? 1 : 1 - Math.exp(-6.5 * k) * Math.cos(13 * k);
      ctx.save();
      ctx.globalAlpha *= Math.min(1, k * 3);
      ctx.translate(0, (1 - spring) * p.fontSize * 0.6);
      ctx.fillStyle = w.emphasis ? p.emphasisColor ?? "#ffd166" : p.color;
      ctx.fillText(w.text, x, 0);
      ctx.restore();
    }
    x -= widths[i] + gap;
  });
}

function drawText(ctx: CanvasRenderingContext2D, p: TextLayerProps, localTime: number) {
  ctx.font = `${p.bold ? "bold " : ""}${p.fontSize}px ${p.fontFamily}`;
  ctx.textBaseline = "middle";
  if (p.glow) {
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = p.fontSize * 0.35;
  }
  if (p.outline) {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(2, p.fontSize * 0.035);
    ctx.textAlign = p.align;
    ctx.strokeText(p.content, 0, 0);
    if (p.glow) ctx.strokeText(p.content, 0, 0);
    return;
  }

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

  if (p.box) {
    const plain = content.replace(/[[\]]/g, "");
    const w = ctx.measureText(plain).width + p.fontSize * 0.9;
    const h = p.fontSize * 1.45;
    const left = p.align === "left" ? -p.fontSize * 0.45 : p.align === "right" ? -w + p.fontSize * 0.45 : -w / 2;
    drawLabelBox(ctx, p.box, left, -h / 2, w, h, p.box === "glass" ? h / 2 : p.fontSize * 0.18);
  }

  if (p.highlightBar) {
    // Marker bar wiping in behind the text (right to left, Arabic reading direction).
    const w = ctx.measureText(content.replace(/[[\]]/g, "")).width + p.fontSize * 0.5;
    const k = Math.min(1, Math.max(0, localTime / 0.4));
    const eased = 1 - (1 - k) * (1 - k);
    const left = p.align === "left" ? -p.fontSize * 0.25 : p.align === "right" ? -w + p.fontSize * 0.25 : -w / 2;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = p.highlightBar;
    ctx.beginPath();
    ctx.roundRect(left + w * (1 - eased), -p.fontSize * 0.62, w * eased, p.fontSize * 1.24, p.fontSize * 0.18);
    ctx.fill();
    ctx.restore();
  }

  if (p.wordStagger && p.wordStagger > 0) {
    drawStaggeredWords(ctx, p, content, localTime);
    return;
  }

  if (p.stretchIn && p.stretchIn > 0 && localTime < p.stretchIn) {
    const remaining = 1 - Math.max(0, localTime) / p.stretchIn;
    content = kashidaStretch(content, Math.round(8 * remaining * remaining));
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
  if (p.glow) ctx.fillText(content, 0, 0); // second pass makes the neon read brighter
}

/**
 * Pro talking-head captions: the current phrase in a big bold first line with the rest in
 * smaller lines beneath, each word rising in as it's spoken; key words glow in the accent color.
 */
function drawPhraseStack(ctx: CanvasRenderingContext2D, p: CaptionLayerProps, t: number) {
  const lines = groupCaptionWordsIntoLines(p.words, 0.45, 6);
  const phrase = lines.find((l) => t >= l[0].start - 0.05 && t <= l[l.length - 1].end + 0.35);
  if (!phrase) return;
  const rows: CaptionWord[][] = [phrase.slice(0, 2)];
  for (let i = 2; i < phrase.length; i += 3) rows.push(phrase.slice(i, i + 3));
  let y = 0;
  rows.forEach((row, r) => {
    const size = r === 0 ? p.fontSize : p.fontSize * 0.62;
    ctx.font = `bold ${size}px ${p.fontFamily}`;
    const gap = size * 0.28;
    const widths = row.map((w) => ctx.measureText(w.text).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
    let x = total / 2;
    ctx.textAlign = "right";
    row.forEach((w, i) => {
      const age = t - w.start;
      if (age < -0.02) {
        x -= widths[i] + gap;
        return;
      }
      const k = Math.min(1, Math.max(0, age / 0.16));
      ctx.save();
      ctx.globalAlpha *= k;
      ctx.translate(0, (1 - k) * size * 0.35);
      ctx.shadowColor = w.emphasis ? p.emphasisColor : "rgba(0,0,0,0.6)";
      ctx.shadowBlur = w.emphasis ? size * 0.35 : size * 0.18;
      ctx.fillStyle = w.emphasis ? p.emphasisColor : p.color;
      ctx.fillText(w.text, x, y);
      ctx.restore();
      x -= widths[i] + gap;
    });
    y += size * (r === 0 ? 0.95 : 1.15);
  });
}

function drawCaption(ctx: CanvasRenderingContext2D, p: CaptionLayerProps, t: number) {
  if (p.words.length === 0) return;
  ctx.direction = "rtl";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${p.fontSize}px ${p.fontFamily}`;

  if (p.style === "phraseStack") {
    drawPhraseStack(ctx, p, t);
    return;
  }

  if (p.style === "glassPill") {
    // Short phrase inside a frosted glass pill that pops in with each new phrase.
    const phrase = groupCaptionWordsIntoLines(p.words, 0.45, 3).find((l) => t >= l[0].start - 0.05 && t <= l[l.length - 1].end + 0.3);
    if (!phrase) return;
    const age = t - phrase[0].start;
    const pop = age < 0.18 ? 0.85 + 0.15 * Math.sin((Math.max(0, age) / 0.18) * (Math.PI / 2)) : 1;
    const gap = p.fontSize * 0.28;
    const widths = phrase.map((w) => ctx.measureText(w.text).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (phrase.length - 1);
    const bw = total + p.fontSize * 1.3;
    const bh = p.fontSize * 1.7;
    ctx.save();
    ctx.scale(pop, pop);
    drawLabelBox(ctx, "glass", -bw / 2, -bh / 2, bw, bh, bh * 0.42);
    let x = total / 2;
    ctx.textAlign = "right";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = p.fontSize * 0.2;
    phrase.forEach((w, i) => {
      ctx.fillStyle = w.emphasis ? p.emphasisColor : p.color;
      ctx.fillText(w.text, x, 0);
      x -= widths[i] + gap;
    });
    ctx.restore();
    return;
  }

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

  if (p.style === "buildUp") {
    const spoken = line.filter((w) => t >= w.start - 0.02);
    if (spoken.length === 0) return;
    const gap = p.fontSize * 0.28;
    const widths = spoken.map((w) => ctx.measureText(w.text).width);
    const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (spoken.length - 1);
    let x = totalWidth / 2;
    ctx.textAlign = "right";
    for (let i = 0; i < spoken.length; i++) {
      const w = spoken[i];
      const isActive = t >= w.start && t <= w.end;
      ctx.fillStyle = isActive || w.emphasis ? p.emphasisColor : p.color;
      ctx.fillText(w.text, x, 0);
      x -= widths[i] + gap;
    }
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
/**
 * Frosted glass inside the current path (given in the current local space): blurs what's
 * already on the canvas there. The clip is captured in device space, so the self-sample is
 * drawn with an identity transform to line up pixel for pixel.
 */
function frostCurrentPath(ctx: CanvasRenderingContext2D, blur: number) {
  ctx.save();
  ctx.clip();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.restore();
}

/** Rounded label box behind text: a solid color, or "glass" for a frosted pill with a light rim. */
function drawLabelBox(ctx: CanvasRenderingContext2D, box: string, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (box === "glass") {
    frostCurrentPath(ctx, 14);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "rgba(255,255,255,0.22)");
    g.addColorStop(1, "rgba(255,255,255,0.06)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, h * 0.035);
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.stroke();
  } else {
    ctx.fillStyle = box;
    ctx.fill();
  }
  ctx.restore();
}

/** Draws media with its bottom edge fading out, via an offscreen buffer so layers beneath stay intact. */
let fadeBuffer: HTMLCanvasElement | null = null;
function drawWithBottomFade(ctx: CanvasRenderingContext2D, w: number, h: number, fade: number, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
  const bw = Math.max(1, Math.min(2048, Math.round(w)));
  const bh = Math.max(1, Math.min(2048, Math.round(h)));
  if (!fadeBuffer) fadeBuffer = document.createElement("canvas");
  if (fadeBuffer.width !== bw || fadeBuffer.height !== bh) {
    fadeBuffer.width = bw;
    fadeBuffer.height = bh;
  }
  const c = fadeBuffer.getContext("2d");
  if (!c) return;
  c.globalCompositeOperation = "source-over";
  c.clearRect(0, 0, bw, bh);
  paint(c, bw, bh);
  const g = c.createLinearGradient(0, bh * (1 - Math.min(1, fade)), 0, bh);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  c.globalCompositeOperation = "destination-out";
  c.fillStyle = g;
  c.fillRect(0, 0, bw, bh);
  c.globalCompositeOperation = "source-over";
  ctx.drawImage(fadeBuffer, -w / 2, -h / 2, w, h);
}

const VIDEO_LOOKS: Record<NonNullable<VideoLayerProps["look"]>, string> = {
  grayscale: "grayscale(1) contrast(1.05)",
  dim: "brightness(0.55)",
  blur: "blur(10px) brightness(0.85)",
};

/** Comp being rendered, so a cutout can find its source video layer. */
let currentComp: Comp | null = null;
let cutoutBuffer: HTMLCanvasElement | null = null;

/** Draws the person from the source video layer (masked by on-device segmentation) with that layer's transform. */
function drawCutout(ctx: CanvasRenderingContext2D, layer: Layer, time: number, opts: Required<RenderOptions>) {
  const p = layer.props as CutoutLayerProps;
  const src = currentComp?.layers.find((l) => l.id === p.sourceLayerId);
  if (!src || src.type !== "video" || time < src.startTime || time > src.endTime) return;
  const vp = src.props as VideoLayerProps;
  if (!vp.src) return;
  const video = opts.session.getVideo(vp.src, src.id);
  const mask = getPersonMask(video);
  if (!mask) return;
  const st = evaluateTransform(src.transform, time);
  const own = evaluateTransform(layer.transform, time);
  const alpha = Math.max(0, Math.min(1, st.opacity * own.opacity));
  if (alpha <= 0) return;

  const w = Math.max(1, Math.min(1920, Math.round(vp.width)));
  const h = Math.max(1, Math.min(1920, Math.round(vp.height)));
  if (!cutoutBuffer) cutoutBuffer = document.createElement("canvas");
  if (cutoutBuffer.width !== w || cutoutBuffer.height !== h) {
    cutoutBuffer.width = w;
    cutoutBuffer.height = h;
  }
  const c = cutoutBuffer.getContext("2d");
  if (!c) return;
  c.globalCompositeOperation = "source-over";
  c.filter = "none";
  c.clearRect(0, 0, w, h);
  opts.session.drawVideoFrame(c, video, 0, 0, w, h);
  c.globalCompositeOperation = "destination-in";
  c.filter = p.feather > 0 ? `blur(${p.feather}px)` : "none";
  c.drawImage(mask, 0, 0, w, h);
  c.filter = "none";
  c.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.translate(st.position.x, st.position.y);
  ctx.rotate((st.rotation * Math.PI) / 180);
  ctx.scale(st.scale.x, st.scale.y);
  ctx.globalAlpha = alpha;
  if (p.outline) {
    ctx.shadowColor = p.outline;
    ctx.shadowBlur = 24;
  }
  ctx.drawImage(cutoutBuffer, -vp.width / 2, -vp.height / 2, vp.width, vp.height);
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, p: ArrowLayerProps, localTime: number) {
  const k = Math.min(1, Math.max(0, localTime / Math.max(0.05, p.drawDuration)));
  if (k <= 0) return;
  const x0 = -p.width / 2;
  const x1 = p.width / 2;
  const cy = -p.curve * p.height;
  const at = (t: number) => ({ x: (1 - t) * (1 - t) * x0 + t * t * x1, y: 2 * (1 - t) * t * cy });
  ctx.strokeStyle = p.color;
  ctx.fillStyle = p.color;
  ctx.lineWidth = p.thickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (p.dashed) ctx.setLineDash([p.thickness * 2.5, p.thickness * 2.2]);
  ctx.beginPath();
  const steps = 48;
  for (let i = 0; i <= steps * k; i++) {
    const pt = at(i / steps);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (k >= 1) {
    const tip = at(1);
    const prev = at(0.96);
    const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x);
    const size = p.thickness * 4.5;
    ctx.beginPath();
    ctx.moveTo(tip.x - size * Math.cos(ang - 0.5), tip.y - size * Math.sin(ang - 0.5));
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(tip.x - size * Math.cos(ang + 0.5), tip.y - size * Math.sin(ang + 0.5));
    ctx.stroke();
  }
}

function drawSlotPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number, name: string) {
  ctx.save();
  ctx.fillStyle = "rgba(79,140,255,0.12)";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.setLineDash([18, 12]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(140,180,255,0.9)";
  ctx.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
  ctx.setLineDash([]);
  const size = Math.max(16, Math.min(w, h) * 0.06);
  ctx.font = `bold ${size}px 'Cairo', sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "rtl";
  const label = name.replace(/^B-roll \d+:\s*/, "");
  ctx.fillText("📷 حط هنا صورة أو مقطع", 0, -size * 0.8);
  ctx.font = `${size * 0.75}px 'Cairo', sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(label.length > 40 ? label.slice(0, 40) + "…" : label, 0, size * 0.6);
  ctx.restore();
}

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

  if (p.effect === "letterbox") {
    const bar = h * (0.06 + 0.1 * p.intensity);
    ctx.fillStyle = "#000000";
    ctx.fillRect(-w / 2, -h / 2, w, bar);
    ctx.fillRect(-w / 2, h / 2 - bar, w, bar);
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
      const video = opts.session.getVideo(p.src, layer.id);
      syncMediaElement(video, active, p.trimIn + (time - layer.startTime), p.muted, opts.playing);
    }
  } else if (layer.type === "audio") {
    const p = layer.props as AudioLayerProps;
    if (p.src) {
      const audio = opts.session.getAudio(p.src, layer.id);
      syncMediaElement(audio, active, p.trimIn + (time - layer.startTime), p.muted, opts.playing);
    }
    return; // audio layers have nothing to draw
  } else if (layer.type === "glass") {
    drawGlassPanel(ctx, layer, time);
    return;
  } else if (layer.type === "cutout") {
    if (active) drawCutout(ctx, layer, time, opts);
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
      if (p.softness) ctx.filter = `blur(${p.softness}px)`;
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
      if (p.softness) ctx.filter = `blur(${p.softness}px)`;
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
      if (!p.src) {
        // Empty B-roll slot: a dashed hint in the live preview only — exports skip it.
        if (opts.session === defaultSession) drawSlotPlaceholder(ctx, p.width, p.height, layer.name);
        break;
      }
      const img = opts.session.getImage(p.src);
      if (img) {
        const paint = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
          if (p.fit === "cover" && img.naturalWidth && img.naturalHeight) {
            const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
            const sw = w / s;
            const sh = h / s;
            c.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
          } else c.drawImage(img, x, y, w, h);
        };
        if (p.fadeBottom && p.fadeBottom > 0) drawWithBottomFade(ctx, p.width, p.height, p.fadeBottom, (c, w, h) => paint(c, 0, 0, w, h));
        else paint(ctx, -p.width / 2, -p.height / 2, p.width, p.height);
      }
      break;
    }
    case "video": {
      const p = layer.props as VideoLayerProps;
      if (!p.src) break;
      const video = opts.session.getVideo(p.src, layer.id);
      if (p.look) ctx.filter = VIDEO_LOOKS[p.look];
      if (p.fadeBottom && p.fadeBottom > 0) {
        drawWithBottomFade(ctx, p.width, p.height, p.fadeBottom, (c, w, h) => opts.session.drawVideoFrame(c, video, 0, 0, w, h));
      } else {
        opts.session.drawVideoFrame(ctx, video, -p.width / 2, -p.height / 2, p.width, p.height);
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
    case "arrow": {
      drawArrow(ctx, layer.props as ArrowLayerProps, time - layer.startTime);
      break;
    }
    case "chart": {
      drawChart(ctx, layer.props as ChartLayerProps, time - layer.startTime);
      break;
    }
  }

  ctx.restore();
}

export function renderComposition(ctx: CanvasRenderingContext2D, comp: Composition, time: number, opts: RenderOptions = { playing: false }) {
  const resolvedOpts: Required<RenderOptions> = { playing: opts.playing, session: opts.session ?? defaultSession };
  resolvedOpts.session.beginFrame();
  currentComp = comp;
  ctx.save();
  ctx.clearRect(0, 0, comp.width, comp.height);
  ctx.fillStyle = comp.backgroundColor;
  ctx.fillRect(0, 0, comp.width, comp.height);

  // index 0 = topmost/front layer, so draw from the back (last) to the front (first).
  for (let i = comp.layers.length - 1; i >= 0; i--) {
    drawLayer(ctx, comp.layers[i], time, resolvedOpts);
  }
  ctx.restore();
  resolvedOpts.session.endFrame(comp);

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
