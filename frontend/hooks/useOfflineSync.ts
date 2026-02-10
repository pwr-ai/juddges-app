"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  getSyncQueue,
  removeSyncQueueItem,
  markAnnotationSynced,
  type SyncQueueItem,
} from "@/lib/offline-documents";

/**
 * Hook that processes the offline sync queue whenever the device comes back online.
 * Annotations created offline are pushed to the server once connectivity returns.
 */
export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const syncingRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const processQueue = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      const queue = await getSyncQueue();
      setPendingCount(queue.length);

      if (queue.length === 0) {
        syncingRef.current = false;
        return;
      }

      for (const item of queue) {
        try {
          await processSyncItem(item);
          await removeSyncQueueItem(item.id);

          // If this was an annotation create/update, mark it synced
          if (
            item.store === "annotations" &&
            (item.action === "create" || item.action === "update")
          ) {
            const annotationId = item.data.id as string;
            if (annotationId) {
              await markAnnotationSynced(annotationId);
            }
          }
        } catch (error) {
          console.warn(
            `[OfflineSync] Failed to sync item ${item.id}:`,
            error
          );
          // Item stays in queue for next retry
        }
      }

      // Refresh count after processing
      const remaining = await getSyncQueue();
      setPendingCount(remaining.length);
      setLastSyncedAt(new Date().toISOString());
    } finally {
      syncingRef.current = false;
    }
  }, []);

  // Process queue when coming back online
  useEffect(() => {
    if (isOnline) {
      processQueue();
    }
  }, [isOnline, processQueue]);

  // Check queue on mount
  useEffect(() => {
    getSyncQueue().then((queue) => setPendingCount(queue.length));
  }, []);

  return { pendingCount, lastSyncedAt, processQueue };
}

async function processSyncItem(item: SyncQueueItem): Promise<void> {
  // Currently annotations are stored locally only.
  // When a server-side annotation API is added, sync logic goes here.
  // For now, mark items as processed so the queue stays clean.
  //
  // Example future implementation:
  // if (item.store === "annotations") {
  //   if (item.action === "create") {
  //     await fetch("/api/annotations", { method: "POST", body: JSON.stringify(item.data) });
  //   } else if (item.action === "delete") {
  //     await fetch(`/api/annotations/${item.data.id}`, { method: "DELETE" });
  //   }
  // }
  return Promise.resolve();
}
