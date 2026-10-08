import type {
  AnimatedProperty,
  Composition,
  Layer,
  LayerType,
  Point,
  Project,
  ShapeLayerProps,
  TextLayerProps,
} from "../types";
import { makeId } from "../utils/id";

export function staticProp<T>(value: T): AnimatedProperty<T> {
  return { static: value, keyframes: [] };
}

export function defaultTransform(width: number, height: number, compW: number, compH: number) {
  return {
    position: staticProp<Point>({ x: compW / 2, y: compH / 2 }),
    scale: staticProp<Point>({ x: 1, y: 1 }),
    rotation: staticProp<number>(0),
    opacity: staticProp<number>(1),
  };
}

function defaultProps(type: LayerType): Layer["props"] {
  switch (type) {
    case "text":
      return {
        content: "Text",
        fontSize: 64,
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        align: "center",
      } as TextLayerProps;
    case "rect":
      return { width: 300, height: 180, color: "#4f8cff", radius: 12 } as ShapeLayerProps;
    case "ellipse":
      return { width: 220, height: 220, color: "#ff6b6b" } as ShapeLayerProps;
    case "image":
      return { src: "", width: 300, height: 300 };
    case "video":
      return { src: "", fileName: "", width: 640, height: 360, trimIn: 0, naturalDuration: 0, muted: true };
  }
}

export function createLayer(type: LayerType, comp: Composition): Layer {
  const props = defaultProps(type);
  const w = "width" in props ? props.width : 300;
  const h = "height" in props ? props.height : 300;
  return {
    id: makeId("layer"),
    name: `${type[0].toUpperCase()}${type.slice(1)} ${comp.layers.length + 1}`,
    type,
    startTime: 0,
    endTime: comp.duration,
    transform: defaultTransform(w, h, comp.width, comp.height),
    props,
  };
}

export function createDefaultComposition(): Composition {
  return {
    id: makeId("comp"),
    name: "Composition 1",
    width: 1280,
    height: 720,
    fps: 30,
    duration: 5,
    backgroundColor: "#111113",
    layers: [],
  };
}

export function createDefaultProject(): Project {
  return {
    id: makeId("proj"),
    name: "Untitled Project",
    composition: createDefaultComposition(),
  };
}
