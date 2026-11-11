// Jump cuts: the first thing a human editor does to a talking-head clip is cut the dead air,
// filler and false starts. A clip with cuts keeps a list of source-time segments to play back to
// back; these helpers map between the layer's local (edited) time and the source's own time.

export interface Segment {
  start: number; // source seconds
  end: number;
}

export interface TimedWord {
  start: number;
  end: number;
}

export function segmentsDuration(segs: Segment[]): number {
  return segs.reduce((a, s) => a + Math.max(0, s.end - s.start), 0);
}

/** Local (edited) time → source time. Past the end it clamps to the last segment's end. */
export function localToSource(local: number, segs: Segment[]): number {
  let acc = 0;
  for (const s of segs) {
    const len = s.end - s.start;
    if (local < acc + len) return s.start + Math.max(0, local - acc);
    acc += len;
  }
  return segs.length ? segs[segs.length - 1].end : local;
}

/** Source time → local (edited) time. A time inside a removed gap maps to where the next segment starts. */
export function sourceToLocal(source: number, segs: Segment[]): number {
  let acc = 0;
  for (const s of segs) {
    if (source < s.start) return acc;
    if (source <= s.end) return acc + (source - s.start);
    acc += s.end - s.start;
  }
  return acc;
}

export interface CutOptions {
  /** Pauses longer than this (s) are shortened. */
  minGap?: number;
  /** Breathing room kept before/after speech (s). */
  pad?: number;
}

/**
 * Speech segments to keep: words are merged across pauses shorter than `minGap`; longer pauses
 * are cut down to `pad` on each side; `remove` ranges (filler, false starts, retakes — in source
 * seconds) are dropped entirely. Returns null when cutting wouldn't save at least half a second.
 */
export function computeSegments(words: TimedWord[], clip: Segment, remove: Segment[] = [], opts: CutOptions = {}): Segment[] | null {
  const minGap = opts.minGap ?? 0.45;
  const pad = opts.pad ?? 0.12;
  const kept = words.filter((w) => !remove.some((r) => w.start >= r.start - 0.01 && w.end <= r.end + 0.01));
  if (kept.length === 0) return null;
  const segs: Segment[] = [];
  for (const w of kept) {
    const s = Math.max(clip.start, w.start - pad);
    const e = Math.min(clip.end, w.end + pad);
    const last = segs[segs.length - 1];
    // Never bridge across a removed range, even if the pause around it is short.
    const crossesRemoval = last && remove.some((r) => r.start >= last.end - pad - 0.01 && r.end <= w.start + 0.01);
    if (last && !crossesRemoval && w.start - (last.end - pad) <= minGap) last.end = Math.max(last.end, e);
    else segs.push({ start: s, end: e });
  }
  // Merge overlaps created by padding.
  const merged: Segment[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  const saved = clip.end - clip.start - segmentsDuration(merged);
  return saved >= 0.5 ? merged : null;
}
