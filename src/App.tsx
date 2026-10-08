import { useEffect, useRef, useState } from "react";
import { importMediaFile } from "./engine/importMedia";
import { Toolbar } from "./components/Toolbar";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { Timeline } from "./components/Timeline/Timeline";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { useEditorStore } from "./state/store";
import { collectUnusedMedia } from "./engine/mediaStore";
import { customFontRefs, loadCustomFonts } from "./engine/customFonts";

const AUTOSAVE_KEY = "motion-studio-autosave";

export default function App() {
  const project = useEditorStore((s) => s.project);
  const loadProject = useEditorStore((s) => s.loadProject);
  const restoredRef = useRef(false);
  const [autosaveFailed, setAutosaveFailed] = useState(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) loadProject(JSON.parse(raw));
    } catch {
      // A corrupt autosave just means starting from a fresh project.
    }
    loadCustomFonts().catch(() => {});
    collectUnusedMedia(JSON.stringify(useEditorStore.getState().project) + customFontRefs()).catch(() => {});
  }, [loadProject]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (typing) return;

      const store = useEditorStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const selected = store.selectedLayerId;

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        store.redo();
      } else if (mod && key === "d" && selected) {
        e.preventDefault();
        store.duplicateLayer(selected);
      } else if (key === " " && !mod) {
        e.preventDefault();
        store.togglePlay();
      } else if ((key === "delete" || key === "backspace") && selected) {
        e.preventDefault();
        store.removeLayer(selected);
      } else if (key.startsWith("arrow") && selected && !mod) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        store.translateLayer(selected, dx, dy);
      } else if (key === "escape") {
        store.selectLayer(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
        setAutosaveFailed(false);
      } catch {
        setAutosaveFailed(true);
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [project]);

  return (
    <div className="app">
      <Toolbar />
      {autosaveFailed && (
        <div className="app-banner">
          Autosave failed — the browser's storage is full. Use 💾 Save to keep a copy of your project.
        </div>
      )}
      <div className="app-body">
        <div
          className="preview-area"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            for (const f of Array.from(e.dataTransfer.files)) {
              const err = await importMediaFile(f);
              if (err) alert(err);
            }
          }}
        >
          <PreviewCanvas />
        </div>
        <PropertiesPanel />
      </div>
      <Timeline />
    </div>
  );
}
