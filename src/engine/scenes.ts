import type { Composition, Keyframe, Layer, Point } from "../types";
import { makeEllipse, makeImage, makeRect, makeText } from "./builders";
import { staticProp } from "./factory";
import { applyPresetToLayer } from "./presets";
import { makeId } from "../utils/id";

type SceneType = "neon" | "product" | "mockup" | "collage" | "note" | "bounce";
export type SceneId = `${SceneType}-0` | `${SceneType}-1` | `${SceneType}-2` | `${SceneType}-3`;

export interface SceneDef {
  id: SceneId;
  label: string;
  description: string;
}

interface SceneResult {
  backgroundColor: string;
  layers: Layer[];
}

const SCENE_LABELS: Record<SceneType, { label: string; description: string }> = {
  neon: { label: "Neon", description: "Glowing neon halo behind your product" },
  product: { label: "Realistic Product", description: "Clean studio stage with a soft shadow" },
  mockup: { label: "3D Mockup", description: "Tilted device-frame mockup" },
  collage: { label: "Paper Collage", description: "Scattered scrapbook paper cutouts" },
  note: { label: "Pinned Note", description: "A pinned sticky note accent" },
  bounce: { label: "Bouncing Words", description: "Kinetic typography, no product focus needed" },
};

const VARIANT_NAMES = ["Variant 1", "Variant 2", "Variant 3", "Variant 4"];

export const FACELESS_SCENES: SceneDef[] = (Object.keys(SCENE_LABELS) as SceneType[]).flatMap((type) =>
  ([0, 1, 2, 3] as const).map((v) => ({
    id: `${type}-${v}` as SceneId,
    label: `${SCENE_LABELS[type].label} — ${VARIANT_NAMES[v]}`,
    description: SCENE_LABELS[type].description,
  }))
);

/** Adds a smooth, continuous up/down float (the "ارتداد ناعم" bounce) to a layer's position. */
function addFloatLoop(layer: Layer, amplitude: number, period: number, startDelay = 0.35): Layer {
  const copy: Layer = JSON.parse(JSON.stringify(layer));
  const base = (copy.transform.position.static ?? { x: 0, y: 0 }) as Point;
  const kfs: Keyframe<Point>[] = [{ id: makeId("kf"), time: copy.startTime, value: base, easing: "linear" }];
  let t = copy.startTime + startDelay;
  let up = true;
  while (t < copy.endTime - 0.1) {
    kfs.push({ id: makeId("kf"), time: t, value: { x: base.x, y: base.y + (up ? -amplitude : amplitude) }, easing: "easeInOut" });
    up = !up;
    t += period / 2;
  }
  copy.transform.position = { static: base, keyframes: kfs };
  return copy;
}

function withOpacity(layer: Layer, opacity: number): Layer {
  const copy: Layer = JSON.parse(JSON.stringify(layer));
  copy.transform.opacity = staticProp(opacity);
  return copy;
}

// --- Neon --------------------------------------------------------------

const NEON_PALETTES = [
  { bg: "#0a0a0f", glow: "#ff2bd6", accent: "#00e5ff", text: "#ffffff" },
  { bg: "#0d0a14", glow: "#7c3aed", accent: "#22d3ee", text: "#ffffff" },
  { bg: "#0a0f0a", glow: "#39ff14", accent: "#ff2bd6", text: "#ffffff" },
  { bg: "#140a0a", glow: "#ffb703", accent: "#fb5607", text: "#ffffff" },
];

