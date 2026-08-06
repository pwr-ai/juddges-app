import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

export function resolveStandaloneRuntimeBuildPath(
  buildPath: string,
  buildDirectory: string,
): string {
  return resolve(buildPath, "standalone/frontend", buildDirectory);
}

export async function prepareProductionContractBuild(
  contractFile: string,
): Promise<ProductionContractBuild> {
  const contract = registry.productionContracts.find(
    (candidate) => candidate.file === contractFile,
  );
  if (!contract) {
    throw new Error(`Unregistered production contract: ${contractFile}`);
  }

  const buildPath = resolve(contract.buildDirectory);
  const tsconfigAbsolutePath = resolve(contract.tsconfigPath);
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
  await rm(build.buildPath, { recursive: true, force: true });
  await rm(build.tsconfigAbsolutePath, { force: true });
}
