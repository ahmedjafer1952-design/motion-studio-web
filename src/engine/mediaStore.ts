import { getSoundUrl, type SoundId } from "./sounds";
import { makeId } from "../utils/id";

// Layers reference media by a stable string instead of a raw object URL, because
// object URLs die on every page reload (which left autosaved projects black):
//   "idb:<id>"    → a user-imported file persisted in IndexedDB
//   "sound:<id>"  → a synthesized library sound, regenerated on demand
// Plain URLs (data:, blob:, http:) pass through unchanged.

const DB_NAME = "motion-studio-media";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(id: string, blob: Blob): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

function idbGet(id: string): Promise<Blob | null> {
  return openDb().then(
    (db) =>
      new Promise<Blob | null>((resolve, reject) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
        req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
        req.onerror = () => reject(req.error);
      })
  );
}

const resolved = new Map<string, Promise<string | null>>();

/**
 * Persists an imported file and returns a stable reference for the layer's `src`.
 * Falls back to a session-only object URL if storage is unavailable (e.g. quota).
 */
export async function storeMediaFile(file: File): Promise<{ src: string; persisted: boolean }> {
  const objectUrl = URL.createObjectURL(file);
  const ref = `idb:${makeId("media")}`;
  try {
    await idbPut(ref.slice(4), file);
    resolved.set(ref, Promise.resolve(objectUrl));
    return { src: ref, persisted: true };
  } catch {
    return { src: objectUrl, persisted: false };
  }
}

/** Turns a layer `src` into a playable URL, or null if the media can no longer be found. */
export function resolveMediaUrl(src: string): Promise<string | null> {
  if (!src.startsWith("idb:") && !src.startsWith("sound:")) return Promise.resolve(src || null);
  let p = resolved.get(src);
  if (!p) {
    p = src.startsWith("sound:")
      ? getSoundUrl(src.slice(6) as SoundId)
      : idbGet(src.slice(4))
          .then((blob) => (blob ? URL.createObjectURL(blob) : null))
          .catch(() => null);
    resolved.set(src, p);
  }
  return p;
}
