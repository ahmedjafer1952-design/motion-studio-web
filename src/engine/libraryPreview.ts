import type { CaptionLayerProps, CaptionStyle, CaptionWord, Composition, Layer, LayerType, OverlayEffect, OverlayLayerProps } from "../types";
import { createLayer } from "./factory";
import { makeEllipse, makeRect, makeText } from "./builders";
import { buildTemplateLayers, type TemplateId } from "./templates";
import { buildScene, type SceneId } from "./scenes";
import { buildSticker, type StickerId } from "./stickers";

/** Everything a <LibraryCardPreview> needs to render one accurate frame: layers + the background to use. */
export interface PreviewScene {
  layers: Layer[];
  backgroundColor?: string;
  time: number;
}

/** Templates/scenes size sub-layers' endTime off comp.duration — floor it so a short project doesn't clip the preview frame. */
function safeComp(comp: Composition): Composition {
  return comp.duration >= 5 ? comp : { ...comp, duration: 5 };
}

export function templatePreview(id: TemplateId, comp: Composition): PreviewScene {
  return { layers: buildTemplateLayers(id, safeComp(comp)), time: 1.6 };
}

export function scenePreview(sceneId: SceneId, comp: Composition): PreviewScene {
  const { layers, backgroundColor } = buildScene(sceneId, safeComp(comp));
  return { layers, backgroundColor, time: 1.3 };
}

const SAMPLE_CAPTION_WORDS: CaptionWord[] = [
  { id: "p1", text: "رحلتنا", start: 0, end: 0.5, emphasis: false },
  { id: "p2", text: "نحو", start: 0.5, end: 0.8, emphasis: false },
  { id: "p3", text: "النجاح", start: 0.8, end: 1.4, emphasis: true },
  { id: "p4", text: "تبدأ", start: 1.4, end: 1.9, emphasis: false },
  { id: "p5", text: "اليوم", start: 1.9, end: 2.4, emphasis: true },
];

export function captionPreview(style: CaptionStyle, rawComp: Composition): PreviewScene {
  const comp = safeComp(rawComp);
  const base = createLayer("caption", comp);
  const layer: Layer = {
    ...base,
    endTime: comp.duration,
    props: { ...(base.props as CaptionLayerProps), words: SAMPLE_CAPTION_WORDS, style },
  };
  return { layers: [layer], time: 1.0 };
}

export function elementPreview(layerType: LayerType, rawComp: Composition): PreviewScene {
  const comp = safeComp(rawComp);
  const layer = createLayer(layerType, comp);
  if (layerType === "glass") {
    const backdrop = makeRect(comp, {
      width: comp.width,
      height: comp.height,
      x: comp.width / 2,
      y: comp.height / 2,
      color: "#4f8cff",
      name: "Backdrop",
    });
    const accent = makeEllipse(comp, {
      width: comp.height * 0.7,
      height: comp.height * 0.7,
      x: comp.width * 0.72,
      y: comp.height * 0.32,
      color: "#ff8a3d",
      name: "Backdrop Accent",
    });
    return { layers: [layer, accent, backdrop], time: 0.6 };
  }
  return { layers: [layer], time: layerType === "chart" ? 2 : 0.6 };
}

export function stickerPreview(id: StickerId, rawComp: Composition): PreviewScene {
  const comp = safeComp(rawComp);
  return { layers: buildSticker(id, comp), time: 0.6 };
}

export function overlayPreview(effect: OverlayEffect, rawComp: Composition): PreviewScene {
  const comp = safeComp(rawComp);
  const backdrop = makeRect(comp, {
    width: comp.width,
    height: comp.height,
    x: comp.width / 2,
    y: comp.height / 2,
    color: "#3a5fd9",
    name: "Backdrop",
  });
  const accent = makeEllipse(comp, {
    width: comp.height * 0.6,
    height: comp.height * 0.6,
    x: comp.width * 0.3,
    y: comp.height * 0.4,
    color: "#ff8a3d",
    name: "Backdrop Accent",
  });
  const base = createLayer("overlay", comp);
  const overlayLayer: Layer = { ...base, props: { ...(base.props as OverlayLayerProps), effect } };
  return { layers: [overlayLayer, accent, backdrop], time: 0.6 };
}

/** A warm, varied-color "landscape" sample used to showcase cinematic color-grade presets. */
export function gradeDemoPreview(rawComp: Composition): PreviewScene {
  const comp = safeComp(rawComp);
  const sky = makeRect(comp, {
    width: comp.width,
    height: comp.height * 0.62,
    x: comp.width / 2,
    y: comp.height * 0.31,
    color: "#ffb86b",
    name: "Sky",
  });
  const sun = makeEllipse(comp, {
    width: comp.height * 0.4,
    height: comp.height * 0.4,
    x: comp.width * 0.74,
    y: comp.height * 0.26,
    color: "#fff1c2",
    name: "Sun",
  });
  const ground = makeRect(comp, {
    width: comp.width,
    height: comp.height * 0.42,
    x: comp.width / 2,
    y: comp.height * 0.82,
    color: "#2e5c3e",
    name: "Ground",
  });
  const title = makeText(comp, {
    content: "عيّنة",
    fontSize: comp.height * 0.11,
    color: "#ffffff",
    x: comp.width / 2,
    y: comp.height * 0.5,
    name: "Sample Text",
  });
  return { layers: [title, sun, sky, ground], time: 0.6 };
}
