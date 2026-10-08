import type { CaptionLayerProps, CaptionStyle, CaptionWord, ColorGradeId, Composition, Layer, TextLayerProps } from "../types";
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

function titleCardAt(comp: Composition, text: string, start: number, end: number): Layer[] {
  const cx = comp.width / 2;
  const cy = comp.height * 0.4;
  let title = makeText(comp, { content: text, fontSize: 68, color: "#ffffff", x: cx, y: cy, startTime: start, endTime: end, name: "Auto Title" });
  let bar = makeRect(comp, { width: 240, height: 8, color: "#4f8cff", radius: 4, x: cx, y: cy + 54, startTime: Math.min(start + 0.15, end), endTime: end, name: "Auto Title Bar" });
  title = applyPresetToLayer(applyPresetToLayer(title, "slideInTop", comp), "fadeIn", comp);
  bar = applyPresetToLayer(bar, "fadeIn", comp);
  return [title, bar];
}

function ctaButtonAt(comp: Composition, text: string, start: number, end: number): Layer[] {
  const w = 260;
  const h = 68;
  const x = comp.width / 2;
  const y = comp.height * 0.85;
  let pill = makeRect(comp, { width: w, height: h, color: "#4f8cff", radius: h / 2, x, y, startTime: start, endTime: end, name: "Auto CTA" });
  let label = makeText(comp, { content: text, fontSize: 28, color: "#ffffff", x, y, startTime: start, endTime: end, name: "Auto CTA Text" });
  pill = applyPresetToLayer(pill, "popIn", comp);
  label = applyPresetToLayer(label, "popIn", comp);
  return [label, pill];
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
    captionStyle: "emphasisOnly",
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
    emphasisColor: "#ffd166",
    fontFamily: "'Cairo', sans-serif",
    sourceTrimIn,
    sourceLayerName: sourceLayer.name,
  } as CaptionLayerProps;
  newLayers.push(captions);

  if (plan.title) {
    newLayers.push(...titleCardAt(comp, plan.title, sourceLayer.startTime, Math.min(sourceLayer.startTime + 2.5, sourceLayer.endTime)));
  }

  // Big-number callouts, upper area so they don't collide with captions at the bottom.
  plan.numbers.slice(0, 8).forEach((n, idx) => {
    const t = toCompTime(n.time);
    if (!inClip(t, 0.3)) return;
    const end = Math.min(t + 2.2, sourceLayer.endTime);
    const x = vertical ? comp.width / 2 : comp.width * 0.78;
    const y = comp.height * 0.22;
    let num = makeText(comp, { content: n.text, fontSize: Math.round(comp.height * 0.16), color: "#ffffff", x, y, startTime: t, endTime: end, name: `Auto Number ${idx + 1}`, fontFamily: "'Cairo', sans-serif" });
    num = applyPresetToLayer(num, "popIn", comp);
    newLayers.push(num);
    if (n.label) {
      let label = makeText(comp, { content: n.label, fontSize: Math.round(comp.height * 0.04), color: "#ffd166", x, y: y + comp.height * 0.11, startTime: Math.min(t + 0.15, end), endTime: end, name: `Auto Number Label ${idx + 1}`, fontFamily: "'Cairo', sans-serif" });
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
    phrase.props = { ...(phrase.props as TextLayerProps), bold: true, emphasisColor: "#ffd166" };
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
      const k = z.strength === "strong" ? 1.12 : 1.06;
      scaleKfs.push({ id: makeId("kf"), time: t - 0.08, value: baseScale, easing: "easeOut" });
      scaleKfs.push({ id: makeId("kf"), time: t + 0.08, value: { x: baseScale.x * k, y: baseScale.y * k }, easing: "easeOut" });
      scaleKfs.push({ id: makeId("kf"), time: t + 0.45, value: baseScale, easing: "easeInOut" });
    });
  scaleKfs.sort((a, b) => a.time - b.time);
  updatedSourceLayer.transform.scale = { static: baseScale, keyframes: scaleKfs };

  const compPatch: Partial<Composition> = {};
  if (sourceLayer.endTime > comp.duration) compPatch.duration = sourceLayer.endTime;
  if (plan.colorGrade) compPatch.colorGrade = plan.colorGrade;

  return { newLayers, updatedSourceLayer, compPatch };
}
