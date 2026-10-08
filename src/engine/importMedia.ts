import { useEditorStore } from "../state/store";
import { storeMediaFile } from "./mediaStore";

/** Reads a media file's duration (and video dimensions) — null if the browser can't decode it. */
export function probeMedia(file: File, kind: "video" | "audio"): Promise<{ duration: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind);
    el.preload = "metadata";
    const done = (result: { duration: number; width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement;
      done({ duration: Number.isFinite(el.duration) ? el.duration : 0, width: v.videoWidth || 0, height: v.videoHeight || 0 });
    };
    el.onerror = () => done(null);
    el.src = url;
  });
}

/** One-step import: creates a video/audio layer for the file and attaches it. Returns an error message, or null. */
export async function importMediaFile(file: File): Promise<string | null> {
  const kind = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") || !file.type ? "video" : null;
  if (!kind) return `"${file.name}" isn't a video or audio file.`;
  const meta = await probeMedia(file, kind);
  if (!meta) return `This browser can't play "${file.name}". Try an mp4 (H.264) or webm — or open the site in Chrome.`;
  const { src } = await storeMediaFile(file);
  const store = useEditorStore.getState();
  store.addLayer(kind);
  const layerId = useEditorStore.getState().selectedLayerId;
  if (!layerId) return "Couldn't add the layer.";
  const media = { src, fileName: file.name, naturalDuration: meta.duration };
  if (kind === "video") store.attachVideo(layerId, { ...media, videoWidth: meta.width, videoHeight: meta.height });
  else store.attachAudio(layerId, media);
  return null;
}
