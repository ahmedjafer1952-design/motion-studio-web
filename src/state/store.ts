import { create } from "zustand";
import type {
  AnimatablePropKey,
  Composition,
  Easing,
  Keyframe,
  Layer,
  LayerType,
  Point,
  Project,
} from "../types";
import { createDefaultProject, createLayer } from "../engine/factory";
import { evaluateTransform } from "../engine/evaluate";
import { makeId } from "../utils/id";

interface EditorState {
  project: Project;
  selectedLayerId: string | null;
  playhead: number; // seconds
  isPlaying: boolean;
  isExporting: boolean;
  exportProgress: number;

  newProject: () => void;
  loadProject: (project: Project) => void;

  updateComposition: (patch: Partial<Composition>) => void;

  addLayer: (type: LayerType) => void;
  removeLayer: (layerId: string) => void;
  selectLayer: (layerId: string | null) => void;
  renameLayer: (layerId: string, name: string) => void;
  updateLayerProps: (layerId: string, patch: Record<string, unknown>) => void;
  updateLayerTiming: (layerId: string, startTime: number, endTime: number) => void;
  moveLayer: (layerId: string, direction: "up" | "down") => void;

  setPlayhead: (time: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;

  addKeyframe: (layerId: string, propKey: AnimatablePropKey, value?: unknown) => void;
  removeKeyframe: (layerId: string, propKey: AnimatablePropKey, keyframeId: string) => void;
  updateKeyframe: (
    layerId: string,
    propKey: AnimatablePropKey,
    keyframeId: string,
    patch: Partial<Keyframe<unknown>>
  ) => void;
  setStaticValue: (layerId: string, propKey: AnimatablePropKey, value: unknown) => void;

  setExporting: (isExporting: boolean, progress?: number) => void;
}

function cloneLayer(layer: Layer): Layer {
  return JSON.parse(JSON.stringify(layer));
}

function mapLayers(comp: Composition, layerId: string, fn: (l: Layer) => Layer): Composition {
  return {
    ...comp,
    layers: comp.layers.map((l) => (l.id === layerId ? fn(l) : l)),
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: createDefaultProject(),
  selectedLayerId: null,
  playhead: 0,
  isPlaying: false,
  isExporting: false,
  exportProgress: 0,

  newProject: () => set({ project: createDefaultProject(), selectedLayerId: null, playhead: 0, isPlaying: false }),

  loadProject: (project) => set({ project, selectedLayerId: null, playhead: 0, isPlaying: false }),

  updateComposition: (patch) =>
    set((s) => ({ project: { ...s.project, composition: { ...s.project.composition, ...patch } } })),

  addLayer: (type) =>
    set((s) => {
      const layer = createLayer(type, s.project.composition);
      const comp = { ...s.project.composition, layers: [layer, ...s.project.composition.layers] };
      return { project: { ...s.project, composition: comp }, selectedLayerId: layer.id };
    }),

  removeLayer: (layerId) =>
    set((s) => {
      const comp = { ...s.project.composition, layers: s.project.composition.layers.filter((l) => l.id !== layerId) };
      const selected = get().selectedLayerId === layerId ? null : get().selectedLayerId;
      return { project: { ...s.project, composition: comp }, selectedLayerId: selected };
    }),

  selectLayer: (layerId) => set({ selectedLayerId: layerId }),

  renameLayer: (layerId, name) =>
    set((s) => ({
      project: { ...s.project, composition: mapLayers(s.project.composition, layerId, (l) => ({ ...l, name })) },
    })),

  updateLayerProps: (layerId, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        composition: mapLayers(s.project.composition, layerId, (l) => ({
          ...l,
          props: { ...l.props, ...patch } as Layer["props"],
        })),
      },
    })),

  updateLayerTiming: (layerId, startTime, endTime) =>
    set((s) => ({
      project: {
        ...s.project,
        composition: mapLayers(s.project.composition, layerId, (l) => ({ ...l, startTime, endTime })),
      },
    })),

  moveLayer: (layerId, direction) =>
    set((s) => {
      const layers = [...s.project.composition.layers];
      const idx = layers.findIndex((l) => l.id === layerId);
      if (idx === -1) return {};
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= layers.length) return {};
      [layers[idx], layers[swapWith]] = [layers[swapWith], layers[idx]];
      return { project: { ...s.project, composition: { ...s.project.composition, layers } } };
    }),

  setPlayhead: (time) =>
    set((s) => ({ playhead: Math.max(0, Math.min(s.project.composition.duration, time)) })),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  addKeyframe: (layerId, propKey, value) =>
    set((s) => {
      const time = get().playhead;
      return {
        project: {
          ...s.project,
          composition: mapLayers(s.project.composition, layerId, (l) => {
            const layer = cloneLayer(l);
            const animProp = layer.transform[propKey] as { static: unknown; keyframes: Keyframe<unknown>[] };
            const current =
              value !== undefined
                ? value
                : (evaluateTransform(l.transform, time) as unknown as Record<string, unknown>)[propKey];
            const existingIdx = animProp.keyframes.findIndex((k) => Math.abs(k.time - time) < 1e-3);
            const kf: Keyframe<unknown> = {
              id: existingIdx >= 0 ? animProp.keyframes[existingIdx].id : makeId("kf"),
              time,
              value: current,
              easing: "easeInOut" as Easing,
            };
            if (existingIdx >= 0) {
              animProp.keyframes[existingIdx] = kf;
            } else {
              animProp.keyframes.push(kf);
            }
            animProp.keyframes.sort((a, b) => a.time - b.time);
            return layer;
          }),
        },
      };
    }),

  removeKeyframe: (layerId, propKey, keyframeId) =>
    set((s) => ({
      project: {
        ...s.project,
        composition: mapLayers(s.project.composition, layerId, (l) => {
          const layer = cloneLayer(l);
          const animProp = layer.transform[propKey] as { keyframes: Keyframe<unknown>[] };
          animProp.keyframes = animProp.keyframes.filter((k) => k.id !== keyframeId);
          return layer;
        }),
      },
    })),

  updateKeyframe: (layerId, propKey, keyframeId, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        composition: mapLayers(s.project.composition, layerId, (l) => {
          const layer = cloneLayer(l);
          const animProp = layer.transform[propKey] as { keyframes: Keyframe<unknown>[] };
          animProp.keyframes = animProp.keyframes
            .map((k) => (k.id === keyframeId ? { ...k, ...patch } : k))
            .sort((a, b) => a.time - b.time);
          return layer;
        }),
      },
    })),

  setStaticValue: (layerId, propKey, value) =>
    set((s) => ({
      project: {
        ...s.project,
        composition: mapLayers(s.project.composition, layerId, (l) => {
          const layer = cloneLayer(l);
          const animProp = layer.transform[propKey] as { static: unknown; keyframes: Keyframe<unknown>[] };
          if (animProp.keyframes.length === 0) {
            animProp.static = value;
          } else {
            const time = get().playhead;
            const existingIdx = animProp.keyframes.findIndex((k) => Math.abs(k.time - time) < 1e-3);
            if (existingIdx >= 0) {
              animProp.keyframes[existingIdx].value = value;
            } else {
              animProp.static = value;
            }
          }
          return layer;
        }),
      },
    })),

  setExporting: (isExporting, progress = 0) => set({ isExporting, exportProgress: progress }),
}));

export function evaluatedTransformFor(layer: Layer, time: number) {
  return evaluateTransform(layer.transform, time);
}

export type { Point };
