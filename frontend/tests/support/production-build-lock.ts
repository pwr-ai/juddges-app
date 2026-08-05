import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";

export type ProductionBuildLockOptions = {
  lockPath?: string;
  timeoutMs?: number;
  staleMs?: number;
  pollIntervalMs?: number;
  testHooks?: {
    onStaleLeaseMoved?: () => void | Promise<void>;
    onStaleEmptyLockDetected?: () => void | Promise<void>;
  };
};

// Covers waiting for another production lifecycle plus a slow CI build/run.
export const PRODUCTION_BUILD_TEST_TIMEOUT_MS = 12 * 60_000;
export const PRODUCTION_BUILD_LOCK_TIMEOUT_MS = 4 * 60_000;

const DEFAULT_TIMEOUT_MS = PRODUCTION_BUILD_LOCK_TIMEOUT_MS;
const DEFAULT_STALE_MS = PRODUCTION_BUILD_TEST_TIMEOUT_MS + 60_000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const LEASE_PREFIX = "lease-";

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function removeStaleLock(
  lockPath: string,
  staleMs: number,
  onStaleLeaseMoved?: () => void | Promise<void>,
  onStaleEmptyLockDetected?: () => void | Promise<void>,
): Promise<boolean> {
  let leaseName: string | undefined;
  try {
    const entries = await readdir(lockPath);
    const leaseNames = entries.filter((entry) =>
      entry.startsWith(LEASE_PREFIX),
    );
    if (entries.length === 0) {
      let lockStats;
      try {
        lockStats = await stat(lockPath);
      } catch (error) {
        if (hasCode(error, "ENOENT")) return true;
        throw error;
      }
      if (Date.now() - lockStats.mtimeMs <= staleMs) return false;

      await onStaleEmptyLockDetected?.();
      try {
        // `rmdir` is the atomic check-and-remove operation: it cannot remove
        // the directory if a delayed owner has installed a lease meanwhile.
        await rmdir(lockPath);
        return true;
      } catch (error) {
        if (hasCode(error, "ENOENT")) return true;
        if (hasCode(error, "ENOTEMPTY") || hasCode(error, "EEXIST")) {
          return false;
        }
        throw error;
      }
    }
    if (leaseNames.length !== 1) return false;
    [leaseName] = leaseNames;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return true;
    throw error;
  }
  const leasePath = resolve(lockPath, leaseName);
  let leaseStats;
  try {
    leaseStats = await stat(leasePath);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return true;
    throw error;
  }
  if (Date.now() - leaseStats.mtimeMs <= staleMs) return false;

  const stalePath = `${lockPath}.${leaseName}.stale-${randomUUID()}`;
  try {
    // Moving the exact lease token proves which owner is being reclaimed.
    await rename(leasePath, stalePath);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return true;
    throw error;
  }
  await onStaleLeaseMoved?.();
  try {
    await rmdir(lockPath);
  } catch (error) {
    if (
      !hasCode(error, "ENOENT") &&
      !hasCode(error, "ENOTEMPTY") &&
      !hasCode(error, "EEXIST")
    ) {
      throw error;
    }
  } finally {
    await rm(stalePath, { force: true });
  }
  return true;
}

export async function acquireProductionBuildLock(
  options: ProductionBuildLockOptions = {},
): Promise<() => Promise<void>> {
  const lockPath = options.lockPath ?? resolve(".next-production-build.lock");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const startedAt = Date.now();
  const ownerToken = randomUUID();
  const leaseName = `${LEASE_PREFIX}${ownerToken}`;
  const leasePath = resolve(lockPath, leaseName);

  for (;;) {
    try {
      await mkdir(lockPath);
      try {
        await writeFile(leasePath, `${process.pid}:${ownerToken}`, {
          encoding: "utf8",
          flag: "wx",
        });
      } catch (error) {
        try {
          await rmdir(lockPath);
        } catch {
          // Preserve any lease that appeared while initialization failed.
        }
        throw error;
      }

      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try {
          // Removing only this owner's unique token cannot delete a newer lease.
          await rm(leasePath, { force: true });
          await rmdir(lockPath);
        } catch (error) {
          if (
            !hasCode(error, "ENOENT") &&
            !hasCode(error, "ENOTEMPTY") &&
            !hasCode(error, "EEXIST")
          ) {
            throw error;
          }
        }
      };
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }

    if (
      await removeStaleLock(
        lockPath,
        staleMs,
        options.testHooks?.onStaleLeaseMoved,
        options.testHooks?.onStaleEmptyLockDetected,
      )
    ) {
      continue;
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      throw new Error(
        `Timed out waiting for production build lock at ${lockPath}`,
      );
    }
    await new Promise((resolveDelay) =>
      setTimeout(
        resolveDelay,
        Math.min(pollIntervalMs, timeoutMs - elapsedMs),
      ),
    );
  }
}

export async function withProductionBuildLock<T>(
  operation: () => T | Promise<T>,
  options: ProductionBuildLockOptions = {},
): Promise<T> {
  const release = await acquireProductionBuildLock(options);
  try {
    return await operation();
  } finally {
    await release();
  }
}
