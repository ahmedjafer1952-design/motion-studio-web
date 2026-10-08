import { useState, type MouseEvent } from "react";
import { useEditorStore } from "../state/store";
import { LIBRARY_CATEGORIES, cardsForCategory, type LibraryCategoryId } from "../engine/libraryCatalog";
import type { TemplateId } from "../engine/templates";
import type { SceneId } from "../engine/scenes";
import {
  captionPreview,
  elementPreview,
  gradeDemoPreview,
  overlayPreview,
  scenePreview,
  stickerPreview,
  templatePreview,
} from "../engine/libraryPreview";
import { LibraryCardPreview } from "./LibraryCardPreview";
import { getSoundUrl } from "../engine/sounds";

export function LibraryPanel({
  onClose,
  onOpenAutoEdit,
}: {
  onClose: () => void;
  onOpenAutoEdit: () => void;
}) {
  const [category, setCategory] = useState<LibraryCategoryId>("text");
  const [flashId, setFlashId] = useState<string | null>(null);
  const applyTemplate = useEditorStore((s) => s.applyTemplate);
  const applyScene = useEditorStore((s) => s.applyScene);
  const insertSticker = useEditorStore((s) => s.insertSticker);
  const addLayer = useEditorStore((s) => s.addLayer);
  const addLayerWithProps = useEditorStore((s) => s.addLayerWithProps);
  const updateComposition = useEditorStore((s) => s.updateComposition);
  const comp = useEditorStore((s) => s.project.composition);
  const activeGrade = comp.colorGrade ?? "none";

  const flash = (id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 350);
  };

  const insertSound = async (id: Parameters<typeof getSoundUrl>[0]) => {
    const buffer = await getSoundUrl(id);
    const naturalDuration = await new Promise<number>((resolve) => {
      const probe = new Audio(buffer);
      probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) ? probe.duration : 1);
      probe.onerror = () => resolve(1);
    });
    addLayerWithProps(
      "audio",
      { src: `sound:${id}`, fileName: `${id}.wav`, trimIn: 0, naturalDuration, muted: false },
      naturalDuration
    );
    flash(id);
  };

  const previewSound = async (id: Parameters<typeof getSoundUrl>[0], e: MouseEvent) => {
    e.stopPropagation();
    const url = await getSoundUrl(id);
    new Audio(url).play().catch(() => {});
  };

  const cards = cardsForCategory(category);
  const activeCat = LIBRARY_CATEGORIES.find((c) => c.id === category)!;
  const pw = comp.width;
  const ph = comp.height;

  return (
    <div className="library-overlay" onClick={onClose}>
      <div className="library-panel" onClick={(e) => e.stopPropagation()}>
        <div className="library-main">
          <div className="library-header">
            <h3>
              {activeCat.icon} {activeCat.label}
            </h3>
            <button className="link-btn" onClick={onClose} title="إغلاق">
              ✕
            </button>
          </div>

          <div className="library-grid">
            {cards.map((card) => {
              if (card.kind === "template") {
                return (
                  <button
                    key={card.id}
                    className={`library-card ${flashId === card.id ? "flash" : ""}`}
                    onClick={() => {
                      applyTemplate(card.id as TemplateId);
                      flash(card.id);
                    }}
                  >
                    <div className="library-card-preview">
                      <LibraryCardPreview scene={templatePreview(card.id, comp)} width={pw} height={ph} />
                    </div>
                    <div className="library-card-label">{card.label}</div>
                    <div className="library-card-desc">{card.description}</div>
                  </button>
                );
              }
              if (card.kind === "caption") {
                return (
                  <button
                    key={card.id}
                    className={`library-card ${flashId === card.id ? "flash" : ""}`}
                    onClick={() => {
                      addLayerWithProps("caption", { style: card.id });
                      flash(card.id);
                    }}
                  >
                    <div className="library-card-preview">
                      <LibraryCardPreview scene={captionPreview(card.id, comp)} width={pw} height={ph} />
                    </div>
                    <div className="library-card-label">{card.label}</div>
                    <div className="library-card-desc">{card.description}</div>
                  </button>
                );
              }
              if (card.kind === "element") {
                return (
                  <button
                    key={card.id}
                    className={`library-card ${flashId === card.id ? "flash" : ""}`}
                    onClick={() => {
                      addLayer(card.layerType);
                      flash(card.id);
                    }}
                  >
                    <div className="library-card-preview">
                      <LibraryCardPreview scene={elementPreview(card.layerType, comp)} width={pw} height={ph} />
                    </div>
                    <div className="library-card-label">{card.label}</div>
                    <div className="library-card-desc">{card.description}</div>
                  </button>
                );
              }
              if (card.kind === "sticker") {
                return (
                  <button
                    key={card.id}
                    className={`library-card ${flashId === card.id ? "flash" : ""}`}
                    onClick={() => {
                      insertSticker(card.id);
                      flash(card.id);
                    }}
                  >
                    <div className="library-card-preview">
                      <LibraryCardPreview scene={stickerPreview(card.id, comp)} width={pw} height={ph} />
                    </div>
                    <div className="library-card-label">{card.label}</div>
                    <div className="library-card-desc">{card.description}</div>
                  </button>
                );
              }
              if (card.kind === "overlay") {
                return (
                  <button
                    key={card.id}
                    className={`library-card ${flashId === card.id ? "flash" : ""}`}
                    onClick={() => {
                      addLayerWithProps("overlay", { effect: card.id, intensity: 0.5, width: pw, height: ph });
                      flash(card.id);
                    }}
                  >
                    <div className="library-card-preview">
                      <LibraryCardPreview scene={overlayPreview(card.id, comp)} width={pw} height={ph} />
                    </div>
                    <div className="library-card-label">{card.label}</div>
                    <div className="library-card-desc">{card.description}</div>
                  </button>
                );
              }
              if (card.kind === "sceneGroup") {
                return (
                  <div key={card.type} className="library-card library-card-scene">
                    <div className="library-card-preview">
                      <LibraryCardPreview
                        scene={scenePreview(card.variants[0].id, comp)}
                        width={pw}
                        height={ph}
                      />
                    </div>
                    <div className="library-card-label">{card.label}</div>
                    <div className="library-card-desc">{card.description}</div>
                    <div className="library-variant-dots">
                      {card.variants.map((v, i) => (
                        <button
                          key={v.id}
                          className={`variant-thumb ${flashId === v.id ? "flash" : ""}`}
                          title={`تنويع ${i + 1}`}
                          onClick={() => {
                            applyScene(v.id as SceneId);
                            flash(v.id);
                          }}
                        >
                          <LibraryCardPreview scene={scenePreview(v.id, comp)} width={pw} height={ph} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              if (card.kind === "grade") {
                const isActive = activeGrade === card.id;
                return (
                  <button
                    key={card.id}
                    className={`library-card ${flashId === card.id ? "flash" : ""} ${isActive ? "selected" : ""}`}
                    onClick={() => {
                      updateComposition({ colorGrade: card.id });
                      flash(card.id);
                    }}
                  >
                    <div className="library-card-preview">
                      <LibraryCardPreview
                        scene={gradeDemoPreview(comp)}
                        width={pw}
                        height={ph}
                        colorGrade={card.id}
                      />
                      {isActive && <span className="grade-active-badge">✓</span>}
                    </div>
                    <div className="library-card-label">{card.label}</div>
                    <div className="library-card-desc">{card.description}</div>
                  </button>
                );
              }
              if (card.kind === "sound") {
                return (
                  <div
                    key={card.id}
                    role="button"
                    tabIndex={0}
                    className={`library-card ${flashId === card.id ? "flash" : ""}`}
                    onClick={() => insertSound(card.id)}
                    onKeyDown={(e) => e.key === "Enter" && insertSound(card.id)}
                  >
                    <div className="library-card-preview sound-preview">
                      <span className="sound-icon">🔊</span>
                      <button
                        type="button"
                        className="sound-play-btn"
                        title="معاينة الصوت"
                        onClick={(e) => previewSound(card.id, e)}
                      >
                        ▶
                      </button>
                    </div>
                    <div className="library-card-label">{card.label}</div>
                    <div className="library-card-desc">{card.description}</div>
                  </div>
                );
              }
              // autoedit
              return (
                <button
                  key="autoedit"
                  className="library-card"
                  onClick={() => {
                    onClose();
                    onOpenAutoEdit();
                  }}
                >
                  <div
                    className="library-card-preview"
                    style={{ background: `linear-gradient(135deg, ${card.swatch[0]}, ${card.swatch[1]})` }}
                  >
                    <span>✨</span>
                  </div>
                  <div className="library-card-label">{card.label}</div>
                  <div className="library-card-desc">{card.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="library-rail">
          {LIBRARY_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`library-rail-btn ${category === cat.id ? "active" : ""}`}
              onClick={() => setCategory(cat.id)}
              title={cat.label}
            >
              <span className="rail-icon">{cat.icon}</span>
              <span className="rail-label">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
