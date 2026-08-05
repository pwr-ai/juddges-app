import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";

export const PRODUCTION_BUILD_PROCESS_TIMEOUT_MS = 4 * 60_000;
export const PRODUCTION_SERVER_PROCESS_TIMEOUT_MS = 4 * 60_000;
export const PRODUCTION_READINESS_REQUEST_TIMEOUT_MS = 5_000;
export const PRODUCTION_REQUEST_TIMEOUT_MS = 30_000;

export type ProductionChildResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  timedOut: boolean;
  exited: boolean;
  closed: true;
  spawnError?: Error;
};

export type ProductionChild = {
  child: ChildProcessWithoutNullStreams;
  completed: Promise<ProductionChildResult>;
  output: () => string;
  label: string;
  timeoutMs: number;
  terminationGraceMs: number;
  stopPromise?: Promise<void>;
  isClosed: () => boolean;
  detached: boolean;
};

export type SpawnProductionChildOptions = Omit<
  SpawnOptionsWithoutStdio,
  "stdio" | "detached"
> & {
  command: string;
  args: string[];
  label: string;
  timeoutMs: number;
  terminationGraceMs?: number;
};

function signalChild(handle: ProductionChild, signal: NodeJS.Signals): void {
  const pid = handle.child.pid;
  if (handle.detached && pid) {
    try {
      process.kill(-pid, signal);
      return;
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "ESRCH"
      ) {
        throw error;
      }
    }
  }
  handle.child.kill(signal);
}

async function waitForCompletionOrGrace(
  handle: ProductionChild,
): Promise<boolean> {
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      handle.completed.then(() => true),
      new Promise<false>((resolve) => {
        graceTimer = setTimeout(
          () => resolve(false),
          handle.terminationGraceMs,
        );
        graceTimer.unref();
      }),
    ]);
  } finally {
    if (graceTimer) clearTimeout(graceTimer);
  }
}

export async function stopProductionChild(
  handle: ProductionChild | undefined,
): Promise<void> {
  if (!handle) return;
  if (handle.stopPromise) return handle.stopPromise;

  handle.stopPromise = (async () => {
    if (!handle.isClosed()) {
      // A parent can exit while one of its descendants keeps the inherited
      // stdio pipes open. Signal the detached process group until `close`, not
      // merely until the direct child reports `exit`.
      signalChild(handle, "SIGTERM");
      if (!(await waitForCompletionOrGrace(handle)) && !handle.isClosed()) {
        signalChild(handle, "SIGKILL");
      }
    }
    // `close` follows `exit` after all stdio descriptors have closed.
    await handle.completed;
  })();
  return handle.stopPromise;
}

export function spawnProductionChild(
  options: SpawnProductionChildOptions,
): ProductionChild {
  const detached = process.platform !== "win32";
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    shell: options.shell,
    windowsHide: options.windowsHide,
    detached,
    stdio: "pipe",
  });
  let output = "";
  let spawnError: Error | undefined;
  let exited = false;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let timedOut = false;
  let closed = false;

  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });

  const completed = new Promise<ProductionChildResult>((resolve) => {
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("exit", (code, signal) => {
      exited = true;
      exitCode = code;
      exitSignal = signal;
    });
    child.once("close", (code, signal) => {
      closed = true;
      clearTimeout(timeoutTimer);
      resolve({
        code: exitCode ?? code,
        signal: exitSignal ?? signal,
        output,
        timedOut,
        exited,
        closed: true,
        spawnError,
      });
    });
  });

  const handle: ProductionChild = {
    child,
    completed,
    output: () => output,
    label: options.label,
    timeoutMs: options.timeoutMs,
    terminationGraceMs: options.terminationGraceMs ?? 5_000,
    isClosed: () => closed,
    detached,
  };
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    void stopProductionChild(handle);
  }, options.timeoutMs);
  timeoutTimer.unref();
  return handle;
}

export async function runProductionChild(
  options: SpawnProductionChildOptions,
): Promise<string> {
  const handle = spawnProductionChild(options);
  const result = await handle.completed;
  if (result.spawnError) {
    throw new Error(
      `${handle.label} failed to spawn: ${result.spawnError.message}`,
    );
  }
  if (result.timedOut) {
    throw new Error(
      `${handle.label} timed out after ${handle.timeoutMs}ms:\n${result.output}`,
    );
  }
  if (result.code !== 0) {
    throw new Error(
      `${handle.label} exited with code ${String(result.code)}:\n${result.output}`,
    );
  }
  return result.output;
}
