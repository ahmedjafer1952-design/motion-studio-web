import type { ChartLayerProps } from "../types";

// Animated data-viz layer: bars grow, donuts sweep, progress fills and lines draw on,
// with their numbers counting up alongside. Drawn centered on the layer origin.

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function fmt(v: number, p: ChartLayerProps) {
  const rounded = Math.abs(v) >= 100 || Number.isInteger(p.values[0]) ? Math.round(v) : Math.round(v * 10) / 10;
  return `${rounded}${p.suffix ?? ""}`;
}

export function drawChart(ctx: CanvasRenderingContext2D, p: ChartLayerProps, localTime: number) {
  const dur = Math.max(0.1, p.revealDuration ?? 1.2);
  const w = p.width;
  const h = p.height;
  const values = p.values.length ? p.values : [0];
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const font = (size: number) => `bold ${size}px ${p.fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.direction = "rtl";

  if (p.kind === "donut" || p.kind === "progress") {
    const target = Math.max(0, Math.min(100, values[0]));
    const k = easeOut(localTime / dur);
    const now = target * k;
    if (p.kind === "donut") {
      const r = Math.min(w, h) / 2 - Math.min(w, h) * 0.08;
      const lw = Math.min(w, h) * 0.12;
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      ctx.strokeStyle = p.trackColor;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      if (now > 0) {
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * now) / 100);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = font(r * 0.55);
      ctx.fillText(fmt(now, p), 0, p.labels[0] ? -r * 0.1 : 0);
      if (p.labels[0]) {
        ctx.font = font(r * 0.2);
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillText(p.labels[0], 0, r * 0.35);
      }
      return;
    }
    const bh = h * 0.28;
    ctx.fillStyle = p.trackColor;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -bh / 2, w, bh, bh / 2);
    ctx.fill();
    if (now > 0) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      // Fills right-to-left, matching Arabic reading direction.
      ctx.roundRect(w / 2 - (w * now) / 100, -bh / 2, (w * now) / 100, bh, bh / 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = font(bh * 0.9);
    ctx.textAlign = "right";
    ctx.fillText(p.labels[0] ?? "", w / 2, -bh * 1.2);
    ctx.textAlign = "left";
    ctx.fillText(fmt(now, p), -w / 2, -bh * 1.2);
    return;
  }

  const n = values.length;
  const labelH = h * 0.14;
  const plotH = h - labelH * 2;
  const top = -h / 2 + labelH;
  const slot = w / n;

  if (p.kind === "line") {
    const k = easeOut(localTime / dur);
    const pts = values.map((v, i) => ({ x: w / 2 - slot * (i + 0.5), y: top + plotH - (v / max) * plotH }));
    ctx.strokeStyle = p.trackColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w / 2, top + plotH);
    ctx.lineTo(w / 2, top + plotH);
    ctx.stroke();
    // Draw the polyline progressively along its length.
    const segs = pts.slice(1).map((pt, i) => Math.hypot(pt.x - pts[i].x, pt.y - pts[i].y));
    let remaining = segs.reduce((a, b) => a + b, 0) * k;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(3, h * 0.02);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    let reached = 0;
    for (let i = 0; i < segs.length && remaining > 0; i++) {
      const f = Math.min(1, remaining / segs[i]);
      ctx.lineTo(pts[i].x + (pts[i + 1].x - pts[i].x) * f, pts[i].y + (pts[i + 1].y - pts[i].y) * f);
      remaining -= segs[i];
      if (f >= 1) reached = i + 1;
    }
    ctx.stroke();
    ctx.font = font(labelH * 0.55);
    ctx.textAlign = "center";
    pts.forEach((pt, i) => {
      if (i > reached) return;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(4, h * 0.02), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(fmt(values[i], p), pt.x, pt.y - labelH * 0.6);
      if (p.labels[i]) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(p.labels[i], pt.x, top + plotH + labelH * 0.6);
      }
    });
    return;
  }

  // Bars, staggered right-to-left.
  const bw = slot * 0.6;
  ctx.font = font(Math.min(labelH * 0.6, bw * 0.45));
  ctx.textAlign = "center";
  values.forEach((v, i) => {
    const k = easeOut((localTime - i * 0.12) / dur);
    const bh = (Math.abs(v) / max) * plotH * k;
    const x = w / 2 - slot * (i + 0.5);
    ctx.fillStyle = p.trackColor;
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, top, bw, plotH, bw * 0.15);
    ctx.fill();
    if (bh > 0.5) {
      ctx.fillStyle = i === values.indexOf(Math.max(...values)) ? p.color : p.secondaryColor ?? p.color;
      ctx.beginPath();
      ctx.roundRect(x - bw / 2, top + plotH - bh, bw, bh, bw * 0.15);
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillText(fmt(v * k, p), x, top + plotH - bh - labelH * 0.45);
    if (p.labels[i]) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(p.labels[i], x, top + plotH + labelH * 0.6);
    }
  });
}
