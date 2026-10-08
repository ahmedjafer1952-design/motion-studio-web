import type { ChartLayerProps, Composition, Keyframe, Layer, Point, TextLayerProps } from "../types";
import { createLayer } from "./factory";
import { makeImage, makeRect, makeText } from "./builders";
import { applyPresetToLayer } from "./presets";
import { makeId } from "../utils/id";

export type TemplateId =
  | "titleCard"
  | "lowerThird"
  | "badge"
  | "ctaButton"
  | "bigNumber"
  | "animatedList"
  | "typewriterText"
  | "highlightText"
  | "countUpNumber"
  | "orbitingIcons"
  | "statCard"
  | "comparisonCard"
  | "wordReveal"
  | "markerHeadline"
  | "statHero"
  | "barChartStory"
  | "brandReveal";

export interface TemplateDef {
  id: TemplateId;
  label: string;
  description: string;
}

export const MOTION_TEMPLATES: TemplateDef[] = [
  { id: "wordReveal", label: "Word Reveal", description: "Words spring up one after another" },
  { id: "markerHeadline", label: "Marker Headline", description: "A highlighter bar wipes in behind the key line" },
  { id: "statHero", label: "Stat Hero", description: "Donut sweeps to a percentage with a headline" },
  { id: "barChartStory", label: "Bar Chart", description: "Bars grow one by one with counting values" },
  { id: "brandReveal", label: "Brand Reveal", description: "Name springs in, tagline rises, accent line draws" },
  { id: "titleCard", label: "Title Card", description: "Big heading + underline bar, slides and fades in" },
  { id: "lowerThird", label: "Lower Third", description: "Name / subtitle bar sliding in from the left" },
  { id: "badge", label: "Badge / Capsule", description: "Pill-shaped label that pops in" },
  { id: "ctaButton", label: "CTA Button", description: "Call-to-action pill with a looping pulse" },
  { id: "bigNumber", label: "Big Number", description: "A number that pops in large, for stats" },
  { id: "animatedList", label: "Animated List", description: "List items that appear one after another" },
  { id: "typewriterText", label: "Typewriter", description: "Text that types itself on, character by character" },
  { id: "highlightText", label: "Highlighted Text", description: "A line of text with one [word] in a different color" },
  { id: "countUpNumber", label: "Count-Up Number", description: "A number that counts up from 0 to its target" },
  { id: "orbitingIcons", label: "Orbiting Icons", description: "Icons circling smoothly around a center product" },
  { id: "statCard", label: "Stat Card", description: "Icon + number + label inside a boxed card" },
  { id: "comparisonCard", label: "Comparison Card", description: "Two numbers side by side — before / after" },
];

function titleCard(comp: Composition): Layer[] {
  const cx = comp.width / 2;
  const cy = comp.height * 0.4;
  let title = makeText(comp, { content: "العنوان هنا", fontSize: 72, color: "#ffffff", x: cx, y: cy, name: "Title" });
  let bar = makeRect(comp, {
    width: 260,
    height: 8,
    color: "#4f8cff",
    radius: 4,
    x: cx,
    y: cy + 56,
    startTime: 0.15,
    name: "Title Underline",
  });
  title = applyPresetToLayer(applyPresetToLayer(title, "slideInTop", comp), "fadeIn", comp);
  bar = applyPresetToLayer(bar, "fadeIn", comp);
  return [title, bar];
}

