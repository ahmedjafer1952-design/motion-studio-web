import type { OverlayEffect } from "../types";

export interface OverlayDef {
  id: OverlayEffect;
  label: string;
  description: string;
}

export const OVERLAY_LIBRARY: OverlayDef[] = [
  { id: "grain", label: "حبيبات فيلم", description: "تشويش ناعم متحرك — لمسة سينمائية خام" },
  { id: "vhs", label: "VHS", description: "حبيبات + خطوط مسح + انزياح لوني — لوك شريط قديم" },
  { id: "vignette", label: "تظليل الحواف", description: "تعتيم تدريجي حول حواف الكادر" },
  { id: "scanlines", label: "خطوط مسح", description: "خطوط أفقية شفافة — لوك شاشة قديمة" },
];