function neonScene(comp: Composition, v: number): SceneResult {
  const pal = NEON_PALETTES[v];
  const cx = comp.width / 2;
  const cy = comp.height / 2;
  const haloOuter = withOpacity(
    makeEllipse(comp, { width: 520, height: 520, color: pal.glow, x: cx, y: cy, name: "Neon Halo Outer" }),
    0.12
  );
  const haloMid = withOpacity(
    makeEllipse(comp, { width: 360, height: 360, color: pal.glow, x: cx, y: cy, name: "Neon Halo Mid" }),
    0.22
  );
  let product = makeImage(comp, { width: 320, height: 320, x: cx, y: cy, name: "Your Product" });
  product = applyPresetToLayer(product, "popIn", comp);
  product = addFloatLoop(product, 14, 1.8);

  let title = makeText(comp, { content: "اسم المنتج", fontSize: 54, color: pal.accent, x: cx, y: comp.height * 0.15, name: "Neon Title" });
  title = applyPresetToLayer(applyPresetToLayer(title, "slideInTop", comp), "fadeIn", comp);

  let sub = makeText(comp, { content: "جرّبه الآن", fontSize: 26, color: pal.text, x: cx, y: comp.height * 0.88, startTime: 0.3, name: "Neon Subtitle" });
  sub = applyPresetToLayer(sub, "fadeIn", comp);

  return { backgroundColor: pal.bg, layers: [sub, title, product, haloMid, haloOuter] };
}

// --- Realistic product ---------------------------------------------------

const PRODUCT_PALETTES = [
  { bg: "#f5f1ea", stage: "#e4ddcf", text: "#222222", accent: "#b08d57" },
  { bg: "#eef3f7", stage: "#d7e3ec", text: "#1c2733", accent: "#4f8cff" },
  { bg: "#fdf0f0", stage: "#f3d9d9", text: "#3a1f1f", accent: "#d16666" },
  { bg: "#f0f5ee", stage: "#dbe8d4", text: "#1f2e1a", accent: "#6a9c5a" },
];

function productScene(comp: Composition, v: number): SceneResult {
  const pal = PRODUCT_PALETTES[v];
  const cx = comp.width / 2;
  const cy = comp.height * 0.52;

  const shadow = withOpacity(
    makeEllipse(comp, { width: 380, height: 70, color: "#000000", x: cx, y: cy + 190, name: "Product Shadow" }),
    0.16
  );
  let stage = makeRect(comp, { width: 480, height: 480, color: pal.stage, radius: 24, x: cx, y: cy, name: "Product Stage" });
  stage = applyPresetToLayer(stage, "fadeIn", comp);

  let product = makeImage(comp, { width: 360, height: 360, x: cx, y: cy, name: "Your Product" });
  product = applyPresetToLayer(product, "popIn", comp);
  product = addFloatLoop(product, 10, 2.2);

  let title = makeText(comp, { content: "اسم المنتج", fontSize: 48, color: pal.text, x: cx, y: comp.height * 0.14, name: "Product Title" });
  title = applyPresetToLayer(applyPresetToLayer(title, "fadeIn", comp), "slideInTop", comp);

  let cta = makeRect(comp, { width: 220, height: 64, color: pal.accent, radius: 32, x: cx, y: comp.height * 0.88, startTime: 0.4, name: "Product CTA" });
  let ctaText = makeText(comp, { content: "اطلب الآن", fontSize: 24, color: "#ffffff", x: cx, y: comp.height * 0.88, startTime: 0.4, name: "Product CTA Text" });
  cta = applyPresetToLayer(cta, "popIn", comp);
  ctaText = applyPresetToLayer(ctaText, "popIn", comp);

  return { backgroundColor: pal.bg, layers: [ctaText, cta, title, product, stage, shadow] };
}

// --- 3D mockup -----------------------------------------------------------

const MOCKUP_PALETTES = [
  { bg: "#1b1b1e", frame: "#2a2a30", screen: "#0e0e10", text: "#ffffff" },
  { bg: "#1a1f2e", frame: "#232a3d", screen: "#0c0f16", text: "#e8edf5" },
  { bg: "#2a1a1e", frame: "#3a2328", screen: "#160d0f", text: "#f5e8ea" },
  { bg: "#1a241e", frame: "#233a2a", screen: "#0e160f", text: "#e8f5ec" },
];

