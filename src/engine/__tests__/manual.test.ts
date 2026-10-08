import { describe, expect, it } from "vitest";
import { buildManualPrompt, parseManualReply } from "../aiEdit/manual";

describe("manual Claude chat mode", () => {
  it("builds a prompt containing the transcript", () => {
    const p = buildManualPrompt({
      words: [{ text: "هلا", start: 0, end: 0.4 }],
      pace: "medium",
      instructions: "",
      title: { enabled: true, text: "" },
      cta: { enabled: false, text: "" },
      frame: { width: 720, height: 1280 },
    });
    expect(p).toContain("0|0.00|هلا");
    expect(p).toContain('"summary"');
  });
  it("parses a fenced reply with extra text", () => {
    const out = parseManualReply('Here:\n```json\n{"emphasis":[1,"2"],"zooms":[{"atWord":1,"strength":"strong"}],"summary":"تم"}\n```');
    expect(out.emphasis).toEqual([1, 2]);
    expect(out.zooms[0].strength).toBe("strong");
    expect(out.corrections).toEqual([]);
    expect(out.summary).toBe("تم");
  });
  it("rejects text without JSON", () => {
    expect(() => parseManualReply("sorry")).toThrow();
  });
});
