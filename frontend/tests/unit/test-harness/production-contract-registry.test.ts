/**
 * @jest-environment node
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import {
  resolveStandaloneRuntimeBuildPath,
} from '../../support/production-contract-build';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const registry = require('../../../jest.production-contracts') as {
  productionContracts: Array<{
    file: string;
    buildDirectory: string;
    tsconfigPath: string;
  }>;
  testPathIgnorePatterns: string[];
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function productionBuildSuites(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionBuildSuites(path);
    if (!/\.test\.[jt]sx?$/.test(entry.name)) return [];
    if (!/\bprepareProductionContractBuild\s*\(/.test(readFileSync(path, 'utf8'))) {
      return [];
    }
    return [relative(process.cwd(), path).split(sep).join('/')];
  });
}

describe('production contract registry', () => {
  it('assigns every contract a distinct non-default build directory', () => {
    const buildDirectories = registry.productionContracts.map(
      (contract) => contract.buildDirectory
    );
    const tsconfigPaths = registry.productionContracts.map(
      (contract) => contract.tsconfigPath
    );

    expect(new Set(buildDirectories).size).toBe(buildDirectories.length);
    expect(new Set(tsconfigPaths).size).toBe(tsconfigPaths.length);
    expect(buildDirectories).not.toContain('.next');
    expect(buildDirectories).not.toContain('./.next');
  });

  it('ignores only exact registered paths under Jest rootDir', () => {
    const rootDir = '/workspace/frontend';
    const patterns = registry.testPathIgnorePatterns.map(
      (pattern) =>
        new RegExp(pattern.replace('<rootDir>', escapeRegExp(rootDir)))
    );
    const registered = registry.productionContracts[0].file;

    expect(patterns.some((pattern) => pattern.test(`${rootDir}/${registered}`))).toBe(
      true
    );
    expect(
      patterns.some((pattern) =>
        pattern.test(`${rootDir}/nested/${registered}`)
      )
    ).toBe(false);
  });

  it('registers only production contract files that exist', () => {
    for (const contract of registry.productionContracts) {
      expect({
        file: contract.file,
        exists: existsSync(resolve(contract.file)),
      }).toEqual({ file: contract.file, exists: true });
    }
  });

  it('registers every test suite that prepares a production build', () => {
    const discovered = [
      ...productionBuildSuites(resolve('__tests__')),
      ...productionBuildSuites(resolve('tests/integration')),
      ...productionBuildSuites(resolve('tests/unit')),
    ].sort();
    const registered = registry.productionContracts
      .map((contract) => contract.file)
      .sort();

    expect(registered).toEqual(discovered);
  });

  it('maps an isolated distDir into the standalone frontend runtime', () => {
    expect(
      resolveStandaloneRuntimeBuildPath(
        '/workspace/frontend/.next-contract-extractions-detail',
        '.next-contract-extractions-detail'
      )
    ).toBe(
      '/workspace/frontend/.next-contract-extractions-detail/standalone/frontend/.next-contract-extractions-detail'
    );
  });
});
