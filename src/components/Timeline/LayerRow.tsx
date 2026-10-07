import type { Layer } from "../../types";
import { useEditorStore } from "../../state/store";
import { KeyframeTrack } from "./KeyframeTrack";

export function LayerRow({ layer }: { layer: Layer }) {
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const moveLayer = useEditorStore((s) => s.moveLayer);
  const isSelected = selectedLayerId === layer.id;

  return (
    <div className={`layer-row ${isSelected ? "selected" : ""}`}>
      <div className="layer-row-label" onClick={() => selectLayer(layer.id)}>
        <span className="layer-type-badge">{layer.type[0].toUpperCase()}</span>
        <span className="layer-name">{layer.name}</span>
        <div className="layer-row-actions">
          <button title="Move up" onClick={() => moveLayer(layer.id, "up")}>
            ↑
          </button>
          <button title="Move down" onClick={() => moveLayer(layer.id, "down")}>
            ↓
          </button>
          <button title="Delete layer" className="danger" onClick={() => removeLayer(layer.id)}>
            ✕
          </button>
        </div>
      </div>
      <div className="layer-row-track">
        <KeyframeTrack layer={layer} />
      </div>
    </div>
  );
}
