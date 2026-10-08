import { useState } from "react";
import { useEditorStore } from "../state/store";
import {
  LIBRARY_CATEGORIES,
  cardsForCategory,
  type LibraryCategoryId,
} from "../engine/libraryCatalog";
import type { TemplateId } from "../engine/templates";
import type { SceneId } from "../engine/scenes";

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
  const addLayer = useEditorStore((s) => s.addLayer);
  const addLayerWithProps = useEditorStore((s) => s.addLayerWithProps);

  const flash = (id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 350);
  };

  const cards = cardsForCategory(category);
  const activeCat = LIBRARY_CATEGORIES.find((c) => c.id === category)!;

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
                    <div
                      className="library-card-preview"
                      style={{ background: `linear-gradient(135deg, ${card.swatch[0]}, ${card.swatch[1]})` }}
                    >
                      <span>{card.label}</span>
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
                    <div
                      className="library-card-preview"
                      style={{ background: `linear-gradient(135deg, ${card.swatch[0]}, ${card.swatch[1]})` }}
                    >
                      <span>💬</span>
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
                    <div
                      className="library-card-preview"
                      style={{ background: `linear-gradient(135deg, ${card.swatch[0]}, ${card.swatch[1]})` }}
                    >
                      <span>{card.label}</span>
                    </div>
                    <div className="library-card-label">{card.label}</div>
                    <div className="library-card-desc">{card.description}</div>
                  </button>
                );
              }
              if (card.kind === "sceneGroup") {
                return (
                  <div key={card.type} className="library-card library-card-scene">
                    <div
                      className="library-card-preview"
                      style={{ background: `linear-gradient(135deg, ${card.variants[0]?.dot ?? "#333"}, #1b1b1e)` }}
                    >
                      <span>🎭</span>
                    </div>
                    <div className="library-card-label">{card.label}</div>
                    <div className="library-card-desc">{card.description}</div>
                    <div className="library-variant-dots">
                      {card.variants.map((v, i) => (
                        <button
                          key={v.id}
                          className={`variant-dot ${flashId === v.id ? "flash" : ""}`}
                          style={{ background: v.dot }}
                          title={`تنويع ${i + 1}`}
                          onClick={() => {
                            applyScene(v.id as SceneId);
                            flash(v.id);
                          }}
                        />
                      ))}
                    </div>
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
