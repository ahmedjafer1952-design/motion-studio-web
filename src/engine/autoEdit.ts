import type { DoodleLayerProps, VideoLayerProps, VideoLook, GlassLayerProps, CaptionLayerProps, CaptionStyle, CaptionWord, ColorGradeId, Composition, Layer, TextLayerProps } from "../types";
import { soundSrcId, type SoundId } from "./sounds";
import { createLayer } from "./factory";
import { segmentsDuration, sourceToLocal } from "./cuts";
import { makeRect, makeText } from "./builders";
import { applyPresetToLayer } from "./presets";
import type { TranscribedWord } from "./transcribe";
import { makeId } from "../utils/id";

export type Pace = "calm" | "medium" | "strong";

export interface AutoEditOptions {
  pace: Pace;
  title?: string;
  cta?: string;
}

export interface AutoEditResult {
  newLayers: Layer[];
  updatedSourceLayer: Layer;
  compPatch: Partial<Composition>;
}

// --- Speech analysis (rule-based — no server, no LLM call) ---------------

interface NumberCallout {
  text: string;
  time: number;
}

interface ListGroup {
  items: { text: string; time: number }[];
}

interface SpeechAnalysis {
  numbers: NumberCallout[];
  lists: ListGroup[];
  emphasisIndices: Set<number>;
  pausePoints: number[]; // seconds, mid-gap
}

const ARABIC_NUMBER_WORDS: Record<string, string> = {
  واحد: "1",
  اثنين: "2",
  اثنان: "2",
  ثلاثة: "3",
  ثلاث: "3",
  أربعة: "4",
  اربعة: "4",
  خمسة: "5",
  ستة: "6",
  سبعة: "7",
  ثمانية: "8",
  تسعة: "9",
  عشرة: "10",
  عشر: "10",
  عشرين: "20",
  ثلاثين: "30",
  أربعين: "40",
  اربعين: "40",
  خمسين: "50",
  مئة: "100",
  مائة: "100",
  ألف: "1000",
  الف: "1000",
};

const ORDINAL_MARKERS = new Set([
  "أولاً",
  "أولا",
  "اولا",
  "ثانياً",
  "ثانيا",
  "ثالثاً",
  "ثالثا",
  "رابعاً",
  "رابعا",
  "خامساً",
  "خامسا",
  "الأول",
  "الأولى",
  "الاول",
  "الثاني",
  "الثانية",
  "الثالث",
  "الثالثة",
  "الرابع",
  "الرابعة",
]);

const STOPWORDS = new Set([
  "في",
  "من",
  "إلى",
  "الى",
  "على",
  "هذا",
  "هذه",
  "ذلك",
  "التي",
  "الذي",
  "أن",
  "ان",
  "كان",
  "لا",
  "لم",
  "لن",
  "قد",
  "ثم",
  "كل",
  "بعض",
  "و",
  "أو",
  "او",
  "مع",
  "عن",
  "هو",
  "هي",
  "نحن",
  "أنت",
  "انت",
  "انا",
  "أنا",
  "ما",
  "اللي",
  "حتى",
  "كما",
  "إذا",
  "اذا",
  "بس",
  "يا",
]);

function normalize(word: string): string {
  return word.replace(/[^\p{L}\p{N}]/gu, "");
}

function analyzeSpeech(words: TranscribedWord[], pace: Pace): SpeechAnalysis {
  const pauseThreshold = pace === "calm" ? 0.9 : pace === "medium" ? 0.6 : 0.4;
  const numbers: NumberCallout[] = [];
  const pausePoints: number[] = [];
  const ordinalHits: { index: number; time: number }[] = [];

  words.forEach((w, i) => {
    const clean = normalize(w.text);
    if (/^\d+$/.test(clean)) {
      numbers.push({ text: clean, time: w.start });
    } else if (ARABIC_NUMBER_WORDS[clean]) {
      numbers.push({ text: ARABIC_NUMBER_WORDS[clean], time: w.start });
    }
    if (ORDINAL_MARKERS.has(clean)) {
      ordinalHits.push({ index: i, time: w.start });
    }
    if (i < words.length - 1) {
      const gap = words[i + 1].start - w.end;
      if (gap > pauseThreshold) pausePoints.push(w.end + gap / 2);
    }
  });

  const emphasisIndices = new Set<number>();
  const candidates = words
    .map((w, i) => ({ i, clean: normalize(w.text) }))
    .filter((c) => c.clean.length >= 4 && !STOPWORDS.has(c.clean));
  const maxEmphasis = Math.max(1, Math.round(words.length * 0.12));
  let lastPicked = -10;
  for (const c of candidates) {
    if (emphasisIndices.size >= maxEmphasis) break;
    if (c.i - lastPicked < 4) continue; // keep emphasis words spread out
    emphasisIndices.add(c.i);
    lastPicked = c.i;
  }

  const lists: ListGroup[] = [];
  if (ordinalHits.length >= 2) {
    const items = ordinalHits.map((hit, k) => {
      const endIdx = k + 1 < ordinalHits.length ? ordinalHits[k + 1].index : Math.min(words.length, hit.index + 8);
      const text = words
        .slice(hit.index, endIdx)
        .map((w) => w.text)
        .join(" ");
      return { text, time: hit.time };
    });
    lists.push({ items });
  }

  return { numbers, lists, emphasisIndices, pausePoints };
}

// --- Small, timed layer builders (local to Auto Edit) --------------------

// A user-uploaded Thmanyah Sans wins when present; otherwise the closest free match.
/** Mixes a hex color toward white so a dark brand color still reads as a glowing neon. */
function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const mix = (c: string) => Math.round(parseInt(c, 16) + (255 - parseInt(c, 16)) * amount).toString(16).padStart(2, "0");
  return `#${mix(m[1])}${mix(m[2])}${mix(m[3])}`;
}

