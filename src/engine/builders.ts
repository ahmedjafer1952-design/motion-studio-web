import type { Composition, ImageLayerProps, Layer, ShapeLayerProps, TextLayerProps } from "../types";
import { createLayer, staticProp } from "./factory";

interface CommonOpts {
  x: number;
  y: number;
  startTime?: number;
  endTime?: number;
  rotation?: number;
  name: string;
}

function place(comp: Composition, layer: Layer, opts: CommonOpts): Layer {
  return {
    ...layer,
    name: opts.name,
    startTime: opts.startTime ?? 0,
    endTime: opts.endTime ?? comp.duration,
    transform: {
      ...layer.transform,
      position: staticProp({ x: opts.x, y: opts.y }),
      rotation: staticProp(opts.rotation ?? 0),
    },
  };
}

export function makeText(
  comp: Composition,
  opts: CommonOpts & {
    content: string;
    fontSize: number;
    color: string;
    align?: "left" | "center" | "right";
    fontFamily?: string;
  }
): Layer {
  const layer = createLayer("text", comp);
  const props: TextLayerProps = {
    content: opts.content,
    fontSize: opts.fontSize,
    color: opts.color,
    fontFamily: opts.fontFamily ?? "Arial, sans-serif",
    align: opts.align ?? "center",
  };
  return { ...place(comp, layer, opts), props };
}

export function makeRect(
  comp: Composition,
  opts: CommonOpts & { width: number; height: number; color: string; radius?: number }
): Layer {
  const layer = createLayer("rect", comp);
  const props: ShapeLayerProps = { width: opts.width, height: opts.height, color: opts.color, radius: opts.radius ?? 0 };
  return { ...place(comp, layer, opts), props };
}

export function makeEllipse(
  comp: Composition,
  opts: CommonOpts & { width: number; height: number; color: string }
): Layer {
  const layer = createLayer("ellipse", comp);
  const props: ShapeLayerProps = { width: opts.width, height: opts.height, color: opts.color };
  return { ...place(comp, layer, opts), props };
}

export function makeImage(
  comp: Composition,
  opts: CommonOpts & { width: number; height: number }
): Layer {
  const layer = createLayer("image", comp);
  const props: ImageLayerProps = { src: "", width: opts.width, height: opts.height };
  return { ...place(comp, layer, opts), props };
}
