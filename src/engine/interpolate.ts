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
    case "spring":
      // Under-damped spring: overshoots, wobbles once or twice, settles exactly on the target.
      return t >= 1 ? 1 : 1 - Math.exp(-6.5 * t) * Math.cos(13 * t);
    case "backOut": {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    }
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
