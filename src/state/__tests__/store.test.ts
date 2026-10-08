import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../store";
import type { VideoLayerProps } from "../../types";

const store = () => useEditorStore.getState();
const layers = () => store().project.composition.layers;

beforeEach(() => {
  store().newProject();
});

describe("undo history", () => {
  it("a multi-layer template insert is a single undo step", () => {
    store().applyTemplate("lowerThird");
    expect(layers().length).toBeGreaterThan(1);
    store().undo();
    expect(layers()).toHaveLength(0);
  });

  it("a whole drag gesture is a single undo step", () => {
    store().addLayer("rect");
    const id = layers()[0].id;
    const start = layers()[0].transform.position.static;
    store().beginGesture();
    for (let i = 1; i <= 20; i++) store().translateLayer(id, i, i);
    store().endGesture();
    expect(layers()[0].transform.position.static).toEqual({ x: start.x + 20, y: start.y + 20 });
    store().undo();
    expect(layers()[0].transform.position.static).toEqual(start);
  });

  it("rapid edits to the same field collapse into one undo step", () => {
    store().addLayer("text");
    const id = layers()[0].id;
    const depth = store().past.length;
    for (const content of ["H", "He", "Hel", "Hell", "Hello"]) store().updateLayerProps(id, { content });
    expect(store().past.length).toBe(depth + 1);
    store().undo();
    expect((layers()[0].props as { content: string }).content).toBe("Text");
  });
});

describe("layer timing", () => {
  it("never lets a layer end before it starts, and grows the project to fit", () => {
    store().addLayer("rect");
    const id = layers()[0].id;
    store().updateLayerTiming(id, 2, 0);
    expect(layers()[0].endTime).toBeGreaterThan(layers()[0].startTime);
    store().updateLayerTiming(id, 0, 30);
    expect(store().project.composition.duration).toBe(30);
  });
});

describe("attaching a video", () => {
  it("fits a vertical phone clip, matches the project shape, and covers the whole clip", () => {
    store().addLayer("video");
    const id = layers()[0].id;
    store().attachVideo(id, { src: "idb:test", fileName: "a.mp4", naturalDuration: 42, videoWidth: 1080, videoHeight: 1920 });
    const comp = store().project.composition;
    expect(comp.width).toBeLessThan(comp.height);
    expect(comp.duration).toBe(42);
    const p = layers()[0].props as VideoLayerProps;
    expect(p.width).toBeLessThanOrEqual(comp.width);
    expect(p.height).toBeLessThanOrEqual(comp.height);
    expect(layers()[0].endTime).toBe(42);
  });

  it("fits a clip inside an existing project without resizing it", () => {
    store().addLayer("text");
    store().addLayer("video");
    const video = layers()[0];
    store().attachVideo(video.id, { src: "idb:x", fileName: "b.mp4", naturalDuration: 3, videoWidth: 1080, videoHeight: 1920 });
    const comp = store().project.composition;
    expect([comp.width, comp.height]).toEqual([1280, 720]);
    const p = layers()[0].props as VideoLayerProps;
    expect(p.height).toBeLessThanOrEqual(720);
  });
});

describe("playback", () => {
  it("pressing play at the end starts again from the beginning", () => {
    store().setPlayhead(store().project.composition.duration);
    store().play();
    expect(store().playhead).toBe(0);
    expect(store().isPlaying).toBe(true);
  });
});

describe("duplicate", () => {
  it("duplicates a layer with a new id, offset slightly", () => {
    store().addLayer("star");
    const original = layers()[0];
    store().duplicateLayer(original.id);
    expect(layers()).toHaveLength(2);
    const copy = layers().find((l) => l.id !== original.id)!;
    expect(copy.transform.position.static.x).toBe(original.transform.position.static.x + 24);
  });
});
