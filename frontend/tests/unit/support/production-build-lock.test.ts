/**
 * @jest-environment node
 */

import { access, mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withProductionBuildLock } from "@/tests/support/production-build-lock";

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
    await mkdir(lockPath);
    const staleTimestamp = new Date(Date.now() - 60_000);
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
