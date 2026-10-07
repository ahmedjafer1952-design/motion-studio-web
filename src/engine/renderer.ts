import type { Composition, Layer, ImageLayerProps, ShapeLayerProps, TextLayerProps } from "../types";
import { evaluateTransform } from "./evaluate";

const imageCache = new Map<string, HTMLImageElement>();

function getImage(src: string): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached) return cached.complete ? cached : null;
  const img = new Image();
  img.src = src;
  imageCache.set(src, img);
  return null;
}

export function preloadImages(comp: Composition): Promise<void[]> {
  const sources = comp.layers
    .filter((l): l is Layer & { props: ImageLayerProps } => l.type === "image")
    .map((l) => (l.props as ImageLayerProps).src)
    .filter(Boolean);
  return Promise.all(
    sources.map(
      (src) =>
        new Promise<void>((resolve) => {
          const cached = imageCache.get(src);
          if (cached && cached.complete) {
            resolve();
            return;
          }
          const img = cached ?? new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          if (!cached) {
            img.src = src;
            imageCache.set(src, img);
          }
        })
    )
  );
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, time: number) {
  if (time < layer.startTime || time > layer.endTime) return;
  const t = evaluateTransform(layer.transform, time);
  if (t.opacity <= 0) return;

  ctx.save();
  ctx.translate(t.position.x, t.position.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale.x, t.scale.y);
  ctx.globalAlpha = Math.max(0, Math.min(1, t.opacity));

  switch (layer.type) {
    case "rect": {
      const p = layer.props as ShapeLayerProps;
      ctx.fillStyle = p.color;
      const r = p.radius ?? 0;
      const w = p.width;
      const h = p.height;
      if (r > 0) {
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, r);
        ctx.fill();
      } else {
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      break;
    }
    case "ellipse": {
      const p = layer.props as ShapeLayerProps;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.width / 2, p.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "text": {
      const p = layer.props as TextLayerProps;
      ctx.fillStyle = p.color;
      ctx.font = `${p.fontSize}px ${p.fontFamily}`;
      ctx.textAlign = p.align;
      ctx.textBaseline = "middle";
      ctx.fillText(p.content, 0, 0);
      break;
    }
    case "image": {
      const p = layer.props as ImageLayerProps;
      const img = getImage(p.src);
      if (img) {
        ctx.drawImage(img, -p.width / 2, -p.height / 2, p.width, p.height);
      }
      break;
    }
  }

  ctx.restore();
}

export function renderComposition(ctx: CanvasRenderingContext2D, comp: Composition, time: number) {
  ctx.save();
  ctx.clearRect(0, 0, comp.width, comp.height);
  ctx.fillStyle = comp.backgroundColor;
  ctx.fillRect(0, 0, comp.width, comp.height);

  // index 0 = topmost/front layer, so draw from the back (last) to the front (first).
  for (let i = comp.layers.length - 1; i >= 0; i--) {
    drawLayer(ctx, comp.layers[i], time);
  }
  ctx.restore();
}
