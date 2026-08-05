import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";

export type ProductionBuildLockOptions = {
  lockPath?: string;
  timeoutMs?: number;
  staleMs?: number;
  pollIntervalMs?: number;
};

const DEFAULT_TIMEOUT_MS = 170_000;
const DEFAULT_STALE_MS = 5 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const OWNER_FILE = "owner";

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
): Promise<boolean> {
  let lockStats;
  try {
    lockStats = await stat(lockPath);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return true;
    throw error;
  }
  if (Date.now() - lockStats.mtimeMs <= staleMs) return false;

  const stalePath = `${lockPath}.stale-${randomUUID()}`;
  try {
    await rename(lockPath, stalePath);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return true;
    throw error;
  }
  await rm(stalePath, { recursive: true, force: true });
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
  const ownerToken = `${process.pid}:${randomUUID()}`;

  for (;;) {
    try {
      await mkdir(lockPath);
      try {
        await writeFile(resolve(lockPath, OWNER_FILE), ownerToken, {
          encoding: "utf8",
          flag: "wx",
        });
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true });
        throw error;
      }

      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try {
          const currentOwner = await readFile(
            resolve(lockPath, OWNER_FILE),
            "utf8",
          );
          if (currentOwner !== ownerToken) return;
          await rm(lockPath, { recursive: true, force: true });
        } catch (error) {
          if (!hasCode(error, "ENOENT")) throw error;
        }
      };
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }

    if (await removeStaleLock(lockPath, staleMs)) continue;

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
