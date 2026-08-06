import { rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const registry = require("../../jest.production-contracts") as {
  productionContracts: ProductionContractDefinition[];
};

type ProductionContractDefinition = {
  file: string;
  buildDirectory: string;
  tsconfigPath: string;
};

export type ProductionContractBuild = ProductionContractDefinition & {
  buildPath: string;
  tsconfigAbsolutePath: string;
  environment: {
    NEXT_BUILD_DIR: string;
    NEXT_TSCONFIG_PATH: string;
  };
};

const BUILD_DIRECTORY_PATTERN = /^\.next-contract-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TSCONFIG_PATH_PATTERN =
  /^tsconfig\.contract-[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

function validateArtifactBasename(
  value: string,
  pattern: RegExp,
  field: "buildDirectory" | "tsconfigPath",
): void {
  if (
    isAbsolute(value) ||
    value.includes("/") ||
    value.includes("\\") ||
    basename(value) !== value ||
    !pattern.test(value)
  ) {
    throw new Error(`Unsafe production contract ${field}: ${value}`);
  }
}

function resolveContractArtifactPaths(contract: ProductionContractDefinition): {
  buildPath: string;
  tsconfigAbsolutePath: string;
} {
  validateArtifactBasename(
    contract.buildDirectory,
    BUILD_DIRECTORY_PATTERN,
    "buildDirectory",
  );
  validateArtifactBasename(
    contract.tsconfigPath,
    TSCONFIG_PATH_PATTERN,
    "tsconfigPath",
  );

  const frontendRoot = resolve();
  const buildPath = resolve(frontendRoot, contract.buildDirectory);
  const tsconfigAbsolutePath = resolve(frontendRoot, contract.tsconfigPath);
  if (
    dirname(buildPath) !== frontendRoot ||
    dirname(tsconfigAbsolutePath) !== frontendRoot
  ) {
    throw new Error(`Unsafe production contract artifact path: ${contract.file}`);
  }
  return { buildPath, tsconfigAbsolutePath };
}

function registeredContract(contractFile: string): ProductionContractDefinition {
  const contract = registry.productionContracts.find(
    (candidate) => candidate.file === contractFile,
  );
  if (!contract) {
    throw new Error(`Unregistered production contract: ${contractFile}`);
  }
  return contract;
}

export function resolveStandaloneRuntimeBuildPath(
  buildPath: string,
  buildDirectory: string,
): string {
  return resolve(buildPath, "standalone/frontend", buildDirectory);
}

export async function prepareProductionContractBuild(
  contractFile: string,
): Promise<ProductionContractBuild> {
  const contract = registeredContract(contractFile);

  const { buildPath, tsconfigAbsolutePath } =
    resolveContractArtifactPaths(contract);
  await rm(buildPath, { recursive: true, force: true });
  await writeFile(
    tsconfigAbsolutePath,
    JSON.stringify(
      {
        extends: "./tsconfig.json",
        include: [
          "next-env.d.ts",
          "**/*.ts",
          "**/*.tsx",
          `${contract.buildDirectory}/types/**/*.ts`,
        ],
        exclude: ["node_modules"],
      },
      null,
      2,
    ),
  );

  return {
    ...contract,
    buildPath,
    tsconfigAbsolutePath,
    environment: {
      NEXT_BUILD_DIR: contract.buildDirectory,
      NEXT_TSCONFIG_PATH: contract.tsconfigPath,
    },
  };
}

export async function cleanupProductionContractBuild(
  build: ProductionContractBuild | undefined,
): Promise<void> {
  if (!build) return;
  const contract = registeredContract(build.file);
  const expected = resolveContractArtifactPaths(contract);
  if (
    build.buildDirectory !== contract.buildDirectory ||
    build.tsconfigPath !== contract.tsconfigPath ||
    build.buildPath !== expected.buildPath ||
    build.tsconfigAbsolutePath !== expected.tsconfigAbsolutePath
  ) {
    throw new Error(`Unsafe production contract cleanup: ${build.file}`);
  }
  await rm(expected.buildPath, { recursive: true, force: true });
  await rm(expected.tsconfigAbsolutePath, { force: true });
}