function mockupScene(comp: Composition, v: number): SceneResult {
  const pal = MOCKUP_PALETTES[v];
  const cx = comp.width / 2;
  const cy = comp.height / 2;
  const tilt = -6;

  let frame = makeRect(comp, { width: 420, height: 520, color: pal.frame, radius: 36, x: cx, y: cy, rotation: tilt, name: "Device Frame" });
  let screen = makeRect(comp, { width: 380, height: 460, color: pal.screen, radius: 20, x: cx, y: cy, rotation: tilt, name: "Device Screen" });
  let product = makeImage(comp, { width: 340, height: 420, x: cx, y: cy, rotation: tilt, name: "Your Product" });
  frame = applyPresetToLayer(applyPresetToLayer(frame, "slideInBottom", comp), "fadeIn", comp);
  screen = applyPresetToLayer(screen, "fadeIn", comp);
  product = applyPresetToLayer(product, "popIn", comp);
  product = addFloatLoop(product, 8, 2.4);

  let title = makeText(comp, { content: "اسم المنتج", fontSize: 46, color: pal.text, x: cx, y: comp.height * 0.12, name: "Mockup Title" });
  title = applyPresetToLayer(applyPresetToLayer(title, "fadeIn", comp), "slideInTop", comp);

  return { backgroundColor: pal.bg, layers: [title, product, screen, frame] };
}

// --- Paper collage ---------------------------------------------------------

const COLLAGE_PALETTES = [
  { bg: "#faf6ef", scrap1: "#ffd6e0", scrap2: "#d6f0ff", scrap3: "#fff3c4", text: "#2b2b2e" },
  { bg: "#f0f0f5", scrap1: "#d0e8ff", scrap2: "#ffe0d0", scrap3: "#e0ffe6", text: "#1a1a2e" },
  { bg: "#fff8f0", scrap1: "#ffe0e9", scrap2: "#e0f7ff", scrap3: "#f0e0ff", text: "#2e1a1a" },
  { bg: "#f5faf5", scrap1: "#d8f0d8", scrap2: "#f0d8e8", scrap3: "#d8e8f0", text: "#1a2e1a" },
];

function collageScene(comp: Composition, v: number): SceneResult {
  const pal = COLLAGE_PALETTES[v];
  const cx = comp.width / 2;
  const cy = comp.height / 2;

  let scrapA = makeRect(comp, { width: 260, height: 200, color: pal.scrap1, radius: 8, x: cx - 140, y: cy - 80, rotation: -10, name: "Paper Scrap A" });
  let scrapB = makeRect(comp, { width: 240, height: 220, color: pal.scrap2, radius: 8, x: cx + 150, y: cy + 40, rotation: 8, startTime: 0.1, name: "Paper Scrap B" });
  let scrapC = makeRect(comp, { width: 220, height: 180, color: pal.scrap3, radius: 8, x: cx - 60, y: cy + 140, rotation: -5, startTime: 0.2, name: "Paper Scrap C" });
  scrapA = applyPresetToLayer(scrapA, "popIn", comp);
  scrapB = applyPresetToLayer(scrapB, "popIn", comp);
  scrapC = applyPresetToLayer(scrapC, "popIn", comp);

  let product = makeImage(comp, { width: 300, height: 300, x: cx, y: cy, startTime: 0.35, name: "Your Product" });
  product = applyPresetToLayer(product, "popIn", comp);
  product = addFloatLoop(product, 10, 2.0, 0.6);

  let title = makeText(comp, {
    content: "اسم المنتج",
    fontSize: 44,
    color: pal.text,
    x: cx,
    y: comp.height * 0.14,
    fontFamily: "'Comic Sans MS', cursive",
    name: "Collage Title",
  });
  title = applyPresetToLayer(applyPresetToLayer(title, "fadeIn", comp), "popIn", comp);

  return { backgroundColor: pal.bg, layers: [title, product, scrapC, scrapB, scrapA] };
}

// --- Pinned note -------------------------------------------------------

const NOTE_PALETTES = [
  { bg: "#2b2b2e", note: "#fff3a0", pin: "#ff5d5d", text: "#2b2b1a" },
  { bg: "#23262b", note: "#a0e8ff", pin: "#ff5d5d", text: "#0f2e38" },
  { bg: "#2b2328", note: "#ffc6e0", pin: "#4f8cff", text: "#3a1a28" },
  { bg: "#232b26", note: "#c6ffcf", pin: "#ffb703", text: "#163a1d" },
];

