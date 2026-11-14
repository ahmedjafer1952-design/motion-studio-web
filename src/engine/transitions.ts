// Transitions the way editors cut reels: a short layer laid over the cut point that bends the
// frame already painted beneath it — a zoom punch with radial streaks, a whip pan, a spin, a
// camera shake, a flash, a glitch, a film burn or a blur dip. The effect peaks at the middle of
// the layer (put the layer's middle on the cut) and is invisible at both ends.
//
// Works in device pixels on the canvas below, so everything under the layer (footage, and any
// graphics beneath it) moves together; graphics above it stay crisp.

import type { TransitionLayerProps } from "../types";

let buffer: HTMLCanvasElement | null = null;

function snapshot(ctx: CanvasRenderingContext2D): HTMLCanvasElement | null {
  const { width, height } = ctx.canvas;
  if (!buffer) buffer = document.createElement("canvas");
  if (buffer.width !== width || buffer.height !== height) {
    buffer.width = width;
    buffer.height = height;
  }
  const b = buffer.getContext("2d");
  if (!b) return null;
  b.clearRect(0, 0, width, height);
  b.drawImage(ctx.canvas, 0, 0);
  return buffer;
}

/** Deterministic noise so preview and export glitch identically. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Draws `img` scaled by `s` and rotated by `rot` (radians) around the frame center, shifted by (dx, dy). */
function drawAround(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, s: number, rot = 0, dx = 0, dy = 0) {
  ctx.save();
  ctx.translate(w / 2 + dx, h / 2 + dy);
  if (rot) ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/**
 * @param progress 0 → 1 across the layer's duration; the effect peaks at 0.5 (the cut).
 */
export function drawTransition(ctx: CanvasRenderingContext2D, p: TransitionLayerProps, progress: number) {
  const k = Math.max(0, Math.min(1, progress));
  const env = Math.sin(Math.PI * k); // 0 → 1 → 0
  const amt = Math.max(0, Math.min(1.5, p.intensity ?? 0.7));
  if (env <= 0.001 || amt <= 0) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const e = env * amt;
  // Out-and-back: before the cut the move goes one way, after it arrives from the other side.
  const signed = k < 0.5 ? k * 2 : (k - 1) * 2; // 0 → 1 | -1 → 0
  const dir = p.direction ?? "left";
  const sx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
  const sy = dir === "up" ? -1 : dir === "down" ? 1 : 0;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";

  const color = p.color ?? "#ffffff";

  switch (p.kind) {
    case "zoomBlur": {
      const img = snapshot(ctx);
      if (!img) break;
      const s = 1 + 0.35 * e;
      ctx.filter = `blur(${(e * Math.min(w, h) * 0.012).toFixed(2)}px)`;
      drawAround(ctx, img, w, h, s);
      ctx.filter = "none";
      // Radial streaks: progressively larger, fainter copies.
      for (let i = 1; i <= 5; i++) {
        ctx.globalAlpha = (0.22 * e) / i;
        drawAround(ctx, img, w, h, s * (1 + 0.06 * i * e));
      }
      break;
    }
    case "whip": {
      const img = snapshot(ctx);
      if (!img) break;
      const travelX = sx * signed * w * 0.9 * Math.min(1, amt);
      const travelY = sy * signed * h * 0.9 * Math.min(1, amt);
      const blurPx = e * Math.max(w, h) * 0.02;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
      // Tile so the frame never shows an empty edge while it slides.
      for (const t of [-1, 0, 1]) drawAround(ctx, img, w, h, 1.04, 0, travelX + t * w * Math.abs(sx), travelY + t * h * Math.abs(sy));
      ctx.filter = "none";
      for (let i = 1; i <= 4; i++) {
        ctx.globalAlpha = (0.18 * e) / i;
        drawAround(ctx, img, w, h, 1.04, 0, travelX - sx * i * w * 0.04 * e, travelY - sy * i * h * 0.04 * e);
      }
      break;
    }
    case "spin": {
      const img = snapshot(ctx);
      if (!img) break;
      const rot = (sx || 1) * signed * (Math.PI / 5) * Math.min(1, amt);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.filter = `blur(${(e * Math.min(w, h) * 0.014).toFixed(2)}px)`;
      // Scale up enough that the rotated frame still covers the corners.
      drawAround(ctx, img, w, h, 1 + 0.55 * Math.abs(Math.sin(rot)) + 0.12 * e, rot);
      break;
    }
    case "shake": {
      const img = snapshot(ctx);
      if (!img) break;
      const step = Math.floor(k * 40);
      const dx = (rand(step) - 0.5) * w * 0.06 * e;
      const dy = (rand(step + 17) - 0.5) * h * 0.04 * e;
      const rot = (rand(step + 31) - 0.5) * 0.06 * e;
      ctx.filter = `blur(${(e * 2).toFixed(2)}px)`;
      drawAround(ctx, img, w, h, 1.08 + 0.05 * e, rot, dx, dy);
      break;
    }
    case "flash": {
      // A hard bloom toward white (or the brand color) right on the cut.
      ctx.globalAlpha = Math.min(1, Math.pow(env, 3) * amt);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "glitch": {
      const img = snapshot(ctx);
      if (!img) break;
      const step = Math.floor(k * 24);
      const bands = 9;
      for (let i = 0; i < bands; i++) {
        if (rand(step * 13 + i) > 0.55 + 0.4 * (1 - e)) continue;
        const y0 = Math.floor(rand(step * 7 + i * 3) * h);
        const bh = Math.max(4, Math.floor(rand(step + i * 11) * h * 0.08));
        const off = (rand(step * 5 + i) - 0.5) * w * 0.18 * e;
        ctx.drawImage(img, 0, y0, w, bh, off, y0, w, bh);
      }
      // Color fringing: offset tinted copies in screen mode.
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.35 * e;
      ctx.filter = "sepia(1) saturate(6) hue-rotate(-50deg)";
      drawAround(ctx, img, w, h, 1, 0, w * 0.012 * e, 0);
      ctx.filter = "sepia(1) saturate(6) hue-rotate(150deg)";
      drawAround(ctx, img, w, h, 1, 0, -w * 0.012 * e, 0);
      break;
    }
    case "filmBurn": {
      // A warm light leak that sweeps across and blows out at the cut.
      ctx.globalCompositeOperation = "screen";
      const blob = (cx: number, cy: number, r: number, a: number) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255,236,190,${Math.min(1, a)})`);
        g.addColorStop(0.3, `rgba(255,120,20,${Math.min(1, 0.95 * a)})`);
        g.addColorStop(0.65, `rgba(220,30,10,${Math.min(1, 0.6 * a)})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      };
      const R = Math.max(w, h);
      blob(w * (0.1 + 0.8 * k), h * 0.4, R * (0.3 + 0.45 * env), e * 1.2);
      blob(w * (0.95 - 0.7 * k), h * 0.75, R * (0.2 + 0.3 * env), e * 0.9);
      // Blow-out right on the cut.
      ctx.fillStyle = `rgba(255,210,150,${(Math.pow(env, 4) * 0.55 * amt).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "blurDip": {
      const img = snapshot(ctx);
      if (!img) break;
      ctx.filter = `blur(${(e * Math.min(w, h) * 0.04).toFixed(2)}px) brightness(${(1 - 0.35 * e).toFixed(3)})`;
      drawAround(ctx, img, w, h, 1 + 0.06 * e);
      break;
    }
  }
  ctx.restore();
}

export const TRANSITION_KINDS: { id: TransitionLayerProps["kind"]; label: string }[] = [
  { id: "zoomBlur", label: "زوم بضبابية (Zoom Punch)" },
  { id: "whip", label: "سحبة سريعة (Whip Pan)" },
  { id: "spin", label: "لفّة (Spin)" },
  { id: "shake", label: "هزّة كاميرا (Shake)" },
  { id: "flash", label: "فلاش أبيض (Flash)" },
  { id: "glitch", label: "تقطيع رقمي (Glitch)" },
  { id: "filmBurn", label: "حرقة فيلم (Film Burn)" },
  { id: "blurDip", label: "غباشة وترجع (Blur Dip)" },
];
