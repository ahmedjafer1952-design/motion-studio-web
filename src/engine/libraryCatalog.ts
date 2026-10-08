import type { CaptionStyle, ColorGradeId, LayerType, OverlayEffect } from "../types";
import { MOTION_TEMPLATES, type TemplateId } from "./templates";
import { FACELESS_SCENES, type SceneId } from "./scenes";
import { COLOR_GRADES } from "./colorGrade";
import { SOUND_LIBRARY, type SoundId } from "./sounds";
import { STICKERS, type StickerId } from "./stickers";
import { OVERLAY_LIBRARY } from "./overlays";

export type LibraryCategoryId =
  | "text"
  | "capsules"
  | "lists"
  | "captions"
  | "scenes"
  | "motion"
  | "grade"
  | "sound"
  | "elements"
  | "autoedit";

export interface LibraryCategory {
  id: LibraryCategoryId;
  icon: string;
  label: string;
}

export const LIBRARY_CATEGORIES: LibraryCategory[] = [
  { id: "text", icon: "T", label: "نصوص وعناوين" },
  { id: "captions", icon: "💬", label: "كابشن" },
  { id: "capsules", icon: "⬭", label: "كبسولات وأزرار" },
  { id: "lists", icon: "≣", label: "قوائم ومؤشرات" },
  { id: "scenes", icon: "🎭", label: "فيسلس" },
  { id: "motion", icon: "🌀", label: "ستيكرز وحركة" },
  { id: "grade", icon: "🎨", label: "تلوين سينمائي" },
  { id: "sound", icon: "🔊", label: "مكتبة الأصوات" },
  { id: "elements", icon: "◐", label: "عناصر" },
  { id: "autoedit", icon: "✨", label: "منطق ذكاء" },
];

export interface TemplateCard {
  kind: "template";
  id: TemplateId;
  label: string;
  description: string;
  swatch: [string, string];
}

export interface CaptionCard {
  kind: "caption";
  id: CaptionStyle;
  label: string;
  description: string;
  swatch: [string, string];
}

export interface ElementCard {
  kind: "element";
  id: string;
  layerType: LayerType;
  label: string;
  description: string;
  swatch: [string, string];
}

export interface SceneGroupCard {
  kind: "sceneGroup";
  type: string;
  label: string;
  description: string;
  variants: { id: SceneId; dot: string }[];
}

export interface AutoEditCard {
  kind: "autoedit";
  label: string;
  description: string;
  swatch: [string, string];
}

export interface GradeCard {
  kind: "grade";
  id: ColorGradeId;
  label: string;
  description: string;
  filter: string;
  tint?: { color: string; alpha: number; blend: GlobalCompositeOperation };
}

export interface SoundCard {
  kind: "sound";
  id: SoundId;
  label: string;
  description: string;
}

export interface StickerCard {
  kind: "sticker";
  id: StickerId;
  label: string;
  description: string;
}

export interface OverlayCard {
  kind: "overlay";
  id: OverlayEffect;
  label: string;
  description: string;
}

export type LibraryCard =
  | TemplateCard
  | CaptionCard
  | ElementCard
  | SceneGroupCard
  | AutoEditCard
  | GradeCard
  | SoundCard
  | StickerCard
  | OverlayCard;

export const GRADE_CARDS: GradeCard[] = COLOR_GRADES.map((g) => ({
  kind: "grade",
  id: g.id,
  label: g.label,
  description: g.description,
  filter: g.filter,
  tint: g.tint,
}));

export const SOUND_CARDS: SoundCard[] = SOUND_LIBRARY.map((s) => ({
  kind: "sound",
  id: s.id,
  label: s.label,
  description: s.description,
}));

export const STICKER_CARDS: StickerCard[] = STICKERS.map((s) => ({
  kind: "sticker",
  id: s.id,
  label: s.label,
  description: `${s.icon} ملصق متحرك قابل للسحب لأي مكان`,
}));

export const OVERLAY_CARDS: OverlayCard[] = OVERLAY_LIBRARY.map((o) => ({
  kind: "overlay",
  id: o.id,
  label: o.label,
  description: o.description,
}));

const TEMPLATE_SWATCH: Record<TemplateId, [string, string]> = {
  titleCard: ["#4f8cff", "#2a2a30"],
  lowerThird: ["#4f8cff", "#1b1b1e"],
  badge: ["#a78bfa", "#2a2a30"],
  ctaButton: ["#7cff8a", "#1b1b1e"],
  bigNumber: ["#ffd166", "#1b1b1e"],
  animatedList: ["#ff8a65", "#1b1b1e"],
  typewriterText: ["#4f8cff", "#1b1b1e"],
  highlightText: ["#ffd166", "#1b1b1e"],
  countUpNumber: ["#ffd166", "#1b1b1e"],
  orbitingIcons: ["#ff8a65", "#1b1b1e"],
};

const TEXT_IDS: TemplateId[] = ["titleCard", "lowerThird", "typewriterText", "highlightText"];
const CAPSULE_IDS: TemplateId[] = ["badge", "ctaButton"];
const LIST_IDS: TemplateId[] = ["bigNumber", "animatedList", "countUpNumber"];
const MOTION_IDS: TemplateId[] = ["orbitingIcons"];

