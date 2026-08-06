/**
 * @jest-environment node
 */

import { once } from "node:events";

import {
  runProductionChild,
  spawnProductionChild,
  stopProductionChild,
} from "@/tests/support/production-child-process";

describe("production child process runner", () => {
  async function waitForOutput(
    handle: ReturnType<typeof spawnProductionChild>,
    expected: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (handle.output().includes(expected)) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`Child did not write ${expected}`);
  }

  it("kills and reaps a child that exceeds its timeout", async () => {
    const handle = spawnProductionChild({
      command: process.execPath,
      args: [
        "-e",
        "process.on('SIGTERM', () => undefined); process.stdout.write('ready'); setInterval(() => undefined, 1000)",
      ],
      label: "hung child",
      timeoutMs: 100,
      terminationGraceMs: 20,
    });
    const pid = handle.child.pid;

    await expect(handle.completed).resolves.toMatchObject({
      timedOut: true,
      signal: "SIGKILL",
      exited: true,
      closed: true,
    });
    expect(() => process.kill(pid!, 0)).toThrow();
  });

  it("waits for close after escalating stop to SIGKILL", async () => {
    const handle = spawnProductionChild({
      command: process.execPath,
      args: [
        "-e",
        "process.on('SIGTERM', () => undefined); process.stdout.write('ready'); setInterval(() => undefined, 1000)",
      ],
      label: "stubborn server",
      timeoutMs: 10_000,
      terminationGraceMs: 20,
    });
    const pid = handle.child.pid;
    await waitForOutput(handle, "ready");

    await stopProductionChild(handle);

    await expect(handle.completed).resolves.toMatchObject({
      signal: "SIGKILL",
      exited: true,
      closed: true,
    });
    expect(() => process.kill(pid!, 0)).toThrow();
  });

  const itOnPosix = process.platform === "win32" ? it.skip : it;

  itOnPosix(
    "kills a hanging descendant after its parent exits but keeps stdio open",
    async () => {
      const descendantScript = [
        "process.on('SIGTERM', () => { process.stdout.write('descendant-stopped'); process.exit(0) })",
        "process.send(process.pid)",
        "setInterval(() => undefined, 1000)",
      ].join(";");
      const parentScript = [
        "const { spawn } = require('node:child_process')",
        `const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })`,
        "descendant.once('message', (pid) => { process.stdout.write(`descendant:${pid}`); descendant.disconnect(); process.exit(0) })",
      ].join(";");
      const handle = spawnProductionChild({
        command: process.execPath,
        args: ["-e", parentScript],
        label: "exited parent with hanging descendant",
        timeoutMs: 10_000,
        terminationGraceMs: 20,
      });

      await waitForOutput(handle, "descendant:");
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (handle.child.exitCode !== null && !handle.isClosed()) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(handle.child.exitCode).toBe(0);
      expect(handle.isClosed()).toBe(false);
      const descendantPid = Number(
        handle.output().match(/descendant:(\d+)/)?.[1],
      );
      expect(descendantPid).toBeGreaterThan(0);

      await stopProductionChild(handle);

      await expect(handle.completed).resolves.toMatchObject({
        code: 0,
        signal: null,
        exited: true,
        closed: true,
      });
      expect(handle.output()).toContain("descendant-stopped");
    },
  );

  itOnPosix(
    "bounds close waiting when an escaped descendant inherits stdio",
    async () => {
      const escapedScript = [
        "process.on('SIGTERM', () => undefined)",
        "process.send(process.pid)",
        "setTimeout(() => process.exit(0), 500)",
        "setInterval(() => undefined, 1000)",
      ].join(";");
      const parentScript = [
        "const { spawn } = require('node:child_process')",
        `const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(escapedScript)}], { detached: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })`,
        "descendant.once('message', (pid) => { process.stdout.write(`escaped:${pid}`); descendant.disconnect(); descendant.unref(); process.exit(0) })",
      ].join(";");
      const handle = spawnProductionChild({
        command: process.execPath,
        args: ["-e", parentScript],
        label: "exited parent with escaped descendant",
        timeoutMs: 10_000,
        terminationGraceMs: 20,
        closeMarginMs: 20,
      });

      await waitForOutput(handle, "escaped:");
      if (handle.child.exitCode === null) {
        await once(handle.child, "exit");
      }
      expect(handle.isClosed()).toBe(false);
      const escapedPid = Number(handle.output().match(/escaped:(\d+)/)?.[1]);
      expect(escapedPid).toBeGreaterThan(0);

      try {
        await stopProductionChild(handle);
        await expect(handle.completed).resolves.toMatchObject({
          exited: true,
          closeTimedOut: true,
        });
        expect(handle.child.stdout.destroyed).toBe(true);
        expect(handle.child.stderr.destroyed).toBe(true);
      } finally {
        try {
          process.kill(-escapedPid, "SIGKILL");
        } catch (error) {
          expect(error).toMatchObject({ code: "ESRCH" });
        }
      }
    },
  );

  it("reports output from a failed child after its streams close", async () => {
    const failure = runProductionChild({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write('stdout-sentinel'); process.stderr.write('stderr-sentinel'); process.exit(7)",
      ],
      label: "failing build",
      timeoutMs: 1_000,
    });

    await expect(failure).rejects.toThrow("code: 7");
    await expect(failure).rejects.toThrow("signal: none");
    await expect(failure).rejects.toThrow("spawn error: none");
    await expect(failure).rejects.toThrow("stdout:\nstdout-sentinel");
    await expect(failure).rejects.toThrow("stderr:\nstderr-sentinel");
    await expect(failure).rejects.toThrow(
      "combined output:\nstdout-sentinelstderr-sentinel",
    );
  });

  it("reports complete context when a child fails to spawn", async () => {
    const failure = runProductionChild({
      command: "/definitely-missing-production-child",
      args: [],
      label: "missing build",
      timeoutMs: 1_000,
    });

    await expect(failure).rejects.toThrow(/code: (?:-?\d+|null)/);
    await expect(failure).rejects.toThrow("signal: none");
    await expect(failure).rejects.toThrow(/spawn error: .*ENOENT/);
    await expect(failure).rejects.toThrow("stdout:\n<empty>");
    await expect(failure).rejects.toThrow("stderr:\n<empty>");
    await expect(failure).rejects.toThrow("combined output:\n<empty>");
  });

  itOnPosix("reports signal termination with all captured output", async () => {
    const failure = runProductionChild({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write('signal-stdout'); process.stderr.write('signal-stderr'); process.kill(process.pid, 'SIGTERM')",
      ],
      label: "signaled build",
      timeoutMs: 1_000,
    });

    await expect(failure).rejects.toThrow("code: null");
    await expect(failure).rejects.toThrow("signal: SIGTERM");
    await expect(failure).rejects.toThrow("spawn error: none");
    await expect(failure).rejects.toThrow("stdout:\nsignal-stdout");
    await expect(failure).rejects.toThrow("stderr:\nsignal-stderr");
    await expect(failure).rejects.toThrow(
      "combined output:\nsignal-stdoutsignal-stderr",
    );
  });
});
