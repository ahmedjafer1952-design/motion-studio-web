import { describe, expect, it } from "vitest";
import { applyCaptionEdits, captionLines, emphasisKeys, linesToText } from "../captionReview";

const w = (text: string, start: number) => ({ text, start, end: start + 0.3 });
const words = [w("أكبر", 0), w("مشكلة", 0.35), w("ويعتبر", 0.7), w("المحاضرات", 2), w("بالتسلسل", 2.35)];

describe("caption review", () => {
  it("groups by pauses and round-trips text", () => {
    const lines = captionLines(words);
    expect(lines).toHaveLength(2);
    expect(linesToText(lines)).toBe("أكبر مشكلة ويعتبر\nالمحاضرات بالتسلسل");
  });
  it("re-times edited lines within their span and keeps emphasis", () => {
    const lines = captionLines(words);
    const keys = emphasisKeys(lines, words, new Set([1]));
    const res = applyCaptionEdits(lines, keys, "أكبر مشكلة تواجه الطالب\nالمحاضرات بالتسلسل");
    if ("error" in res) throw new Error(res.error);
    expect(res.words.map((x) => x.text)).toEqual(["أكبر", "مشكلة", "تواجه", "الطالب", "المحاضرات", "بالتسلسل"]);
    expect(res.words[3].end).toBeLessThanOrEqual(1.0);
    expect(res.words[4].start).toBe(2);
    expect([...res.emphasis]).toEqual([1]);
  });
  it("refuses a changed line count", () => {
    const res = applyCaptionEdits(captionLines(words), new Set(), "سطر واحد بس");
    expect("error" in res).toBe(true);
  });
});