function lowerThird(comp: Composition): Layer[] {
  const barW = 420;
  const barH = 110;
  const x = barW / 2 + 40;
  const y = comp.height - barH / 2 - 60;
  let bar = makeRect(comp, { width: barW, height: barH, color: "#141418", radius: 10, x, y, name: "Lower Third Bar" });
  let accent = makeRect(comp, {
    width: 8,
    height: barH,
    color: "#4f8cff",
    radius: 4,
    x: x - barW / 2 + 4,
    y,
    name: "Lower Third Accent",
  });
  let name = makeText(comp, {
    content: "الاسم هنا",
    fontSize: 34,
    color: "#ffffff",
    align: "right",
    x: x + barW / 2 - 24,
    y: y - 14,
    name: "Lower Third Name",
  });
  let subtitle = makeText(comp, {
    content: "الوصف أو المسمى الوظيفي",
    fontSize: 20,
    color: "#9a9aa2",
    align: "right",
    x: x + barW / 2 - 24,
    y: y + 22,
    name: "Lower Third Subtitle",
  });
  bar = applyPresetToLayer(bar, "slideInLeft", comp);
  accent = applyPresetToLayer(accent, "slideInLeft", comp);
  name = applyPresetToLayer(applyPresetToLayer(name, "slideInLeft", comp), "fadeIn", comp);
  subtitle = applyPresetToLayer(applyPresetToLayer(subtitle, "slideInLeft", comp), "fadeIn", comp);
  return [name, subtitle, accent, bar];
}

function badge(comp: Composition): Layer[] {
  const w = 220;
  const h = 64;
  const x = comp.width / 2;
  const y = comp.height * 0.22;
  let pill = makeRect(comp, { width: w, height: h, color: "#1d1d22", radius: h / 2, x, y, name: "Badge" });
  let label = makeText(comp, { content: "جديد", fontSize: 28, color: "#ffd166", x, y, name: "Badge Text" });
  pill = applyPresetToLayer(pill, "popIn", comp);
  label = applyPresetToLayer(label, "popIn", comp);
  return [label, pill];
}

function ctaButton(comp: Composition): Layer[] {
  const w = 280;
  const h = 72;
  const x = comp.width / 2;
  const y = comp.height * 0.82;
  let pill = makeRect(comp, { width: w, height: h, color: "#4f8cff", radius: h / 2, x, y, name: "CTA Button" });
  let label = makeText(comp, { content: "تابعنا", fontSize: 30, color: "#ffffff", x, y, name: "CTA Text" });
  pill = applyPresetToLayer(pill, "popIn", comp);
  label = applyPresetToLayer(label, "popIn", comp);

  // A looping pulse on the button, continuing after the pop-in settles.
  const period = 1.1;
  const pulseStart = pill.startTime + 0.4;
  const keyframes = [...pill.transform.scale.keyframes];
  let t = pulseStart;
  let big = true;
  while (t < pill.endTime - 0.1) {
    keyframes.push({
      id: makeId("kf"),
      time: t,
      value: big ? { x: 1.06, y: 1.06 } : { x: 1, y: 1 },
      easing: "easeInOut",
    });
    big = !big;
    t += period / 2;
  }
  pill.transform.scale = { static: pill.transform.scale.static, keyframes };
  return [label, pill];
}

function bigNumber(comp: Composition): Layer[] {
  let number = makeText(comp, {
    content: "100",
    fontSize: 160,
    color: "#ffffff",
    x: comp.width / 2,
    y: comp.height / 2,
    name: "Big Number",
  });
  let label = makeText(comp, {
    content: "عميل سعيد",
    fontSize: 28,
    color: "#9a9aa2",
    x: comp.width / 2,
    y: comp.height / 2 + 100,
    startTime: 0.25,
    name: "Number Label",
  });
  number = applyPresetToLayer(number, "popIn", comp);
  label = applyPresetToLayer(label, "fadeIn", comp);
  return [label, number];
}

function animatedList(comp: Composition): Layer[] {
  const items = ["النقطة الأولى", "النقطة الثانية", "النقطة الثالثة"];
  const x = comp.width * 0.72;
  const y0 = comp.height * 0.3;
  const gap = 80;
  return items.map((text, i) => {
    let item = makeText(comp, {
      content: `• ${text}`,
      fontSize: 38,
      color: "#ffffff",
      align: "right",
      x,
      y: y0 + i * gap,
      startTime: i * 0.5,
      name: `List Item ${i + 1}`,
    });
    item = applyPresetToLayer(applyPresetToLayer(item, "slideInRight", comp), "fadeIn", comp);
    return item;
  });
}

