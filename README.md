# Motion Studio Web

A browser-based motion graphics editor, inspired by After Effects: layers, a
keyframeable timeline, a canvas-based compositor, and video export — all
running client-side, no backend or account required.

## Features (v0.5)

- **Faceless scenes**: 6 full-screen scene templates × 4 color variants each
  (24 total) for when you don't want to show a person — Neon, Realistic
  Product, 3D Mockup, Paper Collage, Pinned Note, Bouncing Words. Each
  inserts a ready-animated background plus a product-image placeholder (an
  empty image layer — swap in your own photo) with a smooth continuous
  bounce/float loop, picked from a grouped dropdown.


- **Layers**: text, rectangle, ellipse, polygon (3–12 sides), star, image,
  video (import an mp4/webm clip, trim its in-point), audio (import mp3/wav,
  trim its in-point), captions (auto-generated from a video/audio layer's
  speech, Arabic-first), and a **glass panel** (real frosted-glass blur over
  whatever's behind it).
- **Motion library**: one-click templates that insert a ready-animated group
  of layers — Title Card, Lower Third, Badge/Capsule, CTA Button (with a
  looping pulse), Big Number, Animated List — plus 10 **motion presets**
  (fade/zoom/slide/pop/pan) you can apply to *any* layer from its properties
  panel to animate it in or out.
- **Auto captions**: fully in-browser speech-to-text (Whisper via
  `@xenova/transformers`, no server/upload), word-level timestamps, Arabic
  language hint. Correct any word afterwards — timestamps stay put. Star a
  word to emphasize it (color + highlight), the equivalent of wrapping it in
  `[brackets]`. 4 caption styles: big word, karaoke line, pill/glass badge,
  line + emphasis-only. Proper RTL layout for Arabic text.
- **Keyframeable transform properties**: position, scale, rotation, opacity —
  each with per-keyframe easing (linear / ease in / ease out / ease in-out).
- **Timeline**: scrubbable playhead, per-layer keyframe tracks, ruler.
- **Properties panel**: edit layer content and animate any transform property
  with a stopwatch toggle, like After Effects.
- **Playback**: real-time preview of the composition, including audible
  video/audio layer sound (each has its own mute toggle).
- **Undo / redo**: full edit history (`Ctrl+Z` / `Ctrl+Shift+Z`, or the
  toolbar buttons).
- **Export**: renders the composition — picture *and* sound — to a `.webm`
  video file entirely in your browser, using `canvas.captureStream()` +
  `MediaRecorder`, with video/audio layer audio mixed in via the Web Audio
  API. No server required.
- **Save / Load**: projects are plain JSON files you can save and reopen, and
  the current project auto-saves to `localStorage`. Note: video/audio files
  themselves are session-only (held as an in-memory object URL) — re-attach
  the file after reloading the page or reopening a saved project.

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
    renderer.ts          # MediaSession (img/video/audio element cache) +
                          # draws a Composition to a 2D canvas at time t
    export.ts            # records the canvas (+ mixed audio) to a .webm Blob
    factory.ts            # default project/layer constructors
    transcribe.ts          # in-browser Whisper speech-to-text (lazy-loaded)
    presets.ts              # motion presets — inject entrance/exit keyframes
                             # onto an existing layer
    templates.ts             # motion library — builds ready-animated groups
                              # of layers (title card, lower third, etc.)
    builders.ts               # shared layer constructors used by templates
                               # and scenes (makeText/makeRect/…)
    scenes.ts                  # faceless scenes — full background + product
                                # placeholder compositions, 6 types × 4 colors
  state/
    store.ts            # Zustand store: project state, undo/redo, actions
  components/
    Toolbar.tsx          # add layer, undo/redo, play/pause, save/load, export
    PreviewCanvas.tsx    # live canvas preview + playback loop
    PropertiesPanel.tsx  # per-layer content + animatable transform editor
    Timeline/             # ruler, layer rows, keyframe tracks, scrubbing
```

The renderer and the exporter share the exact same `renderComposition()`
function, so what you see in the preview is exactly what gets exported.
Preview and export use separate `MediaSession` instances (each owns its own
`<video>`/`<audio>` elements) so that export's Web Audio tap-in never
interferes with whatever the user is doing in the live editor.

## Roadmap ideas

This covers "Auto Captions", "Motion Library", and "Faceless Scenes" —
three of the four big pieces of the original plan. Last one:

- **Auto Edit**: ties everything above together — transcribes + understands
  speech (detects lists, numbers, emphasis), and automatically assembles a
  first cut (captions, a faceless scene or titles, zooms, transitions on
  pauses, a CTA) as one undoable step.

Smaller items:
- **More motion library components**: orbiting icons, cards, a proper
  camera-move/transition preset between two layers, more templates.
- **Sound library**: procedurally-generated UI sound effects (pop, whoosh,
  ding…) via the Web Audio API, playable on template insert and mixed into
  export.

Smaller items:
- Drag keyframes directly on the timeline (currently edited via the
  properties panel + "add keyframe at playhead" stopwatch button).
- Persisting uploaded video/image/audio files across reloads (e.g.
  IndexedDB) instead of session-only object URLs.
- A visible waveform for audio/video layers on the timeline.
- More caption styles; editable word timing (currently text-only correction).
- Rotation support for glass panels (currently position/scale/opacity only).
- Optional server-side rendering backend (e.g. your own machine running a
  small render worker) for faster/higher-quality exports — the data model
  and renderer are already decoupled from the UI, so a Node/ffmpeg render
  path can reuse `engine/evaluate.ts` and a canvas-compatible renderer.
