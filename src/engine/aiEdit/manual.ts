import { EDIT_SYSTEM_PROMPT, buildEditUserMessage } from "./prompt";
import type { AiEditRequest, ClaudeEditOutput } from "./types";

// "Use my Claude subscription" mode: the app can't call claude.ai itself (subscriptions don't
// include API access), so the creator copies this prompt into a Claude chat and pastes the
// JSON reply back. planFromClaude() then validates every field exactly like the API path.

const FORMAT = `Reply with ONLY one JSON object (no explanation before or after) in exactly this shape:
{
  "corrections": [{"index": 12, "text": "fixed word"}],
  "emphasis": [3, 17],
  "captionStyle": "bigWord | karaokeLine | pillWord | emphasisOnly | buildUp | phraseStack",
  "title": "string or null",
  "numbers": [{"atWord": 5, "value": "70%", "label": "short label"}],
  "lists": [{"items": [{"atWord": 20, "text": "item"}]}],
  "keyPhrases": [{"atWord": 30, "text": "short phrase"}],
  "zooms": [{"atWord": 8, "strength": "light | strong"}],
  "sounds": [{"atWord": 8, "sound": "one of the available sounds"}],
  "colorGrade": "one of the available color grades",
  "cta": "string or null",
  "summary": "one or two sentences, in the creator's language, describing the edit"
}`;

export function buildManualPrompt(req: AiEditRequest): string {
  return [EDIT_SYSTEM_PROMPT, "---", buildEditUserMessage(req), "---", FORMAT].join("\n\n");
}

const arr = <T>(v: unknown, map: (x: Record<string, unknown>) => T | null): T[] =>
  Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? map(x as Record<string, unknown>) : null)).filter((x): x is T => x !== null) : [];
const int = (v: unknown) => (typeof v === "number" ? v : Number(v));
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Pulls the JSON object out of a pasted chat reply (tolerates ```json fences and extra text). */
export function parseManualReply(text: string): ClaudeEditOutput {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON found in the pasted reply — copy Claude's whole answer.");
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The pasted reply isn't complete JSON — make sure you copied all of it.");
  }
  return {
    corrections: arr(o.corrections, (x) => ({ index: int(x.index), text: str(x.text) })),
    emphasis: Array.isArray(o.emphasis) ? o.emphasis.map(int) : [],
    captionStyle: str(o.captionStyle),
    title: o.title == null ? null : str(o.title),
    numbers: arr(o.numbers, (x) => ({ atWord: int(x.atWord), value: str(x.value), label: str(x.label) })),
    lists: arr(o.lists, (x) => ({ items: arr(x.items, (it) => ({ atWord: int(it.atWord), text: str(it.text) })) })),
    keyPhrases: arr(o.keyPhrases, (x) => ({ atWord: int(x.atWord), text: str(x.text) })),
    zooms: arr(o.zooms, (x) => ({ atWord: int(x.atWord), strength: str(x.strength) })),
    sounds: arr(o.sounds, (x) => ({ atWord: int(x.atWord), sound: str(x.sound) })),
    colorGrade: str(o.colorGrade),
    cta: o.cta == null ? null : str(o.cta),
    summary: str(o.summary),
  };
}
