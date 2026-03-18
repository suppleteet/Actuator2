/**
 * Persist imported mesh blobs in IndexedDB so they survive page refresh.
 * Blob URLs (from URL.createObjectURL) are invalid after reload; we store
 * the underlying File/Blob and recreate a blob URL on restore.
 */

const DB_NAME = "actuator2.mesh-blobs";
const STORE_NAME = "blobs";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Store a mesh blob by id. Overwrites any existing blob for that id.
 */
export function saveMeshBlob(meshId: string, blob: Blob): Promise<void> {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ id: meshId, blob });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  });
}

/**
 * Retrieve a mesh blob by id. Returns null if not found.
 */
export function getMeshBlob(meshId: string): Promise<Blob | null> {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(meshId);
      request.onsuccess = () => {
        db.close();
        const row = request.result as { id: string; blob: Blob } | undefined;
        resolve(row?.blob ?? null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  });
}

/**
 * Remove a mesh blob (e.g. when mesh is removed from scene).
 */
export function removeMeshBlob(meshId: string): Promise<void> {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(meshId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  });
}
