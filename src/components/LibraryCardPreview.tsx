import { useEffect, useRef } from "react";
import type { ColorGradeId, Composition } from "../types";
import type { PreviewScene } from "../engine/libraryPreview";
import { renderComposition } from "../engine/renderer";

/** Renders one real, accurate frame of a library item — same engine as preview/export, so "what you see is what you get". */
export function LibraryCardPreview({
  scene,
  width,
  height,
  colorGrade = "none",
}: {
  scene: PreviewScene;
  width: number;
  height: number;
  colorGrade?: ColorGradeId;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const comp: Composition = {
      id: "library-preview",
      name: "preview",
      width,
      height,
      fps: 30,
      duration: 5,
      backgroundColor: scene.backgroundColor ?? "#1b1b1e",
      colorGrade,
      layers: scene.layers,
    };
    renderComposition(ctx, comp, scene.time, { playing: false });
  }, [scene, width, height, colorGrade]);

  return <canvas ref={canvasRef} width={width} height={height} className="library-card-canvas" />;
}
