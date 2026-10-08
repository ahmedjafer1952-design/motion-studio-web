import { useState } from "react";
import { useEditorStore } from "../state/store";
import type { AudioLayerProps, Layer, VideoLayerProps } from "../types";
import type { ModelSize, TranscribeProgress } from "../engine/transcribe";
import type { Pace } from "../engine/autoEdit";

function progressLabel(p: TranscribeProgress): string {
  if (p.phase === "loading-model") {
    return p.progress != null ? `Loading speech model ${Math.round(p.progress * 100)}%…` : "Loading speech model…";
  }
  if (p.phase === "decoding-audio") return "Reading audio…";
  return "Transcribing…";
}

export function AutoEditDialog({ onClose }: { onClose: () => void }) {
  const layers = useEditorStore((s) => s.project.composition.layers);
  const applyAutoEdit = useEditorStore((s) => s.applyAutoEdit);

  const sourceCandidates = layers.filter(
    (l): l is Layer & { props: VideoLayerProps | AudioLayerProps } =>
      (l.type === "video" || l.type === "audio") && !!(l.props as VideoLayerProps | AudioLayerProps).src
  );

  const [sourceId, setSourceId] = useState(sourceCandidates[0]?.id ?? "");
  const [pace, setPace] = useState<Pace>("medium");
  const [modelSize, setModelSize] = useState<ModelSize>("base");
  const [includeTitle, setIncludeTitle] = useState(true);
  const [titleText, setTitleText] = useState("اسم القناة");
  const [includeCta, setIncludeCta] = useState(true);
  const [ctaText, setCtaText] = useState("تابعنا");
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    const source = sourceCandidates.find((l) => l.id === sourceId);
    if (!source) return;
    setError(null);
    setProgress({ phase: "loading-model" });
    try {
      const { transcribeMediaSource } = await import("../engine/transcribe");
      const srcProps = source.props as VideoLayerProps | AudioLayerProps;
      const words = await transcribeMediaSource(srcProps.src, { modelSize, onProgress: setProgress });
      applyAutoEdit(source.id, words, {
        pace,
        title: includeTitle ? titleText.trim() || undefined : undefined,
        cta: includeCta ? ctaText.trim() || undefined : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>✨ Auto Edit</h3>
        <p className="hint">
          Transcribes a video/audio layer's speech and automatically assembles captions, number callouts, an
          animated list for anything enumerated, zoom punches on pauses, a title, and a CTA — all as one undoable
          step (Ctrl+Z reverts everything).
        </p>

        {sourceCandidates.length === 0 ? (
          <p className="hint">Add a video or audio layer with a file first, then come back here.</p>
        ) : (
          <>
            <label className="field">
              <span>Source</span>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                {sourceCandidates.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Pace</span>
              <select value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
                <option value="calm">Calm — fewer, gentler zooms</option>
                <option value="medium">Medium</option>
                <option value="strong">Strong — more frequent zoom punches</option>
              </select>
            </label>

            <label className="field">
              <span>Speech model</span>
              <select value={modelSize} onChange={(e) => setModelSize(e.target.value as ModelSize)}>
                <option value="tiny">Tiny (fast)</option>
                <option value="base">Base (recommended)</option>
                <option value="small">Small (best accuracy)</option>
              </select>
            </label>

            <div className="field-row">
              <label className="field field-checkbox">
                <input type="checkbox" checked={includeTitle} onChange={(e) => setIncludeTitle(e.target.checked)} />
                <span>Title at start</span>
              </label>
              <label className="field field-checkbox">
                <input type="checkbox" checked={includeCta} onChange={(e) => setIncludeCta(e.target.checked)} />
                <span>CTA at end</span>
              </label>
            </div>
            {includeTitle && (
              <label className="field">
                <span>Title text</span>
                <input value={titleText} onChange={(e) => setTitleText(e.target.value)} dir="rtl" />
              </label>
            )}
            {includeCta && (
              <label className="field">
                <span>CTA text</span>
                <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} dir="rtl" />
              </label>
            )}

            <p className="hint">
              Runs fully in your browser — nothing is uploaded. List/number detection and emphasis are rule-based
              heuristics (ordinal markers like أولاً/ثانياً, digits, pause gaps), not full language understanding —
              review the result afterwards and tweak anything freely.
            </p>
            {error && <p className="hint error">{error}</p>}
          </>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleRun} disabled={!sourceId || !!progress}>
            {progress ? progressLabel(progress) : "✨ Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
