import type { Pace } from "../autoEdit";

/** What the editor sends to Claude: the transcript plus the creator's wishes. */
export interface AiEditRequest {
  words: { text: string; start: number; end: number }[];
  pace: Pace;
  /** Free text from the creator: what the video is, the vibe, anything to stress or avoid. */
  instructions: string;
  /** enabled + empty text = let Claude write it; enabled + text = use this wording. */
  title: { enabled: boolean; text: string };
  cta: { enabled: boolean; text: string };
  frame: { width: number; height: number };
  /** Brand color chosen by the creator ("" = let Claude pick). */
  brandColor?: string;
}

/** Claude's edit decisions, referencing transcript words by index so timing stays exact. */
export interface ClaudeEditOutput {
  corrections: { index: number; text: string }[];
  emphasis: number[];
  captionStyle: string; // validated against CaptionStyle when applied
  title: string | null;
  numbers: { atWord: number; value: string; label: string }[];
  lists: { items: { atWord: number; text: string }[] }[];
  keyPhrases: { atWord: number; text: string; look?: string }[];
  accentColor?: string;
  broll?: { atWord: number; endWord: number; description: string }[];
  zooms: { atWord: number; strength: string }[];
  sounds: { atWord: number; sound: string }[];
  colorGrade: string;
  cta: string | null;
  summary: string;
}
