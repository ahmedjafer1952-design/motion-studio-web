import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../state/store";
import type { AudioLayerProps, Layer, VideoLayerProps } from "../types";
import type { ModelSize, TranscribeProgress } from "../engine/transcribe";
import { planFromRules, type Pace } from "../engine/autoEdit";
import { aiSettings, fetchClaudeEdit, planFromClaude } from "../engine/aiEdit/client";
import { isSpeechSource } from "../engine/mediaStore";

type Mode = "claude" | "rules";
type Phase = TranscribeProgress | { phase: "claude" };

function progressLabel(p: Phase): string {
  if (p.phase === "claude") return "Claude is editing your video…";
  if (p.phase === "loading-model") {
    return p.progress != null ? `Loading speech model ${Math.round(p.progress * 100)}%…` : "Loading speech model…";
  }
  if (p.phase === "decoding-audio") return "Reading audio…";
  return "Transcribing speech…";
}

export function AutoEditDialog({ onClose }: { onClose: () => void }) {
  const layers = useEditorStore((s) => s.project.composition.layers);
  const comp = useEditorStore((s) => s.project.composition);
  const applyEditPlan = useEditorStore((s) => s.applyEditPlan);

  const sourceCandidates = layers.filter(
    (l): l is Layer & { props: VideoLayerProps | AudioLayerProps } =>
      (l.type === "video" || l.type === "audio") && isSpeechSource((l.props as VideoLayerProps | AudioLayerProps).src)
  );

  const [mode, setMode] = useState<Mode>("claude");
  const [sourceId, setSourceId] = useState(sourceCandidates[0]?.id ?? "");
  const [pace, setPace] = useState<Pace>("medium");
  const [modelSize, setModelSize] = useState<ModelSize>("base");
  const [instructions, setInstructions] = useState("");
  const [includeTitle, setIncludeTitle] = useState(true);
  const [titleText, setTitleText] = useState("");
  const [includeCta, setIncludeCta] = useState(true);
  const [ctaText, setCtaText] = useState("");
  const [progress, setProgress] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(aiSettings.getApiKey());
  const [accessCode, setAccessCode] = useState(aiSettings.getAccessCode());

  // Transcription can't be interrupted mid-inference, so closing the dialog discards its result instead.
  const discardedRef = useRef(false);
  useEffect(() => {
    // Reset on (re)mount: React's dev StrictMode mounts twice and would otherwise leave this stuck on.
    discardedRef.current = false;
    return () => {
      discardedRef.current = true;
    };
  }, []);

  const handleRun = async () => {
    const source = sourceCandidates.find((l) => l.id === sourceId);
    if (!source) return;
    setError(null);
    setSummary(null);
    setProgress({ phase: "loading-model" });
    try {
      const { transcribeMediaSource } = await import("../engine/transcribe");
      const srcProps = source.props as VideoLayerProps | AudioLayerProps;
      const words = await transcribeMediaSource(srcProps.src, { modelSize, onProgress: setProgress });
      if (discardedRef.current) return;
      if (words.length === 0) {
        setError("No speech was detected in this clip, so there's nothing to build an edit from.");
        return;
      }

      if (mode === "rules") {
        applyEditPlan(
          source.id,
          planFromRules(words, {
            pace,
            title: includeTitle ? titleText.trim() || undefined : undefined,
            cta: includeCta ? ctaText.trim() || undefined : undefined,
          })
        );
        onClose();
        return;
      }

      setProgress({ phase: "claude" });
      const out = await fetchClaudeEdit({
        words,
        pace,
        instructions,
        title: { enabled: includeTitle, text: titleText },
        cta: { enabled: includeCta, text: ctaText },
        frame: { width: comp.width, height: comp.height },
      });
      if (discardedRef.current) return;
      applyEditPlan(source.id, planFromClaude(words, out));
      setSummary(out.summary || "Done.");
    } catch (err) {
      if (!discardedRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!discardedRef.current) setProgress(null);
    }
  };

  const saveSettings = () => {
    aiSettings.setApiKey(apiKey);
    aiSettings.setAccessCode(accessCode);
    setShowSettings(false);
  };

  if (summary) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <h3>✨ Claude finished the edit</h3>
          <p className="claude-summary" dir="auto">
            {summary}
          </p>
          <p className="hint">Everything was added as one step — press Ctrl+Z to undo it all, or tweak any layer.</p>
          <div className="modal-actions">
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={() => !progress && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>✨ Auto Edit</h3>

        <div className="mode-toggle">
          <button type="button" className={mode === "claude" ? "active" : ""} onClick={() => setMode("claude")}>
            🤖 Claude
          </button>
          <button type="button" className={mode === "rules" ? "active" : ""} onClick={() => setMode("rules")}>
            ⚡ Quick rules (offline)
          </button>
        </div>
        <p className="hint">
          {mode === "claude"
            ? "Claude listens to the transcript, fixes dialect words, and decides the highlights, numbers, lists, punchlines, zooms, sounds and color — like a human editor."
            : "Fixed rules (ordinal words, digits, pauses). Instant and free, but not smart."}
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

            {mode === "claude" && (
              <label className="field">
                <span>Tell Claude about the video (optional)</span>
                <textarea
                  dir="auto"
                  rows={3}
                  placeholder="مثلاً: إعلان لمطعم ببغداد، خليه حماسي وركّز على الأسعار"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </label>
            )}

            <div className="field-row">
              <label className="field">
                <span>Pace</span>
                <select value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
                  <option value="calm">Calm</option>
                  <option value="medium">Medium</option>
                  <option value="strong">Strong</option>
                </select>
              </label>
              <label className="field">
                <span>Speech model</span>
                <select value={modelSize} onChange={(e) => setModelSize(e.target.value as ModelSize)}>
                  <option value="tiny">Tiny (fast)</option>
                  <option value="base">Base</option>
                  <option value="small">Small (most accurate)</option>
                </select>
              </label>
            </div>

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
                <input
                  dir="auto"
                  value={titleText}
                  placeholder={mode === "claude" ? "Leave empty and Claude writes one" : "اسم القناة"}
                  onChange={(e) => setTitleText(e.target.value)}
                />
              </label>
            )}
            {includeCta && (
              <label className="field">
                <span>CTA text</span>
                <input
                  dir="auto"
                  value={ctaText}
                  placeholder={mode === "claude" ? "Leave empty and Claude writes one" : "تابعنا"}
                  onChange={(e) => setCtaText(e.target.value)}
                />
              </label>
            )}

            {mode === "claude" && (
              <div className="claude-settings">
                <button type="button" className="link-btn" onClick={() => setShowSettings((v) => !v)}>
                  🔑 Claude connection {aiSettings.getApiKey() ? "(personal key saved)" : ""}
                </button>
                {showSettings && (
                  <>
                    <label className="field">
                      <span>Your Claude API key (optional)</span>
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder="sk-ant-…"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                      />
                    </label>
                    <p className="hint">
                      Saved only in this browser and sent straight to Anthropic. Leave it empty if the site's server is
                      set up with a key (ANTHROPIC_API_KEY in .env.local or the hosting settings).
                    </p>
                    <label className="field">
                      <span>Access code (only if the server asks for one)</span>
                      <input type="password" autoComplete="off" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
                    </label>
                    <div className="modal-actions">
                      <button type="button" onClick={saveSettings}>
                        Save connection settings
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {error && <p className="hint error">{error}</p>}
          </>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleRun} disabled={!sourceId || !!progress}>
            {progress ? progressLabel(progress) : mode === "claude" ? "✨ Edit with Claude" : "✨ Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
