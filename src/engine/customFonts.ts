import { resolveMediaUrl, storeMediaFile } from "./mediaStore";

// Fonts the user uploads from their own computer (e.g. a licensed brand font). The files live
// only in this browser's storage — never in the app's code or on a server — which keeps
// licenses that forbid redistributing the font files satisfied.

export interface CustomFont {
  family: string;
  weight: string;
  style: string;
  src: string; // "idb:…" media reference
  fileName: string;
}

const STORAGE_KEY = "motion-studio-custom-fonts";
const listeners = new Set<() => void>();
let cache: CustomFont[] | null = null;

function read(): CustomFont[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter((f) => f && typeof f.family === "string" && typeof f.src === "string") : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(list: CustomFont[]) {
  cache = list;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage full/unavailable — fonts still work until reload
  }
  listeners.forEach((l) => l());
}

export function listCustomFonts(): CustomFont[] {
  return read();
}

export function subscribeCustomFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** CSS font-family value for a custom family, as stored on text/caption layers. */
export const customFontValue = (family: string) => `'${family}', sans-serif`;

/** All stored font references, so unused-media cleanup never deletes an uploaded font. */
export function customFontRefs(): string {
  return read()
    .map((f) => f.src)
    .join(" ");
}

const WEIGHTS: [RegExp, string][] = [
  [/thin|hairline/i, "100"],
  [/extra-?light|ultra-?light/i, "200"],
  [/light/i, "300"],
  [/medium/i, "500"],
  [/semi-?bold|demi-?bold/i, "600"],
  [/extra-?bold|ultra-?bold/i, "800"],
  [/black|heavy/i, "900"],
  [/bold/i, "700"],
];

/** "thmanyahsans-Bold.otf" → family "thmanyahsans", weight 700. */
export function parseFontFileName(fileName: string): { family: string; weight: string; style: string } {
  const base = fileName.replace(/\.(otf|ttf|woff2?|)$/i, "");
  const [familyPart, ...rest] = base.split(/[-_ ]/);
  const variant = rest.join(" ");
  const weight = WEIGHTS.find(([re]) => re.test(variant))?.[1] ?? "400";
  return { family: familyPart || base, weight, style: /italic|oblique/i.test(variant) ? "italic" : "normal" };
}

const registered = new Set<string>();

async function register(font: CustomFont): Promise<void> {
  const key = `${font.family}|${font.weight}|${font.style}`;
  if (registered.has(key)) return;
  const url = await resolveMediaUrl(font.src);
  if (!url) return;
  const data = await (await fetch(url)).arrayBuffer();
  const face = new FontFace(font.family, data, { weight: font.weight, style: font.style });
  await face.load();
  document.fonts.add(face);
  registered.add(key);
}

/** Registers every stored font with the browser. Call once at startup. */
export async function loadCustomFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(read().map((f) => register(f).catch(() => {})));
  // FontFace.add() of an already-loaded face fires no "loadingdone", so tell the canvas directly.
  listeners.forEach((l) => l());
}

/** Imports font files; returns the families added and any files that couldn't be read. */
export async function addFontFiles(files: File[]): Promise<{ families: string[]; failed: string[] }> {
  const families = new Set<string>();
  const failed: string[] = [];
  let list = [...read()];
  for (const file of files) {
    if (!/\.(otf|ttf|woff2?)$/i.test(file.name)) {
      failed.push(file.name);
      continue;
    }
    const meta = parseFontFileName(file.name);
    try {
      const { src } = await storeMediaFile(file);
      const font: CustomFont = { ...meta, src, fileName: file.name };
      await register(font);
      list = list.filter((f) => !(f.family === font.family && f.weight === font.weight && f.style === font.style));
      list.push(font);
      families.add(font.family);
    } catch {
      failed.push(file.name);
    }
  }
  write(list);
  return { families: [...families], failed };
}

export function removeCustomFamily(family: string) {
  write(read().filter((f) => f.family !== family));
}
