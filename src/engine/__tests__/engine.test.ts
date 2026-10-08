import { describe, expect, it } from "vitest";
import { evaluateTransform } from "../evaluate";
import { createDefaultComposition, createLayer } from "../factory";
import { applyPresetToLayer } from "../presets";
import { buildTemplateLayers, MOTION_TEMPLATES } from "../templates";
import { buildScene, FACELESS_SCENES } from "../scenes";
import { buildAutoEdit } from "../autoEdit";
import { normalizeProject, InvalidProjectError } from "../migrate";

const comp = createDefaultComposition();

describe("keyframe evaluation", () => {
  it("holds the static value without keyframes and interpolates between keyframes", () => {
    const layer = createLayer("rect", comp);
    expect(evaluateTransform(layer.transform, 1).opacity).toBe(1);
    layer.transform.opacity.keyframes = [
      { id: "a", time: 0, value: 0, easing: "linear" },
      { id: "b", time: 2, value: 1, easing: "linear" },
    ];
    expect(evaluateTransform(layer.transform, 1).opacity).toBeCloseTo(0.5);
    expect(evaluateTransform(layer.transform, 5).opacity).toBe(1);
  });
});

describe("motion presets", () => {
  it("applying the same preset twice keeps the layer visible", () => {
    const layer = createLayer("text", comp);
    const twice = applyPresetToLayer(applyPresetToLayer(layer, "fadeIn", comp), "fadeIn", comp);
    expect(evaluateTransform(twice.transform, 2).opacity).toBe(1);
  });

  it("fade in + fade out stack instead of replacing each other", () => {
    const layer = createLayer("text", comp);
    const both = applyPresetToLayer(applyPresetToLayer(layer, "fadeIn", comp), "fadeOut", comp);
    expect(evaluateTransform(both.transform, 0).opacity).toBeCloseTo(0);
    expect(evaluateTransform(both.transform, comp.duration / 2).opacity).toBe(1);
    expect(evaluateTransform(both.transform, comp.duration).opacity).toBeCloseTo(0);
  });

  it("pop in followed by zoom out doesn't collapse the layer to nothing", () => {
    const layer = createLayer("rect", comp);
    const out = applyPresetToLayer(applyPresetToLayer(layer, "popIn", comp), "zoomOut", comp);
    expect(evaluateTransform(out.transform, comp.duration / 2).scale.x).toBeCloseTo(1);
  });
});

describe("templates and scenes", () => {
  it("every template builds at least one layer inside the composition's time range", () => {
    for (const t of MOTION_TEMPLATES) {
      const layers = buildTemplateLayers(t.id, comp);
      expect(layers.length, t.id).toBeGreaterThan(0);
      for (const l of layers) expect(l.endTime).toBeGreaterThan(l.startTime);
    }
  });

  it("every faceless scene builds layers and a background", () => {
    for (const s of FACELESS_SCENES) {
      const scene = buildScene(s.id, comp);
      expect(scene.layers.length, s.id).toBeGreaterThan(0);
      expect(scene.backgroundColor).toMatch(/^#/);
    }
  });
});

describe("auto edit", () => {
  const words = [
    { text: "أولاً", start: 0, end: 0.4 },
    { text: "التصميم", start: 0.5, end: 1 },
    { text: "ثانياً", start: 2.2, end: 2.6 },
    { text: "السرعة", start: 2.7, end: 3.1 },
    { text: "عندنا", start: 3.2, end: 3.5 },
    { text: "500", start: 3.6, end: 4 },
    { text: "عميل", start: 4.1, end: 4.5 },
  ];

  it("builds captions, list items and a number callout from speech", () => {
    const video = createLayer("video", comp);
    const result = buildAutoEdit(comp, video, words, 0, { pace: "medium", title: "عنوان", cta: "تابعنا" });
    const names = result.newLayers.map((l) => l.name.toLowerCase());
    expect(result.newLayers.some((l) => l.type === "caption")).toBe(true);
    expect(names.some((n) => n.includes("list"))).toBe(true);
    expect(names.some((n) => n.includes("number"))).toBe(true);
  });
});

describe("project loading", () => {
  it("rejects things that aren't projects", () => {
    expect(() => normalizeProject({})).toThrow(InvalidProjectError);
    expect(() => normalizeProject(null)).toThrow(InvalidProjectError);
  });

  it("fills in fields older files don't have and drops broken layers", () => {
    const project = normalizeProject({
      composition: {
        width: 1080,
        height: 1920,
        layers: [{ type: "text", props: { content: "hi" } }, { type: "nonsense" }, { type: "rect", endTime: -5 }],
      },
    });
    expect(project.composition.colorGrade).toBe("none");
    expect(project.composition.layers).toHaveLength(2);
    const text = project.composition.layers[0];
    expect(text.transform.opacity.keyframes).toEqual([]);
    expect((text.props as { content: string; fontSize: number }).fontSize).toBeGreaterThan(0);
    const rect = project.composition.layers[1];
    expect(rect.endTime).toBeGreaterThan(rect.startTime);
  });
});
