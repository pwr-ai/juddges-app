/**
 * @jest-environment node
 */

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
});
