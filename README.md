# Motion Studio Web

A browser-based motion graphics editor, inspired by After Effects — plus an
Arabic-first "Auto Edit" layer that turns raw footage into a first cut
automatically. Layers, a keyframeable timeline, a canvas-based compositor,
speech-to-text, and video export, all running client-side: no backend, no
account, no upload.

## Features (v0.6)

- **Layers**: text, rectangle, ellipse, polygon (3–12 sides), star, image,
  video (import an mp4/webm clip, trim its in-point), audio (import mp3/wav,
  trim its in-point), captions (auto-generated from a video/audio layer's
  speech, Arabic-first), and a **glass panel** (real frosted-glass blur over
  whatever's behind it).
- **Keyframeable transform properties**: position, scale, rotation, opacity —
  each with per-keyframe easing (linear / ease in / ease out / ease in-out).
- **Auto captions**: fully in-browser speech-to-text (Whisper via
  `@xenova/transformers`, no server/upload), word-level timestamps, Arabic
  language hint. Correct any word afterwards — timestamps stay put. Star a
  word to emphasize it (color + highlight), the equivalent of wrapping it in
  `[brackets]`. 4 caption styles: big word, karaoke line, pill/glass badge,
  line + emphasis-only. Proper RTL layout for Arabic text.
- **Motion library panel** (📚 المكتبة): a browsable, categorized library —
  an icon rail (text & titles, captions, capsules/buttons, lists, faceless
  scenes, elements, Auto Edit) next to a grid of preview cards, click to
  insert. Covers the Title Card / Lower Third / Badge / CTA Button / Big
  Number / Animated List templates, all 4 caption styles, all 24 faceless
  scenes (color-variant dots per scene), and shapes/glass — plus 10 **motion
  presets** (fade/zoom/slide/pop/pan) you can apply to *any* layer from its
  properties panel to animate it in or out.
- **Faceless scenes**: 6 full-screen scene templates × 4 color variants each
  (24 total) for when you don't want to show a person — Neon, Realistic
  Product, 3D Mockup, Paper Collage, Pinned Note, Bouncing Words. Each
  inserts a ready-animated background plus a product-image placeholder (an
  empty image layer — swap in your own photo) with a smooth continuous
  bounce/float loop, picked from a grouped dropdown.
- **✨ Auto Edit**: transcribes a video/audio layer's speech and
  automatically assembles a first cut — captions with heuristically-detected
  emphasis, a big-number callout for anything counted, an animated list for
  anything enumerated (أولاً/ثانياً/ثالثاً…, each item appearing exactly when
  spoken), zoom "punches" on the source clip timed to its pauses (density
  controlled by a calm/medium/strong pace setting), a title at the start,
  and a CTA at the end — all inserted as **one single undo step**. Detection
  is rule-based (ordinal markers, digits, pause gaps, content-word length),
  not full language understanding, so review and tweak the result afterward.
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
    libraryCatalog.ts         # categorizes templates/captions/scenes/elements
                               # for the Library panel's icon rail + grid
    builders.ts               # shared layer constructors used by templates,
                               # scenes and Auto Edit (makeText/makeRect/…)
    scenes.ts                  # faceless scenes — full background + product
                                # placeholder compositions, 6 types × 4 colors
    autoEdit.ts                 # rule-based speech analysis (lists, numbers,
                                 # emphasis, pauses) + assembles a first cut
  state/
    store.ts            # Zustand store: project state, undo/redo, actions
  components/
    Toolbar.tsx          # add layer, undo/redo, library, Auto Edit,
                          # play/pause, save/load, export
    LibraryPanel.tsx      # browsable library: category rail + preview-card
                           # grid (templates, captions, scenes, elements)
    AutoEditDialog.tsx   # Auto Edit's source/pace/title/CTA config modal
    PreviewCanvas.tsx    # live canvas preview + playback loop
    PropertiesPanel.tsx  # per-layer content + animatable transform editor
    Timeline/             # ruler, layer rows, keyframe tracks, scrubbing
```

The renderer and the exporter share the exact same `renderComposition()`
function, so what you see in the preview is exactly what gets exported.
Preview and export use separate `MediaSession` instances (each owns its own
`<video>`/`<audio>` elements) so that export's Web Audio tap-in never
interferes with whatever the user is doing in the live editor. Every
composition-wide builder (templates, scenes, Auto Edit) goes through a
single `commit()` call in the store, so each one is exactly one `Ctrl+Z` —
including Auto Edit's whole multi-layer assembly.

## Roadmap ideas

The four big pieces of the original plan (Auto Captions, Motion Library,
Faceless Scenes, Auto Edit) are all in. Next:

- **Smarter Auto Edit**: swap the rule-based heuristics for an actual
  language model where available, pick a faceless scene automatically based
  on content, vary the number-callout/list layout more.
- **More motion library components**: orbiting icons, cards, a proper
  camera-move/transition preset between two layers, more templates.
- **Sound library**: procedurally-generated UI sound effects (pop, whoosh,
  ding…) via the Web Audio API, playable on template insert and mixed into
  export.
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
