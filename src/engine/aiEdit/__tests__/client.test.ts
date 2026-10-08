import { describe, expect, it } from "vitest";
import { planFromClaude } from "../client";
import { buildEditUserMessage } from "../prompt";
import type { ClaudeEditOutput } from "../types";

const words = [
  { text: "هلا", start: 0, end: 0.3 },
  { text: "شلونكوم", start: 0.4, end: 0.9 },
  { text: "عندنا", start: 1.0, end: 1.3 },
  { text: "500", start: 1.4, end: 1.8 },
];

const base: ClaudeEditOutput = {
  corrections: [],
  emphasis: [],
  captionStyle: "emphasisOnly",
  title: null,
  numbers: [],
  lists: [],
  keyPhrases: [],
  zooms: [],
  sounds: [],
  colorGrade: "none",
  cta: null,
  summary: "",
};

describe("planFromClaude", () => {
  it("applies word corrections in place, keeping the original timing", () => {
    const plan = planFromClaude(words, { ...base, corrections: [{ index: 1, text: "شلونكم" }] });
    expect(plan.words[1]).toEqual({ text: "شلونكم", start: 0.4, end: 0.9 });
  });

  it("ignores anything that points outside the transcript or isn't recognized", () => {
    const plan = planFromClaude(words, {
      ...base,
      corrections: [{ index: 42, text: "x" }, { index: 0, text: "two words" }],
      emphasis: [3, -1, 99],
      captionStyle: "sparkly",
      zooms: [{ atWord: 3, strength: "STRONG?" }, { atWord: 50, strength: "strong" }],
      sounds: [{ atWord: 3, sound: "pop" }, { atWord: 2, sound: "foghorn" }],
      colorGrade: "rainbow",
    });
    expect(plan.words[0].text).toBe("هلا");
    expect([...plan.emphasis]).toEqual([3]);
    expect(plan.captionStyle).toBe("phraseStack");
    expect(plan.zooms).toEqual([{ time: 1.4, strength: "light" }]);
    expect(plan.sounds).toEqual([{ sound: "pop", time: 1.4 }]);
    expect(plan.colorGrade).toBeNull();
  });

  it("converts word indexes into the words' start times", () => {
    const plan = planFromClaude(words, {
      ...base,
      numbers: [{ atWord: 3, value: "500", label: "عميل" }],
      colorGrade: "warmFilm",
    });
    expect(plan.numbers).toEqual([{ text: "500", label: "عميل", time: 1.4 }]);
    expect(plan.colorGrade).toBe("warmFilm");
  });
});

describe("edit prompt", () => {
  it("lists every word with its index and start time, and passes the creator's notes", () => {
    const msg = buildEditUserMessage({
      words,
      pace: "strong",
      instructions: "إعلان مطعم",
      title: { enabled: true, text: "" },
      cta: { enabled: false, text: "" },
      frame: { width: 720, height: 1280 },
    });
    expect(msg).toContain("1|0.40|شلونكوم");
    expect(msg).toContain("vertical");
    expect(msg).toContain("إعلان مطعم");
    expect(msg).toContain("CTA: none");
  });
});
