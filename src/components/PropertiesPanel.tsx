import { useEffect, useState, type InputHTMLAttributes } from "react";
import type {
  AnimatablePropKey,
  AudioLayerProps,
  CaptionLayerProps,
  CaptionWord,
  Easing,
  GlassLayerProps,
  ImageLayerProps,
  Layer,
  OverlayLayerProps,
  PolygonLayerProps,
  Point,
  ShapeLayerProps,
  StarLayerProps,
  TextLayerProps,
  VideoLayerProps,
} from "../types";
import { useEditorStore, type AttachedAudio, type AttachedVideo } from "../state/store";
import { isSpeechSource, resolveMediaUrl, storeMediaFile } from "../engine/mediaStore";
import { FONT_CHOICES } from "../engine/fonts";
import { evaluateTransform } from "../engine/evaluate";
import { PROPERTY_COLORS } from "./Timeline/constants";
import type { ModelSize, TranscribeProgress } from "../engine/transcribe";
import { MOTION_PRESETS } from "../engine/presets";
import { makeId } from "../utils/id";

const EASINGS: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut"];

function AnimRow({
  layerId,
  propKey,
  label,
  children,
}: {
  layerId: string;
  propKey: AnimatablePropKey;
  label: string;
  children: React.ReactNode;
}) {
  const layer = useEditorStore((s) => s.project.composition.layers.find((l) => l.id === layerId));
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const removeKeyframe = useEditorStore((s) => s.removeKeyframe);
  const clearKeyframes = useEditorStore((s) => s.clearKeyframes);
  const updateKeyframe = useEditorStore((s) => s.updateKeyframe);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  if (!layer) return null;
  const anim = layer.transform[propKey];
  const animated = anim.keyframes.length > 0;

  return (
    <div className="anim-row">
      <div className="anim-row-header">
        <button
          className={`stopwatch ${animated ? "active" : ""}`}
          title={animated ? "Animated — click to add/update a keyframe here" : "Click to start animating"}
          style={{ color: PROPERTY_COLORS[propKey] }}
          onClick={() => addKeyframe(layerId, propKey)}
        >
          ◆
        </button>
        <span className="anim-row-label">{label}</span>
        {animated && (
          <button
            className="link-btn"
            title="Stop animating (clears all keyframes)"
            onClick={() => {
              if (confirm(`Remove all keyframes for ${label}?`)) {
                clearKeyframes(layerId, propKey);
              }
            }}
          >
            clear
          </button>
        )}
      </div>
      <div className="anim-row-value">{children}</div>
      {animated && (
        <div className="keyframe-list">
          {[...anim.keyframes]
            .sort((a, b) => a.time - b.time)
            .map((k) => (
              <div key={k.id} className="keyframe-list-item">
                <button className="link-btn" onClick={() => setPlayhead(k.time)}>
                  {k.time.toFixed(2)}s
                </button>
                <select
                  value={k.easing}
                  onChange={(e) => updateKeyframe(layerId, propKey, k.id, { easing: e.target.value as Easing })}
                >
                  {EASINGS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                <button className="link-btn danger" onClick={() => removeKeyframe(layerId, propKey, k.id)}>
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * A number input that only commits valid numbers: clearing the field to retype it, or typing "-",
 * no longer pushes 0/NaN into the project. The draft resets to the real value on blur.
 */
function NumInput({
  value,
  onChange,
  onBlur,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "type"> & { value: number | undefined }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      type="number"
      value={draft ?? (value ?? "")}
      onChange={(e) => {
        setDraft(e.target.value);
        if (Number.isFinite(parseFloat(e.target.value))) onChange?.(e);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}

function NumberField({ value, onChange, step = 1, suffix }: { value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="number-field">
      <NumInput value={Number.isFinite(value) ? round(value) : 0} step={step} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function PropertiesPanel() {
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const layer = useEditorStore((s) => s.project.composition.layers.find((l) => l.id === selectedLayerId));
  const playhead = useEditorStore((s) => s.playhead);
  const renameLayer = useEditorStore((s) => s.renameLayer);
  const updateLayerTiming = useEditorStore((s) => s.updateLayerTiming);
  const updateLayerProps = useEditorStore((s) => s.updateLayerProps);
  const setStaticValue = useEditorStore((s) => s.setStaticValue);
  const applyMotionPreset = useEditorStore((s) => s.applyMotionPreset);
  const attachVideo = useEditorStore((s) => s.attachVideo);
  const attachAudio = useEditorStore((s) => s.attachAudio);
  const comp = useEditorStore((s) => s.project.composition);

  if (!layer) {
    return <CompositionSettings />;
  }

  const evaluated = evaluateTransform(layer.transform, playhead);

  const setPoint = (key: "position" | "scale", patch: Partial<Point>) => {
    const current = key === "position" ? evaluated.position : evaluated.scale;
    setStaticValue(layer.id, key, { ...current, ...patch });
  };

  return (
    <div className="properties-panel">
      <div className="properties-section">
        <label className="field">
          <span>Name</span>
          <input value={layer.name} onChange={(e) => renameLayer(layer.id, e.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Start (s)</span>
            <NumInput
              step={0.1}
              value={layer.startTime}
              onChange={(e) => updateLayerTiming(layer.id, parseFloat(e.target.value) || 0, layer.endTime)}
            />
          </label>
          <label className="field">
            <span>End (s)</span>
            <NumInput
              step={0.1}
              value={layer.endTime}
              onChange={(e) => updateLayerTiming(layer.id, layer.startTime, parseFloat(e.target.value) || 0)}
            />
          </label>
        </div>
      </div>

      <div className="properties-section">
        <h4>Content</h4>
        {layer.type === "text" && (
          <TextFields props={layer.props as TextLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
        )}
        {(layer.type === "rect" || layer.type === "ellipse") && (
          <ShapeFields props={layer.props as ShapeLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
        )}
        {layer.type === "polygon" && (
          <PolygonFields props={layer.props as PolygonLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
        )}
        {layer.type === "star" && (
          <StarFields props={layer.props as StarLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
        )}
        {layer.type === "audio" && (
          <AudioFields
            props={layer.props as AudioLayerProps}
            onChange={(p) => updateLayerProps(layer.id, p)}
            onAttach={(media) => attachAudio(layer.id, media)}
            onFitDuration={(naturalDuration, trimIn) =>
              updateLayerTiming(layer.id, layer.startTime, layer.startTime + Math.max(0.1, naturalDuration - trimIn))
            }
          />
        )}
        {layer.type === "caption" && (
          <CaptionFields
            layerId={layer.id}
            props={layer.props as CaptionLayerProps}
            onChange={(p) => updateLayerProps(layer.id, p)}
          />
        )}
        {layer.type === "glass" && (
          <GlassFields props={layer.props as GlassLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
        )}
        {layer.type === "overlay" && (
          <OverlayFields props={layer.props as OverlayLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
        )}
        {layer.type === "image" && (
          <ImageFields props={layer.props as ImageLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
        )}
        {layer.type === "video" && (
          <VideoFields
            props={layer.props as VideoLayerProps}
            onChange={(p) => updateLayerProps(layer.id, p)}
            onAttach={(media) => attachVideo(layer.id, media)}
            onFitDuration={(naturalDuration, trimIn) =>
              updateLayerTiming(layer.id, layer.startTime, layer.startTime + Math.max(0.1, naturalDuration - trimIn))
            }
          />
        )}
      </div>

      {layer.type !== "audio" && (
      <div className="properties-section">
        <h4>Motion presets</h4>
        <div className="preset-grid">
          {MOTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              onClick={() => applyMotionPreset(layer.id, preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {layer.type !== "audio" && (
      <div className="properties-section">
        <h4>Transform</h4>
        <AnimRow layerId={layer.id} propKey="position" label="Position">
          <NumberField value={evaluated.position.x} onChange={(x) => setPoint("position", { x })} />
          <NumberField value={evaluated.position.y} onChange={(y) => setPoint("position", { y })} />
        </AnimRow>
        <AnimRow layerId={layer.id} propKey="scale" label="Scale %">
          <NumberField value={evaluated.scale.x * 100} step={1} onChange={(x) => setPoint("scale", { x: x / 100 })} />
          <NumberField value={evaluated.scale.y * 100} step={1} onChange={(y) => setPoint("scale", { y: y / 100 })} />
        </AnimRow>
        <AnimRow layerId={layer.id} propKey="rotation" label="Rotation">
          <NumberField value={evaluated.rotation} step={1} suffix="°" onChange={(v) => setStaticValue(layer.id, "rotation", v)} />
        </AnimRow>
        <AnimRow layerId={layer.id} propKey="opacity" label="Opacity">
          <NumberField
            value={evaluated.opacity * 100}
            step={1}
            suffix="%"
            onChange={(v) => setStaticValue(layer.id, "opacity", Math.max(0, Math.min(1, v / 100)))}
          />
        </AnimRow>
      </div>
      )}

      <div className="properties-section">
        <h4>Composition</h4>
        <p className="hint">
          {comp.width}×{comp.height} · {comp.fps}fps · {comp.duration}s
        </p>
      </div>
    </div>
  );
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = FONT_CHOICES.some((f) => f.value === value);
  return (
    <label className="field">
      <span>Font</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {!known && <option value={value}>{value}</option>}
        {FONT_CHOICES.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
            {f.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextFields({ props: p, onChange }: { props: TextLayerProps; onChange: (p: Partial<TextLayerProps>) => void }) {
  const isCounter = p.countTo != null;
  return (
    <>
      {!isCounter && (
        <label className="field">
          <span>Text — wrap a word in [brackets] to highlight it</span>
          <textarea dir="auto" value={p.content} onChange={(e) => onChange({ content: e.target.value })} />
        </label>
      )}
      <FontSelect value={p.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} />
      <div className="field-row">
        <label className="field">
          <span>Size</span>
          <NumInput min={1} value={p.fontSize} onChange={(e) => onChange({ fontSize: Math.max(1, parseFloat(e.target.value) || 1) })} />
        </label>
        <label className="field">
          <span>Color</span>
          <input type="color" value={p.color} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        {p.content.includes("[") && !isCounter && (
          <label className="field">
            <span>Highlight</span>
            <input type="color" value={p.emphasisColor ?? "#ffd166"} onChange={(e) => onChange({ emphasisColor: e.target.value })} />
          </label>
        )}
      </div>
      <div className="field-row">
        <label className="field">
          <span>Align</span>
          <select value={p.align} onChange={(e) => onChange({ align: e.target.value as TextLayerProps["align"] })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className="field field-checkbox">
          <input type="checkbox" checked={!!p.bold} onChange={(e) => onChange({ bold: e.target.checked })} />
          <span>Bold</span>
        </label>
      </div>
      {isCounter ? (
        <div className="field-row">
          <label className="field">
            <span>Count to</span>
            <NumInput value={p.countTo} onChange={(e) => onChange({ countTo: parseFloat(e.target.value) || 0 })} />
          </label>
          <label className="field">
            <span>Over (s)</span>
            <NumInput
              min={0.1}
              step={0.1}
              value={p.countDuration ?? 1.5}
              onChange={(e) => onChange({ countDuration: Math.max(0.1, parseFloat(e.target.value) || 0.1) })}
            />
          </label>
        </div>
      ) : (
        <label className="field">
          <span>Typewriter speed (letters/sec, 0 = off)</span>
          <NumInput
            min={0}
            value={p.revealSpeed ?? 0}
            onChange={(e) => {
              const v = Math.max(0, parseFloat(e.target.value) || 0);
              onChange({ revealSpeed: v > 0 ? v : undefined });
            }}
          />
        </label>
      )}
    </>
  );
}

function ShapeFields({ props: p, onChange }: { props: ShapeLayerProps; onChange: (p: Partial<ShapeLayerProps>) => void }) {
  return (
    <>
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <NumInput value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <NumInput value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Color</span>
          <input type="color" value={p.color} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        {"radius" in p && (
          <label className="field">
            <span>Radius</span>
            <NumInput value={p.radius ?? 0} onChange={(e) => onChange({ radius: parseFloat(e.target.value) || 0 })} />
          </label>
        )}
      </div>
    </>
  );
}

const SIZE_PRESETS: { label: string; width: number; height: number }[] = [
  { label: "16:9 أفقي — 1280×720", width: 1280, height: 720 },
  { label: "9:16 عمودي (ريلز/تيك توك) — 720×1280", width: 720, height: 1280 },
  { label: "1:1 مربع — 1080×1080", width: 1080, height: 1080 },
  { label: "4:5 بوست — 1080×1350", width: 1080, height: 1350 },
  { label: "16:9 Full HD — 1920×1080", width: 1920, height: 1080 },
];

function CompositionSettings() {
  const comp = useEditorStore((s) => s.project.composition);
  const updateComposition = useEditorStore((s) => s.updateComposition);
  const presetValue = SIZE_PRESETS.findIndex((p) => p.width === comp.width && p.height === comp.height);
  return (
    <div className="properties-panel">
      <div className="properties-section">
        <h4>Project</h4>
        <label className="field">
          <span>Length (seconds)</span>
          <NumInput
            min={0.5}
            step={0.5}
            value={Number(comp.duration.toFixed(2))}
            onChange={(e) => updateComposition({ duration: Math.max(0.5, parseFloat(e.target.value) || 0.5) })}
          />
        </label>
        <label className="field">
          <span>Frame size</span>
          <select
            value={presetValue}
            onChange={(e) => {
              const preset = SIZE_PRESETS[parseInt(e.target.value, 10)];
              if (preset) updateComposition({ width: preset.width, height: preset.height });
            }}
          >
            {presetValue === -1 && (
              <option value={-1}>
                Custom — {comp.width}×{comp.height}
              </option>
            )}
            {SIZE_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Background</span>
          <input type="color" value={comp.backgroundColor} onChange={(e) => updateComposition({ backgroundColor: e.target.value })} />
        </label>
        <p className="hint">
          Importing a video sets the length to the clip automatically, and a new project takes the clip's shape (e.g.
          vertical for phone videos). Changing the frame size doesn't move existing layers.
        </p>
      </div>
      <div className="properties-section">
        <h4>Shortcuts</h4>
        <p className="hint shortcuts">
          Click a layer on the preview to select it, drag to move it.
          <br />
          Space — play / pause · Delete — remove layer
          <br />
          Ctrl+D — duplicate · Arrows — nudge (Shift = 10px)
          <br />
          Ctrl+Z / Ctrl+Shift+Z — undo / redo · Esc — deselect
        </p>
      </div>
    </div>
  );
}

/** Reads a media file's duration (and video dimensions) — null if the browser can't decode it. */
function probeMedia(file: File, kind: "video" | "audio"): Promise<{ duration: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind);
    el.preload = "metadata";
    const done = (result: { duration: number; width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement;
      done({ duration: Number.isFinite(el.duration) ? el.duration : 0, width: v.videoWidth || 0, height: v.videoHeight || 0 });
    };
    el.onerror = () => done(null);
    el.src = url;
  });
}

function VideoFields({
  props: p,
  onChange,
  onFitDuration,
  onAttach,
}: {
  props: VideoLayerProps;
  onChange: (p: Partial<VideoLayerProps>) => void;
  onFitDuration: (naturalDuration: number, trimIn: number) => void;
  onAttach: (media: AttachedVideo) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const handleFile = async (file: File) => {
    setStatus("Loading…");
    const meta = await probeMedia(file, "video");
    if (!meta) {
      setStatus("This browser can't play this video file. Try an mp4 (H.264) or webm.");
      return;
    }
    const { src, persisted } = await storeMediaFile(file);
    onAttach({
      src,
      fileName: file.name,
      naturalDuration: meta.duration,
      videoWidth: meta.width,
      videoHeight: meta.height,
    });
    setStatus(persisted ? null : "Couldn't save the file for later — it'll need re-attaching after a reload.");
  };
  return (
    <>
      <label className="field">
        <span>Video file (mp4, webm…)</span>
        <input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>
      {status && <p className="hint error">{status}</p>}
      {!status && p.src.startsWith("blob:") && (
        <p className="hint error">This file was imported before files were saved with the project — if it shows black, pick it again.</p>
      )}
      {p.src && (
        <p className="hint">
          {p.fileName || "video"} · source length {p.naturalDuration.toFixed(2)}s
          <br />
          <button type="button" className="link-btn" onClick={() => onFitDuration(p.naturalDuration, p.trimIn)}>
            fit layer duration to clip
          </button>
        </p>
      )}
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <NumInput value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <NumInput value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
      <label className="field">
        <span>Trim in (s into source clip)</span>
        <NumInput
          step={0.1}
          min={0}
          max={p.naturalDuration || undefined}
          value={p.trimIn}
          onChange={(e) => onChange({ trimIn: parseFloat(e.target.value) || 0 })}
        />
      </label>
      <label className="field field-checkbox">
        <input type="checkbox" checked={p.muted} onChange={(e) => onChange({ muted: e.target.checked })} />
        <span>Mute audio</span>
      </label>
      <p className="hint">
        The file is kept in this browser, so it survives reloads. Saved project .json files don't include it — on another device, pick it again.
      </p>
    </>
  );
}

function PolygonFields({ props: p, onChange }: { props: PolygonLayerProps; onChange: (p: Partial<PolygonLayerProps>) => void }) {
  return (
    <>
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <NumInput value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <NumInput value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Color</span>
          <input type="color" value={p.color} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        <label className="field">
          <span>Sides</span>
          <NumInput
            min={3}
            max={12}
            value={p.sides}
            onChange={(e) => onChange({ sides: Math.max(3, Math.min(12, parseInt(e.target.value) || 3)) })}
          />
        </label>
      </div>
    </>
  );
}

function StarFields({ props: p, onChange }: { props: StarLayerProps; onChange: (p: Partial<StarLayerProps>) => void }) {
  return (
    <>
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <NumInput value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <NumInput value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Color</span>
          <input type="color" value={p.color} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        <label className="field">
          <span>Points</span>
          <NumInput
            min={3}
            max={12}
            value={p.points}
            onChange={(e) => onChange({ points: Math.max(3, Math.min(12, parseInt(e.target.value) || 3)) })}
          />
        </label>
      </div>
      <label className="field">
        <span>Inner radius %</span>
        <NumInput
          min={5}
          max={95}
          value={Math.round(p.innerRatio * 100)}
          onChange={(e) => onChange({ innerRatio: Math.max(0.05, Math.min(0.95, (parseFloat(e.target.value) || 50) / 100)) })}
        />
      </label>
    </>
  );
}

function AudioFields({
  props: p,
  onChange,
  onFitDuration,
  onAttach,
}: {
  props: AudioLayerProps;
  onChange: (p: Partial<AudioLayerProps>) => void;
  onFitDuration: (naturalDuration: number, trimIn: number) => void;
  onAttach: (media: AttachedAudio) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const handleFile = async (file: File) => {
    setStatus("Loading…");
    const meta = await probeMedia(file, "audio");
    if (!meta) {
      setStatus("This browser can't play this audio file. Try mp3, wav or m4a.");
      return;
    }
    const { src, persisted } = await storeMediaFile(file);
    onAttach({ src, fileName: file.name, naturalDuration: meta.duration });
    setStatus(persisted ? null : "Couldn't save the file for later — it'll need re-attaching after a reload.");
  };
  return (
    <>
      <label className="field">
        <span>Audio file (mp3, wav…)</span>
        <input type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>
      {status && <p className="hint error">{status}</p>}
      {!status && p.src.startsWith("blob:") && (
        <p className="hint error">This file was imported before files were saved with the project — if it shows black, pick it again.</p>
      )}
      {p.src && (
        <p className="hint">
          {p.fileName || "audio"} · source length {p.naturalDuration.toFixed(2)}s
          <br />
          <button type="button" className="link-btn" onClick={() => onFitDuration(p.naturalDuration, p.trimIn)}>
            fit layer duration to clip
          </button>
        </p>
      )}
      <label className="field">
        <span>Trim in (s into source clip)</span>
        <NumInput
          step={0.1}
          min={0}
          max={p.naturalDuration || undefined}
          value={p.trimIn}
          onChange={(e) => onChange({ trimIn: parseFloat(e.target.value) || 0 })}
        />
      </label>
      <label className="field field-checkbox">
        <input type="checkbox" checked={p.muted} onChange={(e) => onChange({ muted: e.target.checked })} />
        <span>Mute</span>
      </label>
      <p className="hint">
        The file is kept in this browser, so it survives reloads. Saved project .json files don't include it — on another device, pick it again.
      </p>
    </>
  );
}

function progressLabel(p: TranscribeProgress): string {
  if (p.phase === "loading-model") {
    return p.progress != null ? `Loading speech model ${Math.round(p.progress * 100)}%…` : "Loading speech model…";
  }
  if (p.phase === "decoding-audio") return "Reading audio…";
  return "Transcribing…";
}

function CaptionFields({
  layerId,
  props: p,
  onChange,
}: {
  layerId: string;
  props: CaptionLayerProps;
  onChange: (p: Partial<CaptionLayerProps>) => void;
}) {
  const layers = useEditorStore((s) => s.project.composition.layers);
  const updateLayerTiming = useEditorStore((s) => s.updateLayerTiming);

  const sourceCandidates = layers.filter(
    (l): l is Layer & { props: VideoLayerProps | AudioLayerProps } =>
      (l.type === "video" || l.type === "audio") && isSpeechSource((l.props as VideoLayerProps | AudioLayerProps).src)
  );

  const [sourceId, setSourceId] = useState<string>(sourceCandidates[0]?.id ?? "");
  const [modelSize, setModelSize] = useState<ModelSize>("base");
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTranscribe = async () => {
    const sourceLayer = sourceCandidates.find((l) => l.id === sourceId);
    if (!sourceLayer) return;
    setError(null);
    setProgress({ phase: "loading-model" });
    try {
      const sourceProps = sourceLayer.props as VideoLayerProps | AudioLayerProps;
      const { transcribeMediaSource } = await import("../engine/transcribe");
      const words = await transcribeMediaSource(sourceProps.src, { modelSize, onProgress: setProgress });
      if (words.length === 0) {
        setError("No speech was detected in this clip.");
        return;
      }
      // Captions + timing land as one undo step.
      const store = useEditorStore.getState();
      store.beginGesture();
      onChange({
        words: words.map((w) => ({ id: makeId("word"), text: w.text, start: w.start, end: w.end, emphasis: false })),
        sourceTrimIn: sourceProps.trimIn,
        sourceLayerName: sourceLayer.name,
      });
      updateLayerTiming(layerId, sourceLayer.startTime, sourceLayer.endTime);
      store.endGesture();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  };

  const updateWord = (idx: number, patch: Partial<CaptionWord>) =>
    onChange({ words: p.words.map((w, i) => (i === idx ? { ...w, ...patch } : w)) });
  const removeWord = (idx: number) => onChange({ words: p.words.filter((_, i) => i !== idx) });

  return (
    <>
      {sourceCandidates.length === 0 ? (
        <p className="hint">
          Add a video or audio layer with a file first, then come back here to generate captions from it.
        </p>
      ) : (
        <>
          <label className="field">
            <span>Generate from</span>
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {sourceCandidates.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Model (bigger = slower, more accurate)</span>
            <select value={modelSize} onChange={(e) => setModelSize(e.target.value as ModelSize)}>
              <option value="tiny">Tiny (fast)</option>
              <option value="base">Base (recommended)</option>
              <option value="small">Small (best accuracy)</option>
            </select>
          </label>
          <button type="button" onClick={handleTranscribe} disabled={!!progress}>
            {progress ? progressLabel(progress) : "🎙 Transcribe"}
          </button>
          {error && <p className="hint error">{error}</p>}
          <p className="hint">
            Transcription runs fully in your browser — nothing is uploaded. The speech model downloads once (tens of
            MBs) and is cached afterwards. Iraqi dialect is supported but not perfect; correct words below as needed.
          </p>
        </>
      )}

      {p.words.length > 0 && (
        <>
          <label className="field">
            <span>Style</span>
            <select
              value={p.style}
              onChange={(e) => onChange({ style: e.target.value as CaptionLayerProps["style"] })}
            >
              <option value="bigWord">Big word (one at a time)</option>
              <option value="karaokeLine">Karaoke line (highlight as spoken)</option>
              <option value="pillWord">Pill / glass badge</option>
              <option value="emphasisOnly">Line + emphasis only</option>
              <option value="buildUp">Build-up (words accumulate as spoken)</option>
            </select>
          </label>
          <FontSelect value={p.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} />
          <div className="field-row">
            <label className="field">
              <span>Size</span>
              <NumInput
                value={p.fontSize}
                onChange={(e) => onChange({ fontSize: parseFloat(e.target.value) || 1 })}
              />
            </label>
            <label className="field">
              <span>Color</span>
              <input type="color" value={p.color} onChange={(e) => onChange({ color: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Emphasis color (starred words)</span>
            <input
              type="color"
              value={p.emphasisColor}
              onChange={(e) => onChange({ emphasisColor: e.target.value })}
            />
          </label>

          <p className="hint">
            {p.words.length} words · from {p.sourceLayerName || "—"}. Star a word to emphasize it (color +
            highlight) — the equivalent of wrapping it in [brackets].
          </p>
          <div className="caption-word-list">
            {p.words.map((w, i) => (
              <div key={w.id} className="caption-word-row">
                <button
                  type="button"
                  className={`star-toggle ${w.emphasis ? "active" : ""}`}
                  title="Mark important"
                  onClick={() => updateWord(i, { emphasis: !w.emphasis })}
                >
                  ★
                </button>
                <input
                  className="caption-word-input"
                  dir="rtl"
                  value={w.text}
                  onChange={(e) => updateWord(i, { text: e.target.value })}
                />
                <span className="caption-word-time">{w.start.toFixed(1)}s</span>
                <button type="button" className="link-btn danger" onClick={() => removeWord(i)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function GlassFields({ props: p, onChange }: { props: GlassLayerProps; onChange: (p: Partial<GlassLayerProps>) => void }) {
  return (
    <>
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <NumInput value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <NumInput value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Corner radius</span>
          <NumInput value={p.radius} onChange={(e) => onChange({ radius: parseFloat(e.target.value) || 0 })} />
        </label>
        <label className="field">
          <span>Blur</span>
          <NumInput value={p.blur} onChange={(e) => onChange({ blur: parseFloat(e.target.value) || 0 })} />
        </label>
      </div>
      <p className="hint">Blurs whatever is already drawn behind it (video, shapes…) — a real frosted-glass look.</p>
      <p className="hint">Rotation isn't supported on glass panels (position, scale and opacity still work).</p>
    </>
  );
}

function OverlayFields({ props: p, onChange }: { props: OverlayLayerProps; onChange: (p: Partial<OverlayLayerProps>) => void }) {
  return (
    <>
      <label className="field">
        <span>Effect</span>
        <select value={p.effect} onChange={(e) => onChange({ effect: e.target.value as OverlayLayerProps["effect"] })}>
          <option value="grain">Film grain</option>
          <option value="vhs">VHS</option>
          <option value="vignette">Vignette</option>
          <option value="scanlines">Scanlines</option>
        </select>
      </label>
      <label className="field">
        <span>Intensity</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={p.intensity}
          onChange={(e) => onChange({ intensity: parseFloat(e.target.value) })}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <NumInput value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <NumInput value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
      <p className="hint">Full-bleed texture drawn over whatever's behind it — usually left at the frame's full size.</p>
    </>
  );
}

function useResolvedMediaUrl(src: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (src) resolveMediaUrl(src).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [src]);
  return url;
}

function ImageFields({ props: p, onChange }: { props: ImageLayerProps; onChange: (p: Partial<ImageLayerProps>) => void }) {
  const previewUrl = useResolvedMediaUrl(p.src);
  const handleFile = async (file: File) => {
    const dims = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
    if (!dims) {
      alert("This image format can't be opened. Try PNG, JPG or WebP.");
      return;
    }
    // Stored in IndexedDB rather than inlined as a data URL, which used to overflow the autosave.
    const { src } = await storeMediaFile(file);
    onChange({ src, width: dims.width, height: dims.height });
  };
  return (
    <>
      <label className="field">
        <span>Image file</span>
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>
      {previewUrl && <img src={previewUrl} alt="" className="image-preview" />}
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <NumInput value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <NumInput value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
    </>
  );
}