function noteScene(comp: Composition, v: number): SceneResult {
  const pal = NOTE_PALETTES[v];
  const cx = comp.width / 2;
  const cy = comp.height / 2;

  let product = makeImage(comp, { width: 380, height: 380, x: cx, y: cy, name: "Your Product" });
  product = applyPresetToLayer(product, "popIn", comp);
  product = addFloatLoop(product, 12, 2.0);

  const noteW = 240;
  const noteH = 220;
  const noteX = comp.width * 0.78;
  const noteY = comp.height * 0.26;
  let note = makeRect(comp, { width: noteW, height: noteH, color: pal.note, radius: 6, x: noteX, y: noteY, rotation: -6, startTime: 0.3, name: "Sticky Note" });
  let pin = makeEllipse(comp, { width: 22, height: 22, color: pal.pin, x: noteX, y: noteY - noteH / 2 + 14, rotation: -6, startTime: 0.3, name: "Pin" });
  let noteText = makeText(comp, {
    content: "ملاحظة سريعة!",
    fontSize: 26,
    color: pal.text,
    x: noteX,
    y: noteY,
    rotation: -6,
    startTime: 0.3,
    fontFamily: "'Comic Sans MS', cursive",
    name: "Note Text",
  });
  note = applyPresetToLayer(note, "popIn", comp);
  pin = applyPresetToLayer(pin, "popIn", comp);
  noteText = applyPresetToLayer(noteText, "fadeIn", comp);

  let title = makeText(comp, { content: "اسم المنتج", fontSize: 48, color: "#ffffff", x: cx, y: comp.height * 0.86, name: "Note Scene Title" });
  title = applyPresetToLayer(applyPresetToLayer(title, "fadeIn", comp), "slideInBottom", comp);

  return { backgroundColor: pal.bg, layers: [noteText, pin, note, title, product] };
}

// --- Bouncing words ------------------------------------------------------

const BOUNCE_PALETTES = [
  { bg: "#0f0f12", colors: ["#ff2bd6", "#00e5ff", "#ffd166", "#7cff8a"] },
  { bg: "#12100f", colors: ["#ff6b6b", "#4f8cff", "#ffd166", "#a78bfa"] },
  { bg: "#0f120f", colors: ["#06d6a0", "#118ab2", "#ef476f", "#ffd166"] },
  { bg: "#120f12", colors: ["#f72585", "#7209b7", "#3a0ca3", "#4cc9f0"] },
];

function bounceScene(comp: Composition, v: number): SceneResult {
  const pal = BOUNCE_PALETTES[v];
  const words = ["مذهل", "جديد", "حصري", "الآن"];
  const positions = [
    { x: comp.width * 0.28, y: comp.height * 0.3 },
    { x: comp.width * 0.7, y: comp.height * 0.22 },
    { x: comp.width * 0.3, y: comp.height * 0.68 },
    { x: comp.width * 0.72, y: comp.height * 0.72 },
  ];
  const layers: Layer[] = words.map((word, i) => {
    let w = makeText(comp, {
      content: word,
      fontSize: 56,
      color: pal.colors[i % pal.colors.length],
      x: positions[i].x,
      y: positions[i].y,
      startTime: i * 0.2,
      name: `Word ${i + 1}`,
    });
    w = applyPresetToLayer(w, "popIn", comp);
    return addFloatLoop(w, 10, 1.6, 0.4);
  });

  let product = makeImage(comp, { width: 240, height: 240, x: comp.width / 2, y: comp.height / 2, startTime: 0.6, name: "Your Product" });
  product = applyPresetToLayer(product, "popIn", comp);

  return { backgroundColor: pal.bg, layers: [product, ...layers] };
}

export function buildScene(sceneId: SceneId, comp: Composition): SceneResult {
  const [type, variantStr] = sceneId.split("-") as [SceneType, string];
  const v = parseInt(variantStr, 10);
  switch (type) {
    case "neon":
      return neonScene(comp, v);
    case "product":
      return productScene(comp, v);
    case "mockup":
      return mockupScene(comp, v);
    case "collage":
      return collageScene(comp, v);
    case "note":
      return noteScene(comp, v);
    case "bounce":
      return bounceScene(comp, v);
  }
}
