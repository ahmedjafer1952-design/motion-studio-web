import type { Composition, Keyframe, Layer, Point, TextLayerProps } from "../types";
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
  | "comparisonCard";

export interface TemplateDef {
  id: TemplateId;
  label: string;
  description: string;
}

export const MOTION_TEMPLATES: TemplateDef[] = [
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
  }
}