function typewriterText(comp: Composition): Layer[] {
  const cx = comp.width / 2;
  const cy = comp.height / 2;
  const text = makeText(comp, {
    content: "نص سينمائي يُكتب أمام عينيك...",
    fontSize: 46,
    color: "#ffffff",
    x: cx,
    y: cy,
    name: "Typewriter Text",
  });
  text.props = { ...(text.props as TextLayerProps), revealSpeed: 14 };
  return [text];
}

function highlightText(comp: Composition): Layer[] {
  const cx = comp.width / 2;
  const cy = comp.height / 2;
  let text = makeText(comp, {
    content: "اختر [منصة بناء] متكاملة لمشروعك",
    fontSize: 50,
    color: "#ffffff",
    x: cx,
    y: cy,
    name: "Highlighted Text",
  });
  text.props = { ...(text.props as TextLayerProps), emphasisColor: "#ffd166" };
  text = applyPresetToLayer(applyPresetToLayer(text, "fadeIn", comp), "slideInTop", comp);
  return [text];
}

function countUpNumber(comp: Composition): Layer[] {
  const cx = comp.width / 2;
  const cy = comp.height / 2;
  const number = makeText(comp, {
    content: "0",
    fontSize: 150,
    color: "#ffffff",
    x: cx,
    y: cy,
    name: "Count Up Number",
  });
  number.props = { ...(number.props as TextLayerProps), countTo: 100, countDuration: 1.8 };
  let label = makeText(comp, {
    content: "عميل سعيد",
    fontSize: 28,
    color: "#9a9aa2",
    x: cx,
    y: cy + 100,
    startTime: 0.2,
    name: "Count Label",
  });
  label = applyPresetToLayer(label, "fadeIn", comp);
  return [label, number];
}

/** Replaces a layer's position keyframes with a smooth circular orbit around `center`, looping for `loops` revolutions. */
function addOrbitLoop(layer: Layer, center: Point, radius: number, period: number, phase: number, loops: number): Layer {
  const stepsPerLoop = 16;
  const kfs: Keyframe<Point>[] = [];
  for (let i = 0; i <= stepsPerLoop * loops; i++) {
    const time = layer.startTime + (i / stepsPerLoop) * period;
    const angle = phase + (i / stepsPerLoop) * Math.PI * 2;
    kfs.push({
      id: makeId("kf"),
      time,
      value: { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius },
      easing: "linear",
    });
  }
  return {
    ...layer,
    transform: { ...layer.transform, position: { static: layer.transform.position.static, keyframes: kfs } },
  };
}

function orbitingIcons(comp: Composition): Layer[] {
  const cx = comp.width / 2;
  const cy = comp.height / 2;
  const icons = ["⭐", "💡", "🔥", "❤️"];
  const radius = Math.min(comp.width, comp.height) * 0.3;
  const period = 6;
  const orbitLayers = icons.map((icon, i) => {
    let layer = makeText(comp, {
      content: icon,
      fontSize: 52,
      color: "#ffffff",
      x: cx,
      y: cy,
      name: `Orbit Icon ${i + 1}`,
    });
    layer = applyPresetToLayer(layer, "popIn", comp);
    const phase = (i / icons.length) * Math.PI * 2;
    return addOrbitLoop(layer, { x: cx, y: cy }, radius, period, phase, 4);
  });
  let center = makeImage(comp, { width: radius * 0.85, height: radius * 0.85, x: cx, y: cy, name: "Center Product" });
  center = applyPresetToLayer(center, "popIn", comp);
  return [...orbitLayers, center];
}

function statCard(comp: Composition): Layer[] {
  const cx = comp.width / 2;
  const cy = comp.height / 2;
  const cardW = 320;
  const cardH = 220;
  let card = makeRect(comp, { width: cardW, height: cardH, color: "#1d1d22", radius: 20, x: cx, y: cy, name: "Stat Card" });
  let icon = makeText(comp, {
    content: "📈",
    fontSize: 48,
    color: "#ffffff",
    x: cx,
    y: cy - cardH * 0.28,
    startTime: 0.1,
    name: "Stat Icon",
  });
  let number = makeText(comp, {
    content: "250",
    fontSize: 64,
    color: "#ffd166",
    x: cx,
    y: cy + cardH * 0.02,
    startTime: 0.2,
    name: "Stat Number",
  });
  let label = makeText(comp, {
    content: "عملية ناجحة",
    fontSize: 22,
    color: "#9a9aa2",
    x: cx,
    y: cy + cardH * 0.33,
    startTime: 0.3,
    name: "Stat Label",
  });
  card = applyPresetToLayer(card, "popIn", comp);
  icon = applyPresetToLayer(icon, "fadeIn", comp);
  number = applyPresetToLayer(number, "popIn", comp);
  label = applyPresetToLayer(label, "fadeIn", comp);
  return [label, number, icon, card];
}

