import { useRef, useState } from "react";
import { useEditorStore } from "../state/store";
import { downloadBlob } from "../utils/download";
import { canExportVideo, exportCompositionToVideo, ExportCancelledError, extensionForBlob } from "../engine/export";
import { AutoEditDialog } from "./AutoEditDialog";
import { InvalidProjectError } from "../engine/migrate";
import { LibraryPanel } from "./LibraryPanel";

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

export function Toolbar() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const isExporting = useEditorStore((s) => s.isExporting);
  const exportProgress = useEditorStore((s) => s.exportProgress);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const addLayer = useEditorStore((s) => s.addLayer);
  const newProject = useEditorStore((s) => s.newProject);
  const loadProject = useEditorStore((s) => s.loadProject);
  const setExporting = useEditorStore((s) => s.setExporting);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const [autoEditOpen, setAutoEditOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSave = () => {
    const json = JSON.stringify(project, null, 2);
    downloadBlob(new Blob([json], { type: "application/json" }), `${project.name || "project"}.json`);
  };

  const handleLoadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadProject(JSON.parse(reader.result as string));
      } catch (err) {
        alert(err instanceof InvalidProjectError ? err.message : "Could not read this project file — it isn't valid JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportAbortRef = useRef<AbortController | null>(null);

  const handleExport = async () => {
    if (!canExportVideo()) {
      alert("This browser can't export video. Please open the editor in a recent Chrome or Edge.");
      return;
    }
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExporting(true, 0);
    try {
      const blob = await exportCompositionToVideo(
        project.composition,
        (progress) => setExporting(true, progress),
        controller.signal
      );
      downloadBlob(blob, `${project.name || "export"}.${extensionForBlob(blob)}`);
    } catch (err) {
      if (err instanceof ExportCancelledError) return;
      console.error(err);
      alert("Export failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      exportAbortRef.current = null;
      setExporting(false, 0);
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button onClick={newProject} title="New project">
          🆕
        </button>
        <button onClick={handleSave} title="Save project (.json)">
          💾 Save
        </button>
        <button onClick={handleLoadClick} title="Load project (.json)">
          📂 Load
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChange} />
      </div>

      <div className="toolbar-group">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷
        </button>
      </div>

      <div className="toolbar-group">
        <span className="toolbar-title">Add layer:</span>
        <button onClick={() => addLayer("text")}>T Text</button>
        <button onClick={() => addLayer("rect")}>▭ Rect</button>
        <button onClick={() => addLayer("ellipse")}>◯ Ellipse</button>
        <button onClick={() => addLayer("polygon")}>⬠ Polygon</button>
        <button onClick={() => addLayer("star")}>★ Star</button>
        <button onClick={() => addLayer("image")}>🖼 Image</button>
        <button onClick={() => addLayer("video")}>🎬 Video</button>
        <button onClick={() => addLayer("audio")}>🔊 Audio</button>
        <button onClick={() => addLayer("caption")}>💬 Captions</button>
        <button onClick={() => addLayer("glass")}>◐ Glass</button>
        <button onClick={() => addLayer("overlay")}>▦ Overlay</button>
      </div>

      <div className="toolbar-group">
        <button onClick={() => setLibraryOpen(true)} title="تصفّح مكتبة الموشن (قوالب، كابشن، مشاهد فيسلس...)">
          📚 المكتبة
        </button>
      </div>

      <div className="toolbar-group">
        <button onClick={() => setPlayhead(0)} title="Go to start">
          ⏮
        </button>
        <button onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? "⏸" : "▶"}
        </button>
        <span className="time-readout">
          {formatTime(playhead)} / {formatTime(project.composition.duration)}
        </span>
      </div>

      <div className="toolbar-group toolbar-group-end">
        <button onClick={() => setAutoEditOpen(true)} title="Automatically assemble a first edit from speech">
          ✨ Auto Edit
        </button>
        {isExporting ? (
          <>
            <span className="export-status" title="Keep this tab in front until the export finishes">
              Exporting {Math.round(exportProgress * 100)}% — keep this tab open
            </span>
            <button onClick={() => exportAbortRef.current?.abort()}>Cancel</button>
          </>
        ) : (
          <button className="primary" onClick={handleExport}>
            ⬇ Export video
          </button>
        )}
      </div>

      {autoEditOpen && <AutoEditDialog onClose={() => setAutoEditOpen(false)} />}
      {libraryOpen && (
        <LibraryPanel onClose={() => setLibraryOpen(false)} onOpenAutoEdit={() => setAutoEditOpen(true)} />
      )}
    </div>
  );
}
