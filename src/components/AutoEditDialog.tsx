import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../state/store";
import type { AudioLayerProps, Layer, VideoLayerProps, VideoLook } from "../types";
import type { ModelSize, TranscribeProgress, TranscribedWord } from "../engine/transcribe";
import { planFromRules, type EditPlan, type Pace } from "../engine/autoEdit";
import { aiSettings, fetchClaudeEdit, planFromClaude } from "../engine/aiEdit/client";
import { isSpeechSource } from "../engine/mediaStore";
import { buildManualPrompt, parseManualReply } from "../engine/aiEdit/manual";
import { applyCaptionEdits, captionLines, emphasisKeys, linesToText } from "../engine/captionReview";

// Auto Edit as a short wizard: set up → (transcribe + Claude) → review captions and what will be
// added → apply as ONE undo step. Every screen says what's happening and what to do next.

type Mode = "chat" | "claude" | "rules";
type Step = "setup" | "working" | "chat" | "review" | "done";
type Phase = TranscribeProgress | { phase: "claude" };

const MODES: { id: Mode; icon: string; title: string; desc: string }[] = [
  { id: "chat", icon: "💬", title: "اشتراكك بـ Claude", desc: "مجاني — تنسخ طلب وتلصقه بمحادثة Claude وترجع الجواب" },
  { id: "claude", icon: "🤖", title: "Claude تلقائي", desc: "يحتاج مفتاح API — كلشي يصير بضغطة وحدة" },
  { id: "rules", icon: "⚡", title: "سريع بدون ذكاء", desc: "قواعد ثابتة، فوري ومجاني، بس أقل احترافية" },
];

const NOTE_CHIPS: { label: string; text: string }[] = [
  { label: "تعليمي", text: "فيديو تعليمي، ستايل احترافي هادي." },
  { label: "إعلان", text: "إعلان، خليه حماسي وسريع وركّز على العروض والأسعار." },
  { label: "قصة", text: "قصة أو معلومة، جو درامي وفخم." },
  { label: "كبسولة زجاج", text: "الكابشن كبسولة زجاج." },
  { label: "النقاط كروت", text: "النقاط اللي يعددها خليها كروت." },
  { label: "اقترح صور", text: "اقترح صور توضيحية للأمثلة اللي يذكرها." },
  { label: "بدون أصوات", text: "بدون مؤثرات صوتية." },
];

function phaseLabel(p: Phase | null): string {
  if (!p) return "";
  if (p.phase === "claude") return "Claude ديمنتج الفيديو…";
  if (p.phase === "loading-model") return p.progress != null ? `تحميل موديل الكلام ${Math.round(p.progress * 100)}%` : "تحميل موديل الكلام…";
  if (p.phase === "decoding-audio") return "قراءة الصوت…";
  return "تحويل الكلام لنص… (ياخذ وقت حسب طول الفيديو)";
}

function planSummary(plan: EditPlan): string[] {
  const out: string[] = [`كابشن (${plan.words.length} كلمة)`];
  if (plan.title) out.push(`عنوان: «${plan.title}»`);
  const items = plan.lists.reduce((n, l) => n + l.items.length, 0);
  if (items) out.push(`${items} كروت للنقاط`);
  if (plan.numbers.length) out.push(`${plan.numbers.length} رقم كبير`);
  if (plan.keyPhrases.length) out.push(`${plan.keyPhrases.length} عبارات مميزة`);
  if (plan.broll?.length) out.push(`${plan.broll.length} أماكن لصور توضيحية`);
  if (plan.zooms.length) out.push(`${plan.zooms.length} زوم`);
  if (plan.sounds.length) out.push(`${plan.sounds.length} مؤثرات صوتية`);
  if (plan.colorGrade) out.push("تلوين سينمائي");
  if (plan.cta) out.push(`دعوة بالنهاية: «${plan.cta}»`);
  return out;
}

