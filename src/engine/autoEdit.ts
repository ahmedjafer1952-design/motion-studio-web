import type { CaptionLayerProps, CaptionWord, Composition, Layer } from "../types";
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

// --- Assembly --------------------------------------------------------------

export function buildAutoEdit(
  comp: Composition,
  sourceLayer: Layer,
  words: TranscribedWord[],
  sourceTrimIn: number,
  opts: AutoEditOptions
): AutoEditResult {
  const analysis = analyzeSpeech(words, opts.pace);
  const newLayers: Layer[] = [];
  const toCompTime = (sourceTime: number) => sourceLayer.startTime + (sourceTime - sourceTrimIn);

  // Captions, spanning the full source clip, with heuristic emphasis highlighting.
  const captionWords: CaptionWord[] = words.map((w, i) => ({
    id: makeId("word"),
    text: w.text,
    start: w.start,
    end: w.end,
    emphasis: analysis.emphasisIndices.has(i),
  }));
  const captions = createLayer("caption", comp);
  captions.name = "Auto Captions";
  captions.startTime = sourceLayer.startTime;
  captions.endTime = sourceLayer.endTime;
  captions.props = {
    words: captionWords,
    style: "emphasisOnly",
    fontSize: 52,
    color: "#ffffff",
    emphasisColor: "#ffd166",
    fontFamily: "Arial, sans-serif",
    sourceTrimIn,
    sourceLayerName: sourceLayer.name,
  } as CaptionLayerProps;
  newLayers.push(captions);

  if (opts.title) {
    newLayers.push(...titleCardAt(comp, opts.title, sourceLayer.startTime, Math.min(sourceLayer.startTime + 2.5, sourceLayer.endTime)));
  }

  // Big-number callouts, top-right so they don't collide with captions at the bottom.
  analysis.numbers.slice(0, 6).forEach((n, idx) => {
    const t = toCompTime(n.time);
    if (t < sourceLayer.startTime || t > sourceLayer.endTime - 0.3) return;
    let num = makeText(comp, {
      content: n.text,
      fontSize: 120,
      color: "#ffffff",
      x: comp.width * 0.78,
      y: comp.height * 0.22,
      startTime: t,
      endTime: Math.min(t + 1.8, sourceLayer.endTime),
      name: `Auto Number ${idx + 1}`,
    });
    num = applyPresetToLayer(num, "popIn", comp);
    newLayers.push(num);
  });

  // Animated list items, each appearing exactly when its marker is spoken.
  analysis.lists.forEach((list, li) => {
    list.items.forEach((item, ii) => {
      const t = toCompTime(item.time);
      if (t < sourceLayer.startTime || t > sourceLayer.endTime) return;
      let entry = makeText(comp, {
        content: `• ${item.text}`,
        fontSize: 32,
        color: "#ffffff",
        align: "right",
        x: comp.width * 0.7,
        y: comp.height * 0.3 + ii * 64,
        startTime: t,
        endTime: sourceLayer.endTime,
        name: `Auto List ${li + 1}.${ii + 1}`,
      });
      entry = applyPresetToLayer(applyPresetToLayer(entry, "slideInRight", comp), "fadeIn", comp);
      newLayers.push(entry);
    });
  });

  if (opts.cta) {
    const ctaStart = Math.max(sourceLayer.startTime, sourceLayer.endTime - 2.5);
    newLayers.push(...ctaButtonAt(comp, opts.cta, ctaStart, sourceLayer.endTime));
  }

  // Zoom "punches" on pauses, applied directly to the source layer's own scale.
  const updatedSourceLayer: Layer = JSON.parse(JSON.stringify(sourceLayer));
  const baseScale = updatedSourceLayer.transform.scale.static;
  const scaleKfs = [...updatedSourceLayer.transform.scale.keyframes];
  analysis.pausePoints.slice(0, 14).forEach((pausePoint) => {
    const t = toCompTime(pausePoint);
    if (t <= sourceLayer.startTime + 0.2 || t >= sourceLayer.endTime - 0.2) return;
    scaleKfs.push({ id: makeId("kf"), time: t - 0.08, value: baseScale, easing: "easeOut" });
    scaleKfs.push({ id: makeId("kf"), time: t + 0.08, value: { x: baseScale.x * 1.06, y: baseScale.y * 1.06 }, easing: "easeOut" });
    scaleKfs.push({ id: makeId("kf"), time: t + 0.4, value: baseScale, easing: "easeInOut" });
  });
  scaleKfs.sort((a, b) => a.time - b.time);
  updatedSourceLayer.transform.scale = { static: baseScale, keyframes: scaleKfs };

  const compPatch: Partial<Composition> = {};
  if (sourceLayer.endTime > comp.duration) compPatch.duration = sourceLayer.endTime;

  return { newLayers, updatedSourceLayer, compPatch };
}
