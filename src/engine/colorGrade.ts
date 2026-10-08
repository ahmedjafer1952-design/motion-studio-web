import type { ColorGradeId } from "../types";

export interface ColorGradePreset {
  id: ColorGradeId;
  label: string;
  description: string;
  /** CSS/Canvas filter() string — the same syntax works for both ctx.filter and a DOM style.filter preview. */
  filter: string;
  /** Optional split-tone color wash, blended on top after the filter pass. */
  tint?: { color: string; alpha: number; blend: GlobalCompositeOperation };
}

export const COLOR_GRADES: ColorGradePreset[] = [
  { id: "none", label: "بدون تلوين", description: "الألوان الأصلية بدون أي تعديل", filter: "none" },
  {
    id: "tealOrange",
    label: "تيل وبرتقالي",
    description: "لوك سينمائي هوليوودي كلاسيكي",
    filter: "contrast(1.15) saturate(1.3) brightness(1.02)",
    tint: { color: "#ff8a3d", alpha: 0.1, blend: "overlay" },
  },
  {
    id: "moodyBlue",
    label: "أزرق قاتم",
    description: "أجواء درامية باردة",
    filter: "contrast(1.2) saturate(0.85) brightness(0.92) hue-rotate(-8deg)",
    tint: { color: "#1b3a5c", alpha: 0.18, blend: "overlay" },
  },
  {
    id: "warmFilm",
    label: "فيلم دافئ",
    description: "حنين سينمائي دافئ",
    filter: "contrast(1.05) saturate(1.15) brightness(1.03) sepia(0.15)",
    tint: { color: "#ffb86b", alpha: 0.08, blend: "soft-light" },
  },
  { id: "noir", label: "نوار أبيض وأسود", description: "تباين عالي، بدون لون", filter: "grayscale(1) contrast(1.35)" },
  {
    id: "vintageSepia",
    label: "سيبيا قديم",
    description: "لوك أرشيفي قديم",
    filter: "sepia(0.55) contrast(0.95) saturate(0.9)",
  },
  { id: "highContrast", label: "تباين عالي", description: "ألوان حادة وقوية", filter: "contrast(1.4) saturate(1.35)" },
  {
    id: "cyberpunk",
    label: "سايبربنك",
    description: "بنفسجي وسماوي نيون",
    filter: "contrast(1.25) saturate(1.5) hue-rotate(10deg)",
    tint: { color: "#8a2be2", alpha: 0.12, blend: "overlay" },
  },
  { id: "fadedPastel", label: "باستيل باهت", description: "ألوان ناعمة منخفضة التباين", filter: "contrast(0.85) saturate(0.7) brightness(1.08)" },
  {
    id: "goldenHour",
    label: "الساعة الذهبية",
    description: "غروب دافئ ذهبي",
    filter: "contrast(1.08) saturate(1.2) brightness(1.05) sepia(0.2)",
    tint: { color: "#ffcf6b", alpha: 0.12, blend: "soft-light" },
  },
  {
    id: "dayForNight",
    label: "نهار لليل",
    description: "محاكاة تصوير ليلي",
    filter: "contrast(1.15) saturate(0.75) brightness(0.65) hue-rotate(-15deg)",
    tint: { color: "#0d1b3a", alpha: 0.22, blend: "multiply" },
  },
];

export function getColorGrade(id: ColorGradeId | undefined): ColorGradePreset {
  return COLOR_GRADES.find((g) => g.id === id) ?? COLOR_GRADES[0];
}
