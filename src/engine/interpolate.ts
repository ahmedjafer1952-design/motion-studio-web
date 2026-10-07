import type { Easing, Point } from "../types";

function easeFn(t: number, easing: Easing): number {
  switch (easing) {
    case "linear":
      return t;
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}

export function lerpNumber(a: number, b: number, t: number, easing: Easing): number {
  const e = easeFn(Math.min(1, Math.max(0, t)), easing);
  return a + (b - a) * e;
}

export function lerpPoint(a: Point, b: Point, t: number, easing: Easing): Point {
  return {
    x: lerpNumber(a.x, b.x, t, easing),
    y: lerpNumber(a.y, b.y, t, easing),
  };
}
