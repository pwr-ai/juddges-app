import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";

export const PRODUCTION_BUILD_PROCESS_TIMEOUT_MS = 4 * 60_000;
export const PRODUCTION_SERVER_PROCESS_TIMEOUT_MS = 4 * 60_000;
export const PRODUCTION_CHILD_TERMINATION_GRACE_MS = 5_000;
export const PRODUCTION_CHILD_CLOSE_MARGIN_MS = 5_000;
export const PRODUCTION_READINESS_REQUEST_TIMEOUT_MS = 5_000;
export const PRODUCTION_READINESS_POLL_INTERVAL_MS = 250;
export const PRODUCTION_REQUEST_TIMEOUT_MS = 30_000;

export type ProductionChildResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  timedOut: boolean;
  exited: boolean;
  closed: boolean;
  closeTimedOut: boolean;
  spawnError?: Error;
};

export type ProductionChild = {
  child: ChildProcessWithoutNullStreams;
  completed: Promise<ProductionChildResult>;
  output: () => string;
  label: string;
  timeoutMs: number;
  terminationGraceMs: number;
  closeMarginMs: number;
  stopPromise?: Promise<void>;
  isClosed: () => boolean;
  detached: boolean;
  forceCloseAfterTimeout: () => void;
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
  closeMarginMs?: number;
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
  waitMs: number,
): Promise<boolean> {
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      handle.completed.then(() => true),
      new Promise<false>((resolve) => {
        graceTimer = setTimeout(
          () => resolve(false),
          waitMs,
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
      if (
        !(await waitForCompletionOrGrace(handle, handle.terminationGraceMs)) &&
        !handle.isClosed()
      ) {
        signalChild(handle, "SIGKILL");
      }
    }
    if (
      !handle.isClosed() &&
      !(await waitForCompletionOrGrace(handle, handle.closeMarginMs))
    ) {
      handle.forceCloseAfterTimeout();
    }
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
  let closeTimedOut = false;
  let completedResult = false;
  let resolveCompleted: (result: ProductionChildResult) => void = () => undefined;

  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });

  const finish = (didClose: boolean): void => {
    if (completedResult) return;
    completedResult = true;
    clearTimeout(timeoutTimer);
    resolveCompleted({
      code: exitCode,
      signal: exitSignal,
      output,
      timedOut,
      exited,
      closed: didClose,
      closeTimedOut,
      spawnError,
    });
  };

  const completed = new Promise<ProductionChildResult>((resolve) => {
    resolveCompleted = resolve;
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
      exitCode ??= code;
      exitSignal ??= signal;
      finish(true);
    });
  });

  const handle: ProductionChild = {
    child,
    completed,
    output: () => output,
    label: options.label,
    timeoutMs: options.timeoutMs,
    terminationGraceMs:
      options.terminationGraceMs ?? PRODUCTION_CHILD_TERMINATION_GRACE_MS,
    closeMarginMs: options.closeMarginMs ?? PRODUCTION_CHILD_CLOSE_MARGIN_MS,
    isClosed: () => closed,
    detached,
    forceCloseAfterTimeout: () => {
      if (completedResult) return;
      closeTimedOut = true;
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      for (const stream of [child.stdin, child.stdout, child.stderr]) {
        const unref = (stream as typeof stream & { unref?: () => void }).unref;
        unref?.call(stream);
      }
      child.unref();
      finish(false);
    },
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
