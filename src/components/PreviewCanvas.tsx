import { useEffect, useRef } from "react";
import { useEditorStore } from "../state/store";
import { renderComposition } from "../engine/renderer";

export function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const pause = useEditorStore((s) => s.pause);

  const comp = project.composition;
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // Draw whenever composition, playhead, or play state changes (covers paused scrubbing + edits).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderComposition(ctx, comp, playhead, { playing: isPlaying });
  }, [comp, playhead, isPlaying]);

  // Playback loop.
  useEffect(() => {
    if (!isPlaying) {
      lastTsRef.current = null;
      return;
    }
    const step = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const next = useEditorStore.getState().playhead + dt;
      if (next >= comp.duration) {
        setPlayhead(comp.duration);
        pause();
        return;
      }
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, comp.duration]);

  return (
    <canvas
      ref={canvasRef}
      width={comp.width}
      height={comp.height}
      className="preview-canvas"
      style={{ aspectRatio: `${comp.width} / ${comp.height}` }}
    />
  );
}
