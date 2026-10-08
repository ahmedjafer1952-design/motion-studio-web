import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../state/store";
import { defaultSession, renderComposition } from "../engine/renderer";
import { drawSelectionOutline, hitTestLayers, layerBounds } from "../engine/hitTest";
import { ensureFontsLoaded } from "../engine/fonts";

export function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const pause = useEditorStore((s) => s.pause);
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const beginGesture = useEditorStore((s) => s.beginGesture);
  const endGesture = useEditorStore((s) => s.endGesture);
  const translateLayer = useEditorStore((s) => s.translateLayer);
  const dragRef = useRef<{ layerId: string; startX: number; startY: number; moved: boolean } | null>(null);

  const comp = project.composition;
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const [frameTick, setFrameTick] = useState(0);

  // A video finished loading or seeking: redraw so the canvas shows the real frame, not a stale/black one.
  useEffect(() => {
    defaultSession.onFrameReady = () => setFrameTick((n) => n + 1);
    return () => {
      defaultSession.onFrameReady = null;
    };
  }, []);

  // Web fonts load lazily; redraw once the ones this composition uses have arrived.
  useEffect(() => {
    let cancelled = false;
    ensureFontsLoaded(comp).then(() => {
      if (!cancelled) setFrameTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [comp]);

  // Draw whenever composition, playhead, or play state changes (covers paused scrubbing + edits).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderComposition(ctx, comp, playhead, { playing: isPlaying });
    const selected = !isPlaying && comp.layers.find((l) => l.id === selectedLayerId);
    if (selected) {
      const b = layerBounds(selected, comp, playhead);
      if (b) {
        const ratio = comp.width / Math.max(1, canvas.getBoundingClientRect().width);
        drawSelectionOutline(ctx, b, Math.max(1, ratio));
      }
    }
  }, [comp, playhead, isPlaying, frameTick, selectedLayerId]);

  /** Maps a pointer position to composition pixels, accounting for the letterboxing of object-fit: contain. */
  const toCompPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / comp.width, rect.height / comp.height);
    const offsetX = (rect.width - comp.width * scale) / 2;
    const offsetY = (rect.height - comp.height * scale) / 2;
    return { x: (e.clientX - rect.left - offsetX) / scale, y: (e.clientY - rect.top - offsetY) / scale };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const pt = toCompPoint(e);
    const hit = hitTestLayers(comp, playhead, pt.x, pt.y);
    selectLayer(hit?.id ?? null);
    if (!hit) return;
    pause();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { layerId: hit.id, startX: pt.x, startY: pt.y, moved: false };
    beginGesture();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const pt = toCompPoint(e);
    if (!drag) {
      e.currentTarget.style.cursor = hitTestLayers(comp, playhead, pt.x, pt.y) ? "move" : "default";
      return;
    }
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    drag.moved = true;
    translateLayer(drag.layerId, Math.round(dx), Math.round(dy));
  };

  const handlePointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    endGesture();
  };

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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
