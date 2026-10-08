import { useState } from "react";
import type {
  AnimatablePropKey,
  AudioLayerProps,
  CaptionLayerProps,
  CaptionWord,
  Easing,
  GlassLayerProps,
  ImageLayerProps,
  Layer,
  PolygonLayerProps,
  Point,
  ShapeLayerProps,
  StarLayerProps,
  TextLayerProps,
  VideoLayerProps,
} from "../types";
import { useEditorStore } from "../state/store";
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
                anim.keyframes.forEach((k) => removeKeyframe(layerId, propKey, k.id));
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

function NumberField({ value, onChange, step = 1, suffix }: { value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="number-field">
      <input type="number" value={Number.isFinite(value) ? round(value) : 0} step={step} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
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
  const comp = useEditorStore((s) => s.project.composition);

  if (!layer) {
    return (
      <div className="properties-panel empty">
        <p>Select a layer to edit its properties.</p>
      </div>
    );
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
            <input
              type="number"
              step={0.1}
              value={layer.startTime}
              onChange={(e) => updateLayerTiming(layer.id, parseFloat(e.target.value) || 0, layer.endTime)}
            />
          </label>
          <label className="field">
            <span>End (s)</span>
            <input
              type="number"
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
        {layer.type === "image" && (
          <ImageFields props={layer.props as ImageLayerProps} onChange={(p) => updateLayerProps(layer.id, p)} />
        )}
        {layer.type === "video" && (
          <VideoFields
            props={layer.props as VideoLayerProps}
            onChange={(p) => updateLayerProps(layer.id, p)}
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

function TextFields({ props: p, onChange }: { props: TextLayerProps; onChange: (p: Partial<TextLayerProps>) => void }) {
  return (
    <>
      <label className="field">
        <span>Text</span>
        <textarea value={p.content} onChange={(e) => onChange({ content: e.target.value })} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Size</span>
          <input type="number" value={p.fontSize} onChange={(e) => onChange({ fontSize: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Color</span>
          <input type="color" value={p.color} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Align</span>
        <select value={p.align} onChange={(e) => onChange({ align: e.target.value as TextLayerProps["align"] })}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
    </>
  );
}

function ShapeFields({ props: p, onChange }: { props: ShapeLayerProps; onChange: (p: Partial<ShapeLayerProps>) => void }) {
  return (
    <>
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <input type="number" value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <input type="number" value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
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
            <input type="number" value={p.radius ?? 0} onChange={(e) => onChange({ radius: parseFloat(e.target.value) || 0 })} />
          </label>
        )}
      </div>
    </>
  );
}

function VideoFields({
  props: p,
  onChange,
  onFitDuration,
}: {
  props: VideoLayerProps;
  onChange: (p: Partial<VideoLayerProps>) => void;
  onFitDuration: (naturalDuration: number, trimIn: number) => void;
}) {
  const handleFile = (file: File) => {
    const src = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      onChange({
        src,
        fileName: file.name,
        width: probe.videoWidth || p.width,
        height: probe.videoHeight || p.height,
        trimIn: 0,
        naturalDuration: probe.duration || 0,
      });
    };
    probe.src = src;
  };
  return (
    <>
      <label className="field">
        <span>Video file (mp4, webm…)</span>
        <input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>
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
          <input type="number" value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <input type="number" value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
      <label className="field">
        <span>Trim in (s into source clip)</span>
        <input
          type="number"
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
        Video is session-only: it isn't saved inside the project JSON. Re-add the file after reloading the page.
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
          <input type="number" value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <input type="number" value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Color</span>
          <input type="color" value={p.color} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        <label className="field">
          <span>Sides</span>
          <input
            type="number"
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
          <input type="number" value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <input type="number" value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Color</span>
          <input type="color" value={p.color} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        <label className="field">
          <span>Points</span>
          <input
            type="number"
            min={3}
            max={12}
            value={p.points}
            onChange={(e) => onChange({ points: Math.max(3, Math.min(12, parseInt(e.target.value) || 3)) })}
          />
        </label>
      </div>
      <label className="field">
        <span>Inner radius %</span>
        <input
          type="number"
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
}: {
  props: AudioLayerProps;
  onChange: (p: Partial<AudioLayerProps>) => void;
  onFitDuration: (naturalDuration: number, trimIn: number) => void;
}) {
  const handleFile = (file: File) => {
    const src = URL.createObjectURL(file);
    const probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      onChange({ src, fileName: file.name, trimIn: 0, naturalDuration: probe.duration || 0 });
    };
    probe.src = src;
  };
  return (
    <>
      <label className="field">
        <span>Audio file (mp3, wav…)</span>
        <input type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>
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
        <input
          type="number"
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
        Audio is session-only: it isn't saved inside the project JSON. Re-add the file after reloading the page.
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
      (l.type === "video" || l.type === "audio") && !!(l.props as VideoLayerProps | AudioLayerProps).src
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
      onChange({
        words: words.map((w) => ({ id: makeId("word"), text: w.text, start: w.start, end: w.end, emphasis: false })),
        sourceTrimIn: sourceProps.trimIn,
        sourceLayerName: sourceLayer.name,
      });
      updateLayerTiming(layerId, sourceLayer.startTime, sourceLayer.endTime);
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
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Size</span>
              <input
                type="number"
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
          <input type="number" value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <input type="number" value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Corner radius</span>
          <input type="number" value={p.radius} onChange={(e) => onChange({ radius: parseFloat(e.target.value) || 0 })} />
        </label>
        <label className="field">
          <span>Blur</span>
          <input type="number" value={p.blur} onChange={(e) => onChange({ blur: parseFloat(e.target.value) || 0 })} />
        </label>
      </div>
      <p className="hint">Blurs whatever is already drawn behind it (video, shapes…) — a real frosted-glass look.</p>
      <p className="hint">Rotation isn't supported on glass panels (position, scale and opacity still work).</p>
    </>
  );
}

function ImageFields({ props: p, onChange }: { props: ImageLayerProps; onChange: (p: Partial<ImageLayerProps>) => void }) {
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => onChange({ src, width: img.width, height: img.height });
      img.src = src;
    };
    reader.readAsDataURL(file);
  };
  return (
    <>
      <label className="field">
        <span>Image file</span>
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>
      {p.src && <img src={p.src} alt="" className="image-preview" />}
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <input type="number" value={p.width} onChange={(e) => onChange({ width: parseFloat(e.target.value) || 1 })} />
        </label>
        <label className="field">
          <span>Height</span>
          <input type="number" value={p.height} onChange={(e) => onChange({ height: parseFloat(e.target.value) || 1 })} />
        </label>
      </div>
    </>
  );
}
