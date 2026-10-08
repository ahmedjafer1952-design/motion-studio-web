import { createContext, useContext } from "react";

/** Timeline zoom in pixels per second — auto-fit so the whole composition is visible. */
export const TimelineScaleContext = createContext(140);
export const useTimelineScale = () => useContext(TimelineScaleContext);

export function fitPixelsPerSecond(availableWidth: number, duration: number): number {
  if (availableWidth <= 0 || duration <= 0) return 140;
  return Math.max(2, Math.min(140, (availableWidth - 8) / duration));
}

/** Ruler label spacing that keeps labels readable at the current zoom. */
export function rulerStep(pixelsPerSecond: number): number {
  for (const step of [1, 2, 5, 10, 15, 30, 60]) {
    if (step * pixelsPerSecond >= 40) return step;
  }
  return 120;
}
export const PROPERTY_COLORS: Record<string, string> = {
  position: "#4fd1ff",
  scale: "#7cff8a",
  rotation: "#ffb347",
  opacity: "#d59bff",
};
export const PROPERTY_ORDER = ["position", "scale", "rotation", "opacity"] as const;
