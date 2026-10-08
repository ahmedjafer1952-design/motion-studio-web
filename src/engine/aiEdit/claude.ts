import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { COLOR_GRADES } from "../colorGrade";
import { SOUND_LIBRARY } from "../sounds";
import { EDIT_SYSTEM_PROMPT, buildEditUserMessage } from "./prompt";
import type { AiEditRequest, ClaudeEditOutput } from "./types";

// Runs wherever an API key is available: the dev server / Netlify function (key stays
// server-side), or the browser when the user pasted their own key into settings.

// Enum-like fields are plain strings described with their allowed values: the SDK's schema
// transform doesn't carry `enum` through, and one off-list value shouldn't sink a whole edit.
// planFromClaude() drops or defaults anything unrecognized.
const soundList = SOUND_LIBRARY.map((s) => s.id).join(", ");
const gradeList = COLOR_GRADES.map((g) => g.id).join(", ");
const wordIndex = () => z.number().int().describe("Index of a word in the transcript");

const ClaudeEditSchema = z.object({
  corrections: z.array(z.object({ index: wordIndex(), text: z.string() })),
  emphasis: z.array(wordIndex()),
  captionStyle: z.string().describe("One of: bigWord, karaokeLine, pillWord, emphasisOnly, buildUp"),
  title: z.string().nullable(),
  numbers: z.array(z.object({ atWord: wordIndex(), value: z.string(), label: z.string() })),
  lists: z.array(z.object({ items: z.array(z.object({ atWord: wordIndex(), text: z.string() })) })),
  keyPhrases: z.array(z.object({ atWord: wordIndex(), text: z.string() })),
  zooms: z.array(z.object({ atWord: wordIndex(), strength: z.string().describe("light or strong") })),
  sounds: z.array(z.object({ atWord: wordIndex(), sound: z.string().describe(`One of: ${soundList}`) })),
  colorGrade: z.string().describe(`One of: ${gradeList}`),
  cta: z.string().nullable(),
  summary: z.string(),
});

export const EDIT_MODEL = "claude-opus-5-5";

export class AiEditError extends Error {
  constructor(
    message: string,
    readonly status = 500
  ) {
    super(message);
  }
}

/** Longest transcript sent in one request (~25 minutes of speech). */
export const MAX_WORDS = 4000;

export function validateRequest(raw: unknown): AiEditRequest {
  const r = raw as Partial<AiEditRequest> | null;
  const words = Array.isArray(r?.words) ? r.words : null;
  if (!r || !words || words.length === 0) throw new AiEditError("The transcript is empty.", 400);
  if (words.length > MAX_WORDS) throw new AiEditError("This clip is too long for one edit — trim it first.", 413);
  const ok = words.every((w) => typeof w?.text === "string" && Number.isFinite(w.start) && Number.isFinite(w.end));
  if (!ok) throw new AiEditError("The transcript is malformed.", 400);
  const toggle = (v: unknown) => ({
    enabled: !!(v as { enabled?: unknown })?.enabled,
    text: String((v as { text?: unknown })?.text ?? "").slice(0, 120),
  });
  return {
    words: words.map((w) => ({ text: String(w.text).slice(0, 80), start: w.start, end: w.end })),
    pace: r.pace === "calm" || r.pace === "strong" ? r.pace : "medium",
    instructions: String(r.instructions ?? "").slice(0, 2000),
    title: toggle(r.title),
    cta: toggle(r.cta),
    frame: {
      width: Number(r.frame?.width) > 0 ? Number(r.frame?.width) : 1280,
      height: Number(r.frame?.height) > 0 ? Number(r.frame?.height) : 720,
    },
  };
}

export async function requestClaudeEdit(client: Anthropic, req: AiEditRequest): Promise<ClaudeEditOutput> {
  let response;
  try {
    response = await client.beta.messages.parse({
      model: EDIT_MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, retry server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ClaudeEditSchema) },
      system: EDIT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildEditUserMessage(req) }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiEditError("The Claude API key is invalid.", 401);
    if (err instanceof Anthropic.PermissionDeniedError) throw new AiEditError("This API key can't use this model.", 403);
    if (err instanceof Anthropic.RateLimitError) throw new AiEditError("Claude is busy (rate limit) — try again in a minute.", 429);
    if (err instanceof Anthropic.BadRequestError) throw new AiEditError(`Claude rejected the request: ${err.message}`, 400);
    if (err instanceof Anthropic.APIError) throw new AiEditError(`Claude API error (${err.status ?? "network"}).`, 502);
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new AiEditError("Claude declined to edit this clip.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiEditError("The edit plan was too long to finish — try a shorter clip.", 413);
  }
  if (!response.parsed_output) {
    throw new AiEditError("Claude's answer couldn't be read — please try again.", 502);
  }
  return response.parsed_output as ClaudeEditOutput;
}

/**
 * Shared HTTP handler for the dev server and the Netlify function. Returns a status + JSON body.
 * When ACCESS_CODE is configured, callers must send it, so a public deployment can't be used to
 * spend the owner's API credit by anyone who finds the URL.
 */
export async function handleAiEditHttp(
  body: unknown,
  env: { apiKey?: string; accessCode?: string },
  providedCode: string | null
): Promise<{ status: number; json: unknown }> {
  if (!env.apiKey) {
    return { status: 503, json: { error: "Claude isn't connected on this server (ANTHROPIC_API_KEY is not set)." } };
  }
  if (env.accessCode && providedCode !== env.accessCode) {
    return { status: 401, json: { error: "Wrong or missing access code." } };
  }
  try {
    const req = validateRequest(body);
    const client = new Anthropic({ apiKey: env.apiKey });
    return { status: 200, json: await requestClaudeEdit(client, req) };
  } catch (err) {
    if (err instanceof AiEditError) return { status: err.status, json: { error: err.message } };
    console.error("AI edit failed", err);
    return { status: 500, json: { error: "Unexpected server error." } };
  }
}
