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
  VideoLayerProps,
} from "../types";
import { createDefaultProject, createLayer } from "../engine/factory";
import { evaluateTransform } from "../engine/evaluate";
import { applyPresetToLayer, type PresetId } from "../engine/presets";
import { buildTemplateLayers, type TemplateId } from "../engine/templates";
import { buildScene, type SceneId } from "../engine/scenes";
import { buildEditFromPlan, planFromRules, type AutoEditOptions, type EditPlan } from "../engine/autoEdit";
import type { TranscribedWord } from "../engine/transcribe";
import { buildSticker, type StickerId } from "../engine/stickers";
import { makeId } from "../utils/id";
import { normalizeProject } from "../engine/migrate";

const MAX_HISTORY = 100;
const COALESCE_MS = 800;

interface EditorState {
  project: Project;
  past: Project[];
  future: Project[];
  selectedLayerId: string | null;
  playhead: number; // seconds
  isPlaying: boolean;
  isExporting: boolean;
  exportProgress: number;
  /** Project snapshot taken when a continuous gesture (e.g. a drag) began; edits during it share one undo step. */
  gestureBase: Project | null;

  beginGesture: () => void;
  endGesture: () => void;

  newProject: () => void;
  /** Validates/migrates the data first; throws InvalidProjectError on something that isn't a project. */
  loadProject: (project: unknown) => void;

  undo: () => void;
  redo: () => void;

  updateComposition: (patch: Partial<Composition>) => void;

  addLayer: (type: LayerType) => void;
  addLayerWithProps: (type: LayerType, propsPatch: Record<string, unknown>, durationOverride?: number) => void;
  removeLayer: (layerId: string) => void;
  duplicateLayer: (layerId: string) => void;
  /** Moves a layer (its whole position path, keyframes included) by dx/dy from where it was when the gesture began. */
  translateLayer: (layerId: string, dx: number, dy: number) => void;
  selectLayer: (layerId: string | null) => void;
  renameLayer: (layerId: string, name: string) => void;
  updateLayerProps: (layerId: string, patch: Record<string, unknown>) => void;
  updateLayerTiming: (layerId: string, startTime: number, endTime: number) => void;
  moveLayer: (layerId: string, direction: "up" | "down") => void;
  applyMotionPreset: (layerId: string, presetId: PresetId) => void;
  applyTemplate: (templateId: TemplateId) => void;
  applyScene: (sceneId: SceneId) => void;
  insertSticker: (stickerId: StickerId) => void;
  attachVideo: (layerId: string, media: AttachedVideo) => void;
  attachAudio: (layerId: string, media: AttachedAudio) => void;
  applyAutoEdit: (sourceLayerId: string, words: TranscribedWord[], opts: AutoEditOptions) => void;
  /** Applies an edit plan (from the built-in rules or from Claude) as one undo step. */
  applyEditPlan: (sourceLayerId: string, plan: EditPlan) => void;

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
  /** Removes all keyframes from a property, keeping its current value as the static one (one undo step). */
  clearKeyframes: (layerId: string, propKey: AnimatablePropKey) => void;

  setExporting: (isExporting: boolean, progress?: number) => void;
}

export interface AttachedAudio {
  src: string;
  fileName: string;
  naturalDuration: number;
}

export interface AttachedVideo extends AttachedAudio {
  videoWidth: number;
  videoHeight: number;
}

