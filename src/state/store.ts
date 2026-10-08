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
import { applyPresetToLayer, type PresetId } from "../engine/presets";
import { buildTemplateLayers, type TemplateId } from "../engine/templates";
import { buildScene, type SceneId } from "../engine/scenes";
import { buildAutoEdit, type AutoEditOptions } from "../engine/autoEdit";
import type { TranscribedWord } from "../engine/transcribe";
import { makeId } from "../utils/id";

const MAX_HISTORY = 100;

interface EditorState {
  project: Project;
  past: Project[];
  future: Project[];
  selectedLayerId: string | null;
  playhead: number; // seconds
  isPlaying: boolean;
  isExporting: boolean;
  exportProgress: number;

  newProject: () => void;
  loadProject: (project: Project) => void;

  undo: () => void;
  redo: () => void;

  updateComposition: (patch: Partial<Composition>) => void;

  addLayer: (type: LayerType) => void;
  addLayerWithProps: (type: LayerType, propsPatch: Record<string, unknown>) => void;
  removeLayer: (layerId: string) => void;
  selectLayer: (layerId: string | null) => void;
  renameLayer: (layerId: string, name: string) => void;
  updateLayerProps: (layerId: string, patch: Record<string, unknown>) => void;
  updateLayerTiming: (layerId: string, startTime: number, endTime: number) => void;
  moveLayer: (layerId: string, direction: "up" | "down") => void;
  applyMotionPreset: (layerId: string, presetId: PresetId) => void;
  applyTemplate: (templateId: TemplateId) => void;
  applyScene: (sceneId: SceneId) => void;
  applyAutoEdit: (sourceLayerId: string, words: TranscribedWord[], opts: AutoEditOptions) => void;

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

export const useEditorStore = create<EditorState>((set, get) => {
  /** Applies a pure transform to the current project, pushing the previous project onto the undo stack. */
  function commit(updater: (project: Project) => Project, extraPatch?: Partial<EditorState>) {
    const prevProject = get().project;
    const nextProject = updater(prevProject);
    if (nextProject === prevProject && !extraPatch) return;
    set((s) => ({
      project: nextProject,
      past: [...s.past, prevProject].slice(-MAX_HISTORY),
      future: [],
      ...extraPatch,
    }));
  }

  return {
    project: createDefaultProject(),
    past: [],
    future: [],
    selectedLayerId: null,
    playhead: 0,
    isPlaying: false,
    isExporting: false,
    exportProgress: 0,

    newProject: () =>
      set({
        project: createDefaultProject(),
        past: [],
        future: [],
        selectedLayerId: null,
        playhead: 0,
        isPlaying: false,
      }),

    loadProject: (project) =>
      set({ project, past: [], future: [], selectedLayerId: null, playhead: 0, isPlaying: false }),

    undo: () => {
      const { past, future, project } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      set({ project: prev, past: past.slice(0, -1), future: [project, ...future] });
    },

    redo: () => {
      const { past, future, project } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({ project: next, past: [...past, project], future: future.slice(1) });
    },

    updateComposition: (patch) =>
      commit((p) => ({ ...p, composition: { ...p.composition, ...patch } })),

    addLayer: (type) => {
      const layer = createLayer(type, get().project.composition);
      commit(
        (p) => ({ ...p, composition: { ...p.composition, layers: [layer, ...p.composition.layers] } }),
        { selectedLayerId: layer.id }
      );
    },

    addLayerWithProps: (type, propsPatch) => {
      const base = createLayer(type, get().project.composition);
      const layer: Layer = { ...base, props: { ...base.props, ...propsPatch } as Layer["props"] };
      commit(
        (p) => ({ ...p, composition: { ...p.composition, layers: [layer, ...p.composition.layers] } }),
        { selectedLayerId: layer.id }
      );
    },

    removeLayer: (layerId) => {
      const selected = get().selectedLayerId === layerId ? null : get().selectedLayerId;
      commit(
        (p) => ({
          ...p,
          composition: { ...p.composition, layers: p.composition.layers.filter((l) => l.id !== layerId) },
        }),
        { selectedLayerId: selected }
      );
    },

    selectLayer: (layerId) => set({ selectedLayerId: layerId }),

    renameLayer: (layerId, name) =>
      commit((p) => ({ ...p, composition: mapLayers(p.composition, layerId, (l) => ({ ...l, name })) })),

    updateLayerProps: (layerId, patch) =>
      commit((p) => ({
        ...p,
        composition: mapLayers(p.composition, layerId, (l) => ({
          ...l,
          props: { ...l.props, ...patch } as Layer["props"],
        })),
      })),

    updateLayerTiming: (layerId, startTime, endTime) =>
      commit((p) => ({
        ...p,
        composition: mapLayers(p.composition, layerId, (l) => ({ ...l, startTime, endTime })),
      })),

    moveLayer: (layerId, direction) =>
      commit((p) => {
        const layers = [...p.composition.layers];
        const idx = layers.findIndex((l) => l.id === layerId);
        if (idx === -1) return p;
        const swapWith = direction === "up" ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= layers.length) return p;
        [layers[idx], layers[swapWith]] = [layers[swapWith], layers[idx]];
        return { ...p, composition: { ...p.composition, layers } };
      }),

    applyMotionPreset: (layerId, presetId) =>
      commit((p) => ({
        ...p,
        composition: mapLayers(p.composition, layerId, (l) => applyPresetToLayer(l, presetId, p.composition)),
      })),

    applyTemplate: (templateId) => {
      const layers = buildTemplateLayers(templateId, get().project.composition);
      commit(
        (p) => ({ ...p, composition: { ...p.composition, layers: [...layers, ...p.composition.layers] } }),
        { selectedLayerId: layers[0]?.id ?? null }
      );
    },

    applyScene: (sceneId) => {
      const { layers, backgroundColor } = buildScene(sceneId, get().project.composition);
      commit(
        (p) => ({
          ...p,
          composition: { ...p.composition, backgroundColor, layers: [...layers, ...p.composition.layers] },
        }),
        { selectedLayerId: layers[0]?.id ?? null }
      );
    },

    applyAutoEdit: (sourceLayerId, words, opts) => {
      const comp = get().project.composition;
      const sourceLayer = comp.layers.find((l) => l.id === sourceLayerId);
      if (!sourceLayer) return;
      const srcProps = sourceLayer.props as { trimIn: number };
      const { newLayers, updatedSourceLayer, compPatch } = buildAutoEdit(comp, sourceLayer, words, srcProps.trimIn, opts);
      commit(
        (p) => ({
          ...p,
          composition: {
            ...p.composition,
            ...compPatch,
            layers: [...newLayers, ...p.composition.layers.map((l) => (l.id === sourceLayerId ? updatedSourceLayer : l))],
          },
        }),
        { selectedLayerId: newLayers[0]?.id ?? null }
      );
    },

    setPlayhead: (time) =>
      set((s) => ({ playhead: Math.max(0, Math.min(s.project.composition.duration, time)) })),

    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

    addKeyframe: (layerId, propKey, value) =>
      commit((p) => {
        const time = get().playhead;
        return {
          ...p,
          composition: mapLayers(p.composition, layerId, (l) => {
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
        };
      }),

    removeKeyframe: (layerId, propKey, keyframeId) =>
      commit((p) => ({
        ...p,
        composition: mapLayers(p.composition, layerId, (l) => {
          const layer = cloneLayer(l);
          const animProp = layer.transform[propKey] as { keyframes: Keyframe<unknown>[] };
          animProp.keyframes = animProp.keyframes.filter((k) => k.id !== keyframeId);
          return layer;
        }),
      })),

    updateKeyframe: (layerId, propKey, keyframeId, patch) =>
      commit((p) => ({
        ...p,
        composition: mapLayers(p.composition, layerId, (l) => {
          const layer = cloneLayer(l);
          const animProp = layer.transform[propKey] as { keyframes: Keyframe<unknown>[] };
          animProp.keyframes = animProp.keyframes
            .map((k) => (k.id === keyframeId ? { ...k, ...patch } : k))
            .sort((a, b) => a.time - b.time);
          return layer;
        }),
      })),

    setStaticValue: (layerId, propKey, value) =>
      commit((p) => ({
        ...p,
        composition: mapLayers(p.composition, layerId, (l) => {
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
      })),

    setExporting: (isExporting, progress = 0) => set({ isExporting, exportProgress: progress }),
  };
});

export function evaluatedTransformFor(layer: Layer, time: number) {
  return evaluateTransform(layer.transform, time);
}

export type { Point };
