import type { Composition, Easing, Keyframe, Layer, Point } from "../types";
import { makeId } from "../utils/id";
import { evaluateTransform } from "./evaluate";

export type PresetId =
  | "fadeIn"
  | "fadeOut"
  | "zoomIn"
  | "zoomOut"
  | "slideInLeft"
  | "slideInRight"
  | "slideInTop"
  | "slideInBottom"
  | "popIn"
  | "panRight";

export interface PresetDef {
  id: PresetId;
  label: string;
  description: string;
}

export const MOTION_PRESETS: PresetDef[] = [
  { id: "fadeIn", label: "Fade In", description: "Opacity fades in at the start" },
  { id: "fadeOut", label: "Fade Out", description: "Opacity fades out at the end" },
  { id: "zoomIn", label: "Zoom In", description: "Scales up into place at the start" },
  { id: "zoomOut", label: "Zoom Out", description: "Scales down and out at the end" },
  { id: "slideInLeft", label: "Slide In ← Left", description: "Slides in from the left edge" },
  { id: "slideInRight", label: "Slide In Right →", description: "Slides in from the right edge" },
  { id: "slideInTop", label: "Slide In ↑ Top", description: "Slides in from the top edge" },
  { id: "slideInBottom", label: "Slide In ↓ Bottom", description: "Slides in from the bottom edge" },
  { id: "popIn", label: "Pop In", description: "Bouncy scale pop at the start" },
  { id: "panRight", label: "Camera Pan →", description: "Slow drift to the right across the layer's duration" },
];

function kf<T>(time: number, value: T, easing: Easing = "easeOut"): Keyframe<T> {
  return { id: makeId("kf"), time, value, easing };
}

/** Returns a new layer with the chosen preset's keyframes applied, based on the layer's resting pose at its startTime. */
export function applyPresetToLayer(layer: Layer, presetId: PresetId, comp: Composition): Layer {
  const base = evaluateTransform(layer.transform, layer.startTime);
  const start = layer.startTime;
  const end = layer.endTime;
  const dur = Math.max(0.1, end - start);
  const clone: Layer = JSON.parse(JSON.stringify(layer));

  switch (presetId) {
    case "fadeIn": {
      const d = Math.min(0.5, dur * 0.4);
      clone.transform.opacity = {
        static: base.opacity,
        keyframes: [kf(start, 0, "easeOut"), kf(start + d, base.opacity, "easeOut")],
      };
      break;
    }
    case "fadeOut": {
      const d = Math.min(0.5, dur * 0.4);
      clone.transform.opacity = {
        static: base.opacity,
        keyframes: [kf(end - d, base.opacity, "easeIn"), kf(end, 0, "easeIn")],
      };
      break;
    }
    case "zoomIn": {
      const d = Math.min(0.4, dur * 0.4);
      const small: Point = { x: base.scale.x * 0.8, y: base.scale.y * 0.8 };
      clone.transform.scale = {
        static: base.scale,
        keyframes: [kf(start, small, "easeOut"), kf(start + d, base.scale, "easeOut")],
      };
      break;
    }
    case "zoomOut": {
      const d = Math.min(0.4, dur * 0.4);
      const small: Point = { x: base.scale.x * 0.8, y: base.scale.y * 0.8 };
      clone.transform.scale = {
        static: base.scale,
        keyframes: [kf(end - d, base.scale, "easeIn"), kf(end, small, "easeIn")],
      };
      break;
    }
    case "slideInLeft":
    case "slideInRight":
    case "slideInTop":
    case "slideInBottom": {
      const d = Math.min(0.5, dur * 0.4);
      const dx = presetId === "slideInLeft" ? -comp.width * 0.6 : presetId === "slideInRight" ? comp.width * 0.6 : 0;
      const dy = presetId === "slideInTop" ? -comp.height * 0.6 : presetId === "slideInBottom" ? comp.height * 0.6 : 0;
      const off: Point = { x: base.position.x + dx, y: base.position.y + dy };
      clone.transform.position = {
        static: base.position,
        keyframes: [kf(start, off, "easeOut"), kf(start + d, base.position, "easeOut")],
      };
      break;
    }
    case "popIn": {
      const overshoot: Point = { x: base.scale.x * 1.15, y: base.scale.y * 1.15 };
      const zero: Point = { x: 0.001, y: 0.001 };
      clone.transform.scale = {
        static: base.scale,
        keyframes: [kf(start, zero, "easeOut"), kf(start + 0.18, overshoot, "easeOut"), kf(start + 0.3, base.scale, "easeInOut")],
      };
      break;
    }
    case "panRight": {
      const drift = comp.width * 0.04;
      const a: Point = { x: base.position.x - drift, y: base.position.y };
      const b: Point = { x: base.position.x + drift, y: base.position.y };
      clone.transform.position = {
        static: base.position,
        keyframes: [kf(start, a, "linear"), kf(end, b, "linear")],
      };
      break;
    }
  }

  return clone;
}