function comparisonCard(comp: Composition): Layer[] {
  const cx = comp.width / 2;
  const cy = comp.height / 2;
  const cardW = 520;
  const cardH = 220;
  const colOffset = cardW * 0.27;
  let card = makeRect(comp, { width: cardW, height: cardH, color: "#1d1d22", radius: 20, x: cx, y: cy, name: "Comparison Card" });
  let divider = makeRect(comp, { width: 2, height: cardH * 0.6, color: "#35353b", x: cx, y: cy, name: "Divider" });
  let leftNum = makeText(comp, {
    content: "40%",
    fontSize: 52,
    color: "#ff6b6b",
    x: cx - colOffset,
    y: cy - 10,
    startTime: 0.15,
    name: "Left Number",
  });
  let leftLabel = makeText(comp, {
    content: "قبل",
    fontSize: 20,
    color: "#9a9aa2",
    x: cx - colOffset,
    y: cy + 46,
    startTime: 0.2,
    name: "Left Label",
  });
  let rightNum = makeText(comp, {
    content: "95%",
    fontSize: 52,
    color: "#7cff8a",
    x: cx + colOffset,
    y: cy - 10,
    startTime: 0.3,
    name: "Right Number",
  });
  let rightLabel = makeText(comp, {
    content: "بعد",
    fontSize: 20,
    color: "#9a9aa2",
    x: cx + colOffset,
    y: cy + 46,
    startTime: 0.35,
    name: "Right Label",
  });
  card = applyPresetToLayer(card, "popIn", comp);
  divider = applyPresetToLayer(divider, "fadeIn", comp);
  leftNum = applyPresetToLayer(leftNum, "popIn", comp);
  leftLabel = applyPresetToLayer(leftLabel, "fadeIn", comp);
  rightNum = applyPresetToLayer(rightNum, "popIn", comp);
  rightLabel = applyPresetToLayer(rightLabel, "fadeIn", comp);
  return [rightLabel, rightNum, leftLabel, leftNum, divider, card];
}

const DISPLAY = "'thmanyahsans', 'Alexandria', 'Cairo', sans-serif";
const unitOf = (comp: Composition) => Math.min(comp.width, comp.height);

function wordReveal(comp: Composition): Layer[] {
  const t = makeText(comp, { content: "كل كلمة [تطلع] بوقتها", fontSize: Math.round(unitOf(comp) * 0.09), color: "#ffffff", x: comp.width / 2, y: comp.height / 2, name: "Word Reveal", fontFamily: DISPLAY });
  t.props = { ...(t.props as TextLayerProps), wordStagger: 0.12, emphasisColor: "#ffd166" };
  return [applyPresetToLayer(t, "fadeOut", comp)];
}

function markerHeadline(comp: Composition): Layer[] {
  const u = unitOf(comp);
  const t = makeText(comp, { content: "أهم نقطة بالفيديو", fontSize: Math.round(u * 0.085), color: "#111111", x: comp.width / 2, y: comp.height / 2, name: "Marker Headline", fontFamily: DISPLAY });
  t.props = { ...(t.props as TextLayerProps), highlightBar: "#ffd166" };
  return [applyPresetToLayer(t, "fadeUp", comp)];
}

function chartLayer(comp: Composition, patch: Partial<ChartLayerProps>, x: number, y: number, name: string): Layer {
  const layer = createLayer("chart", comp);
  layer.name = name;
  layer.props = { ...(layer.props as ChartLayerProps), ...patch };
  layer.transform.position.static = { x, y };
  return layer;
}

