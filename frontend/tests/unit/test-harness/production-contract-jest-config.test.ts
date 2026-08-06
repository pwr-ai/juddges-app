/**
 * @jest-environment node
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

describe("production contract Jest selection", () => {
  it("discovers an explicitly selected production contract in the base config", () => {
    const contractFile =
      "tests/unit/app/extractions/http-status-contract.test.ts";
    const result = spawnSync(
      process.execPath,
      [
        resolve("node_modules/jest/bin/jest.js"),
        "--runTestsByPath",
        contractFile,
        "--listTests",
        "--runInBand",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe(resolve(contractFile));
  });
});
