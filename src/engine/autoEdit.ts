import type { GlassLayerProps, CaptionLayerProps, CaptionStyle, CaptionWord, ColorGradeId, Composition, Layer, TextLayerProps } from "../types";
import type { SoundId } from "./sounds";
import { createLayer } from "./factory";
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
  const fontSize = Math.round(unit * 0.085);
  const card = createLayer("glass", comp);
  card.name = "Auto Title Glass";
  card.startTime = start;
  card.endTime = end;
  card.transform.position.static = { x: cx, y: cy };
  card.props = {
    width: Math.round(unit * 0.62),
    height: Math.round(fontSize * (lines.length * 1.25 + 0.9)),
    radius: Math.round(unit * 0.05),
    blur: 22,
    tint: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.45)",
  } as GlassLayerProps;
  const out: Layer[] = [];
  lines.forEach((line, i) => {
    let t = makeText(comp, { content: line, fontSize, color: "#ffffff", x: cx, y: cy + (i - (lines.length - 1) / 2) * fontSize * 1.25, startTime: start, endTime: end, name: `Auto Title ${i + 1}`, fontFamily: DISPLAY_FONT });
    t.props = { ...(t.props as TextLayerProps), stretchIn: 0.7 };
    out.push(applyPresetToLayer(t, "fadeIn", comp));
  });
  return [...out, applyPresetToLayer(applyPresetToLayer(card, "popIn", comp), "fadeOut", comp)];
}

/** Tilted call-to-action in the top corner, like the "بالتعليقات" stamp in pro edits. */
function ctaButtonAt(comp: Composition, text: string, start: number, end: number): Layer[] {
  const unit = Math.min(comp.width, comp.height);
  let label = makeText(comp, { content: text, fontSize: Math.round(unit * 0.075), color: "#ffffff", x: comp.width * 0.27, y: comp.height * 0.1, startTime: start, endTime: end, name: "Auto CTA", fontFamily: DISPLAY_FONT });
  label.transform.rotation.static = -40;
  label.props = { ...(label.props as TextLayerProps), glow: "rgba(0,0,0,0.55)" };
  return [applyPresetToLayer(label, "popIn", comp)];
}

// --- Edit plan --------------------------------------------------------------
// Whatever decides the edit (the built-in rules below, or Claude) produces an EditPlan in
// source-clip seconds; buildEditFromPlan turns it into layers. Keeping the two apart means
// both brains share exactly the same, tested layout code.

