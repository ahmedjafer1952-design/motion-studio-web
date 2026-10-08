import type { CaptionLayerProps, Composition, TextLayerProps } from "../types";

export interface FontChoice {
  label: string;
  value: string; // CSS font-family list, used as-is in ctx.font
}

/** Arabic-capable web fonts, loaded from Google Fonts in index.html. */
export const FONT_CHOICES: FontChoice[] = [
  { label: "Arial — افتراضي", value: "Arial, sans-serif" },
  { label: "Cairo — القاهرة", value: "'Cairo', sans-serif" },
  { label: "Tajawal — تجوّل", value: "'Tajawal', sans-serif" },
  { label: "IBM Plex Sans Arabic", value: "'IBM Plex Sans Arabic', sans-serif" },
  { label: "Noto Kufi Arabic — كوفي", value: "'Noto Kufi Arabic', sans-serif" },
  { label: "Reem Kufi — ريم كوفي", value: "'Reem Kufi', sans-serif" },
  { label: "Changa — تشانغا", value: "'Changa', sans-serif" },
  { label: "Lalezar — عريض للعناوين", value: "'Lalezar', sans-serif" },
  { label: "Amiri — أميري (نسخ)", value: "'Amiri', serif" },
  { label: "Comic Sans MS", value: "'Comic Sans MS', cursive" },
];

function fontsUsed(comp: Composition): Set<string> {
  const families = new Set<string>();
  for (const layer of comp.layers) {
    if (layer.type === "text") families.add((layer.props as TextLayerProps).fontFamily);
    else if (layer.type === "caption") families.add((layer.props as CaptionLayerProps).fontFamily);
  }
  return families;
}

const requested = new Set<string>();

/**
 * Canvas text never triggers a web-font download on its own, so request every family the
 * composition uses. Resolves once they're available (or failed), so exports never fall back.
 */
export async function ensureFontsLoaded(comp: Composition): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const loads: Promise<unknown>[] = [];
  for (const family of fontsUsed(comp)) {
    for (const weight of ["400", "700"]) {
      const spec = `${weight} 40px ${family}`;
      if (requested.has(spec) && document.fonts.check(spec)) continue;
      requested.add(spec);
      loads.push(document.fonts.load(spec).catch(() => []));
    }
  }
  await Promise.all(loads);
}