function darken(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const mix = (c: string) => Math.round(parseInt(c, 16) * (1 - amount)).toString(16).padStart(2, "0");
  return `#${mix(m[1])}${mix(m[2])}${mix(m[3])}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return `rgba(20,184,166,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

/** Rough on-screen width of bold Arabic display text (no canvas at build time). */
function estTextWidth(text: string, fontSize: number): number {
  return text.replace(/[[\]]/g, "").length * fontSize * 0.52;
}

/** Largest font size ≤ desired that keeps `text` within `maxWidth`. */
function fitFont(text: string, desired: number, maxWidth: number): number {
  const w = estTextWidth(text, desired);
  return Math.max(12, Math.round(w > maxWidth ? desired * (maxWidth / w) : desired));
}

const DISPLAY_FONT = "'thmanyahsans', 'Alexandria', 'Cairo', sans-serif";
const NEON = "#5ab8ff";
const ACCENT_RED = "#ff3b3b";

/** Hook title on a frosted-glass card, letters stretching (kashida) as it lands. */
function titleCardAt(comp: Composition, text: string, start: number, end: number): Layer[] {
  const cx = comp.width / 2;
  const cy = comp.height * 0.4;
  const unit = Math.min(comp.width, comp.height);
  const words = text.split(/\s+/).filter(Boolean);
  const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [text];
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
  const fontSize = fitFont(longest, Math.round(unit * 0.085), comp.width * 0.72);
  const cardW = Math.min(comp.width * 0.9, estTextWidth(longest, fontSize) + fontSize * 1.6);
  const card = createLayer("glass", comp);
  card.name = "Auto Title Glass";
  card.startTime = start;
  card.endTime = end;
  card.transform.position.static = { x: cx, y: cy };
  card.props = {
    width: Math.round(cardW),
    height: Math.round(fontSize * (lines.length * 1.25 + 0.9)),
    radius: Math.round(unit * 0.05),
    blur: 22,
    tint: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.45)",
    style: "liquid",
  } as GlassLayerProps;
  const out: Layer[] = [];
  lines.forEach((line, i) => {
    let t = makeText(comp, { content: line, fontSize, color: "#ffffff", x: cx, y: cy + (i - (lines.length - 1) / 2) * fontSize * 1.25, startTime: start, endTime: end, name: `Auto Title ${i + 1}`, fontFamily: DISPLAY_FONT });
    t.props = { ...(t.props as TextLayerProps), bold: true, shine: true };
    out.push(applyPresetToLayer(applyPresetToLayer(t, "fadeUp", comp), "fadeOut", comp));
  });
  return [...out, applyPresetToLayer(applyPresetToLayer(card, "popIn", comp), "fadeOut", comp)];
}

// --- Editorial (modern pro) look -------------------------------------------
// What separates a human editor's work from a template: restraint and typography. Type is set
// flush to one side (right, for Arabic) instead of centered; a small light "kicker" line sits over
// one heavy word; serif numerals; thin rules; slow camera pushes with occasional hard jump-cut
// punch-ins; light film grain; entrances that differ slightly in timing instead of a uniform pop.

const KICKER_FONT = "'thmanyahsans', 'IBM Plex Sans Arabic', 'Cairo', sans-serif";
const HEAVY_FONT = "'thmanyahsans', 'Alexandria', 'Cairo', sans-serif";
const SERIF_FONT = "'thmanyahserifdisplay', 'Playfair Display', 'Amiri', serif";

/** Deterministic small timing offset (0–90 ms) so entrances don't all fire in lockstep. */
function humanize(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 0.09;
}

/** A thin accent rule that draws itself (right → left). */
function ruleAt(comp: Composition, xRight: number, y: number, width: number, color: string, start: number, end: number, name: string): Layer {
  const line = makeRect(comp, { width, height: Math.max(2, Math.round(comp.height * 0.0025)), color, x: xRight - width / 2, y, startTime: start, endTime: end, name });
  line.transform.scale = {
    static: { x: 1, y: 1 },
    keyframes: [
      { id: makeId("kf"), time: start, value: { x: 0.001, y: 1 }, easing: "easeOut" },
      { id: makeId("kf"), time: start + 0.5, value: { x: 1, y: 1 }, easing: "easeOut" },
    ],
  };
  // Grow from the right edge: shift so the right end stays put while it scales.
  line.transform.position.keyframes = [
    { id: makeId("kf"), time: start, value: { x: xRight, y }, easing: "easeOut" },
    { id: makeId("kf"), time: start + 0.5, value: { x: xRight - width / 2, y }, easing: "easeOut" },
  ];
  return applyPresetToLayer(line, "fadeOut", comp);
}

/** Kicker (small, light) over a heavy main line, flush right — the editorial headline. */
function editorialHeadline(comp: Composition, kicker: string, main: string, y: number, start: number, end: number, accent: string, name: string, seed: number): Layer[] {
  const unit = Math.min(comp.width, comp.height);
  const xr = comp.width * 0.9;
  const maxW = comp.width * 0.8;
  const mainSize = fitFont(main, Math.round(unit * 0.12), maxW);
  const out: Layer[] = [];
  const t0 = start + humanize(seed);
  if (kicker) {
    let k = makeText(comp, { content: kicker, fontSize: fitFont(kicker, Math.round(unit * 0.042), maxW), color: "rgba(255,255,255,0.78)", align: "right", x: xr, y: y - mainSize * 0.78, startTime: t0, endTime: end, name: `${name} Kicker`, fontFamily: KICKER_FONT });
    out.push(applyPresetToLayer(applyPresetToLayer(k, "fadeUp", comp), "fadeOut", comp));
  }
  let m = makeText(comp, { content: main, fontSize: mainSize, color: "#ffffff", align: "right", x: xr, y, startTime: t0 + 0.12, endTime: end, name, fontFamily: HEAVY_FONT });
  m.props = { ...(m.props as TextLayerProps), bold: true, wipeIn: 0.55 };
  out.push(applyPresetToLayer(m, "fadeOut", comp));
  out.push(ruleAt(comp, xr, y + mainSize * 0.72, Math.min(maxW, estTextWidth(main, mainSize) * 0.6), accent, t0 + 0.3, end, `${name} Rule`));
  return out;
}

// --- Trend (2026 reels) look ---------------------------------------------------
// Seen across current top reels: a small line over ONE huge word set above the speaker's head,
// revealed by sharpening out of blur or by letters scrambling into place; marker doodles
// (sparkle, underline, circled word, question marks) drawn by hand; scattered word captions;
// and the occasional full-screen color card as a hard cut on the biggest beat.

const TREND_HEAVY = "'thmanyahsans', 'Alexandria', 'Cairo', sans-serif";

function doodle(comp: Composition, kind: DoodleLayerProps["kind"], x: number, y: number, size: number, color: string, start: number, end: number, name: string): Layer {
  const d = createLayer("doodle", comp);
  d.name = name;
  d.startTime = start;
  d.endTime = end;
  d.transform.position.static = { x, y };
  d.props = { kind, width: size, height: kind === "underline" ? size * 0.3 : kind === "questions" ? size * 0.5 : size, color, thickness: Math.max(3, size * 0.035), drawDuration: 0.45 } as DoodleLayerProps;
  return applyPresetToLayer(d, "fadeOut", comp);
}

/** Small line over one huge word, centered above the head, with a reveal and a doodle. */
function trendHeadline(comp: Composition, kicker: string, main: string, start: number, end: number, accent: string, name: string, seed: number): Layer[] {
  const unit = Math.min(comp.width, comp.height);
  const vertical = comp.height > comp.width;
  const cx = comp.width / 2;
  const y = comp.height * (vertical ? 0.16 : 0.22);
  const mainSize = fitFont(main, Math.round(unit * 0.16), comp.width * 0.86);
  const t0 = start + humanize(seed);
  const out: Layer[] = [];
  if (kicker) {
    let k = makeText(comp, { content: kicker, fontSize: fitFont(kicker, Math.round(unit * 0.045), comp.width * 0.8), color: "rgba(255,255,255,0.9)", x: cx, y: y - mainSize * 0.72, startTime: t0, endTime: end, name: `${name} Kicker`, fontFamily: KICKER_FONT });
    out.push(applyPresetToLayer(applyPresetToLayer(k, "fadeUp", comp), "fadeOut", comp));
  }
  let m = makeText(comp, { content: main, fontSize: mainSize, color: "#ffffff", x: cx, y, startTime: t0 + 0.1, endTime: end, name, fontFamily: TREND_HEAVY });
  m.props = { ...(m.props as TextLayerProps), bold: true, ...(seed % 2 ? { scrambleIn: 0.5 } : { blurIn: 0.5 }) };
  out.push(applyPresetToLayer(m, "fadeOut", comp));
  const w = Math.min(comp.width * 0.86, estTextWidth(main, mainSize));
  const isQuestion = /[؟?]/.test(kicker + main);
  const kind: DoodleLayerProps["kind"] = isQuestion ? "questions" : (["sparkle", "underline", "scribbleCircle"] as const)[seed % 3];
  // Question marks surround the word rather than sitting on it.
  if (kind === "questions") out.push(doodle(comp, kind, cx, y - mainSize * 0.1, Math.min(comp.width * 0.92, Math.max(w * 1.7, unit * 0.55)), accent, t0 + 0.35, end, `${name} Doodle`));
  else if (kind === "underline") out.push(doodle(comp, kind, cx, y + mainSize * 0.62, w * 0.9, accent, t0 + 0.45, end, `${name} Doodle`));
  else if (kind === "scribbleCircle") out.push(doodle(comp, kind, cx, y, Math.max(w * 1.15, mainSize * 1.6), accent, t0 + 0.45, end, `${name} Doodle`));
  else out.push(doodle(comp, kind, cx + w / 2 + mainSize * 0.25, y - mainSize * 0.45, mainSize * 0.45, accent, t0 + 0.4, end, `${name} Doodle`));
  return out;
}

/** Full-screen color card with one huge word — a hard cut on the biggest beat. */
function typeCard(comp: Composition, text: string, start: number, end: number, color: string, name: string): Layer[] {
  const unit = Math.min(comp.width, comp.height);
  const bg = makeRect(comp, { width: comp.width, height: comp.height, color, x: comp.width / 2, y: comp.height / 2, startTime: start, endTime: end, name: `${name} Card` });
  const dark = /^#?(?:[a-f0-9]{2}){3}$/i.test(color) && parseInt(color.replace("#", "").slice(0, 2), 16) * 0.3 + parseInt(color.replace("#", "").slice(2, 4), 16) * 0.59 + parseInt(color.replace("#", "").slice(4, 6), 16) * 0.11 < 140;
  let t = makeText(comp, { content: text.replace(/[[\]]/g, ""), fontSize: fitFont(text, Math.round(unit * 0.2), comp.width * 0.86), color: dark ? "#ffffff" : "#0b0b0b", x: comp.width / 2, y: comp.height / 2, startTime: start, endTime: end, name, fontFamily: TREND_HEAVY });
  t.props = { ...(t.props as TextLayerProps), bold: true };
  return [applyPresetToLayer(t, "zoomPunch", comp), bg];
}

/** Tilted call-to-action in the top corner, like the "بالتعليقات" stamp in pro edits. */
function ctaButtonAt(comp: Composition, text: string, start: number, end: number): Layer[] {
  const unit = Math.min(comp.width, comp.height);
  // Tilted -35°: keep the rotated box fully inside the frame's top-left corner.
  const fontSize = fitFont(text, Math.round(unit * 0.065), comp.width * 0.62);
  const half = estTextWidth(text, fontSize) / 2;
  const x = half * Math.cos((35 * Math.PI) / 180) + fontSize * 0.9;
  const y = half * Math.sin((35 * Math.PI) / 180) + fontSize * 1.2;
  let label = makeText(comp, { content: text, fontSize, color: "#ffffff", x, y, startTime: start, endTime: end, name: "Auto CTA", fontFamily: DISPLAY_FONT });
  label.transform.rotation.static = -35;
  label.props = { ...(label.props as TextLayerProps), glow: "rgba(0,0,0,0.55)" };
  return [applyPresetToLayer(label, "popIn", comp)];
}

// --- Edit plan --------------------------------------------------------------
// Whatever decides the edit (the built-in rules below, or Claude) produces an EditPlan in
// source-clip seconds; buildEditFromPlan turns it into layers. Keeping the two apart means
// both brains share exactly the same, tested layout code.

export type KeyPhraseLook = "neon" | "box" | "glass" | "stretch" | "card";

export type EditStyle = "editorial" | "bold" | "trend";

/** Cartoonish/game sounds a restrained editorial edit never uses. */
const LOUD_SOUNDS = new Set(["bubble", "laser", "coin", "notification", "typewriterKey", "camera", "magic", "drop", "jingleSax", "success", "drumHit"]);

export interface EditPlan {
  /** Transcript to caption — may carry corrected wording, same timings. */
  words: TranscribedWord[];
  emphasis: Set<number>;
  captionStyle: CaptionStyle;
  title: string | null;
  numbers: { text: string; label: string; time: number }[];
  lists: { items: { text: string; time: number }[] }[];
  /** Short on-screen punchlines; a [bracketed] word gets the highlight color. */
  keyPhrases: { text: string; time: number; look?: KeyPhraseLook }[];
  /** One brand color for highlights, boxes and glows; null = the default neon/red pairing. */
  accent?: string | null;
  /** Put titles, numbers and key phrases behind the speaker (needs a video source). */
  textBehind?: boolean;
  /** Cutaway slots: the creator drops an image/clip into each placeholder. */
  broll?: { start: number; end: number; description: string }[];
  backgroundLook?: VideoLook | null;
  /** Replace the real background with a studio backdrop lit in the brand color. */
  studioBackground?: boolean;
  /** Jump cuts (source seconds) to keep; set by the dialog from pauses + Claude's removals. */
  segments?: { start: number; end: number }[];
  /** Filler / false starts / retakes Claude marked for removal (source seconds). */
  removeRanges?: { start: number; end: number }[];
  /** "editorial" = restrained modern pro look; "bold" = high-energy reels look. */
  style?: EditStyle;
  zooms: { time: number; strength: "light" | "strong" }[];
  sounds: { sound: SoundId; time: number }[];
  colorGrade: ColorGradeId | null;
  cta: string | null;
}

export function planFromRules(words: TranscribedWord[], opts: AutoEditOptions): EditPlan {
  const analysis = analyzeSpeech(words, opts.pace);
  return {
    words,
    emphasis: analysis.emphasisIndices,
    captionStyle: "phraseStack",
    title: opts.title ?? null,
    numbers: analysis.numbers.map((n) => ({ text: n.text, label: "", time: n.time })),
    lists: analysis.lists,
    keyPhrases: [],
    zooms: analysis.pausePoints.map((time) => ({ time, strength: "light" as const })),
    sounds: [],
    colorGrade: null,
    cta: opts.cta ?? null,
  };
}

// --- Assembly --------------------------------------------------------------

export function buildAutoEdit(
  comp: Composition,
  sourceLayer: Layer,
  words: TranscribedWord[],
  sourceTrimIn: number,
  opts: AutoEditOptions
): AutoEditResult {
  return buildEditFromPlan(comp, sourceLayer, sourceTrimIn, planFromRules(words, opts));
}

export function buildEditFromPlan(
  comp: Composition,
  sourceLayer: Layer,
  sourceTrimIn: number,
  plan: EditPlan
): AutoEditResult {
  const newLayers: Layer[] = [];
  const segments = plan.segments && plan.segments.length ? plan.segments : null;
  const originalEnd = sourceLayer.endTime;
  if (segments) {
    // Jump cuts shorten the clip; everything below is laid out on the edited timeline.
    sourceLayer = { ...sourceLayer, endTime: sourceLayer.startTime + segmentsDuration(segments) };
  }
  const toCompTime = (sourceTime: number) =>
    sourceLayer.startTime + (segments ? sourceToLocal(sourceTime, segments) : sourceTime - sourceTrimIn);
  const inClip = (t: number, tail = 0) => t >= sourceLayer.startTime && t <= sourceLayer.endTime - tail;
  const vertical = comp.height > comp.width;
  const accent = plan.accent ?? null;

  // Captions, spanning the full source clip.
  const captionWords: CaptionWord[] = plan.words.map((w, i) => ({
    id: makeId("word"),
    text: w.text,
    start: w.start,
    end: w.end,
    emphasis: plan.emphasis.has(i),
  }));
  const captions = createLayer("caption", comp);
  captions.name = "Auto Captions";
  captions.startTime = sourceLayer.startTime;
  captions.endTime = sourceLayer.endTime;
  captions.props = {
    words: captionWords,
    style: plan.captionStyle,
    fontSize: Math.round(Math.min(comp.width, comp.height) * 0.072),
    color: "#ffffff",
    emphasisColor: accent ?? (plan.captionStyle === "phraseStack" ? ACCENT_RED : "#ffd166"),
    fontFamily: plan.captionStyle === "phraseStack" || plan.captionStyle === "glassPill" ? DISPLAY_FONT : "'Cairo', sans-serif",
    sourceTrimIn,
    segments: segments ?? undefined,
    sourceLayerName: sourceLayer.name,
  } as CaptionLayerProps;
  if (plan.captionStyle === "glassPill") {
    captions.transform.position.static = { x: comp.width / 2, y: comp.height * (vertical ? 0.75 : 0.8) };
    (captions.props as CaptionLayerProps).fontSize = Math.round(Math.min(comp.width, comp.height) * 0.065);
  }
  if (plan.captionStyle === "phraseStack") {
    captions.transform.position.static = { x: comp.width / 2, y: comp.height * (vertical ? 0.62 : 0.72) };
    (captions.props as CaptionLayerProps).fontSize = Math.round(Math.min(comp.width, comp.height) * 0.085);
  }
  if (plan.style === "trend") {
    const props = captions.props as CaptionLayerProps;
    if (props.style !== "minimal" && props.style !== "glassPill") props.style = "scatter";
    props.fontSize = Math.round(Math.min(comp.width, comp.height) * (props.style === "scatter" ? 0.07 : 0.056));
    props.fontFamily = TREND_HEAVY;
    props.emphasisColor = accent ?? "#c8ff00";
    captions.transform.position.static = { x: comp.width / 2, y: comp.height * (vertical ? (props.style === "scatter" ? 0.58 : 0.8) : 0.7) };
  }
  if (plan.style === "editorial") {
    // Editorial captions: small, low, regular weight — the speaker carries the frame, not the text.
    const props = captions.props as CaptionLayerProps;
    if (["bigWord", "pillWord", "buildUp", "phraseStack"].includes(props.style)) props.style = "minimal";
    if (props.style === "minimal") {
      props.fontSize = Math.round(Math.min(comp.width, comp.height) * 0.056);
      props.fontFamily = "'thmanyahsans', 'IBM Plex Sans Arabic', 'Cairo', sans-serif";
      props.emphasisColor = lighten(accent ?? "#e8c37b", 0.2);
      captions.transform.position.static = { x: comp.width / 2, y: comp.height * (vertical ? 0.8 : 0.85) };
    }
    // A whisper of film grain over everything: footage stops looking "digital-clean".
    const grain = createLayer("overlay", comp);
    grain.name = "Auto Film Grain";
    grain.startTime = sourceLayer.startTime;
    grain.endTime = sourceLayer.endTime;
    grain.props = { ...(grain.props as object), effect: "grain", intensity: 0.22, width: comp.width, height: comp.height } as Layer["props"];
    newLayers.push(grain);
  }
  newLayers.push(captions);

  const trend = plan.style === "trend";
  // Trend shares the editorial restraint (lists, zooms, subtle sound) and swaps the typography.
  const editorial = plan.style === "editorial" || trend;
  const accentE = accent ?? (trend ? "#c8ff00" : "#e8c37b");
  if (plan.title) {
    const tEnd = Math.min(sourceLayer.startTime + 2.5, sourceLayer.endTime);
    if (trend) {
      const words = plan.title.split(/\s+/).filter(Boolean);
      const main = words.length > 1 ? words[words.length - 1] : plan.title;
      newLayers.push(...trendHeadline(comp, words.slice(0, -1).join(" "), main, sourceLayer.startTime, tEnd, accentE, "Auto Title", 0));
    } else if (editorial) {
      const words = plan.title.split(/\s+/).filter(Boolean);
      const main = words.length > 2 ? words.slice(-2).join(" ") : plan.title;
      const kicker = words.length > 2 ? words.slice(0, -2).join(" ") : "";
      newLayers.push(...editorialHeadline(comp, kicker, main, comp.height * (vertical ? 0.24 : 0.3), sourceLayer.startTime, tEnd, accentE, "Auto Title", 1));
    } else {
      newLayers.push(...titleCardAt(comp, plan.title, sourceLayer.startTime, tEnd));
    }
  }

  // Big-number callouts, upper area so they don't collide with captions at the bottom.
  // One "center stage" moment at a time: the title, each list, each number and key phrase get
  // their own window; anything that would land on top of another is skipped rather than stacked.
  const busy: [number, number][] = [];
  const claim = (a: number, b: number) => {
    if (busy.some(([x, y]) => a < y - 0.05 && b > x + 0.05)) return false;
    busy.push([a, b]);
    return true;
  };
  if (plan.title) claim(sourceLayer.startTime, sourceLayer.startTime + 2.5);
  for (const list of plan.lists) {
    const times = list.items.slice(0, 5).map((it) => toCompTime(it.time));
    if (times.length) claim(Math.min(...times), Math.max(...times) + 2.5);
  }

  plan.numbers.slice(0, 8).forEach((n, idx) => {
    const t = toCompTime(n.time);
    if (!inClip(t, 0.3)) return;
    const end = Math.min(t + 2.2, sourceLayer.endTime);
    if (!claim(t, end)) return;
    if (trend) {
      newLayers.push(...trendHeadline(comp, n.label, n.text, t, end, accentE, `Auto Number ${idx + 1}`, idx + 5));
      return;
    }
    if (editorial) {
      // Serif numeral, flush right, with a light label and a rule.
      const unit = Math.min(comp.width, comp.height);
      const xr = comp.width * 0.9;
      const y = comp.height * (vertical ? 0.3 : 0.35);
      const size = fitFont(n.text, Math.round(unit * 0.26), comp.width * 0.75);
      let num = makeText(comp, { content: n.text, fontSize: size, color: "#ffffff", align: "right", x: xr, y, startTime: t + humanize(idx + 7), endTime: end, name: `Auto Number ${idx + 1}`, fontFamily: SERIF_FONT });
      newLayers.push(applyPresetToLayer(applyPresetToLayer(num, "fadeUp", comp), "fadeOut", comp));
      if (n.label) {
        let lab = makeText(comp, { content: n.label, fontSize: Math.round(unit * 0.045), color: "rgba(255,255,255,0.8)", align: "right", x: xr, y: y + size * 0.62, startTime: t + 0.2, endTime: end, name: `Auto Number Label ${idx + 1}`, fontFamily: KICKER_FONT });
        newLayers.push(applyPresetToLayer(applyPresetToLayer(lab, "fadeUp", comp), "fadeOut", comp));
      }
      newLayers.push(ruleAt(comp, xr, y + size * 0.45, unit * 0.25, accentE, t + 0.25, end, `Auto Number Rule ${idx + 1}`));
      return;
    }
    // Huge hollow neon number in the top corner, like a lit sign.
    const x = vertical ? comp.width * 0.2 : comp.width * 0.78;
    const y = comp.height * (vertical ? 0.17 : 0.24);
    let num = makeText(comp, { content: n.text, fontSize: Math.round(comp.height * (n.text.length <= 2 ? 0.2 : 0.12)), color: "#ffffff", x, y, startTime: t, endTime: end, name: `Auto Number ${idx + 1}`, fontFamily: "'Playfair Display', serif" });
    num.props = { ...(num.props as TextLayerProps), outline: true, glow: accent ?? "rgba(255,255,255,0.9)" };
    num = applyPresetToLayer(num, "popIn", comp);
    newLayers.push(num);
    if (n.label) {
      let label = makeText(comp, { content: n.label, fontSize: Math.round(Math.min(comp.width, comp.height) * 0.085), color: "#ffffff", x: vertical ? comp.width / 2 : x, y: vertical ? comp.height * 0.52 : y + comp.height * 0.11, startTime: Math.min(t + 0.15, end), endTime: end, name: `Auto Number Label ${idx + 1}`, fontFamily: DISPLAY_FONT });
      label.props = { ...(label.props as TextLayerProps), stretchIn: 0.5, glow: "rgba(0,0,0,0.5)" };
      label = applyPresetToLayer(label, "fadeIn", comp);
      newLayers.push(label);
    }
  });

  // List items as frosted glass cards stacking in, each exactly when it's spoken.
  plan.lists.forEach((list, li) => {
    if (editorial) {
      // Numbered, flush-right list: accent numeral + item, a hairline under each.
      const unit = Math.min(comp.width, comp.height);
      const items = list.items.slice(0, 4);
      const lastItem = items.length ? toCompTime(items[items.length - 1].time) : 0;
      const end = Math.min(sourceLayer.endTime, lastItem + 2.5);
      const xr = comp.width * 0.9;
      const rowH = unit * 0.11;
      const top = comp.height * (vertical ? 0.24 : 0.22);
      items.forEach((item, ii) => {
        const t = toCompTime(item.time) + humanize(li * 10 + ii);
        if (!inClip(t)) return;
        const y = top + ii * rowH;
        const size = fitFont(item.text, Math.round(unit * 0.058), comp.width * 0.62);
        let num = makeText(comp, { content: String(ii + 1).padStart(2, "0"), fontSize: Math.round(unit * 0.034), color: accentE, align: "right", x: xr, y, startTime: t, endTime: end, name: `Auto List Num ${li + 1}.${ii + 1}`, fontFamily: SERIF_FONT });
        let txt = makeText(comp, { content: item.text, fontSize: size, color: "#ffffff", align: "right", x: xr - unit * 0.075, y, startTime: t + 0.06, endTime: end, name: `Auto List ${li + 1}.${ii + 1}`, fontFamily: HEAVY_FONT });
        txt.props = { ...(txt.props as TextLayerProps), bold: true };
        newLayers.push(applyPresetToLayer(applyPresetToLayer(num, "fadeIn", comp), "fadeOut", comp));
        newLayers.push(applyPresetToLayer(applyPresetToLayer(txt, "fadeUp", comp), "fadeOut", comp));
        let hair = makeRect(comp, { width: comp.width * 0.8, height: 1, color: "rgba(255,255,255,0.22)", x: xr - comp.width * 0.4, y: y + rowH * 0.48, startTime: t + 0.1, endTime: end, name: `Auto List Line ${li + 1}.${ii + 1}` });
        newLayers.push(applyPresetToLayer(applyPresetToLayer(hair, "fadeIn", comp), "fadeOut", comp));
      });
      return;
    }
    const unit = Math.min(comp.width, comp.height);
    const cardW = Math.min(comp.width * 0.82, unit * 0.8);
    const cardH = unit * 0.095;
    const gap = unit * 0.018;
    const items = list.items.slice(0, 5);
    // Below the face (portrait faces sit around 15–38% of the height), above the captions.
    const top = comp.height * (vertical ? 0.43 : 0.2);
    // The stack clears 2.5 s after its last item, so later key moments aren't buried under it.
    const lastItem = items.length ? toCompTime(items[items.length - 1].time) : 0;
    const end = Math.min(sourceLayer.endTime, lastItem + 2.5);
    items.forEach((item, ii) => {
      const t = toCompTime(item.time);
      if (!inClip(t)) return;
      const y = top + ii * (cardH + gap);
      const card = createLayer("glass", comp);
      card.name = `Auto List Card ${li + 1}.${ii + 1}`;
      card.startTime = t;
      card.endTime = end;
      card.transform.position.static = { x: comp.width / 2, y };
      card.props = { width: cardW, height: cardH, radius: cardH * 0.3, blur: 18, tint: hexToRgba(accent ?? "#14b8a6", 0.3), borderColor: "rgba(255,255,255,0.6)", style: "liquid" } as GlassLayerProps;
      let entry = makeText(comp, {
        content: item.text,
        fontSize: fitFont(item.text, Math.round(cardH * 0.4), cardW - cardH * 1.4),
        color: "#ffffff",
        align: "right",
        x: comp.width / 2 + cardW / 2 - cardH * 0.35,
        y,
        startTime: t,
        endTime: end,
        name: `Auto List ${li + 1}.${ii + 1}`,
        fontFamily: DISPLAY_FONT,
      });
      let check = makeText(comp, { content: "✓", fontSize: Math.round(cardH * 0.45), color: accent ?? "#5eead4", x: comp.width / 2 - cardW / 2 + cardH * 0.5, y, startTime: t + 0.1, endTime: end, name: `Auto List Check ${li + 1}.${ii + 1}` });
      check.props = { ...(check.props as TextLayerProps), glow: accent ?? "#5eead4" };
      entry = applyPresetToLayer(applyPresetToLayer(entry, "fadeUp", comp), "fadeOut", comp);
      check = applyPresetToLayer(applyPresetToLayer(check, "springIn", comp), "fadeOut", comp);
      newLayers.push(check, entry, applyPresetToLayer(applyPresetToLayer(card, "fadeUp", comp), "fadeOut", comp));
    });
  });

  // Key phrases, each in its look: neon sign, accent label box, glass pill, or kashida stretch.
  plan.keyPhrases.slice(0, 8).forEach((k, idx) => {
    const t = toCompTime(k.time);
    if (!inClip(t, 0.3)) return;
    const unit = Math.min(comp.width, comp.height);
    const look = k.look ?? "neon";
    const color = accent ? lighten(accent, 0.45) : NEON;
    if (!claim(t, Math.min(t + 2.4, sourceLayer.endTime))) return;
    if (look === "card" && plan.style !== "editorial") {
      const cardEnd = Math.min(t + 0.9, sourceLayer.endTime);
      const m = /\[([^\]]+)\]/.exec(k.text);
      // In front of everything, captions included: it's a full-frame cut.
      newLayers.unshift(...typeCard(comp, m ? m[1] : k.text, t, cardEnd, accent ?? (trend ? "#c8ff00" : "#ffffff"), `Auto Type Card ${idx + 1}`));
      return;
    }
    if (trend) {
      const m = /\[([^\]]+)\]/.exec(k.text);
      const main = m ? m[1] : k.text;
      const kicker = m ? k.text.replace(m[0], "").replace(/\s+/g, " ").trim() : "";
      newLayers.push(...trendHeadline(comp, kicker, main, t, Math.min(t + 2.4, sourceLayer.endTime), accentE, `Auto Key Phrase ${idx + 1}`, idx + 1));
      return;
    }
    if (editorial) {
      // The [bracketed] word becomes the heavy line; the rest of the phrase is its kicker.
      const m = /\[([^\]]+)\]/.exec(k.text);
      const main = m ? m[1] : k.text;
      const kicker = m ? k.text.replace(m[0], "").replace(/\s+/g, " ").trim() : "";
      const y = comp.height * (vertical ? (idx % 2 ? 0.3 : 0.26) : 0.32);
      newLayers.push(...editorialHeadline(comp, kicker, main, y, t, Math.min(t + 2.4, sourceLayer.endTime), accentE, `Auto Key Phrase ${idx + 1}`, idx + 3));
      return;
    }
    const text = look === "box" || look === "glass" ? k.text.replace(/[[\]]/g, "") : k.text;
    const desired = Math.round(unit * (look === "glass" ? 0.065 : look === "box" ? 0.075 : 0.11));
    let phrase = makeText(comp, {
      content: text,
      fontSize: fitFont(text, desired, comp.width * (look === "stretch" ? 0.62 : 0.8)),
      color: look === "neon" ? color : "#ffffff",
      x: comp.width / 2,
      y: comp.height * (vertical ? 0.52 : 0.45),
      startTime: t,
      endTime: Math.min(t + 2.4, sourceLayer.endTime),
      name: `Auto Key Phrase ${idx + 1}`,
      fontFamily: DISPLAY_FONT,
    });
    const props = phrase.props as TextLayerProps;
    if (look === "neon") phrase.props = { ...props, glow: color, emphasisColor: "#ffffff" };
    else if (look === "box") phrase.props = { ...props, box: accent ?? "#6d28d9", wipeIn: 0.45 };
    else if (look === "glass") phrase.props = { ...props, box: "glass", emphasisColor: color };
    else phrase.props = { ...props, stretchIn: 0.8, emphasisColor: color };
    const entrance = look === "box" ? "slideInRight" : look === "glass" ? "springIn" : look === "stretch" ? "fadeIn" : "popIn";
    phrase = applyPresetToLayer(applyPresetToLayer(phrase, entrance, comp), "fadeOut", comp);
    newLayers.push(phrase);
  });

  // Sound effects at their moments, each spanning only its own length.
  plan.sounds
    .filter((s) => !editorial || !LOUD_SOUNDS.has(s.sound))
    .slice(0, 20)
    .forEach((s, idx) => {
    const t = toCompTime(s.time);
    if (!inClip(t)) return;
    const layer = createLayer("audio", comp);
    layer.name = `Auto Sound ${idx + 1} (${s.sound})`;
    layer.startTime = t;
    layer.endTime = Math.min(t + 1.3, Math.max(sourceLayer.endTime, t + 0.2));
    const srcId = soundSrcId(s.sound);
    layer.props = { src: `sound:${srcId}`, fileName: `${s.sound}${srcId.startsWith("pack:") ? ".mp3" : ".wav"}`, trimIn: 0, naturalDuration: 1.3, muted: false };
    newLayers.push(layer);
  });

  if (plan.cta) {
    const ctaStart = Math.max(sourceLayer.startTime, sourceLayer.endTime - 2.5);
    if (editorial) {
      const unit = Math.min(comp.width, comp.height);
      let c = makeText(comp, { content: plan.cta, fontSize: fitFont(plan.cta, Math.round(unit * 0.05), comp.width * 0.8), color: "#ffffff", x: comp.width / 2, y: comp.height * (vertical ? 0.9 : 0.88), startTime: ctaStart, endTime: sourceLayer.endTime, name: "Auto CTA", fontFamily: KICKER_FONT });
      c.props = { ...(c.props as TextLayerProps), bold: true };
      newLayers.push(applyPresetToLayer(c, "fadeUp", comp));
      newLayers.push(ruleAt(comp, comp.width / 2 + unit * 0.06, comp.height * (vertical ? 0.87 : 0.84), unit * 0.12, accentE, ctaStart + 0.2, sourceLayer.endTime, "Auto CTA Rule"));
    } else {
      newLayers.push(...ctaButtonAt(comp, plan.cta, ctaStart, sourceLayer.endTime));
    }
  }

  // Zoom "punches", applied directly to the source layer's own scale.
  const updatedSourceLayer: Layer = JSON.parse(JSON.stringify(sourceLayer));
  if (segments) (updatedSourceLayer.props as VideoLayerProps).segments = segments;
  const baseScale = updatedSourceLayer.transform.scale.static;
  const scaleKfs = [...updatedSourceLayer.transform.scale.keyframes];
  let lastZoom = -Infinity;
  [...plan.zooms]
    .sort((a, b) => a.time - b.time)
    .slice(0, 24)
    .forEach((z) => {
      const t = toCompTime(z.time);
      if (t <= sourceLayer.startTime + 0.2 || t >= sourceLayer.endTime - 0.5 || t - lastZoom < 0.8) return;
      lastZoom = t;
      if (editorial) {
        if (z.strength === "strong") {
          // Jump-cut punch-in: an instant cut to a tighter frame, held, then an instant cut back.
          const k = 1.14;
          const hold = Math.min(1.8, Math.max(0.6, sourceLayer.endTime - t - 0.3));
          scaleKfs.push({ id: makeId("kf"), time: t - 0.01, value: baseScale, easing: "linear" });
          scaleKfs.push({ id: makeId("kf"), time: t, value: { x: baseScale.x * k, y: baseScale.y * k }, easing: "linear" });
          scaleKfs.push({ id: makeId("kf"), time: t + hold, value: { x: baseScale.x * k, y: baseScale.y * k }, easing: "linear" });
          scaleKfs.push({ id: makeId("kf"), time: t + hold + 0.01, value: baseScale, easing: "linear" });
          lastZoom = t + hold;
        } else {
          // Slow push-in, like a dolly: barely noticed, but it keeps the frame alive.
          const dur = Math.min(3.2, Math.max(1, sourceLayer.endTime - t - 0.2));
          scaleKfs.push({ id: makeId("kf"), time: t, value: baseScale, easing: "easeInOut" });
          scaleKfs.push({ id: makeId("kf"), time: t + dur, value: { x: baseScale.x * 1.05, y: baseScale.y * 1.05 }, easing: "easeInOut" });
          scaleKfs.push({ id: makeId("kf"), time: t + dur + 0.8, value: baseScale, easing: "easeInOut" });
          lastZoom = t + dur + 0.8;
        }
        return;
      }
      // Punch in and hold, the way editors cut to a closer shot, then ease back out.
      const k = z.strength === "strong" ? 1.18 : 1.08;
      const hold = Math.min(1.6, Math.max(0.5, sourceLayer.endTime - t - 0.4));
      scaleKfs.push({ id: makeId("kf"), time: t - 0.06, value: baseScale, easing: "easeOut" });
      scaleKfs.push({ id: makeId("kf"), time: t + 0.1, value: { x: baseScale.x * k, y: baseScale.y * k }, easing: "linear" });
      scaleKfs.push({ id: makeId("kf"), time: t + hold, value: { x: baseScale.x * k, y: baseScale.y * k }, easing: "easeInOut" });
      scaleKfs.push({ id: makeId("kf"), time: t + hold + 0.3, value: baseScale, easing: "easeInOut" });
      lastZoom = t + hold;
    });
  scaleKfs.sort((a, b) => a.time - b.time);
  updatedSourceLayer.transform.scale = { static: baseScale, keyframes: scaleKfs };

  // B-roll placeholders: top half in portrait (fading into the speaker below), full frame in landscape.
  (plan.broll ?? []).forEach((b, idx) => {
    const t = toCompTime(b.start);
    if (!inClip(t, 0.5)) return;
    const slot = createLayer("image", comp);
    slot.name = `B-roll ${idx + 1}: ${b.description}`;
    slot.startTime = t;
    slot.endTime = Math.min(sourceLayer.endTime, toCompTime(b.end));
    const h = vertical ? comp.height * 0.5 : comp.height;
    slot.transform.position.static = { x: comp.width / 2, y: vertical ? h / 2 : comp.height / 2 };
    slot.props = { src: "", width: comp.width, height: h, fit: "cover", fadeBottom: vertical ? 0.35 : undefined };
    newLayers.push(applyPresetToLayer(applyPresetToLayer(slot, "fadeIn", comp), "fadeOut", comp));
  });

  // A person cutout keeps the speaker in front of B-roll (so cutaways never cover the face), keeps
  // them in color over a B&W/dim/blurred background, and — with "text behind" — in front of the text.
  const hasBroll = newLayers.some((l) => l.name.startsWith("B-roll"));
  if ((plan.textBehind || plan.backgroundLook || hasBroll) && sourceLayer.type === "video") {
    const isBroll = (l: Layer) => l.name.startsWith("B-roll");
    const front = (l: Layer) => l.name === "Auto Captions" || l.name.startsWith("Auto List") || l.name.startsWith("Auto CTA") || l.type === "audio";
    const cutout = createLayer("cutout", comp);
    cutout.name = plan.textBehind ? "Auto Person (text behind)" : "Auto Person";
    cutout.startTime = sourceLayer.startTime;
    cutout.endTime = sourceLayer.endTime;
    cutout.props = { sourceLayerId: sourceLayer.id, feather: 2 };
    const fronts = newLayers.filter((l) => !isBroll(l) && front(l));
    const middles = newLayers.filter((l) => !isBroll(l) && !front(l));
    const brolls = newLayers.filter(isBroll);
    const reordered = plan.textBehind ? [...fronts, cutout, ...middles, ...brolls] : [...fronts, ...middles, cutout, ...brolls];
    newLayers.length = 0;
    newLayers.push(...reordered);
  }
  if (plan.studioBackground && sourceLayer.type === "video") {
    const base = accent ?? "#3a3f4b";
    (updatedSourceLayer.props as VideoLayerProps).background = { kind: "studio", color: darken(base, 0.45), color2: "#05060a" };
  }
  if (plan.backgroundLook && sourceLayer.type === "video") {
    (updatedSourceLayer.props as VideoLayerProps).look = plan.backgroundLook;
  }

  const compPatch: Partial<Composition> = {};
  if (sourceLayer.endTime > comp.duration) compPatch.duration = sourceLayer.endTime;
  // The clip got shorter: if it was what set the project's length, shrink the project with it.
  if (segments && originalEnd >= comp.duration - 0.05) {
    const othersEnd = Math.max(0, ...comp.layers.filter((l) => l.id !== sourceLayer.id).map((l) => l.endTime));
    compPatch.duration = Math.max(sourceLayer.endTime, Math.min(othersEnd, comp.duration));
  }
  if (plan.colorGrade) compPatch.colorGrade = plan.colorGrade;

  return { newLayers, updatedSourceLayer, compPatch };
}
