import type { AnimatedProperty, Point } from "../types";
import { lerpNumber, lerpPoint } from "./interpolate";

function evaluateGeneric<T>(
  prop: AnimatedProperty<T>,
  time: number,
  lerp: (a: T, b: T, t: number, easing: AnimatedProperty<T>["keyframes"][number]["easing"]) => T
): T {
  const kfs = prop.keyframes;
  if (kfs.length === 0) return prop.static;
  const sorted = [...kfs].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const k0 = sorted[i];
    const k1 = sorted[i + 1];
    if (time >= k0.time && time <= k1.time) {
      const span = k1.time - k0.time;
      const t = span === 0 ? 1 : (time - k0.time) / span;
      return lerp(k0.value, k1.value, t, k1.easing);
    }
  }
  return last.value;
}

export function evaluateNumber(prop: AnimatedProperty<number>, time: number): number {
  return evaluateGeneric(prop, time, lerpNumber);
}

export function evaluatePoint(prop: AnimatedProperty<Point>, time: number): Point {
  return evaluateGeneric(prop, time, lerpPoint);
}

export interface EvaluatedTransform {
  position: Point;
  scale: Point;
  rotation: number;
  opacity: number;
}

export function evaluateTransform(transform: {
  position: AnimatedProperty<Point>;
  scale: AnimatedProperty<Point>;
  rotation: AnimatedProperty<number>;
  opacity: AnimatedProperty<number>;
}, time: number): EvaluatedTransform {
  return {
    position: evaluatePoint(transform.position, time),
    scale: evaluatePoint(transform.scale, time),
    rotation: evaluateNumber(transform.rotation, time),
    opacity: evaluateNumber(transform.opacity, time),
  };
}
