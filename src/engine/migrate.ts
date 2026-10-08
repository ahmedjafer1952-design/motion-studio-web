import type { AnimatedProperty, Composition, Keyframe, Layer, LayerType, Point, Project } from "../types";
import { createDefaultComposition, defaultProps, staticProp } from "./factory";
import { COLOR_GRADES } from "./colorGrade";
import { makeId } from "../utils/id";

const LAYER_TYPES: LayerType[] = [
  "text",
  "rect",
  "ellipse",
  "polygon",
  "star",
  "image",
  "video",
  "audio",
  "caption",
  "glass",
  "overlay",
  "chart",
  "cutout",
];

export class InvalidProjectError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
const isPoint = (v: unknown): v is Point => isObj(v) && typeof v.x === "number" && typeof v.y === "number";

function animated<T>(raw: unknown, fallback: T, valid: (v: unknown) => v is T): AnimatedProperty<T> {
  if (!isObj(raw)) return staticProp(fallback);
  const keyframes = Array.isArray(raw.keyframes)
    ? (raw.keyframes as unknown[])
        .filter((k): k is Obj => isObj(k) && typeof k.time === "number" && valid(k.value))
        .map(
          (k): Keyframe<T> => ({
            id: str(k.id, makeId("kf")),
            time: k.time as number,
            value: k.value as T,
            easing: ["linear", "easeIn", "easeOut", "easeInOut", "spring", "backOut"].includes(k.easing as string)
              ? (k.easing as Keyframe<T>["easing"])
              : "easeInOut",
          })
        )
        .sort((a, b) => a.time - b.time)
    : [];
  return { static: valid(raw.static) ? raw.static : fallback, keyframes };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function normalizeLayer(raw: unknown, comp: Composition): Layer | null {
  if (!isObj(raw) || !LAYER_TYPES.includes(raw.type as LayerType)) return null;
  const type = raw.type as LayerType;
  const t = isObj(raw.transform) ? raw.transform : {};
  const startTime = Math.max(0, num(raw.startTime, 0));
  const endTime = Math.max(startTime + 0.05, num(raw.endTime, comp.duration));
  return {
    id: str(raw.id, makeId("layer")),
    name: str(raw.name, type),
    type,
    startTime,
    endTime,
    transform: {
      position: animated(t.position, { x: comp.width / 2, y: comp.height / 2 }, isPoint),
      scale: animated(t.scale, { x: 1, y: 1 }, isPoint),
      rotation: animated(t.rotation, 0, isNum),
      opacity: animated(t.opacity, 1, isNum),
    },
    // New props added in later versions get their defaults; saved values win.
    props: { ...defaultProps(type), ...(isObj(raw.props) ? raw.props : {}) } as Layer["props"],
  };
}

/**
 * Validates a project loaded from a file or autosave and fills in anything an older version
 * didn't have, so a stale or hand-edited file can't crash the editor. Throws on garbage.
 */
export function normalizeProject(raw: unknown): Project {
  if (!isObj(raw) || !isObj(raw.composition)) {
    throw new InvalidProjectError("This doesn't look like a Motion Studio project file.");
  }
  const c = raw.composition;
  const defaults = createDefaultComposition();
  const comp: Composition = {
    id: str(c.id, defaults.id),
    name: str(c.name, defaults.name),
    width: Math.max(16, Math.round(num(c.width, defaults.width))),
    height: Math.max(16, Math.round(num(c.height, defaults.height))),
    fps: Math.min(60, Math.max(1, num(c.fps, defaults.fps))),
    duration: Math.max(0.5, num(c.duration, defaults.duration)),
    backgroundColor: str(c.backgroundColor, defaults.backgroundColor),
    colorGrade: COLOR_GRADES.some((g) => g.id === c.colorGrade)
      ? (c.colorGrade as Composition["colorGrade"])
      : "none",
    layers: [],
  };
  comp.layers = (Array.isArray(c.layers) ? c.layers : [])
    .map((l) => normalizeLayer(l, comp))
    .filter((l): l is Layer => l !== null);
  return { id: str(raw.id, makeId("proj")), name: str(raw.name, "Untitled"), composition: comp };
}
