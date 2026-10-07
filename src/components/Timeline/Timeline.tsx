import { useRef } from "react";
import { useEditorStore } from "../../state/store";
import { Ruler } from "./Ruler";
import { LayerRow } from "./LayerRow";
import { PIXELS_PER_SECOND } from "./constants";

const LABEL_WIDTH = 200;

export function Timeline() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const pause = useEditorStore((s) => s.pause);
  const comp = project.composition;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrubFromEvent = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft;
    const time = Math.max(0, Math.min(comp.duration, x / PIXELS_PER_SECOND));
    setPlayhead(time);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    pause();
    scrubFromEvent(e);
    const handleMove = (ev: MouseEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left + el.scrollLeft;
      const time = Math.max(0, Math.min(comp.duration, x / PIXELS_PER_SECOND));
      setPlayhead(time);
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div className="timeline">
      <div className="timeline-header-row">
        <div className="timeline-label-spacer" style={{ width: LABEL_WIDTH }}>
          Layers
        </div>
        <div className="timeline-ruler-scroll" ref={scrollRef} onMouseDown={handleMouseDown}>
          <Ruler duration={comp.duration} />
          <div className="playhead-line" style={{ left: playhead * PIXELS_PER_SECOND }} />
        </div>
      </div>
      <div className="timeline-body">
        {comp.layers.length === 0 && <div className="timeline-empty">No layers yet — add one from the toolbar.</div>}
        {comp.layers.map((layer) => (
          <LayerRow layer={layer} key={layer.id} />
        ))}
      </div>
    </div>
  );
}
