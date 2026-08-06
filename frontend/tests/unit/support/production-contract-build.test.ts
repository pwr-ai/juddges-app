/**
 * @jest-environment node
 */

jest.mock('node:fs/promises', () => ({
  rm: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { prepareProductionContractBuild } from '../../support/production-contract-build';

const mockRm = jest.mocked(rm);
const mockWriteFile = jest.mocked(writeFile);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const registry = require('../../../jest.production-contracts') as {
  productionContracts: Array<{
    file: string;
    buildDirectory: string;
    tsconfigPath: string;
  }>;
};

const injectedFiles = new Set<string>();

function registerContract(buildDirectory: string, tsconfigPath: string): string {
  const file = `tests/unit/app/injected-${injectedFiles.size}.test.ts`;
  injectedFiles.add(file);
  registry.productionContracts.push({ file, buildDirectory, tsconfigPath });
  return file;
}

describe('production contract build paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    registry.productionContracts.splice(
      0,
      registry.productionContracts.length,
      ...registry.productionContracts.filter(
        (contract) => !injectedFiles.has(contract.file)
      )
    );
    injectedFiles.clear();
  });

  it.each([
    ['dot build directory', '.', 'tsconfig.contract-safe.json'],
    ['parent build directory', '..', 'tsconfig.contract-safe.json'],
    ['absolute build directory', '/tmp/.next-contract-escape', 'tsconfig.contract-safe.json'],
    ['nested build directory', 'nested/.next-contract-escape', 'tsconfig.contract-safe.json'],
    ['backslash build directory', '..\\.next-contract-escape', 'tsconfig.contract-safe.json'],
    ['default build directory', '.next', 'tsconfig.contract-safe.json'],
    ['dot tsconfig', '.next-contract-safe', '.'],
    ['parent tsconfig', '.next-contract-safe', '..'],
    ['absolute tsconfig', '.next-contract-safe', '/tmp/tsconfig.contract-escape.json'],
    ['nested tsconfig', '.next-contract-safe', 'nested/tsconfig.contract-escape.json'],
    ['backslash tsconfig', '.next-contract-safe', '..\\tsconfig.contract-escape.json'],
    ['application tsconfig', '.next-contract-safe', 'tsconfig.json'],
  ])('rejects %s before mutating the filesystem', async (_, buildDirectory, tsconfigPath) => {
    const file = registerContract(buildDirectory, tsconfigPath);

    await expect(prepareProductionContractBuild(file)).rejects.toThrow(
      /unsafe production contract/i
    );
    expect(mockRm).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('resolves valid contract artifacts directly beneath the frontend root', async () => {
    const file = registerContract(
      '.next-contract-safe',
      'tsconfig.contract-safe.json'
    );

    const build = await prepareProductionContractBuild(file);

    expect(build.buildPath).toBe(resolve('.next-contract-safe'));
    expect(build.tsconfigAbsolutePath).toBe(
      resolve('tsconfig.contract-safe.json')
    );
    expect(mockRm).toHaveBeenCalledWith(resolve('.next-contract-safe'), {
      recursive: true,
      force: true,
    });
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });
});
