import { useEffect, useRef } from "react";
import { Toolbar } from "./components/Toolbar";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { Timeline } from "./components/Timeline/Timeline";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { useEditorStore } from "./state/store";
import type { Project } from "./types";

const AUTOSAVE_KEY = "motion-studio-autosave";

export default function App() {
  const project = useEditorStore((s) => s.project);
  const loadProject = useEditorStore((s) => s.loadProject);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Project;
        loadProject(parsed);
      }
    } catch {
      // ignore corrupt autosave
    }
  }, [loadProject]);

  useEffect(() => {
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
      } catch {
        // ignore quota errors
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [project]);

  return (
    <div className="app">
      <Toolbar />
      <div className="app-body">
        <div className="preview-area">
          <PreviewCanvas />
        </div>
        <PropertiesPanel />
      </div>
      <Timeline />
    </div>
  );
}
