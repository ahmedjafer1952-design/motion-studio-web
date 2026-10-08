import type { CaptionLayerProps, Composition, Layer, TextLayerProps } from "../types";
import { evaluateTransform } from "./evaluate";

export interface LayerBounds {
  /** Center of the drawn box, in composition pixels. */
  cx: number;
  cy: number;
  /** Unscaled box size in the layer's local space. */
  w: number;
  h: number;
  rotation: number; // degrees
  scaleX: number;
  scaleY: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 10;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** The on-screen box of a layer at `time`, or null if it isn't visible/selectable there. */
export function layerBounds(layer: Layer, comp: Composition, time: number): LayerBounds | null {
  if (layer.type === "audio") return null;
  if (time < layer.startTime || time > layer.endTime) return null;
  const t = evaluateTransform(layer.transform, time);
  if (t.opacity <= 0) return null;

  let w: number;
  let h: number;
  let offsetX = 0;
  if (layer.type === "text") {
    const p = layer.props as TextLayerProps;
    const text = p.countTo != null ? String(p.countTo) : p.content.replace(/[[\]]/g, "");
    w = Math.max(8, measureText(text, `${p.bold ? "bold " : ""}${p.fontSize}px ${p.fontFamily}`));
    h = p.fontSize * 1.2;
    if (p.align === "left") offsetX = w / 2;
    else if (p.align === "right") offsetX = -w / 2;
  } else if (layer.type === "caption") {
    const p = layer.props as CaptionLayerProps;
    w = comp.width * 0.7;
    h = p.fontSize * 1.6;
  } else {
    const p = layer.props as { width?: number; height?: number };
    w = p.width ?? 100;
    h = p.height ?? 100;
  }

  // Text alignment shifts the box in local (pre-rotation) space.
  const rad = (t.rotation * Math.PI) / 180;
  const ox = offsetX * t.scale.x;
  return {
    cx: t.position.x + ox * Math.cos(rad),
    cy: t.position.y + ox * Math.sin(rad),
    w,
    h,
    rotation: t.rotation,
    scaleX: t.scale.x,
    scaleY: t.scale.y,
  };
}

function contains(b: LayerBounds, x: number, y: number): boolean {
  const rad = (-b.rotation * Math.PI) / 180;
  const dx = x - b.cx;
  const dy = y - b.cy;
  const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / (b.scaleX || 1);
  const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / (b.scaleY || 1);
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
}

/** Front-most layer under the point. Full-frame overlays are skipped so they don't swallow every click. */
export function hitTestLayers(comp: Composition, time: number, x: number, y: number): Layer | null {
  for (const layer of comp.layers) {
    if (layer.type === "overlay" || layer.type === "cutout") continue;
    const b = layerBounds(layer, comp, time);
    if (b && contains(b, x, y)) return layer;
  }
  return null;
}

/** Outlines the selected layer on the preview only — never part of renders or exports. */
export function drawSelectionOutline(ctx: CanvasRenderingContext2D, b: LayerBounds, pixelRatio: number) {
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.rotate((b.rotation * Math.PI) / 180);
  const w = b.w * b.scaleX;
  const h = b.h * b.scaleY;
  ctx.lineWidth = 2 * pixelRatio;
  ctx.strokeStyle = "#4f8cff";
  ctx.setLineDash([6 * pixelRatio, 4 * pixelRatio]);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.setLineDash([]);
  ctx.fillStyle = "#4f8cff";
  const s = 6 * pixelRatio;
  for (const [hx, hy] of [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [-w / 2, h / 2],
    [w / 2, h / 2],
  ]) {
    ctx.fillRect(hx - s / 2, hy - s / 2, s, s);
  }
  ctx.restore();
}
