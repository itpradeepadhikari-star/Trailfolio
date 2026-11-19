import { useEffect, useState } from 'react';
import { onSnapshotsInSync, waitForPendingWrites } from 'firebase/firestore';
import { db } from './firebase';

const PENDING_STORAGE_KEY = 'trailfolio_pending_sync_ops';

export type CloudSyncPhase = 'online' | 'offline' | 'syncing' | 'synced';

export interface SyncSnapshotState {
  isOnline: boolean;
  pendingOps: number;
  hasPendingSnapshotWrites: boolean;
  phase: CloudSyncPhase;
  lastError: string | null;
}

let pendingOpsCount = (() => {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
})();

let snapshotPendingWrites = false;
let recentlySynced = false;
let lastSyncError: string | null = null;
let syncedResetTimer: number | null = null;
const listeners = new Set<() => void>();

function persistPendingOps(count: number) {
  pendingOpsCount = Math.max(0, count);
  try {
    localStorage.setItem(PENDING_STORAGE_KEY, String(pendingOpsCount));
  } catch {
    // Ignore storage quota errors
  }
}

function getIsOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function computePhase(isOnline: boolean): CloudSyncPhase {
  if (!isOnline) return 'offline';
  if (pendingOpsCount > 0 || snapshotPendingWrites) return 'syncing';
  if (recentlySynced) return 'synced';
  return 'online';
}

function getState(): SyncSnapshotState {
  const isOnline = getIsOnline();
  return {
    isOnline,
    pendingOps: pendingOpsCount,
    hasPendingSnapshotWrites: snapshotPendingWrites,
    phase: computePhase(isOnline),
    lastError: lastSyncError,
  };
}

function emit() {
  listeners.forEach((fn) => fn());
}

function markSyncedRecently() {
  recentlySynced = true;
  if (syncedResetTimer !== null) {
    window.clearTimeout(syncedResetTimer);
  }
  syncedResetTimer = window.setTimeout(() => {
    recentlySynced = false;
    emit();
  }, 4500);
}

export function setSnapshotPendingWrites(hasPending: boolean) {
  const prev = snapshotPendingWrites;
  snapshotPendingWrites = hasPending;
  if (prev && !hasPending && pendingOpsCount === 0 && getIsOnline()) {
    markSyncedRecently();
  }
  emit();
}

export function clearSyncError() {
  lastSyncError = null;
  emit();
}

/**
 * Waits briefly for Firestore to commit to the server when online.
 * If the user is offline or on a dead mountain connection, resolves immediately
 * once queued in Firestore's persistent IndexedDB cache and tracks sync until
 * connectivity returns.
 */
export async function commitWithOfflineQueue(
  commitPromise: Promise<unknown>,
  onFatalError?: (err: unknown) => never
): Promise<{ syncedImmediately: boolean }> {
  persistPendingOps(pendingOpsCount + 1);
  lastSyncError = null;
  emit();

  let settled = false;

  const tracked = commitPromise
    .then(() => {
      settled = true;
      persistPendingOps(pendingOpsCount - 1);
      if (pendingOpsCount === 0 && !snapshotPendingWrites && getIsOnline()) {
        markSyncedRecently();
      }
      emit();
      return { syncedImmediately: true };
    })
    .catch((err) => {
      settled = true;
      persistPendingOps(pendingOpsCount - 1);
      lastSyncError = err instanceof Error ? err.message : String(err);
      emit();
      if (onFatalError) {
        onFatalError(err);
      }
      throw err;
    });

  // If device already reports offline, let Firestore queue locally in IndexedDB
  // and return immediately so the UI remains snappy.
  if (!getIsOnline()) {
    void tracked.catch(() => {
      // Handled by lastSyncError / listener when back online
    });
    return { syncedImmediately: false };
  }

  // Race against a short network timeout (1.5s) in case the phone shows signal
  // bars in a valley but packets cannot reach Firestore.
  return await Promise.race([
    tracked,
    new Promise<{ syncedImmediately: boolean }>((resolve) => {
      window.setTimeout(() => {
        if (!settled) {
          resolve({ syncedImmediately: false });
        }
      }, 1500);
    }),
  ]);
}

let bridgeInitialized = false;

export function initOfflineSyncBridge() {
  if (bridgeInitialized || typeof window === 'undefined') return;
  bridgeInitialized = true;

  const flushPending = () => {
    emit();
    if (!getIsOnline()) return;

    void waitForPendingWrites(db)
      .then(() => {
        const hadPending = pendingOpsCount > 0 || snapshotPendingWrites;
        persistPendingOps(0);
        snapshotPendingWrites = false;
        if (hadPending) {
          markSyncedRecently();
        }
        emit();
      })
      .catch(() => {
        // Will retry automatically on next online event or snapshot sync
      });
  };

  window.addEventListener('online', flushPending);
  window.addEventListener('offline', () => emit());

  onSnapshotsInSync(db, () => {
    if (getIsOnline() && !snapshotPendingWrites && pendingOpsCount > 0) {
      persistPendingOps(0);
      markSyncedRecently();
      emit();
    }
  });

  if (getIsOnline() && pendingOpsCount > 0) {
    flushPending();
  }
}

export function useSyncStatus(): SyncSnapshotState {
  const [state, setState] = useState<SyncSnapshotState>(() => getState());

  useEffect(() => {
    initOfflineSyncBridge();
    const update = () => setState(getState());
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  return state;
}
