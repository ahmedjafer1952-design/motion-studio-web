# Motion Studio Web

A browser-based motion graphics editor, inspired by After Effects — plus an
Arabic-first "Auto Edit" layer that turns raw footage into a first cut
automatically. Layers, a keyframeable timeline, a canvas-based compositor,
speech-to-text, and video export, all running client-side: no backend, no
account, no upload.

## Features (v0.8)

- **Layers**: text (incl. a typewriter reveal, `[bracket]` word-highlighting,
  and a 0→N count-up mode), rectangle, ellipse, polygon (3–12 sides), star,
  image, video (import an mp4/webm clip, trim its in-point), audio (import
  mp3/wav, trim its in-point), captions (auto-generated from a video/audio
  layer's speech, Arabic-first), a **glass panel** (real frosted-glass blur
  over whatever's behind it), and an **overlay** (full-bleed film grain /
  VHS / vignette / scanlines texture).
- **Keyframeable transform properties**: position, scale, rotation, opacity —
  each with per-keyframe easing (linear / ease in / ease out / ease in-out).
- **Auto captions**: fully in-browser speech-to-text (Whisper via
  `@xenova/transformers`, no server/upload), word-level timestamps, Arabic
  language hint. Correct any word afterwards — timestamps stay put. Star a
  word to emphasize it (color + highlight), the equivalent of wrapping it in
  `[brackets]`. 5 caption styles: big word, karaoke line, pill/glass badge,
  line + emphasis-only, and build-up (words accumulate as spoken). Proper
  RTL layout for Arabic text.
- **Motion library panel** (📚 المكتبة): a browsable, categorized library —
  an icon rail (text & titles, captions, capsules/buttons, lists, faceless
  scenes, stickers & motion, color grading, sound library, elements,
  Auto Edit) next to a grid of cards, click to insert. Every card renders a
  **real accurate frame through the actual engine** (not a mockup/
  placeholder) — the same `renderComposition()` preview/export share — so
  what you see is exactly what you get. Covers the Title Card / Lower Third
  / Badge / CTA Button / Big Number / Animated List / Typewriter /
  Highlighted-Text / Count-Up-Number / Stat Card / Comparison Card
  templates, all 5 caption styles (with a sample sentence), all 24 faceless
  scenes (a real-rendered thumbnail per
  color variant, not a flat swatch), orbiting icons, 8 animated emoji
  stickers, 4 overlay effects, shapes/glass, a 19-sound synthesized SFX
  library, and the color-grade looks — plus 14 **motion presets**
  (fade/zoom/slide/pop/pan/whip-pan/zoom-punch/glitch-cut) you can apply to
  *any* layer from its properties panel to animate it in or out.
- **Sound library** (🔊 مكتبة الأصوات): 19 UI/SFX sounds (pop, whoosh, ding,
  click, riser, impact, coin, laser, success…) synthesized on the fly with
  the Web Audio API — no audio files shipped. Preview with the ▶ button or
  click to insert as a real audio layer; mixes into export exactly like any
  uploaded sound.
- **Stickers & camera transitions**: 8 animated emoji stickers (fire, heart,
  star, thumbs-up…) with a gentle wiggle loop, an **orbiting icons** template
  (icons circling a center product), and 4 fast camera-cut presets (whip pan
  left/right, zoom punch, glitch cut) alongside the existing fade/slide/pop/
  pan set.
- **Cinematic color grading**: 10 whole-composition "looks" (Teal & Orange,
  Moody Blue, Warm Film, Noir B&W, Vintage Sepia, High Contrast, Cyberpunk,
  Faded Pastel, Golden Hour, Day-for-Night) applied as a post-process pass
  over everything — picked from the library panel's 🎨 تلوين سينمائي
  category, with a live WYSIWYG preview on each card. Saved with the
  project; export renders the exact same grade you see in preview.
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
  the current project auto-saves to `localStorage`. Imported video/audio
  files are kept in the browser's IndexedDB and referenced by a stable
  `idb:` id, so they survive page reloads (library sounds use `sound:` ids
  and are re-synthesized on demand). A saved `.json` doesn't contain the
  media itself — on another device, pick the files again.
- **Clips drive the project**: importing a video makes the layer span the
  whole clip and extends the project length to match; a fresh project also
  takes the clip's shape (a vertical phone video → a 9:16 frame). The clip
  is fitted inside the frame, never cropped. Project length, frame size
  (16:9 / 9:16 / 1:1 / 4:5 presets) and background are editable from the
  properties panel when no layer is selected. The timeline zooms to fit.

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
                               # /grades for the Library panel's icon rail + grid
    colorGrade.ts              # cinematic color-grade presets (filter + tint)
                                # applied as a post-process pass in the renderer
    builders.ts               # shared layer constructors used by templates,
                               # scenes and Auto Edit (makeText/makeRect/…)
    scenes.ts                  # faceless scenes — full background + product
                                # placeholder compositions, 6 types × 4 colors
    autoEdit.ts                 # rule-based speech analysis (lists, numbers,
                                 # emphasis, pauses) + assembles a first cut
    libraryPreview.ts            # builds the sample layers each library
                                  # card previews, per category
    stickers.ts                   # 8 animated emoji stickers + orbiting-icon
                                   # orbit-loop keyframe helper
    overlays.ts                    # film grain / VHS / vignette / scanlines
                                    # overlay effect metadata
    sounds.ts                       # 19 synthesized UI sounds (Web Audio
                                     # OfflineAudioContext → WAV blob, cached)
    mediaStore.ts                    # persists imported media in IndexedDB;
                                      # resolves idb:/sound: refs to URLs
  state/
    store.ts            # Zustand store: project state, undo/redo, actions
  components/
    Toolbar.tsx          # add layer, undo/redo, library, Auto Edit,
                          # play/pause, save/load, export
    LibraryPanel.tsx      # browsable library: category rail + preview-card
                           # grid (templates, captions, scenes, grades,
                           # sounds, stickers, overlays, elements)
    LibraryCardPreview.tsx # renders one real accurate frame per card via
                            # renderComposition — WYSIWYG, not a mockup
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

The original plan (Auto Captions, Motion Library, Faceless Scenes, Auto
Edit) plus a first library-expansion pass (text components, orbiting
icons/camera presets, sound library, stickers/overlays) are all in. Next:

- **Smarter Auto Edit**: swap the rule-based heuristics for an actual
  language model where available, pick a faceless scene automatically based
  on content, vary the number-callout/list layout more.
- **More motion library components**: animated cards, a proper
  camera-move/transition preset between two layers, more templates.
- Drag keyframes directly on the timeline (currently edited via the
  properties panel + "add keyframe at playhead" stopwatch button).
- A visible waveform for audio/video layers on the timeline.
- More caption styles; editable word timing (currently text-only correction).
- Rotation support for glass panels (currently position/scale/opacity only).
- Optional server-side rendering backend (e.g. your own machine running a
  small render worker) for faster/higher-quality exports — the data model
  and renderer are already decoupled from the UI, so a Node/ffmpeg render
  path can reuse `engine/evaluate.ts` and a canvas-compatible renderer.
