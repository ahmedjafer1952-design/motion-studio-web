import type { Layer } from "../../types";
import { useEditorStore } from "../../state/store";
import { PIXELS_PER_SECOND, PROPERTY_COLORS, PROPERTY_ORDER } from "./constants";

export function KeyframeTrack({ layer }: { layer: Layer }) {
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);

  return (
    <div
      className="keyframe-track"
      style={{
        left: layer.startTime * PIXELS_PER_SECOND,
        width: (layer.endTime - layer.startTime) * PIXELS_PER_SECOND,
      }}
      onMouseDown={() => selectLayer(layer.id)}
    >
      {PROPERTY_ORDER.map((propKey) => {
        const anim = layer.transform[propKey];
        return anim.keyframes.map((kf) => (
          <div
            key={kf.id}
            className="keyframe-diamond"
            title={`${propKey} @ ${kf.time.toFixed(2)}s`}
            style={{
              left: (kf.time - layer.startTime) * PIXELS_PER_SECOND,
              background: PROPERTY_COLORS[propKey],
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              selectLayer(layer.id);
              setPlayhead(kf.time);
            }}
          />
        ));
      })}
    </div>
  );
}
