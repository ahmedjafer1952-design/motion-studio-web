import { useEffect, useRef, useState, useSyncExternalStore, type InputHTMLAttributes } from "react";
import { addFontFiles, customFontValue, listCustomFonts, subscribeCustomFonts } from "../engine/customFonts";
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
  ChartLayerProps,
  CutoutLayerProps,
  ArrowLayerProps,
  VideoBackground,
  PolygonLayerProps,
  Point,
  ShapeLayerProps,
  StarLayerProps,
  TextLayerProps,
  VideoLayerProps,
} from "../types";
import { probeMedia } from "../engine/importMedia";
import { useEditorStore, type AttachedAudio, type AttachedVideo } from "../state/store";
import { isSpeechSource, resolveMediaUrl, storeMediaFile } from "../engine/mediaStore";
import { FONT_CHOICES } from "../engine/fonts";
import { evaluateTransform } from "../engine/evaluate";
import { PROPERTY_COLORS } from "./Timeline/constants";
import type { ModelSize, TranscribeProgress } from "../engine/transcribe";
import { MOTION_PRESETS } from "../engine/presets";
import { makeId } from "../utils/id";

const EASINGS: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut", "spring", "backOut"];

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
  const addPersonCutout = useEditorStore((s) => s.addPersonCutout);
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
        {layer.type === "arrow" && (
          <ArrowFields props={layer.props as ArrowLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
        )}
        {layer.type === "cutout" && (
          <CutoutFields props={layer.props as CutoutLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
        )}
        {layer.type === "chart" && (
          <ChartFields props={layer.props as ChartLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
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
            onAddCutout={() => addPersonCutout(layer.id)}
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

const UPLOAD_FONT = "__upload_font__";

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const custom = useSyncExternalStore(subscribeCustomFonts, listCustomFonts);
  const customFamilies = [...new Set(custom.map((f) => f.family))];
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const known = FONT_CHOICES.some((f) => f.value === value) || customFamilies.some((f) => customFontValue(f) === value);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setStatus("جاري تحميل الخط…");
    const { families, failed } = await addFontFiles(files);
    setStatus(failed.length ? `ما انقرأ: ${failed.join("، ")}` : null);
    if (families[0]) onChange(customFontValue(families[0]));
  };

  return (
    <label className="field">
      <span>Font</span>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === UPLOAD_FONT) fileRef.current?.click();
          else onChange(e.target.value);
        }}
      >
        {!known && <option value={value}>{value}</option>}
        {customFamilies.length > 0 && (
          <optgroup label="خطوطك">
            {customFamilies.map((family) => (
              <option key={family} value={customFontValue(family)} style={{ fontFamily: customFontValue(family) }}>
                {family}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="الخطوط المدمجة">
          {FONT_CHOICES.map((f) => (
            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
              {f.label}
            </option>
          ))}
        </optgroup>
        <option value={UPLOAD_FONT}>＋ رفع خط من جهازك (otf / ttf / woff)…</option>
      </select>
      <input
        ref={fileRef}
        type="file"
        accept=".otf,.ttf,.woff,.woff2"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          handleFiles(files);
        }}
      />
      {status && <span className="hint">{status}</span>}
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
      {!isCounter && (
        <>
          <div className="field-row">
            <label className="field">
              <span>Word-by-word (sec between words, 0 = off)</span>
              <NumInput
                min={0}
                step={0.02}
                value={p.wordStagger ?? 0}
                onChange={(e) => {
                  const v = Math.max(0, parseFloat(e.target.value) || 0);
                  onChange({ wordStagger: v > 0 ? v : undefined });
                }}
              />
            </label>
            <label className="field">
              <span>Letter stretch in (sec, 0 = off)</span>
              <NumInput
                min={0}
                step={0.1}
                value={p.stretchIn ?? 0}
                onChange={(e) => {
                  const v = Math.max(0, parseFloat(e.target.value) || 0);
                  onChange({ stretchIn: v > 0 ? v : undefined });
                }}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field field-checkbox">
              <input type="checkbox" checked={!!p.glow} onChange={(e) => onChange({ glow: e.target.checked ? p.color : undefined })} />
              <span>Neon glow</span>
            </label>
            {p.glow && <input type="color" value={p.glow.startsWith("#") ? p.glow : "#5ab8ff"} onChange={(e) => onChange({ glow: e.target.value })} />}
            <label className="field field-checkbox">
              <input type="checkbox" checked={!!p.outline} onChange={(e) => onChange({ outline: e.target.checked || undefined })} />
              <span>Outline only</span>
            </label>
          </div>
          <label className="field">
            <span>Label box behind text</span>
            <select value={p.box ? (p.box === "glass" ? "glass" : "color") : ""} onChange={(e) => onChange({ box: e.target.value === "glass" ? "glass" : e.target.value === "color" ? "#6d28d9" : undefined })}>
              <option value="">None</option>
              <option value="color">Solid color box</option>
              <option value="glass">Frosted glass pill</option>
            </select>
          </label>
          {p.box && p.box !== "glass" && <input type="color" value={p.box} onChange={(e) => onChange({ box: e.target.value })} />}
          <div className="field-row">
            <label className="field field-checkbox">
              <input type="checkbox" checked={!!p.highlightBar} onChange={(e) => onChange({ highlightBar: e.target.checked ? "#ffd166" : undefined })} />
              <span>Highlight bar behind</span>
            </label>
            {p.highlightBar && <input type="color" value={p.highlightBar} onChange={(e) => onChange({ highlightBar: e.target.value })} />}
          </div>
        </>
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
        <label className="field">
          <span>Soft glow (blur px)</span>
          <NumInput min={0} value={p.softness ?? 0} onChange={(e) => onChange({ softness: Math.max(0, parseFloat(e.target.value) || 0) || undefined })} />
        </label>
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

function VideoFields({
  props: p,
  onChange,
  onFitDuration,
  onAttach,
  onAddCutout,
}: {
  props: VideoLayerProps;
  onChange: (p: Partial<VideoLayerProps>) => void;
  onFitDuration: (naturalDuration: number, trimIn: number) => void;
  onAttach: (media: AttachedVideo) => void;
  onAddCutout: () => void;
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
      {p.src && <BackgroundPicker value={p.background} onChange={(background) => onChange({ background })} />}
      {p.src && (
        <div className="properties-subsection">
          <button type="button" className="primary" onClick={onAddCutout} title="يفصل الشخص عن الخلفية — أي كتابة تحت طبقة الشخص تطلع وراه">
            👤 كتابة ورا الشخص (فصل الشخص)
          </button>
          <label className="field">
            <span>Background look (pair with the person cutout)</span>
            <select value={p.look ?? ""} onChange={(e) => onChange({ look: (e.target.value || undefined) as VideoLayerProps["look"] })}>
              <option value="">Natural</option>
              <option value="grayscale">Black &amp; white</option>
              <option value="dim">Darkened</option>
              <option value="blur">Blurred</option>
            </select>
          </label>
        </div>
      )}
      <label className="field">
        <span>Fade bottom edge (0–1, for split-screen B-roll)</span>
        <NumInput min={0} max={1} step={0.05} value={p.fadeBottom ?? 0} onChange={(e) => onChange({ fadeBottom: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)) || undefined })} />
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
              <option value="phraseStack">Phrase stack (pro talking-head)</option>
              <option value="glassPill">Glass pill (phrase in frosted glass)</option>
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

function ArrowFields({ props: p, onChange }: { props: ArrowLayerProps; onChange: (p: Partial<ArrowLayerProps>) => void }) {
  return (
    <>
      <div className="field-row">
        <label className="field">
          <span>Length</span>
          <NumInput min={20} value={p.width} onChange={(e) => onChange({ width: Math.max(20, parseFloat(e.target.value) || 20) })} />
        </label>
        <label className="field">
          <span>Bow (-1 to 1)</span>
          <NumInput min={-1} max={1} step={0.1} value={p.curve} onChange={(e) => onChange({ curve: Math.max(-1, Math.min(1, parseFloat(e.target.value) || 0)) })} />
        </label>
        <label className="field">
          <span>Thickness</span>
          <NumInput min={1} value={p.thickness} onChange={(e) => onChange({ thickness: Math.max(1, parseFloat(e.target.value) || 1) })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Color</span>
          <input type="color" value={p.color} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        <label className="field field-checkbox">
          <input type="checkbox" checked={p.dashed} onChange={(e) => onChange({ dashed: e.target.checked })} />
          <span>Dashed</span>
        </label>
        <label className="field">
          <span>Draw time (s)</span>
          <NumInput min={0.05} step={0.1} value={p.drawDuration} onChange={(e) => onChange({ drawDuration: Math.max(0.05, parseFloat(e.target.value) || 0.6) })} />
        </label>
      </div>
    </>
  );
}

const BG_PRESETS: { id: string; label: string; bg: VideoBackground | undefined; swatch: string }[] = [
  { id: "none", label: "الأصلية", bg: undefined, swatch: "linear-gradient(135deg,#555,#222)" },
  { id: "blur", label: "ضبابية", bg: { kind: "blur", amount: 18 }, swatch: "radial-gradient(circle,#9aa,#455)" },
  { id: "studio", label: "ستوديو", bg: { kind: "studio", color: "#3a3f4b", color2: "#07080b" }, swatch: "radial-gradient(circle,#3a3f4b,#07080b)" },
  { id: "warm", label: "دافئ", bg: { kind: "studio", color: "#6b4a2e", color2: "#120a05" }, swatch: "radial-gradient(circle,#6b4a2e,#120a05)" },
  { id: "blue", label: "تقني أزرق", bg: { kind: "studio", color: "#1e4f8f", color2: "#050b18" }, swatch: "radial-gradient(circle,#1e4f8f,#050b18)" },
  { id: "purple", label: "بنفسجي", bg: { kind: "studio", color: "#5b2a86", color2: "#0c0614" }, swatch: "radial-gradient(circle,#5b2a86,#0c0614)" },
  { id: "teal", label: "فيروزي", bg: { kind: "studio", color: "#0f766e", color2: "#021412" }, swatch: "radial-gradient(circle,#0f766e,#021412)" },
  { id: "white", label: "أبيض", bg: { kind: "studio", color: "#ffffff", color2: "#b9bcc4" }, swatch: "radial-gradient(circle,#fff,#b9bcc4)" },
];

/** Replace what's behind the speaker: blur, studio light, a color or an image (on-device segmentation). */
function BackgroundPicker({ value, onChange }: { value?: VideoBackground; onChange: (bg: VideoBackground | undefined) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const activeId = !value
    ? "none"
    : value.kind === "image"
      ? "image"
      : value.kind === "color"
        ? "color"
        : BG_PRESETS.find((b) => b.bg && b.bg.kind === value.kind && b.bg.color === value.color)?.id ?? "";
  return (
    <div className="properties-subsection">
      <span className="field-label">🎨 تغيير الخلفية (الشخص ينفصل تلقائيًا)</span>
      <div className="bg-swatches">
        {BG_PRESETS.map((b) => (
          <button key={b.id} type="button" className={`bg-swatch ${activeId === b.id ? "active" : ""}`} onClick={() => onChange(b.bg)} title={b.label}>
            <span className="bg-swatch-color" style={{ background: b.swatch }} />
            <span>{b.label}</span>
          </button>
        ))}
        <button type="button" className={`bg-swatch ${activeId === "color" ? "active" : ""}`} onClick={() => onChange({ kind: "color", color: value?.kind === "color" ? value.color : "#0b5" })}>
          <span className="bg-swatch-color" style={{ background: value?.kind === "color" ? value.color : "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" }} />
          <span>لون</span>
        </button>
        <button type="button" className={`bg-swatch ${activeId === "image" ? "active" : ""}`} onClick={() => fileRef.current?.click()}>
          <span className="bg-swatch-color bg-swatch-icon">🖼</span>
          <span>صورة</span>
        </button>
      </div>
      {value?.kind === "color" && <input type="color" value={value.color ?? "#000000"} onChange={(e) => onChange({ kind: "color", color: e.target.value })} />}
      {value?.kind === "blur" && (
        <label className="field">
          <span>قوة الضبابية</span>
          <input type="range" min={4} max={40} value={value.amount ?? 18} onChange={(e) => onChange({ kind: "blur", amount: Number(e.target.value) })} />
        </label>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const { src } = await storeMediaFile(file);
          onChange({ kind: "image", src });
        }}
      />
      {value && <p className="hint">أول مرة ياخذ ثواني حتى يحمّل موديل فصل الشخص. الأفضل خلفية التصوير تكون مرتبة والإضاءة على الشخص واضحة.</p>}
    </div>
  );
}

function CutoutFields({ props: p, onChange }: { props: CutoutLayerProps; onChange: (p: Partial<CutoutLayerProps>) => void }) {
  const layers = useEditorStore((s) => s.project.composition.layers);
  const videos = layers.filter((l) => l.type === "video");
  return (
    <>
      <p className="hint">
        يرسم الشخص من الفيديو فوق الطبقات اللي تحته — أي كتابة أو شكل تحت هاي الطبقة يطلع ورا الشخص. الفصل يصير على جهازك بالذكاء الاصطناعي.
      </p>
      <label className="field">
        <span>Person from</span>
        <select value={p.sourceLayerId} onChange={(e) => onChange({ sourceLayerId: e.target.value })}>
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label className="field">
          <span>Edge softness (px)</span>
          <NumInput min={0} max={20} value={p.feather} onChange={(e) => onChange({ feather: Math.max(0, parseFloat(e.target.value) || 0) })} />
        </label>
        <label className="field field-checkbox">
          <input type="checkbox" checked={!!p.outline} onChange={(e) => onChange({ outline: e.target.checked ? "#ffffff" : undefined })} />
          <span>Glow rim</span>
        </label>
        {p.outline && <input type="color" value={p.outline} onChange={(e) => onChange({ outline: e.target.value })} />}
      </div>
    </>
  );
}

function ChartFields({ props: p, onChange }: { props: ChartLayerProps; onChange: (p: Partial<ChartLayerProps>) => void }) {
  const single = p.kind === "donut" || p.kind === "progress";
  return (
    <>
      <label className="field">
        <span>Chart type</span>
        <select value={p.kind} onChange={(e) => onChange({ kind: e.target.value as ChartLayerProps["kind"] })}>
          <option value="bar">Bars</option>
          <option value="line">Line</option>
          <option value="donut">Donut (percentage)</option>
          <option value="progress">Progress bar (percentage)</option>
        </select>
      </label>
      <label className="field">
        <span>{single ? "Percentage (0–100)" : "Values, comma separated"}</span>
        <input
          defaultValue={single ? String(p.values[0] ?? 0) : p.values.join(", ")}
          key={p.kind}
          onBlur={(e) => {
            const values = e.target.value.split(/[,،]/).map((v) => parseFloat(v)).filter((v) => Number.isFinite(v));
            if (values.length) onChange({ values });
          }}
        />
      </label>
      <label className="field">
        <span>{single ? "Label" : "Labels, comma separated"}</span>
        <input
          dir="auto"
          defaultValue={p.labels.join("، ")}
          onBlur={(e) => onChange({ labels: e.target.value.split(/[,،]/).map((v) => v.trim()) })}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Color</span>
          <input type="color" value={p.color} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        <label className="field">
          <span>Suffix</span>
          <input value={p.suffix ?? ""} onChange={(e) => onChange({ suffix: e.target.value })} />
        </label>
        <label className="field">
          <span>Reveal (sec)</span>
          <NumInput min={0.1} step={0.1} value={p.revealDuration ?? 1.2} onChange={(e) => onChange({ revealDuration: Math.max(0.1, parseFloat(e.target.value) || 1.2) })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <NumInput min={50} value={p.width} onChange={(e) => onChange({ width: Math.max(50, parseFloat(e.target.value) || 50) })} />
        </label>
        <label className="field">
          <span>Height</span>
          <NumInput min={50} value={p.height} onChange={(e) => onChange({ height: Math.max(50, parseFloat(e.target.value) || 50) })} />
        </label>
      </div>
      <FontSelect value={p.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} />
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
    // Slots (cover-fit) keep their box; a plain image takes its natural size.
    onChange(p.fit === "cover" ? { src } : { src, width: dims.width, height: dims.height });
  };
  return (
    <>
      <label className="field">
        <span>{p.src ? "Image file" : "📷 اختار صورة لهذا المكان"}</span>
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
      <label className="field">
        <span>Fade bottom edge (0–1, for split-screen B-roll)</span>
        <NumInput min={0} max={1} step={0.05} value={p.fadeBottom ?? 0} onChange={(e) => onChange({ fadeBottom: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)) || undefined })} />
      </label>
    </>
  );
}
