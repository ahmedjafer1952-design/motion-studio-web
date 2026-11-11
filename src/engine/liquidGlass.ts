// "Liquid glass" (Apple-style) on a plain 2D canvas: unlike a flat frosted panel, the edge of the
// pane behaves like a thick convex lens. Near the rim the background is bent (refracted) outward,
// with a slight color split, under a soft blur; a specular highlight runs along the rim where the
// light hits it, and a sheen plus inner shadow give the pane volume.
//
// Everything happens in device pixels on the region of the canvas already painted beneath.

export interface LiquidGlassOptions {
  radius: number;
  /** Width of the curved rim, px. */
  bezel?: number;
  /** Max sideways shift of the background at the very edge, px. */
  refraction?: number;
  blur?: number;
  saturation?: number;
  /** rgba() fill laid over the glass (brand tint). */
  tint?: string;
  /** 0–1 overall opacity. */
  opacity?: number;
  /** Rim highlight strength 0–1. */
  highlight?: number;
}

let sampleBuffer: HTMLCanvasElement | null = null;

/** Signed distance from (px,py) to a rounded rect centered at 0 with half-size hw,hh and radius r. */
function roundedRectSdf(px: number, py: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Outward unit normal of that rounded rect at (px,py). */
function roundedRectNormal(px: number, py: number, hw: number, hh: number, r: number): [number, number] {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  let nx: number;
  let ny: number;
  if (qx > 0 && qy > 0) {
    const l = Math.hypot(qx, qy) || 1;
    nx = qx / l;
    ny = qy / l;
  } else if (qx > qy) {
    nx = 1;
    ny = 0;
  } else {
    nx = 0;
    ny = 1;
  }
  return [px < 0 ? -nx : nx, py < 0 ? -ny : ny];
}

/**
 * Draws a liquid-glass pane over the device-pixel rect (x, y, w, h). Call with any transform —
 * it works in device space and restores the context.
 */
export function drawLiquidGlass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: LiquidGlassOptions) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const opacity = Math.max(0, Math.min(1, o.opacity ?? 1));
  if (w < 4 || h < 4 || opacity <= 0) return;
  const r = Math.max(0, Math.min(o.radius, w / 2, h / 2));
  const bezel = Math.max(2, Math.min(o.bezel ?? Math.min(w, h) * 0.22, Math.min(w, h) / 2));
  const refraction = o.refraction ?? bezel * 0.8;
  const blur = o.blur ?? 6;
  const pad = Math.ceil(refraction + blur * 2 + 2);

  // Integer device rect of the pane, clipped to the canvas.
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(cw, Math.ceil(x + w));
  const y1 = Math.min(ch, Math.ceil(y + h));
  if (x1 - x0 < 2 || y1 - y0 < 2) return;

  // Blurred, slightly saturated copy of what's beneath (with margin for the refraction to reach into).
  const sx0 = Math.max(0, x0 - pad);
  const sy0 = Math.max(0, y0 - pad);
  const sx1 = Math.min(cw, x1 + pad);
  const sy1 = Math.min(ch, y1 + pad);
  const sw = sx1 - sx0;
  const sh = sy1 - sy0;
  if (!sampleBuffer) sampleBuffer = document.createElement("canvas");
  if (sampleBuffer.width !== sw || sampleBuffer.height !== sh) {
    sampleBuffer.width = sw;
    sampleBuffer.height = sh;
  }
  const sctx = sampleBuffer.getContext("2d", { willReadFrequently: true });
  if (!sctx) return;
  sctx.clearRect(0, 0, sw, sh);
  sctx.filter = `blur(${blur}px) saturate(${o.saturation ?? 1.35}) brightness(1.04)`;
  sctx.drawImage(ctx.canvas, sx0, sy0, sw, sh, 0, 0, sw, sh);
  sctx.filter = "none";

  let src: Uint8ClampedArray;
  let dstImg: ImageData;
  try {
    src = sctx.getImageData(0, 0, sw, sh).data;
    dstImg = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  } catch {
    return; // tainted canvas — leave it untouched
  }
  const dst = dstImg.data;
  const dw = x1 - x0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const hw = w / 2;
  const hh = h / 2;

  const sample = (fx: number, fy: number, ch: number) => {
    const ix = Math.min(sw - 1, Math.max(0, Math.round(fx - sx0)));
    const iy = Math.min(sh - 1, Math.max(0, Math.round(fy - sy0)));
    return src[(iy * sw + ix) * 4 + ch];
  };

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const lx = px + 0.5 - cx;
      const ly = py + 0.5 - cy;
      const sd = roundedRectSdf(lx, ly, hw, hh, r);
      if (sd > 0) continue; // outside the pane
      const inset = -sd;
      const k = (py - y0) * dw + (px - x0);
      const o4 = k * 4;
      // Anti-aliased edge (1px).
      const edgeAlpha = Math.min(1, inset) * opacity;
      let rr: number;
      let gg: number;
      let bb: number;
      if (inset < bezel) {
        // Convex rim: the surface slope grows toward the edge, so light bends more there.
        const t = 1 - inset / bezel; // 0 inside → 1 at the edge
        const bend = refraction * t * t * Math.sqrt(t);
        const [nx, ny] = roundedRectNormal(lx, ly, hw, hh, r);
        const fx = px + 0.5;
        const fy = py + 0.5;
        // Slightly different bend per channel = a whisper of chromatic dispersion.
        rr = sample(fx + nx * bend, fy + ny * bend, 0);
        gg = sample(fx + nx * bend * 1.08, fy + ny * bend * 1.08, 1);
        bb = sample(fx + nx * bend * 1.16, fy + ny * bend * 1.16, 2);
      } else {
        rr = sample(px + 0.5, py + 0.5, 0);
        gg = sample(px + 0.5, py + 0.5, 1);
        bb = sample(px + 0.5, py + 0.5, 2);
      }
      dst[o4] = dst[o4] + (rr - dst[o4]) * edgeAlpha;
      dst[o4 + 1] = dst[o4 + 1] + (gg - dst[o4 + 1]) * edgeAlpha;
      dst[o4 + 2] = dst[o4 + 2] + (bb - dst[o4 + 2]) * edgeAlpha;
    }
  }
  ctx.putImageData(dstImg, x0, y0);

  // Volume: tint, a top sheen, an inner shadow at the bottom, and the specular rim.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (o.tint) {
    ctx.fillStyle = o.tint;
    ctx.fill();
  }
  const sheen = ctx.createLinearGradient(0, y, 0, y + h);
  sheen.addColorStop(0, "rgba(255,255,255,0.16)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0.03)");
  sheen.addColorStop(1, "rgba(0,0,0,0.10)");
  ctx.fillStyle = sheen;
  ctx.fill();

  const hl = Math.max(0, Math.min(1, o.highlight ?? 0.85));
  // Light from the top-left: bright on that rim, a faint bounce on the opposite one.
  const rim = ctx.createLinearGradient(x, y, x + w, y + h);
  rim.addColorStop(0, `rgba(255,255,255,${0.95 * hl})`);
  rim.addColorStop(0.35, `rgba(255,255,255,${0.12 * hl})`);
  rim.addColorStop(0.65, `rgba(255,255,255,${0.05 * hl})`);
  rim.addColorStop(1, `rgba(255,255,255,${0.45 * hl})`);
  ctx.lineWidth = Math.max(1.2, Math.min(w, h) * 0.012);
  ctx.strokeStyle = rim;
  ctx.stroke();
  // Soft inner glow just inside the rim.
  ctx.save();
  ctx.clip();
  ctx.lineWidth = Math.max(4, bezel * 0.5);
  ctx.strokeStyle = `rgba(255,255,255,${0.07 * hl})`;
  ctx.filter = `blur(${Math.max(2, bezel * 0.25)}px)`;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/**
 * Liquid glass for a path described in the CURRENT local space as a rounded rect: maps it to
 * device space when the transform has no rotation/skew. Returns false if it can't (caller falls back).
 */
export function drawLiquidGlassLocal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  o: Omit<LiquidGlassOptions, "radius">
): boolean {
  const m = ctx.getTransform();
  if (Math.abs(m.b) > 1e-3 || Math.abs(m.c) > 1e-3 || m.a <= 0 || m.d <= 0) return false;
  drawLiquidGlass(ctx, m.a * x + m.e, m.d * y + m.f, w * m.a, h * m.d, {
    ...o,
    radius: r * Math.min(m.a, m.d),
    bezel: o.bezel !== undefined ? o.bezel * m.a : undefined,
    refraction: o.refraction !== undefined ? o.refraction * m.a : undefined,
    opacity: (o.opacity ?? 1) * ctx.globalAlpha,
  });
  return true;
}
