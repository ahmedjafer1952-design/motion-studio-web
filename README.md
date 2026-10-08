# Motion Studio Web

A browser-based motion graphics editor, inspired by After Effects: layers, a
keyframeable timeline, a canvas-based compositor, and video export — all
running client-side, no backend or account required.

## Features (v0.3)

- **Layers**: text, rectangle, ellipse, polygon (3–12 sides), star, image,
  video (import an mp4/webm clip, trim its in-point), audio (import mp3/wav,
  trim its in-point), and **captions** (auto-generated from a video/audio
  layer's speech, Arabic-first).
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

This is the "Auto Captions" slice of a larger plan (see below). Next up, in
order:

- **Motion library**: a template/preset system — titles, number callouts,
  lists, CTA buttons, badges, a real glass-blur-over-video layer, cards,
  orbiting icons, camera-move transitions — each inserted as a single
  pre-animated layer group that adapts to its text/size.
- **Faceless scenes**: full background scene templates (neon, product
  mockup, paper collage, etc.) for when you don't want to show a person.
- **Auto Edit**: ties the above together — transcribes + understands speech
  (detects lists, numbers, emphasis), and automatically assembles a first
  cut (titles, zooms, transitions on pauses, a CTA) as one undoable step.

Smaller items:
- Drag keyframes directly on the timeline (currently edited via the
  properties panel + "add keyframe at playhead" stopwatch button).
- Persisting uploaded video/image/audio files across reloads (e.g.
  IndexedDB) instead of session-only object URLs.
- A visible waveform for audio/video layers on the timeline.
- More caption styles; editable word timing (currently text-only correction).
- Optional server-side rendering backend (e.g. your own machine running a
  small render worker) for faster/higher-quality exports — the data model
  and renderer are already decoupled from the UI, so a Node/ffmpeg render
  path can reuse `engine/evaluate.ts` and a canvas-compatible renderer.
