import type { TranscribedWord } from "./transcribe";

// Lets the creator proofread captions as plain lines before the edit is applied. Each line keeps
// its original time span; edited words are spread evenly across it, so timing stays in sync.

export interface CaptionLine {
  words: TranscribedWord[];
  start: number;
  end: number;
}

export function captionLines(words: TranscribedWord[], gap = 0.45, maxWords = 6): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let cur: TranscribedWord[] = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.start - prev.end > gap || cur.length >= maxWords)) {
      lines.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) lines.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
  return lines;
}

export const linesToText = (lines: CaptionLine[]) => lines.map((l) => l.words.map((w) => w.text).join(" ")).join("\n");

/**
 * Applies the proofread text (one line per original line). Returns the new words and which of
 * them stay emphasized (a word keeps its highlight if the same word was emphasized in that line),
 * or an error when the number of lines changed.
 */
export function applyCaptionEdits(
  lines: CaptionLine[],
  emphasizedTexts: Set<string>,
  text: string
): { words: TranscribedWord[]; emphasis: Set<number> } | { error: string } {
  const edited = text.split("\n").map((l) => l.trim());
  while (edited.length > lines.length && edited[edited.length - 1] === "") edited.pop();
  if (edited.length !== lines.length) {
    return { error: `لازم يبقى عدد الأسطر ${lines.length} — صحّح الكلمات بس، لا تضيف أو تمسح أسطر.` };
  }
  const words: TranscribedWord[] = [];
  const emphasis = new Set<number>();
  edited.forEach((line, i) => {
    const parts = line.split(/\s+/).filter(Boolean);
    const { start, end } = lines[i];
    const step = Math.max(0.12, end - start) / Math.max(1, parts.length);
    parts.forEach((p, k) => {
      if (emphasizedTexts.has(`${i}|${p}`)) emphasis.add(words.length);
      words.push({ text: p, start: start + k * step, end: start + (k + 1) * step - 0.02 });
    });
  });
  return { words, emphasis };
}

/** Keys "lineIndex|word" for the emphasized words, so highlights survive light edits. */
export function emphasisKeys(lines: CaptionLine[], allWords: TranscribedWord[], emphasis: Set<number>): Set<string> {
  const keys = new Set<string>();
  let idx = 0;
  lines.forEach((line, i) => {
    for (const w of line.words) {
      if (emphasis.has(idx) && allWords[idx] === w) keys.add(`${i}|${w.text}`);
      idx++;
    }
  });
  return keys;
}
