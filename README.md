# Motion Studio Web

A browser-based motion graphics editor, inspired by After Effects: layers, a
keyframeable timeline, a canvas-based compositor, and video export — all
running client-side, no backend or account required.

## Features (v0.1)

- **Layers**: text, rectangle, ellipse, image, and **video** layers (import an
  mp4/webm clip from your computer, trim its in-point, and composite other
  layers — text, shapes, images — on top of it).
- **Keyframeable transform properties**: position, scale, rotation, opacity —
  each with per-keyframe easing (linear / ease in / ease out / ease in-out).
- **Timeline**: scrubbable playhead, per-layer keyframe tracks, ruler.
- **Properties panel**: edit layer content and animate any transform property
  with a stopwatch toggle, like After Effects.
- **Playback**: real-time preview of the composition.
- **Export**: renders the composition to a `.webm` video file entirely in
  your browser, using `canvas.captureStream()` + `MediaRecorder` — no server
  required.
- **Save / Load**: projects are plain JSON files you can save and reopen, and
  the current project auto-saves to `localStorage`. Note: video files
  themselves are session-only (held as an in-memory object URL) — re-attach
  the video file after reloading the page or reopening a saved project.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in a Chromium-based browser (export relies
on `MediaRecorder` + `canvas.captureStream`, best supported in Chrome/Edge).

```bash
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## Architecture

```
src/
  types.ts            # Project / Composition / Layer / Keyframe data model
  engine/
    interpolate.ts     # easing + lerp functions
    evaluate.ts         # evaluates animated properties at a given time
    renderer.ts          # draws a Composition to a 2D canvas at time t
    export.ts            # records the canvas to a .webm Blob
    factory.ts            # default project/layer constructors
  state/
    store.ts            # Zustand store: project state + editor actions
  components/
    Toolbar.tsx          # add layer, play/pause, save/load, export
    PreviewCanvas.tsx    # live canvas preview + playback loop
    PropertiesPanel.tsx  # per-layer content + animatable transform editor
    Timeline/             # ruler, layer rows, keyframe tracks, scrubbing
```

The renderer and the exporter share the exact same `renderComposition()`
function, so what you see in the preview is exactly what gets exported.

## Roadmap ideas

- Drag keyframes directly on the timeline (currently edited via the
  properties panel + "add keyframe at playhead" stopwatch button).
- Audio support for video layers during export (currently video layers are
  muted; `canvas.captureStream()` only carries picture, so audio would need
  a separate `MediaStream` audio track merged in via the Web Audio API).
- Persisting uploaded video/image files across reloads (e.g. IndexedDB)
  instead of session-only object URLs.
- More layer types (shapes with paths, layer groups/precomps).
- Optional server-side rendering backend (e.g. your own machine running a
  small render worker) for faster/higher-quality exports — the data model
  and renderer are already decoupled from the UI, so a Node/ffmpeg render
  path can reuse `engine/evaluate.ts` and a canvas-compatible renderer.
- Undo/redo history.