export function AutoEditDialog({ onClose }: { onClose: () => void }) {
  const layers = useEditorStore((s) => s.project.composition.layers);
  const comp = useEditorStore((s) => s.project.composition);
  const applyEditPlan = useEditorStore((s) => s.applyEditPlan);

  const sourceCandidates = layers.filter(
    (l): l is Layer & { props: VideoLayerProps | AudioLayerProps } =>
      (l.type === "video" || l.type === "audio") && isSpeechSource((l.props as VideoLayerProps | AudioLayerProps).src)
  );

  const [step, setStep] = useState<Step>("setup");
  const [mode, setMode] = useState<Mode>(aiSettings.getApiKey() ? "claude" : "chat");
  const [sourceId, setSourceId] = useState(sourceCandidates[0]?.id ?? "");
  const [pace, setPace] = useState<Pace>("medium");
  const [modelSize, setModelSize] = useState<ModelSize>("small"); // Iraqi speech needs the more accurate model
  const [instructions, setInstructions] = useState("");
  const [includeTitle, setIncludeTitle] = useState(true);
  const [titleText, setTitleText] = useState("");
  const [includeCta, setIncludeCta] = useState(true);
  const [ctaText, setCtaText] = useState("");
  const [brandColor, setBrandColor] = useState(""); // "" = Claude picks
  const [textBehind, setTextBehind] = useState(false);
  const [bgLook, setBgLook] = useState<"" | VideoLook | "studio">("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiKey, setApiKey] = useState(aiSettings.getApiKey());
  const [accessCode, setAccessCode] = useState(aiSettings.getAccessCode());

  const [progress, setProgress] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [words, setWords] = useState<TranscribedWord[]>([]);
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [copied, setCopied] = useState(false);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [claudeSummary, setClaudeSummary] = useState("");
  const [captionText, setCaptionText] = useState("");

  const source = sourceCandidates.find((l) => l.id === sourceId);
  const isVideo = source?.type === "video";
  const lines = useMemo(() => (plan ? captionLines(plan.words) : []), [plan]);

  // Transcription can't be interrupted mid-inference, so closing the dialog discards its result instead.
  const discardedRef = useRef(false);
  useEffect(() => {
    discardedRef.current = false; // reset on (re)mount — dev StrictMode mounts twice
    return () => {
      discardedRef.current = true;
    };
  }, []);

  const toReview = (p: EditPlan, summary: string) => {
    setPlan(p);
    setClaudeSummary(summary);
    setCaptionText(linesToText(captionLines(p.words)));
    setStep("review");
  };

  const handleRun = async () => {
    if (!source) return;
    if (mode === "claude") {
      aiSettings.setApiKey(apiKey);
      aiSettings.setAccessCode(accessCode);
    }
    setError(null);
    setStep("working");
    setProgress({ phase: "loading-model" });
    try {
      const { transcribeMediaSource } = await import("../engine/transcribe");
      const w = await transcribeMediaSource((source.props as VideoLayerProps | AudioLayerProps).src, { modelSize, onProgress: setProgress });
      if (discardedRef.current) return;
      if (w.length === 0) throw new Error("ما انسمع أي كلام بهذا المقطع، فما أكدر أسوي مونتاج عليه.");
      setWords(w);

      if (mode === "rules") {
        const title = includeTitle ? titleText.trim() || undefined : undefined;
        const cta = includeCta ? ctaText.trim() || undefined : undefined;
        toReview(planFromRules(w, { pace, title, cta }), "مونتاج سريع بالقواعد الثابتة.");
        return;
      }
      const req = {
        words: w,
        pace,
        instructions,
        title: { enabled: includeTitle, text: titleText },
        cta: { enabled: includeCta, text: ctaText },
        frame: { width: comp.width, height: comp.height },
        brandColor: brandColor || undefined,
      };
      if (mode === "chat") {
        setPrompt(buildManualPrompt(req));
        setStep("chat");
        return;
      }
      setProgress({ phase: "claude" });
      const out = await fetchClaudeEdit(req);
      if (discardedRef.current) return;
      toReview(planFromClaude(w, out), out.summary);
    } catch (err) {
      if (discardedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStep("setup");
    } finally {
      if (!discardedRef.current) setProgress(null);
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setError("ما انتسخ تلقائيًا — اضغط داخل المربع، Ctrl+A ثم Ctrl+C.");
    }
  };

  const readReply = () => {
    try {
      const out = parseManualReply(reply);
      setError(null);
      toReview(planFromClaude(words, out), out.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const apply = () => {
    if (!plan || !source) return;
    const res = applyCaptionEdits(lines, emphasisKeys(lines, plan.words, plan.emphasis), captionText);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    applyEditPlan(source.id, {
      ...plan,
      words: res.words,
      emphasis: res.emphasis,
      textBehind: isVideo && textBehind,
      backgroundLook: isVideo && bgLook && bgLook !== "studio" ? bgLook : null,
      studioBackground: isVideo && bgLook === "studio",
    });
    setStep("done");
  };

  const appendNote = (text: string) => setInstructions((v) => (v.includes(text) ? v : (v.trim() ? v.trim() + "\n" : "") + text));

  // --- Screens --------------------------------------------------------------

  if (step === "done") {
    return (
      <div className="modal-backdrop">
        <div className="modal" dir="rtl">
          <h3>✅ المونتاج انضاف</h3>
          {claudeSummary && <p className="claude-summary">{claudeSummary}</p>}
          <ul className="hint">
            <li>شغّل الفيديو وشوف النتيجة.</li>
            <li>أي عنصر ما عجبك: اضغط عليه بالشاشة أو بالتايملاين وعدّله أو امسحه.</li>
            <li>إذا عندك أماكن صور توضيحية (إطار منقّط): اضغط عليه واختار صورة.</li>
            <li>ما عجبك كله؟ Ctrl+Z يرجّع كلشي بخطوة وحدة.</li>
          </ul>
          <div className="modal-actions">
            <button type="button" className="primary" onClick={onClose}>
              تمام
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "review" && plan) {
    return (
      <div className="modal-backdrop">
        <div className="modal modal-wide" dir="rtl">
          <h3>٣/٣ — راجع قبل التطبيق</h3>
          {claudeSummary && <p className="claude-summary">{claudeSummary}</p>}
          <div className="review-chips">
            {planSummary(plan).map((s) => (
              <span key={s} className="chip">
                {s}
              </span>
            ))}
          </div>
          <label className="field">
            <span>الكابشن — صحّح أي كلمة غلط (كل سطر يطلع بوقته؛ لا تضيف ولا تمسح أسطر)</span>
            <textarea dir="rtl" rows={Math.min(12, Math.max(5, lines.length))} value={captionText} onChange={(e) => setCaptionText(e.target.value)} />
          </label>
          {error && <p className="hint error">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={() => setStep(mode === "chat" ? "chat" : "setup")}>
              رجوع
            </button>
            <button type="button" className="primary" onClick={apply}>
              ✨ طبّق المونتاج
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "chat") {
    return (
      <div className="modal-backdrop">
        <div className="modal modal-wide" dir="rtl">
          <h3>٢/٣ — خلّي Claude يمنتج</h3>
          <ol className="steps">
            <li>
              اضغط <b>📋 انسخ الطلب</b>، وافتح <b>claude.ai</b> بمحادثة جديدة، والصقه وارسله.
            </li>
            <li>لما يخلص الجواب، اضغط زر النسخ اللي تحت جواب Claude، والصقه بالمربع الثاني.</li>
          </ol>
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="primary" onClick={copyPrompt}>
              {copied ? "✅ انتسخ" : "📋 انسخ الطلب"}
            </button>
            <a className="button-link" href="https://claude.ai/new" target="_blank" rel="noreferrer">
              🔗 افتح claude.ai
            </a>
          </div>
          <textarea className="manual-prompt" dir="auto" rows={3} readOnly value={prompt} onFocus={(e) => e.target.select()} />
          <label className="field">
            <span>الصق جواب Claude هنا</span>
            <textarea dir="ltr" rows={6} placeholder='{ "corrections": [...], ... }' value={reply} onChange={(e) => setReply(e.target.value)} />
          </label>
          {error && <p className="hint error">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              إلغاء
            </button>
            <button type="button" className="primary" onClick={readReply} disabled={!reply.trim()}>
              التالي ←
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "working") {
    const transcribing = progress && progress.phase !== "claude";
    return (
      <div className="modal-backdrop">
        <div className="modal" dir="rtl">
          <h3>⏳ دنشتغل…</h3>
          <ol className="steps">
            <li className={transcribing ? "active" : "done"}>تحويل الكلام لنص {transcribing ? `— ${phaseLabel(progress)}` : "✓"}</li>
            {mode === "claude" && <li className={progress?.phase === "claude" ? "active" : ""}>Claude يقرر المونتاج</li>}
            <li>تراجع النتيجة وتطبّقها</li>
          </ol>
          <p className="hint">خلّي هاي النافذة مفتوحة. أول مرة تحمّل موديل الكلام تاخذ دقيقة أو أكثر.</p>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              إلغاء
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Setup
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <h3>✨ مونتاج تلقائي — ١/٣ الإعداد</h3>

        {sourceCandidates.length === 0 ? (
          <p className="hint">ضيف فيديو أو صوت فيه كلام أول (📥 استيراد فيديو)، وبعدين ارجع هنا.</p>
        ) : (
          <>
            <div className="mode-cards">
              {MODES.map((m) => (
                <button key={m.id} type="button" className={`mode-card ${mode === m.id ? "active" : ""}`} onClick={() => setMode(m.id)}>
                  <span className="mode-card-title">
                    {m.icon} {m.title}
                  </span>
                  <span className="mode-card-desc">{m.desc}</span>
                </button>
              ))}
            </div>

            {sourceCandidates.length > 1 && (
              <label className="field">
                <span>الفيديو</span>
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                  {sourceCandidates.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {mode !== "rules" && (
              <label className="field">
                <span>شنو الفيديو وشلون تريده؟ (كلّما تكتب أكثر، يطلع أقرب للي ببالك)</span>
                <textarea
                  dir="rtl"
                  rows={3}
                  placeholder="مثلاً: فيديو تعليمي لطلاب السادس عن الفيزياء، ستايل احترافي هادي، النقاط كروت، واقترح صور توضيحية."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
                <div className="note-chips">
                  {NOTE_CHIPS.map((c) => (
                    <button key={c.label} type="button" className="chip chip-btn" onClick={() => appendNote(c.text)}>
                      + {c.label}
                    </button>
                  ))}
                </div>
              </label>
            )}

            <div className="field-row">
              <label className="field">
                <span>الإيقاع</span>
                <select value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
                  <option value="calm">هادي</option>
                  <option value="medium">متوسط</option>
                  <option value="strong">سريع وحماسي</option>
                </select>
              </label>
              {mode !== "rules" && (
                <label className="field">
                  <span>لون الهوية</span>
                  <div className="inline-row">
                    <label className="field-checkbox">
                      <input type="checkbox" checked={!brandColor} onChange={(e) => setBrandColor(e.target.checked ? "" : "#6d28d9")} />
                      <span>Claude يختار</span>
                    </label>
                    {brandColor && <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />}
                  </div>
                </label>
              )}
            </div>

            {isVideo && (
              <div className="field-row">
                <label className="field field-checkbox">
                  <input type="checkbox" checked={textBehind} onChange={(e) => setTextBehind(e.target.checked)} />
                  <span>👤 الكتابة ورا الشخص</span>
                </label>
                <label className="field">
                  <span>الخلفية</span>
                  <select value={bgLook} onChange={(e) => setBgLook(e.target.value as typeof bgLook)}>
                    <option value="">طبيعية</option>
                    <option value="grayscale">أبيض وأسود (الشخص ملوّن)</option>
                    <option value="dim">معتّمة</option>
                    <option value="blur">مضبّبة</option>
                    <option value="studio">🎨 ستوديو بلون الهوية (تغيير الخلفية)</option>
                  </select>
                </label>
              </div>
            )}

            <div className="field-row">
              <label className="field">
                <span>
                  <input type="checkbox" checked={includeTitle} onChange={(e) => setIncludeTitle(e.target.checked)} /> عنوان بالبداية
                </span>
                {includeTitle && <input dir="rtl" value={titleText} placeholder={mode === "rules" ? "اكتب العنوان" : "فارغ = Claude يكتبه"} onChange={(e) => setTitleText(e.target.value)} />}
              </label>
              <label className="field">
                <span>
                  <input type="checkbox" checked={includeCta} onChange={(e) => setIncludeCta(e.target.checked)} /> دعوة بالنهاية (CTA)
                </span>
                {includeCta && <input dir="rtl" value={ctaText} placeholder={mode === "rules" ? "مثلاً: تابعنا" : "فارغ = Claude يكتبها"} onChange={(e) => setCtaText(e.target.value)} />}
              </label>
            </div>

            <button type="button" className="link-btn" onClick={() => setShowAdvanced((v) => !v)}>
              ⚙️ إعدادات متقدمة {showAdvanced ? "▲" : "▼"}
            </button>
            {(showAdvanced || (mode === "claude" && !aiSettings.getApiKey())) && (
              <div className="claude-settings">
                <label className="field">
                  <span>دقة تحويل الكلام</span>
                  <select value={modelSize} onChange={(e) => setModelSize(e.target.value as ModelSize)}>
                    <option value="small">عالية (أنصح بيها للعراقي)</option>
                    <option value="base">متوسطة</option>
                    <option value="tiny">سريعة (أقل دقة — للأجهزة الضعيفة)</option>
                  </select>
                </label>
                {mode === "claude" && (
                  <>
                    <label className="field">
                      <span>مفتاح Claude API (يبدي بـ sk-ant-)</span>
                      <input type="password" autoComplete="off" placeholder="sk-ant-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>كود الدخول (بس إذا الموقع المنشور يطلبه)</span>
                      <input type="password" autoComplete="off" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
                    </label>
                    <p className="hint">المفتاح ينحفظ بس بهذا المتصفح. اتركه فارغ إذا السيرفر بيه مفتاح.</p>
                  </>
                )}
              </div>
            )}

            {error && <p className="hint error">{error}</p>}
          </>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="primary" onClick={handleRun} disabled={!source}>
            التالي ←
          </button>
        </div>
      </div>
    </div>
  );
}