export interface EditPlan {
  /** Transcript to caption — may carry corrected wording, same timings. */
  words: TranscribedWord[];
  emphasis: Set<number>;
  captionStyle: CaptionStyle;
  title: string | null;
  numbers: { text: string; label: string; time: number }[];
  lists: { items: { text: string; time: number }[] }[];
  /** Short on-screen punchlines; a [bracketed] word gets the highlight color. */
  keyPhrases: { text: string; time: number }[];
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
  const toCompTime = (sourceTime: number) => sourceLayer.startTime + (sourceTime - sourceTrimIn);
  const inClip = (t: number, tail = 0) => t >= sourceLayer.startTime && t <= sourceLayer.endTime - tail;
  const vertical = comp.height > comp.width;

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
    emphasisColor: plan.captionStyle === "phraseStack" ? ACCENT_RED : "#ffd166",
    fontFamily: plan.captionStyle === "phraseStack" ? DISPLAY_FONT : "'Cairo', sans-serif",
    sourceTrimIn,
    sourceLayerName: sourceLayer.name,
  } as CaptionLayerProps;
  if (plan.captionStyle === "phraseStack") {
    captions.transform.position.static = { x: comp.width / 2, y: comp.height * (vertical ? 0.62 : 0.72) };
    (captions.props as CaptionLayerProps).fontSize = Math.round(Math.min(comp.width, comp.height) * 0.085);
  }
  newLayers.push(captions);

  if (plan.title) {
    newLayers.push(...titleCardAt(comp, plan.title, sourceLayer.startTime, Math.min(sourceLayer.startTime + 2.5, sourceLayer.endTime)));
  }

  // Big-number callouts, upper area so they don't collide with captions at the bottom.
  plan.numbers.slice(0, 8).forEach((n, idx) => {
    const t = toCompTime(n.time);
    if (!inClip(t, 0.3)) return;
    const end = Math.min(t + 2.2, sourceLayer.endTime);
    // Huge hollow neon number in the top corner, like a lit sign.
    const x = vertical ? comp.width * 0.2 : comp.width * 0.78;
    const y = comp.height * (vertical ? 0.17 : 0.24);
    let num = makeText(comp, { content: n.text, fontSize: Math.round(comp.height * (n.text.length <= 2 ? 0.2 : 0.12)), color: "#ffffff", x, y, startTime: t, endTime: end, name: `Auto Number ${idx + 1}`, fontFamily: "'Playfair Display', serif" });
    num.props = { ...(num.props as TextLayerProps), outline: true, glow: "rgba(255,255,255,0.9)" };
    num = applyPresetToLayer(num, "popIn", comp);
    newLayers.push(num);
    if (n.label) {
      let label = makeText(comp, { content: n.label, fontSize: Math.round(Math.min(comp.width, comp.height) * 0.085), color: "#ffffff", x: vertical ? comp.width / 2 : x, y: vertical ? comp.height * 0.4 : y + comp.height * 0.11, startTime: Math.min(t + 0.15, end), endTime: end, name: `Auto Number Label ${idx + 1}`, fontFamily: DISPLAY_FONT });
      label.props = { ...(label.props as TextLayerProps), stretchIn: 0.5, glow: "rgba(0,0,0,0.5)" };
      label = applyPresetToLayer(label, "fadeIn", comp);
      newLayers.push(label);
    }
  });

  // Animated list items, each appearing exactly when it's spoken.
  plan.lists.forEach((list, li) => {
    const listEnd = sourceLayer.endTime;
    list.items.slice(0, 6).forEach((item, ii) => {
      const t = toCompTime(item.time);
      if (!inClip(t)) return;
      let entry = makeText(comp, {
        content: `• ${item.text}`,
        fontSize: Math.round(Math.min(comp.width, comp.height) * 0.045),
        color: "#ffffff",
        align: "right",
        x: comp.width * (vertical ? 0.9 : 0.7),
        y: comp.height * 0.3 + ii * Math.min(comp.width, comp.height) * 0.09,
        startTime: t,
        endTime: listEnd,
        name: `Auto List ${li + 1}.${ii + 1}`,
        fontFamily: "'Cairo', sans-serif",
      });
      entry = applyPresetToLayer(applyPresetToLayer(entry, "slideInRight", comp), "fadeIn", comp);
      newLayers.push(entry);
    });
  });

  // Key phrases: short highlighted punchlines in the middle of the frame.
  plan.keyPhrases.slice(0, 8).forEach((k, idx) => {
    const t = toCompTime(k.time);
    if (!inClip(t, 0.3)) return;
    let phrase = makeText(comp, {
      content: k.text,
      fontSize: Math.round(Math.min(comp.width, comp.height) * 0.07),
      color: "#ffffff",
      x: comp.width / 2,
      y: comp.height * (vertical ? 0.42 : 0.45),
      startTime: t,
      endTime: Math.min(t + 2.4, sourceLayer.endTime),
      name: `Auto Key Phrase ${idx + 1}`,
      fontFamily: "'Cairo', sans-serif",
    });
    // Neon sign look: glowing blue display type, the bracketed word in red.
    phrase.props = { ...(phrase.props as TextLayerProps), fontFamily: DISPLAY_FONT, fontSize: Math.round(Math.min(comp.width, comp.height) * 0.11), color: NEON, glow: NEON, emphasisColor: "#9fdcff" };
    phrase = applyPresetToLayer(applyPresetToLayer(phrase, "popIn", comp), "fadeOut", comp);
    newLayers.push(phrase);
  });

  // Sound effects at their moments, each spanning only its own length.
  plan.sounds.slice(0, 20).forEach((s, idx) => {
    const t = toCompTime(s.time);
    if (!inClip(t)) return;
    const layer = createLayer("audio", comp);
    layer.name = `Auto Sound ${idx + 1} (${s.sound})`;
    layer.startTime = t;
    layer.endTime = Math.min(t + 1.3, Math.max(sourceLayer.endTime, t + 0.2));
    layer.props = { src: `sound:${s.sound}`, fileName: `${s.sound}.wav`, trimIn: 0, naturalDuration: 1.3, muted: false };
    newLayers.push(layer);
  });

  if (plan.cta) {
    const ctaStart = Math.max(sourceLayer.startTime, sourceLayer.endTime - 2.5);
    newLayers.push(...ctaButtonAt(comp, plan.cta, ctaStart, sourceLayer.endTime));
  }

  // Zoom "punches", applied directly to the source layer's own scale.
  const updatedSourceLayer: Layer = JSON.parse(JSON.stringify(sourceLayer));
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

  const compPatch: Partial<Composition> = {};
  if (sourceLayer.endTime > comp.duration) compPatch.duration = sourceLayer.endTime;
  if (plan.colorGrade) compPatch.colorGrade = plan.colorGrade;

  return { newLayers, updatedSourceLayer, compPatch };
}