function statHero(comp: Composition): Layer[] {
  const u = unitOf(comp);
  const cx = comp.width / 2;
  const donut = chartLayer(comp, { kind: "donut", values: [87], labels: ["نسبة النجاح"], width: u * 0.5, height: u * 0.5, color: "#7cff8a", revealDuration: 1.4 }, cx, comp.height * 0.48, "Stat Donut");
  let head = makeText(comp, { content: "نتائج [حقيقية]", fontSize: Math.round(u * 0.08), color: "#ffffff", x: cx, y: comp.height * 0.48 - u * 0.36, name: "Stat Headline", fontFamily: DISPLAY });
  head.props = { ...(head.props as TextLayerProps), wordStagger: 0.1, emphasisColor: "#7cff8a" };
  head = applyPresetToLayer(head, "fadeOut", comp);
  return [head, applyPresetToLayer(donut, "springIn", comp)];
}

function barChartStory(comp: Composition): Layer[] {
  const u = unitOf(comp);
  const chart = chartLayer(comp, { width: Math.min(comp.width * 0.85, u * 1.1), height: u * 0.6 }, comp.width / 2, comp.height * 0.55, "Bar Chart");
  let head = makeText(comp, { content: "النمو خلال 4 شهور", fontSize: Math.round(u * 0.065), color: "#ffffff", x: comp.width / 2, y: comp.height * 0.55 - u * 0.42, name: "Chart Title", fontFamily: DISPLAY });
  head = applyPresetToLayer(head, "fadeUp", comp);
  return [head, chart];
}

function brandReveal(comp: Composition): Layer[] {
  const u = unitOf(comp);
  const cx = comp.width / 2;
  const cy = comp.height / 2;
  let name = makeText(comp, { content: "اسم البراند", fontSize: Math.round(u * 0.13), color: "#ffffff", x: cx, y: cy, name: "Brand Name", fontFamily: DISPLAY });
  name.props = { ...(name.props as TextLayerProps), stretchIn: 0.8, glow: "rgba(79,140,255,0.8)" };
  name = applyPresetToLayer(name, "springIn", comp);
  let tag = makeText(comp, { content: "شعار قصير يوصف الخدمة", fontSize: Math.round(u * 0.045), color: "#c9c9d1", x: cx, y: cy + u * 0.12, startTime: 0.5, name: "Brand Tagline", fontFamily: "'Cairo', sans-serif" });
  tag = applyPresetToLayer(tag, "fadeUp", comp);
  let line = makeRect(comp, { width: u * 0.35, height: Math.max(4, u * 0.008), color: "#4f8cff", radius: 4, x: cx, y: cy + u * 0.075, startTime: 0.3, name: "Brand Accent Line" });
  line.transform.scale = { static: { x: 1, y: 1 }, keyframes: [{ id: makeId("kf"), time: 0.3, value: { x: 0, y: 1 }, easing: "easeOut" }, { id: makeId("kf"), time: 0.8, value: { x: 1, y: 1 }, easing: "easeOut" }] };
  return [name, tag, line];
}

export function buildTemplateLayers(templateId: TemplateId, comp: Composition): Layer[] {
  switch (templateId) {
    case "titleCard":
      return titleCard(comp);
    case "lowerThird":
      return lowerThird(comp);
    case "badge":
      return badge(comp);
    case "ctaButton":
      return ctaButton(comp);
    case "bigNumber":
      return bigNumber(comp);
    case "animatedList":
      return animatedList(comp);
    case "typewriterText":
      return typewriterText(comp);
    case "highlightText":
      return highlightText(comp);
    case "countUpNumber":
      return countUpNumber(comp);
    case "orbitingIcons":
      return orbitingIcons(comp);
    case "statCard":
      return statCard(comp);
    case "comparisonCard":
      return comparisonCard(comp);
    case "wordReveal":
      return wordReveal(comp);
    case "markerHeadline":
      return markerHeadline(comp);
    case "statHero":
      return statHero(comp);
    case "barChartStory":
      return barChartStory(comp);
    case "brandReveal":
      return brandReveal(comp);
  }
}
