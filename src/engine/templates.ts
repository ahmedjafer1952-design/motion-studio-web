import type { Composition, Layer, ShapeLayerProps, TextLayerProps } from "../types";
import { createLayer, staticProp } from "./factory";
import { applyPresetToLayer } from "./presets";
import { makeId } from "../utils/id";

export type TemplateId = "titleCard" | "lowerThird" | "badge" | "ctaButton" | "bigNumber" | "animatedList";

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
];

function makeText(
  comp: Composition,
  opts: {
    content: string;
    fontSize: number;
    color: string;
    align?: "left" | "center" | "right";
    x: number;
    y: number;
    startTime?: number;
    endTime?: number;
    name: string;
  }
): Layer {
  const layer = createLayer("text", comp);
  const props: TextLayerProps = {
    content: opts.content,
    fontSize: opts.fontSize,
    color: opts.color,
    fontFamily: "Arial, sans-serif",
    align: opts.align ?? "center",
  };
  return {
    ...layer,
    name: opts.name,
    startTime: opts.startTime ?? 0,
    endTime: opts.endTime ?? comp.duration,
    transform: { ...layer.transform, position: staticProp({ x: opts.x, y: opts.y }) },
    props,
  };
}

function makeRect(
  comp: Composition,
  opts: {
    width: number;
    height: number;
    color: string;
    radius?: number;
    x: number;
    y: number;
    startTime?: number;
    endTime?: number;
    name: string;
  }
): Layer {
  const layer = createLayer("rect", comp);
  const props: ShapeLayerProps = { width: opts.width, height: opts.height, color: opts.color, radius: opts.radius ?? 0 };
  return {
    ...layer,
    name: opts.name,
    startTime: opts.startTime ?? 0,
    endTime: opts.endTime ?? comp.duration,
    transform: { ...layer.transform, position: staticProp({ x: opts.x, y: opts.y }) },
    props,
  };
}

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
  }
}
