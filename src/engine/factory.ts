import type {
  AnimatedProperty,
  Composition,
  Layer,
  LayerType,
  OverlayLayerProps,
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

export function defaultProps(type: LayerType): Layer["props"] {
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
    case "polygon":
      return { width: 220, height: 220, color: "#7cff8a", sides: 6 };
    case "star":
      return { width: 220, height: 220, color: "#ffd166", points: 5, innerRatio: 0.5 };
    case "image":
      return { src: "", width: 300, height: 300 };
    case "video":
      return { src: "", fileName: "", width: 640, height: 360, trimIn: 0, naturalDuration: 0, muted: false };
    case "audio":
      return { src: "", fileName: "", trimIn: 0, naturalDuration: 0, muted: false };
    case "caption":
      return {
        words: [],
        style: "bigWord",
        fontSize: 56,
        color: "#ffffff",
        emphasisColor: "#ffd166",
        fontFamily: "Arial, sans-serif",
        sourceTrimIn: 0,
        sourceLayerName: "",
      };
    case "glass":
      return {
        width: 420,
        height: 160,
        radius: 24,
        blur: 18,
        tint: "rgba(255,255,255,0.10)",
        borderColor: "rgba(255,255,255,0.28)",
      };
    case "overlay":
      return { effect: "grain", intensity: 0.5, width: 1280, height: 720 } as OverlayLayerProps;
  }
}

export function createLayer(type: LayerType, comp: Composition): Layer {
  const props = defaultProps(type);
  if (type === "overlay") {
    (props as OverlayLayerProps).width = comp.width;
    (props as OverlayLayerProps).height = comp.height;
  }
  const w = "width" in props ? props.width : 300;
  const h = "height" in props ? props.height : 300;
  const transform = defaultTransform(w, h, comp.width, comp.height);
  if (type === "caption") {
    // Classic caption placement: lower third, not dead center over the subject.
    transform.position = staticProp<Point>({ x: comp.width / 2, y: comp.height * 0.82 });
  }
  return {
    id: makeId("layer"),
    name: `${type[0].toUpperCase()}${type.slice(1)} ${comp.layers.length + 1}`,
    type,
    startTime: 0,
    endTime: comp.duration,
    transform,
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
    colorGrade: "none",
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
