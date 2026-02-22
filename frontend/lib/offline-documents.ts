const DB_NAME = "juddges-offline";
const DB_VERSION = 2;
const STORE_NAME = "documents";
const ANNOTATIONS_STORE = "annotations";
const SYNC_QUEUE_STORE = "sync-queue";

export interface OfflineDocument {
  id: string;
  title: string | null;
  documentType: string | null;
  fullText: string | null;
  htmlContent?: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  savedAt: string;
}

export interface OfflineAnnotation {
  id: string;
  documentId: string;
  text: string;
  selectedText?: string | null;
  startOffset?: number;
  endOffset?: number;
  color: string;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
}

export interface SyncQueueItem {
  id: string;
  action: "create" | "update" | "delete";
  store: "annotations";
  data: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      // v1: documents store
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      }

      // v2: annotations + sync queue
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(ANNOTATIONS_STORE)) {
          const annotationStore = db.createObjectStore(ANNOTATIONS_STORE, {
            keyPath: "id",
          });
          annotationStore.createIndex("documentId", "documentId", {
            unique: false,
          });
          annotationStore.createIndex("synced", "synced", { unique: false });
        }
        if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
          const syncStore = db.createObjectStore(SYNC_QUEUE_STORE, {
            keyPath: "id",
          });
          syncStore.createIndex("createdAt", "createdAt", { unique: false });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Document Operations ─────────────────────────

export async function saveDocumentOffline(
  doc: OfflineDocument
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(doc);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineDocument(
  id: string
): Promise<OfflineDocument | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineDocuments(): Promise<OfflineDocument[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeOfflineDocument(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function isDocumentSavedOffline(id: string): Promise<boolean> {
  const doc = await getOfflineDocument(id);
  return doc !== undefined;
}

// ─── Annotation Operations ───────────────────────

export async function saveAnnotation(
  annotation: OfflineAnnotation
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANNOTATIONS_STORE, "readwrite");
    tx.objectStore(ANNOTATIONS_STORE).put(annotation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAnnotationsForDocument(
  documentId: string
): Promise<OfflineAnnotation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANNOTATIONS_STORE, "readonly");
    const index = tx.objectStore(ANNOTATIONS_STORE).index("documentId");
    const request = index.getAll(documentId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeAnnotation(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANNOTATIONS_STORE, "readwrite");
    tx.objectStore(ANNOTATIONS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getUnsyncedAnnotations(): Promise<OfflineAnnotation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANNOTATIONS_STORE, "readonly");
    const store = tx.objectStore(ANNOTATIONS_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      resolve(request.result.filter((a: OfflineAnnotation) => !a.synced));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function markAnnotationSynced(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANNOTATIONS_STORE, "readwrite");
    const store = tx.objectStore(ANNOTATIONS_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const annotation = getReq.result;
      if (annotation) {
        annotation.synced = true;
        store.put(annotation);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Sync Queue Operations ───────────────────────

export async function addToSyncQueue(
  item: Omit<SyncQueueItem, "id" | "createdAt" | "retryCount">
): Promise<void> {
  const db = await openDB();
  const queueItem: SyncQueueItem = {
    ...item,
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    tx.objectStore(SYNC_QUEUE_STORE).put(queueItem);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readonly");
    const request = tx.objectStore(SYNC_QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    tx.objectStore(SYNC_QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearSyncQueue(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    tx.objectStore(SYNC_QUEUE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
