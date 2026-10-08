import type { EditPlan, KeyPhraseLook } from "../autoEdit";

const KEY_LOOKS: KeyPhraseLook[] = ["neon", "box", "glass", "stretch"];
import type { CaptionStyle, ColorGradeId } from "../../types";
import { SOUND_LIBRARY, type SoundId } from "../sounds";
import { COLOR_GRADES } from "../colorGrade";
import type { TranscribedWord } from "../transcribe";
import type { AiEditRequest, ClaudeEditOutput } from "./types";

const CAPTION_STYLES: CaptionStyle[] = ["bigWord", "karaokeLine", "pillWord", "emphasisOnly", "buildUp", "phraseStack", "glassPill"];
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

  const fixed = words.map((w) => ({ ...w }));
  for (const c of out.corrections) {
    const text = c.text.trim();
    if (valid(c.index) && !/\s/.test(text)) fixed[c.index].text = text; // "" = drop the word
  }
  // Rewrites replace a garbled span with what was said, spreading the new words over its time.
  const replaced = new Map<number, { from: number; to: number; text: string }>();
  const covered = new Set<number>();
  for (const r of [...(out.rewrites ?? [])].sort((a, b) => a.fromWord - b.fromWord)) {
    if (!valid(r.fromWord) || !valid(r.toWord) || r.toWord < r.fromWord) continue;
    let clash = false;
    for (let i = r.fromWord; i <= r.toWord; i++) if (covered.has(i)) clash = true;
    if (clash) continue;
    for (let i = r.fromWord; i <= r.toWord; i++) covered.add(i);
    replaced.set(r.fromWord, { from: r.fromWord, to: r.toWord, text: r.text.trim() });
  }
  const emphasisIn = new Set(out.emphasis.filter(valid));
  const corrected: TranscribedWord[] = [];
  const emphasis = new Set<number>();
  for (let i = 0; i < n; i++) {
    const r = replaced.get(i);
    if (r) {
      const parts = r.text.split(/\s+/).filter(Boolean);
      const t0 = words[r.from].start;
      const t1 = Math.max(words[r.to].end, t0 + 0.2 * parts.length);
      const step = (t1 - t0) / Math.max(1, parts.length);
      parts.forEach((text, k) => corrected.push({ text, start: t0 + k * step, end: t0 + (k + 1) * step - 0.02 }));
      i = r.to;
      continue;
    }
    if (covered.has(i) || !fixed[i].text.trim()) continue;
    if (emphasisIn.has(i)) emphasis.add(corrected.length);
    corrected.push(fixed[i]);
  }

  const style = out.captionStyle.trim() as CaptionStyle;
  const grade = out.colorGrade.trim();
  return {
    words: corrected,
    emphasis,
    captionStyle: CAPTION_STYLES.includes(style) ? style : "phraseStack",
    title: out.title?.trim() || null,
    numbers: out.numbers.filter((x) => valid(x.atWord) && x.value.trim()).map((x) => ({ text: x.value.trim(), label: x.label.trim(), time: at(x.atWord) })),
    lists: out.lists
      .map((l) => ({ items: l.items.filter((it) => valid(it.atWord) && it.text.trim()).map((it) => ({ text: it.text.trim(), time: at(it.atWord) })) }))
      .filter((l) => l.items.length > 0),
    keyPhrases: out.keyPhrases
      .filter((k) => valid(k.atWord) && k.text.trim())
      .map((k) => ({ text: k.text.trim(), time: at(k.atWord), look: KEY_LOOKS.includes(k.look?.trim() as KeyPhraseLook) ? (k.look!.trim() as KeyPhraseLook) : "neon" })),
    broll: (out.broll ?? [])
      .filter((b) => valid(b.atWord) && valid(b.endWord) && b.endWord >= b.atWord && b.description.trim())
      .slice(0, 6)
      .map((b) => ({ start: at(b.atWord), end: Math.max(at(b.atWord) + 1.5, words[b.endWord].end), description: b.description.trim() })),
    accent: /^#[0-9a-f]{6}$/i.test(out.accentColor?.trim() ?? "") ? out.accentColor!.trim() : null,
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