function templateCards(ids: TemplateId[]): TemplateCard[] {
  return MOTION_TEMPLATES.filter((t) => ids.includes(t.id)).map((t) => ({
    kind: "template",
    id: t.id,
    label: t.label,
    description: t.description,
    swatch: TEMPLATE_SWATCH[t.id],
  }));
}

export const TEXT_CARDS = templateCards(TEXT_IDS);
export const CAPSULE_CARDS = templateCards(CAPSULE_IDS);
export const LIST_CARDS = templateCards(LIST_IDS);
export const MOTION_CARDS = templateCards(MOTION_IDS);

export const CAPTION_CARDS: CaptionCard[] = [
  { kind: "caption", id: "bigWord", label: "كلمة كبيرة", description: "كلمة واحدة بالوقت، تكبر وتختفي", swatch: ["#ffffff", "#1b1b1e"] },
  { kind: "caption", id: "karaokeLine", label: "كاريوكي", description: "السطر كامل، تمييز الكلمة أثناء النطق", swatch: ["#4f8cff", "#1b1b1e"] },
  { kind: "caption", id: "pillWord", label: "كبسولة زجاجية", description: "كلمة داخل خلفية زجاجية شفافة", swatch: ["#a78bfa", "#2a2a30"] },
  { kind: "caption", id: "emphasisOnly", label: "تمييز كلمة", description: "خط كامل، تمييز الكلمات المهمة فقط بالذهبي", swatch: ["#ffd166", "#1b1b1e"] },
];

export const ELEMENT_CARDS: ElementCard[] = [
  { kind: "element", id: "glass", layerType: "glass", label: "لوحة زجاجية", description: "تمويه زجاجي حقيقي فوق الفيديو", swatch: ["#e4e4e8", "#28282d"] },
  { kind: "element", id: "rect", layerType: "rect", label: "مستطيل", description: "شكل مستطيل بسيط قابل للتحريك", swatch: ["#4f8cff", "#1b1b1e"] },
  { kind: "element", id: "ellipse", layerType: "ellipse", label: "دائرة", description: "شكل بيضاوي/دائري", swatch: ["#7cff8a", "#1b1b1e"] },
  { kind: "element", id: "polygon", layerType: "polygon", label: "مضلّع", description: "شكل مضلّع 3-12 أضلاع", swatch: ["#ff8a65", "#1b1b1e"] },
  { kind: "element", id: "star", layerType: "star", label: "نجمة", description: "شكل نجمة متحركة", swatch: ["#ffd166", "#1b1b1e"] },
];

const SCENE_SWATCHES: Record<string, string[]> = {
  neon: ["#ff2bd6", "#7c3aed", "#39ff14", "#ffb703"],
  product: ["#b08d57", "#4f8cff", "#d16666", "#6a9c5a"],
  mockup: ["#2a2a30", "#232a3d", "#3a2328", "#233a2a"],
  collage: ["#ffd6e0", "#d0e8ff", "#ffe0e9", "#d8f0d8"],
  note: ["#fff3a0", "#a0e8ff", "#ffc6e0", "#c6ffcf"],
  bounce: ["#ff2bd6", "#ff6b6b", "#06d6a0", "#f72585"],
};

const SCENE_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  neon: { label: "نيون", description: "هالة نيون متوهجة خلف منتجك" },
  product: { label: "منتج واقعي", description: "استوديو نظيف مع ظل ناعم" },
  mockup: { label: "موكاب 3D", description: "إطار جهاز مائل" },
  collage: { label: "كولاج ورقي", description: "قصاصات ورق متناثرة" },
  note: { label: "ملاحظة مثبتة", description: "ملاحظة لاصقة كعنصر مميز" },
  bounce: { label: "كلمات مرتدة", description: "تايبوغرافي حركي بدون منتج" },
};

export const SCENE_GROUP_CARDS: SceneGroupCard[] = Object.keys(SCENE_TYPE_LABELS).map((type) => ({
  kind: "sceneGroup",
  type,
  label: SCENE_TYPE_LABELS[type].label,
  description: SCENE_TYPE_LABELS[type].description,
  variants: FACELESS_SCENES.filter((s) => s.id.startsWith(`${type}-`)).map((s, i) => ({
    id: s.id,
    dot: SCENE_SWATCHES[type][i] ?? SCENE_SWATCHES[type][0],
  })),
}));

export const AUTOEDIT_CARD: AutoEditCard = {
  kind: "autoedit",
  label: "✨ Auto Edit",
  description: "يفرّغ الكلام ويبني مونتاج أولي كامل بضغطة وحدة",
  swatch: ["#ffd166", "#4f8cff"],
};

export function cardsForCategory(category: LibraryCategoryId): LibraryCard[] {
  switch (category) {
    case "text":
      return TEXT_CARDS;
    case "capsules":
      return CAPSULE_CARDS;
    case "lists":
      return LIST_CARDS;
    case "captions":
      return CAPTION_CARDS;
    case "elements":
      return [...ELEMENT_CARDS, ...OVERLAY_CARDS];
    case "scenes":
      return SCENE_GROUP_CARDS;
    case "motion":
      return [...MOTION_CARDS, ...STICKER_CARDS];
    case "grade":
      return GRADE_CARDS;
    case "sound":
      return SOUND_CARDS;
    case "autoedit":
      return [AUTOEDIT_CARD];
  }
}
