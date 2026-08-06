/**
 * @jest-environment node
 */

jest.mock('node:fs/promises', () => ({
  rm: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  cleanupProductionContractBuild,
  prepareProductionContractBuild,
} from '../../support/production-contract-build';

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

  it('revalidates and removes only the exact registered cleanup artifacts', async () => {
    const file = registerContract(
      '.next-contract-cleanup',
      'tsconfig.contract-cleanup.json'
    );
    const build = await prepareProductionContractBuild(file);
    jest.clearAllMocks();

    await cleanupProductionContractBuild(build);

    expect(mockRm).toHaveBeenNthCalledWith(1, resolve('.next-contract-cleanup'), {
      recursive: true,
      force: true,
    });
    expect(mockRm).toHaveBeenNthCalledWith(
      2,
      resolve('tsconfig.contract-cleanup.json'),
      { force: true }
    );
  });

  it('rejects an unsafe caller-controlled cleanup path before deletion', async () => {
    const file = registerContract(
      '.next-contract-cleanup',
      'tsconfig.contract-cleanup.json'
    );
    const build = await prepareProductionContractBuild(file);
    jest.clearAllMocks();

    await expect(
      cleanupProductionContractBuild({
        ...build,
        buildPath: resolve('/tmp/caller-controlled-contract-build'),
      })
    ).rejects.toThrow(/unsafe production contract cleanup/i);
    expect(mockRm).not.toHaveBeenCalled();
  });

  it('rejects safe-looking cleanup paths changed after prepare', async () => {
    const file = registerContract(
      '.next-contract-cleanup',
      'tsconfig.contract-cleanup.json'
    );
    const build = await prepareProductionContractBuild(file);
    jest.clearAllMocks();

    await expect(
      cleanupProductionContractBuild({
        ...build,
        buildPath: resolve('.next-contract-different'),
      })
    ).rejects.toThrow(/unsafe production contract cleanup/i);
    expect(mockRm).not.toHaveBeenCalled();
  });

  it('rejects cleanup rebound to a different unregistered artifact pair', async () => {
    const file = registerContract(
      '.next-contract-cleanup',
      'tsconfig.contract-cleanup.json'
    );
    const build = await prepareProductionContractBuild(file);
    jest.clearAllMocks();

    await expect(
      cleanupProductionContractBuild({
        ...build,
        buildDirectory: '.next-contract-rebound',
        tsconfigPath: 'tsconfig.contract-rebound.json',
        buildPath: resolve('.next-contract-rebound'),
        tsconfigAbsolutePath: resolve('tsconfig.contract-rebound.json'),
      })
    ).rejects.toThrow(/unsafe production contract cleanup/i);
    expect(mockRm).not.toHaveBeenCalled();
  });
});
