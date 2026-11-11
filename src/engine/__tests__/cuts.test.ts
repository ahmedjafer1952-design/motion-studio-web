import { describe, expect, it } from "vitest";
import { computeSegments, localToSource, segmentsDuration, sourceToLocal } from "../cuts";

const w = (start: number, end: number) => ({ start, end });

describe("jump cuts", () => {
  it("keeps speech, shortens long pauses, merges short ones", () => {
    // Speech 0–1, short pause, 1.2–2, a 3 s silence, 5–6.
    const segs = computeSegments([w(0, 1), w(1.2, 2), w(5, 6)], { start: 0, end: 7 });
    expect(segs).toEqual([
      { start: 0, end: 2.12 },
      { start: 4.88, end: 6.12 },
    ]);
    expect(segmentsDuration(segs!)).toBeCloseTo(3.36);
  });

  it("drops removed ranges (filler / false starts)", () => {
    const segs = computeSegments([w(0, 1), w(1.1, 1.4), w(1.5, 2.5)], { start: 0, end: 3 }, [{ start: 1.1, end: 1.4 }]);
    expect(segs).toEqual([
      { start: 0, end: 1.12 },
      { start: 1.38, end: 2.62 },
    ]);
  });

  it("returns null when there's nothing worth cutting", () => {
    expect(computeSegments([w(0, 1), w(1.2, 2)], { start: 0, end: 2.1 })).toBeNull();
  });

  it("maps local ↔ source time across cuts", () => {
    const segs = [
      { start: 0, end: 2 },
      { start: 5, end: 6 },
    ];
    expect(localToSource(1, segs)).toBe(1);
    expect(localToSource(2.5, segs)).toBe(5.5);
    expect(sourceToLocal(5.5, segs)).toBe(2.5);
    expect(sourceToLocal(3, segs)).toBe(2); // inside a cut → the next segment's start
    expect(sourceToLocal(localToSource(2.75, segs), segs)).toBeCloseTo(2.75);
  });
});
