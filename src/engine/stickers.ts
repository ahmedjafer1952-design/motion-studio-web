import type { Composition, Keyframe, Layer } from "../types";
import { makeText } from "./builders";
import { applyPresetToLayer } from "./presets";
import { makeId } from "../utils/id";

export type StickerId = "fire" | "heart" | "star" | "thumbsUp" | "confetti" | "bulb" | "check" | "laugh";

export interface StickerDef {
  id: StickerId;
  icon: string;
  label: string;
}

export const STICKERS: StickerDef[] = [
  { id: "fire", icon: "🔥", label: "نار" },
  { id: "heart", icon: "❤️", label: "قلب" },
  { id: "star", icon: "⭐", label: "نجمة" },
  { id: "thumbsUp", icon: "👍", label: "إعجاب" },
  { id: "confetti", icon: "🎉", label: "احتفال" },
  { id: "bulb", icon: "💡", label: "فكرة" },
  { id: "check", icon: "✅", label: "صح" },
  { id: "laugh", icon: "😂", label: "ضحك" },
];

/** Replaces a layer's rotation keyframes with a gentle, continuous side-to-side wiggle. */
function addWiggleLoop(layer: Layer, amplitudeDeg: number, period: number, loops: number): Layer {
  const stepsPerLoop = 4;
  const kfs: Keyframe<number>[] = [];
  for (let i = 0; i <= stepsPerLoop * loops; i++) {
    const time = layer.startTime + (i / stepsPerLoop) * period;
    const angle = Math.sin((i / stepsPerLoop) * Math.PI * 2) * amplitudeDeg;
    kfs.push({ id: makeId("kf"), time, value: angle, easing: "easeInOut" });
  }
  return { ...layer, transform: { ...layer.transform, rotation: { static: layer.transform.rotation.static, keyframes: kfs } } };
}

export function buildSticker(id: StickerId, comp: Composition): Layer[] {
  const def = STICKERS.find((s) => s.id === id)!;
  let layer = makeText(comp, {
    content: def.icon,
    fontSize: 96,
    color: "#ffffff",
    x: comp.width / 2,
    y: comp.height / 2,
    name: `Sticker — ${def.label}`,
  });
  layer = applyPresetToLayer(layer, "popIn", comp);
  layer = addWiggleLoop(layer, 10, 1.1, 4);
  return [layer];
}
