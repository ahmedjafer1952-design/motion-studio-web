import type { EditPlan } from "../autoEdit";
import type { CaptionStyle, ColorGradeId } from "../../types";
import { SOUND_LIBRARY, type SoundId } from "../sounds";
import { COLOR_GRADES } from "../colorGrade";
import type { TranscribedWord } from "../transcribe";
import type { AiEditRequest, ClaudeEditOutput } from "./types";

const CAPTION_STYLES: CaptionStyle[] = ["bigWord", "karaokeLine", "pillWord", "emphasisOnly", "buildUp"];
const SOUND_IDS = new Set<string>(SOUND_LIBRARY.map((s) => s.id));
const GRADE_IDS = new Set<string>(COLOR_GRADES.map((g) => g.id));

const KEY_STORAGE = "motion-studio-claude-key";
const CODE_STORAGE = "motion-studio-ai-access-code";

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // storage unavailable — the setting just won't persist
  }
}

export const aiSettings = {
  getApiKey: () => read(KEY_STORAGE),
  // Keys copied from chats or Arabic text often carry invisible characters (RTL marks, spaces,
  // line breaks) that make Anthropic reject an otherwise valid key — keep only the key's own characters.
  setApiKey: (v: string) => write(KEY_STORAGE, v.replace(/[^A-Za-z0-9_-]/g, "")),
  getAccessCode: () => read(CODE_STORAGE),
  setAccessCode: (v: string) => write(CODE_STORAGE, v.trim()),
};

/**
 * Asks Claude for an edit plan. With a personal key saved in this browser, calls the API
 * directly; otherwise goes through the app's own /api/ai-edit endpoint, which keeps the
 * owner's key on the server.
 */
export async function fetchClaudeEdit(req: AiEditRequest): Promise<ClaudeEditOutput> {
  const apiKey = aiSettings.getApiKey();
  if (apiKey && !apiKey.startsWith("sk-ant-")) {
    throw new Error("The saved key doesn't look like a Claude API key (it should start with sk-ant-). Create one at console.anthropic.com → API Keys.");
  }
  if (apiKey) {
    const [{ default: Anthropic }, { requestClaudeEdit, validateRequest }] = await Promise.all([
      import("@anthropic-ai/sdk"),
      import("./claude"),
    ]);
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    return requestClaudeEdit(client, validateRequest(req));
  }

  let res: Response;
  try {
    res = await fetch("/api/ai-edit", {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-code": aiSettings.getAccessCode() },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your internet connection.");
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (res.status === 404) {
    throw new Error("Claude isn't connected yet. Add your Claude API key in the settings below.");
  }
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
  return body as ClaudeEditOutput;
}

/** Turns Claude's index-based decisions into a time-based plan, ignoring anything out of range. */
export function planFromClaude(words: TranscribedWord[], out: ClaudeEditOutput): EditPlan {
  const n = words.length;
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
  const at = (i: number) => words[Math.min(n - 1, Math.max(0, i))].start;

  const corrected = words.map((w) => ({ ...w }));
  for (const c of out.corrections) {
    const text = c.text.trim();
    if (valid(c.index) && text && !/\s/.test(text)) corrected[c.index].text = text;
  }

  const style = out.captionStyle.trim() as CaptionStyle;
  const grade = out.colorGrade.trim();
  return {
    words: corrected,
    emphasis: new Set(out.emphasis.filter(valid)),
    captionStyle: CAPTION_STYLES.includes(style) ? style : "emphasisOnly",
    title: out.title?.trim() || null,
    numbers: out.numbers.filter((x) => valid(x.atWord) && x.value.trim()).map((x) => ({ text: x.value.trim(), label: x.label.trim(), time: at(x.atWord) })),
    lists: out.lists
      .map((l) => ({ items: l.items.filter((it) => valid(it.atWord) && it.text.trim()).map((it) => ({ text: it.text.trim(), time: at(it.atWord) })) }))
      .filter((l) => l.items.length > 0),
    keyPhrases: out.keyPhrases.filter((k) => valid(k.atWord) && k.text.trim()).map((k) => ({ text: k.text.trim(), time: at(k.atWord) })),
    zooms: out.zooms
      .filter((z) => valid(z.atWord))
      .map((z) => ({ time: at(z.atWord), strength: z.strength.trim() === "strong" ? ("strong" as const) : ("light" as const) })),
    sounds: out.sounds
      .filter((s) => valid(s.atWord) && SOUND_IDS.has(s.sound.trim()))
      .map((s) => ({ sound: s.sound.trim() as SoundId, time: at(s.atWord) })),
    colorGrade: GRADE_IDS.has(grade) && grade !== "none" ? (grade as ColorGradeId) : null,
    cta: out.cta?.trim() || null,
  };
}
