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
  PRODUCTION_BUILD_LOCK_TIMEOUT_MS,
  PRODUCTION_BUILD_TEST_TIMEOUT_MS,
  withProductionBuildLock,
} from "@/tests/support/production-build-lock";
import {
  PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
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
    expect(PRODUCTION_BUILD_LOCK_TIMEOUT_MS).toBeGreaterThanOrEqual(
      PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
    );
    expect(PRODUCTION_BUILD_TEST_TIMEOUT_MS).toBeGreaterThanOrEqual(
      PRODUCTION_BUILD_LOCK_TIMEOUT_MS +
        PRODUCTION_BUILD_PROCESS_TIMEOUT_MS +
        PRODUCTION_SERVER_PROCESS_TIMEOUT_MS,
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
    const second = withProductionBuildLock(
      async () => {
        secondEntered = true;
        return "second";
      },
      { lockPath, timeoutMs: 1_000, pollIntervalMs: 5 },
    );

    await new Promise((resolve) => setTimeout(resolve, 25));
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
      },
    }).then((release) => {
      contenderAcquired = true;
      return release;
    });

    const firstEvent = await Promise.race([
      staleLeaseMoved.then(() => "stale-moved" as const),
      contender.then(() => "contender-acquired" as const),
    ]);
    if (firstEvent !== "stale-moved") {
      await (await contender)();
      await firstRelease();
      expect(firstEvent).toBe("stale-moved");
      return;
    }

    await firstRelease();
    const newerRelease = await acquireProductionBuildLock({ lockPath });
    resumeTakeover();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(contenderAcquired).toBe(false);
    await expect(readdir(lockPath)).resolves.toEqual([
      expect.stringMatching(/^lease-[0-9a-f-]+$/),
    ]);

    await newerRelease();
    const contenderRelease = await contender;
    await contenderRelease();
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
