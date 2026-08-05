/**
 * @jest-environment node
 */

import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acquireProductionBuildLock,
  PRODUCTION_BUILD_CLEANUP_MARGIN_MS,
  PRODUCTION_BUILD_LOCK_TIMEOUT_MS,
  PRODUCTION_BUILD_TEST_TIMEOUT_MS,
  withProductionBuildLock,
} from "@/tests/support/production-build-lock";
import {
  PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
  PRODUCTION_CHILD_CLOSE_MARGIN_MS,
  PRODUCTION_CHILD_TERMINATION_GRACE_MS,
  PRODUCTION_READINESS_POLL_INTERVAL_MS,
  PRODUCTION_READINESS_REQUEST_TIMEOUT_MS,
  PRODUCTION_REQUEST_TIMEOUT_MS,
  PRODUCTION_SERVER_PROCESS_TIMEOUT_MS,
} from "@/tests/support/production-child-process";

describe("withProductionBuildLock", () => {
  let temporaryDirectory: string;
  let lockPath: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "juddges-build-lock-"));
    lockPath = join(temporaryDirectory, "production-build.lock");
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("budgets lock wait plus a slow production lifecycle", () => {
    const requiredCleanupMarginMs =
      2 * PRODUCTION_CHILD_TERMINATION_GRACE_MS +
      2 * PRODUCTION_CHILD_CLOSE_MARGIN_MS +
      PRODUCTION_READINESS_REQUEST_TIMEOUT_MS +
      PRODUCTION_REQUEST_TIMEOUT_MS +
      PRODUCTION_READINESS_POLL_INTERVAL_MS;

    expect(PRODUCTION_BUILD_LOCK_TIMEOUT_MS).toBeGreaterThanOrEqual(
      PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
    );
    expect(PRODUCTION_BUILD_CLEANUP_MARGIN_MS).toBeGreaterThanOrEqual(
      requiredCleanupMarginMs,
    );
    expect(PRODUCTION_BUILD_TEST_TIMEOUT_MS).toBe(
      PRODUCTION_BUILD_LOCK_TIMEOUT_MS +
        PRODUCTION_BUILD_PROCESS_TIMEOUT_MS +
        PRODUCTION_SERVER_PROCESS_TIMEOUT_MS +
        PRODUCTION_BUILD_CLEANUP_MARGIN_MS,
    );
  });

  it("stores ownership in a unique lease token", async () => {
    const release = await acquireProductionBuildLock({ lockPath });

    await expect(readdir(lockPath)).resolves.toEqual([
      expect.stringMatching(/^lease-[0-9a-f-]+$/),
    ]);

    await release();
  });

  it("serializes contending build operations", async () => {
    let enterFirst: () => void = () => undefined;
    let releaseFirst: () => void = () => undefined;
    const firstEntered = new Promise<void>((resolve) => {
      enterFirst = resolve;
    });
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withProductionBuildLock(
      async () => {
        enterFirst();
        await firstReleased;
        return "first";
      },
      { lockPath, timeoutMs: 1_000, pollIntervalMs: 5 },
    );
    await firstEntered;

    let secondEntered = false;
    let signalFirstLeaseObserved: () => void = () => undefined;
    const firstLeaseObserved = new Promise<void>((resolve) => {
      signalFirstLeaseObserved = resolve;
    });
    const second = withProductionBuildLock(
      async () => {
        secondEntered = true;
        return "second";
      },
      {
        lockPath,
        timeoutMs: 1_000,
        pollIntervalMs: 5,
        testHooks: {
          onFreshLeaseObserved: () => signalFirstLeaseObserved(),
        },
      },
    );

    await firstLeaseObserved;
    expect(secondEntered).toBe(false);

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("times out instead of running a second operation concurrently", async () => {
    let enterFirst: () => void = () => undefined;
    let releaseFirst: () => void = () => undefined;
    const firstEntered = new Promise<void>((resolve) => {
      enterFirst = resolve;
    });
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = withProductionBuildLock(
      async () => {
        enterFirst();
        await firstReleased;
      },
      { lockPath, timeoutMs: 1_000, pollIntervalMs: 5 },
    );
    await firstEntered;

    await expect(
      withProductionBuildLock(async () => undefined, {
        lockPath,
        timeoutMs: 20,
        staleMs: 60_000,
        pollIntervalMs: 5,
      }),
    ).rejects.toThrow("Timed out waiting for production build lock");

    releaseFirst();
    await first;
  });

  it("recovers an abandoned stale lock", async () => {
    const abandonedRelease = await acquireProductionBuildLock({ lockPath });
    const [leaseName] = await readdir(lockPath);
    const staleTimestamp = new Date(Date.now() - 120_000);
    await utimes(
      join(lockPath, leaseName),
      staleTimestamp,
      staleTimestamp,
    );

    await expect(
      withProductionBuildLock(async () => "built", {
        lockPath,
        timeoutMs: 1_000,
        staleMs: 10,
        pollIntervalMs: 5,
      }),
    ).resolves.toBe("built");
    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await abandonedRelease();
  });

  it("atomically recovers an abandoned empty lock directory", async () => {
    await mkdir(lockPath);
    const staleTimestamp = new Date(Date.now() - 120_000);
    await utimes(lockPath, staleTimestamp, staleTimestamp);

    await expect(
      withProductionBuildLock(async () => "built", {
        lockPath,
        timeoutMs: 1_000,
        staleMs: 10,
        pollIntervalMs: 5,
      }),
    ).resolves.toBe("built");
    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not remove a new lease during empty-lock recovery", async () => {
    await mkdir(lockPath);
    const staleTimestamp = new Date(Date.now() - 120_000);
    await utimes(lockPath, staleTimestamp, staleTimestamp);
    const newLeasePath = join(lockPath, "lease-new-owner");
    let hookCalls = 0;

    await expect(
      acquireProductionBuildLock({
        lockPath,
        timeoutMs: 20,
        staleMs: 60_000,
        pollIntervalMs: 5,
        testHooks: {
          onStaleEmptyLockDetected: async () => {
            hookCalls += 1;
            if (hookCalls === 1) {
              await writeFile(newLeasePath, "new owner", { flag: "wx" });
            }
          },
        },
      }),
    ).rejects.toThrow("Timed out waiting for production build lock");

    await expect(readdir(lockPath)).resolves.toEqual(["lease-new-owner"]);
  });

  it("retries acquisition when a stale reclaimer removes its new empty directory", async () => {
    await mkdir(lockPath);
    const staleTimestamp = new Date(Date.now() - 120_000);
    await utimes(lockPath, staleTimestamp, staleTimestamp);

    let signalStaleDetected: () => void = () => undefined;
    const staleDetected = new Promise<void>((resolve) => {
      signalStaleDetected = resolve;
    });
    let resumeStaleReclaimer: () => void = () => undefined;
    const staleReclaimerMayResume = new Promise<void>((resolve) => {
      resumeStaleReclaimer = resolve;
    });
    let signalReplacementRemoved: () => void = () => undefined;
    const replacementRemoved = new Promise<void>((resolve) => {
      signalReplacementRemoved = resolve;
    });
    let resumeAfterReplacementRemoved: () => void = () => undefined;
    const reclaimerMayContinue = new Promise<void>((resolve) => {
      resumeAfterReplacementRemoved = resolve;
    });
    let signalNewDirectoryCreated: () => void = () => undefined;
    const newDirectoryCreated = new Promise<void>((resolve) => {
      signalNewDirectoryCreated = resolve;
    });
    let resumeNewOwnerWrite: () => void = () => undefined;
    const newOwnerMayWrite = new Promise<void>((resolve) => {
      resumeNewOwnerWrite = resolve;
    });
    let signalNewLeaseObserved: () => void = () => undefined;
    const newLeaseObserved = new Promise<void>((resolve) => {
      signalNewLeaseObserved = resolve;
    });

    const staleReclaimer = acquireProductionBuildLock({
      lockPath,
      timeoutMs: 1_000,
      staleMs: 60_000,
      pollIntervalMs: 5,
      testHooks: {
        onStaleEmptyLockDetected: async () => {
          signalStaleDetected();
          await staleReclaimerMayResume;
        },
        onStaleEmptyLockRemoved: async () => {
          signalReplacementRemoved();
          await reclaimerMayContinue;
        },
        onFreshLeaseObserved: () => signalNewLeaseObserved(),
      },
    });

    let newOwner: Promise<() => Promise<void>> | undefined;
    try {
      await staleDetected;
      let directoryHookCalls = 0;
      newOwner = acquireProductionBuildLock({
        lockPath,
        timeoutMs: 1_000,
        staleMs: 60_000,
        pollIntervalMs: 5,
        testHooks: {
          onLockDirectoryCreated: async () => {
            directoryHookCalls += 1;
            if (directoryHookCalls === 1) {
              signalNewDirectoryCreated();
              await newOwnerMayWrite;
            }
          },
        },
      });

      await newDirectoryCreated;

      resumeStaleReclaimer();
      await replacementRemoved;
      resumeNewOwnerWrite();

      const releaseNewOwner = await newOwner;
      const [newLeaseName] = await readdir(lockPath);
      expect(newLeaseName).toMatch(/^lease-[0-9a-f-]+$/);

      resumeAfterReplacementRemoved();
      await newLeaseObserved;
      await expect(readdir(lockPath)).resolves.toEqual([newLeaseName]);

      await releaseNewOwner();
      const releaseReclaimer = await staleReclaimer;
      await releaseReclaimer();
    } finally {
      resumeStaleReclaimer();
      signalReplacementRemoved();
      resumeAfterReplacementRemoved();
      signalNewDirectoryCreated();
      resumeNewOwnerWrite();
      const pending = [staleReclaimer, newOwner].filter(
        (operation): operation is Promise<() => Promise<void>> =>
          operation !== undefined,
      );
      const settled = await Promise.allSettled(pending);
      await Promise.all(
        settled.flatMap((result) =>
          result.status === "fulfilled" ? [result.value()] : [],
        ),
      );
    }
  });

  it("does not remove a newer lease during stale takeover", async () => {
    const firstRelease = await acquireProductionBuildLock({ lockPath });
    const [firstLeaseName] = await readdir(lockPath);
    const staleTimestamp = new Date(Date.now() - 120_000);
    await utimes(
      join(lockPath, firstLeaseName),
      staleTimestamp,
      staleTimestamp,
    );

    let signalStaleLeaseMoved: () => void = () => undefined;
    const staleLeaseMoved = new Promise<void>((resolve) => {
      signalStaleLeaseMoved = resolve;
    });
    let resumeTakeover: () => void = () => undefined;
    const takeoverMayResume = new Promise<void>((resolve) => {
      resumeTakeover = resolve;
    });
    let contenderAcquired = false;
    let signalNewerLeaseObserved: () => void = () => undefined;
    const newerLeaseObserved = new Promise<void>((resolve) => {
      signalNewerLeaseObserved = resolve;
    });
    const contender = acquireProductionBuildLock({
      lockPath,
      timeoutMs: 1_000,
      staleMs: 60_000,
      pollIntervalMs: 5,
      testHooks: {
        onStaleLeaseMoved: async () => {
          signalStaleLeaseMoved();
          await takeoverMayResume;
        },
        onFreshLeaseObserved: () => signalNewerLeaseObserved(),
      },
    }).then((release) => {
      contenderAcquired = true;
      return release;
    });

    await staleLeaseMoved;

    await firstRelease();
    const newerRelease = await acquireProductionBuildLock({ lockPath });
    resumeTakeover();
    await newerLeaseObserved;

    expect(contenderAcquired).toBe(false);
    await expect(readdir(lockPath)).resolves.toEqual([
      expect.stringMatching(/^lease-[0-9a-f-]+$/),
    ]);

    await newerRelease();
    const contenderRelease = await contender;
    await contenderRelease();
  });

  it("times out after repeated ENOENT initialization churn", async () => {
    let now = 0;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    let attempts = 0;

    try {
      const outcome = await acquireProductionBuildLock({
        lockPath,
        timeoutMs: 10,
        staleMs: 60_000,
        pollIntervalMs: 5,
        testHooks: {
          onLockDirectoryCreated: async () => {
            attempts += 1;
            now += 4;
            if (attempts <= 3) {
              await rm(lockPath, { recursive: true, force: true });
            }
          },
        },
      }).then(
        async (release) => {
          await release();
          return "acquired" as const;
        },
        (error: unknown) => {
          expect(error).toEqual(
            new Error(`Timed out waiting for production build lock at ${lockPath}`),
          );
          return "timed-out" as const;
        },
      );

      expect(outcome).toBe("timed-out");
      expect(attempts).toBe(3);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("checks the deadline before retrying after stale-lock recovery", async () => {
    await mkdir(lockPath);
    await utimes(lockPath, new Date(0), new Date(0));
    let now = 120_000;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    let recovered = 0;

    try {
      const outcome = await acquireProductionBuildLock({
        lockPath,
        timeoutMs: 10,
        staleMs: 60_000,
        pollIntervalMs: 5,
        testHooks: {
          onStaleEmptyLockRemoved: () => {
            recovered += 1;
            now += 20;
          },
        },
      }).then(
        async (release) => {
          await release();
          return "acquired" as const;
        },
        (error: unknown) => {
          expect(error).toEqual(
            new Error(`Timed out waiting for production build lock at ${lockPath}`),
          );
          return "timed-out" as const;
        },
      );

      expect(outcome).toBe("timed-out");
      expect(recovered).toBe(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("releases the lock when the build operation fails", async () => {
    await expect(
      withProductionBuildLock(
        async () => {
          throw new Error("build failed");
        },
        { lockPath },
      ),
    ).rejects.toThrow("build failed");

    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