/** Longest side of a composition auto-matched to an imported clip — keeps preview/export real-time. */
const AUTO_COMP_MAX_SIDE = 1280;

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** Sets a media layer to span its whole clip, and grows the composition so nothing gets cut off. */
function fitLayerToClip(comp: Composition, layer: Layer, naturalDuration: number): Composition {
  const clipLength = Math.max(0.1, naturalDuration);
  const endTime = layer.startTime + clipLength;
  return {
    ...comp,
    duration: Math.max(comp.duration, endTime),
    layers: comp.layers.map((l) => (l.id === layer.id ? { ...layer, endTime } : l)),
  };
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
  let lastCoalesce: { key: string; at: number } | null = null;

  /**
   * Applies a pure transform to the current project, pushing the previous project onto the undo stack.
   * Edits sharing a `coalesceKey` within a short window (typing in a field, dragging a color picker)
   * collapse into one undo step instead of flooding the history.
   */
  function commit(updater: (project: Project) => Project, extraPatch?: Partial<EditorState>, coalesceKey?: string) {
    const prevProject = get().project;
    const nextProject = updater(prevProject);
    if (nextProject === prevProject && !extraPatch) return;
    const now = Date.now();
    const merge = !!coalesceKey && lastCoalesce?.key === coalesceKey && now - lastCoalesce.at < COALESCE_MS;
    lastCoalesce = coalesceKey ? { key: coalesceKey, at: now } : null;
    if (get().gestureBase || merge) {
      set({ project: nextProject, future: [], ...extraPatch });
      return;
    }
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
    gestureBase: null,

    beginGesture: () => set((s) => ({ gestureBase: s.project })),

    endGesture: () => {
      const { gestureBase, project } = get();
      if (!gestureBase) return;
      if (gestureBase === project) {
        set({ gestureBase: null });
        return;
      }
      set((s) => ({ gestureBase: null, past: [...s.past, gestureBase].slice(-MAX_HISTORY), future: [] }));
    },

    newProject: () =>
      set({
        project: createDefaultProject(),
        past: [],
        future: [],
        selectedLayerId: null,
        playhead: 0,
        isPlaying: false,
        gestureBase: null,
      }),

    loadProject: (raw) =>
      set({
        project: normalizeProject(raw),
        past: [],
        future: [],
        selectedLayerId: null,
        playhead: 0,
        isPlaying: false,
        gestureBase: null,
      }),

    undo: () => {
      get().endGesture();
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

    updateComposition: (patch) => {
      commit((p) => ({ ...p, composition: { ...p.composition, ...patch } }), undefined, `comp:${Object.keys(patch).join(",")}`);
      set((s) => ({ playhead: Math.min(s.playhead, s.project.composition.duration) }));
    },

    addLayer: (type) => {
      const layer = createLayer(type, get().project.composition);
      commit(
        (p) => ({ ...p, composition: { ...p.composition, layers: [layer, ...p.composition.layers] } }),
        { selectedLayerId: layer.id }
      );
    },

    addLayerWithProps: (type, propsPatch, durationOverride) => {
      const base = createLayer(type, get().project.composition);
      const layer: Layer = {
        ...base,
        endTime: durationOverride != null ? base.startTime + durationOverride : base.endTime,
        props: { ...base.props, ...propsPatch } as Layer["props"],
      };
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

    duplicateLayer: (layerId) => {
      const comp = get().project.composition;
      const idx = comp.layers.findIndex((l) => l.id === layerId);
      if (idx === -1) return;
      const copy = cloneLayer(comp.layers[idx]);
      copy.id = makeId("layer");
      copy.name = `${comp.layers[idx].name} copy`;
      const offset = 24;
      copy.transform.position.static = { x: copy.transform.position.static.x + offset, y: copy.transform.position.static.y + offset };
      copy.transform.position.keyframes = copy.transform.position.keyframes.map((k) => ({
        ...k,
        id: makeId("kf"),
        value: { x: k.value.x + offset, y: k.value.y + offset },
      }));
      for (const key of ["scale", "rotation", "opacity"] as const) {
        const prop = copy.transform[key] as { keyframes: Keyframe<unknown>[] };
        prop.keyframes = prop.keyframes.map((k) => ({ ...k, id: makeId("kf") }));
      }
      commit(
        (p) => {
          const layers = [...p.composition.layers];
          layers.splice(idx, 0, copy);
          return { ...p, composition: { ...p.composition, layers } };
        },
        { selectedLayerId: copy.id }
      );
    },

    translateLayer: (layerId, dx, dy) => {
      const source = (get().gestureBase ?? get().project).composition.layers.find((l) => l.id === layerId);
      if (!source) return;
      const shift = (pt: Point): Point => ({ x: pt.x + dx, y: pt.y + dy });
      commit((p) => ({
        ...p,
        composition: mapLayers(p.composition, layerId, (l) => ({
          ...l,
          transform: {
            ...l.transform,
            position: {
              static: shift(source.transform.position.static),
              keyframes: source.transform.position.keyframes.map((k) => ({ ...k, value: shift(k.value) })),
            },
          },
        })),
      }));
    },

    selectLayer: (layerId) => set({ selectedLayerId: layerId }),

    renameLayer: (layerId, name) =>
      commit(
        (p) => ({ ...p, composition: mapLayers(p.composition, layerId, (l) => ({ ...l, name })) }),
        undefined,
        `name:${layerId}`
      ),

    updateLayerProps: (layerId, patch) =>
      commit(
        (p) => ({
          ...p,
          composition: mapLayers(p.composition, layerId, (l) => ({
            ...l,
            props: { ...l.props, ...patch } as Layer["props"],
          })),
        }),
        undefined,
        `props:${layerId}:${Object.keys(patch).sort().join(",")}`
      ),

    updateLayerTiming: (layerId, startTime, endTime) => {
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return;
      const start = Math.max(0, startTime);
      const end = Math.max(start + 0.05, endTime);
      commit(
        (p) => {
          const comp = mapLayers(p.composition, layerId, (l) => ({ ...l, startTime: start, endTime: end }));
          return { ...p, composition: { ...comp, duration: Math.max(comp.duration, end) } };
        },
        undefined,
        `timing:${layerId}`
      );
    },

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

    insertSticker: (stickerId) => {
      const layers = buildSticker(stickerId, get().project.composition);
      commit(
        (p) => ({ ...p, composition: { ...p.composition, layers: [...layers, ...p.composition.layers] } }),
        { selectedLayerId: layers[0]?.id ?? null }
      );
    },

    attachVideo: (layerId, media) => {
      commit((p) => {
        let comp = p.composition;
        const layer = comp.layers.find((l) => l.id === layerId);
        if (!layer) return p;
        const vw = media.videoWidth || (layer.props as VideoLayerProps).width;
        const vh = media.videoHeight || (layer.props as VideoLayerProps).height;

        // A fresh project takes the shape of its first clip (e.g. a vertical phone video → 9:16).
        const onlyLayer = comp.layers.length === 1;
        if (onlyLayer && vw > 0 && vh > 0) {
          const scale = Math.min(1, AUTO_COMP_MAX_SIDE / Math.max(vw, vh));
          comp = { ...comp, width: even(vw * scale), height: even(vh * scale) };
        }

        const fit = Math.min(comp.width / vw, comp.height / vh);
        const next = cloneLayer(layer);
        next.props = {
          ...(layer.props as VideoLayerProps),
          src: media.src,
          fileName: media.fileName,
          naturalDuration: media.naturalDuration,
          trimIn: 0,
          width: Math.round(vw * fit),
          height: Math.round(vh * fit),
        };
        next.transform.position.static = { x: comp.width / 2, y: comp.height / 2 };
        return { ...p, composition: fitLayerToClip(comp, next, media.naturalDuration) };
      });
    },

    attachAudio: (layerId, media) => {
      commit((p) => {
        const layer = p.composition.layers.find((l) => l.id === layerId);
        if (!layer) return p;
        const next = cloneLayer(layer);
        next.props = { ...layer.props, src: media.src, fileName: media.fileName, naturalDuration: media.naturalDuration, trimIn: 0 } as Layer["props"];
        return { ...p, composition: fitLayerToClip(p.composition, next, media.naturalDuration) };
      });
    },

    applyAutoEdit: (sourceLayerId, words, opts) => get().applyEditPlan(sourceLayerId, planFromRules(words, opts)),

    applyEditPlan: (sourceLayerId, plan) => {
      const comp = get().project.composition;
      const sourceLayer = comp.layers.find((l) => l.id === sourceLayerId);
      if (!sourceLayer) return;
      const srcProps = sourceLayer.props as { trimIn: number };
      const { newLayers, updatedSourceLayer, compPatch } = buildEditFromPlan(comp, sourceLayer, srcProps.trimIn, plan);
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

    play: () =>
      set((s) => {
        const comp = s.project.composition;
        const atEnd = s.playhead >= comp.duration - 1 / comp.fps;
        return { isPlaying: true, playhead: atEnd ? 0 : s.playhead };
      }),
    pause: () => set({ isPlaying: false }),
    togglePlay: () => (get().isPlaying ? get().pause() : get().play()),

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
              // Animated property edited between keyframes: record the change as a new keyframe here,
              // otherwise the edit would silently have no effect.
              animProp.keyframes.push({ id: makeId("kf"), time, value, easing: "easeInOut" });
              animProp.keyframes.sort((a, b) => a.time - b.time);
            }
          }
          return layer;
        }),
      }), undefined, `static:${layerId}:${propKey}:${get().playhead.toFixed(3)}`),

    clearKeyframes: (layerId, propKey) =>
      commit((p) => ({
        ...p,
        composition: mapLayers(p.composition, layerId, (l) => {
          const layer = cloneLayer(l);
          const animProp = layer.transform[propKey] as { static: unknown; keyframes: Keyframe<unknown>[] };
          animProp.static = evaluateTransform(l.transform, get().playhead)[propKey];
          animProp.keyframes = [];
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
