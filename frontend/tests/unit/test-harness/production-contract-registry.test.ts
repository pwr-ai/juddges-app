/**
 * @jest-environment node
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

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

const arrayRunsNextBuild = (node: ts.Expression | undefined): boolean =>
  Boolean(
    node &&
      ts.isArrayLiteralExpression(node) &&
      node.elements.some(
        (element) => ts.isStringLiteralLike(element) && element.text === 'build'
      )
  );

function callRunsNextBuild(node: ts.CallExpression): boolean {
  if (!ts.isIdentifier(node.expression)) return false;

  if (node.expression.text === 'runProductionChild') {
    const options = node.arguments[0];
    if (!options || !ts.isObjectLiteralExpression(options)) return false;
    const args = options.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) &&
        ((ts.isIdentifier(property.name) && property.name.text === 'args') ||
          (ts.isStringLiteralLike(property.name) && property.name.text === 'args'))
    );
    return arrayRunsNextBuild(args?.initializer);
  }

  if (
    ['spawn', 'spawnSync', 'execFile', 'execFileSync'].includes(
      node.expression.text
    )
  ) {
    return arrayRunsNextBuild(node.arguments[1]);
  }

  if (node.expression.text === 'execSync') {
    const command = node.arguments[0];
    return Boolean(
      command &&
        ts.isStringLiteralLike(command) &&
        /(?:^|\s)(?:next build|npm (?:run )?build)(?:\s|$)/.test(command.text)
    );
  }

  return false;
}

function sourceRunsNextBuild(source: string, path: string): boolean {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && callRunsNextBuild(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function productionBuildSuites(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionBuildSuites(path);
    if (!/\.test\.[jt]sx?$/.test(entry.name)) return [];
    const source = readFileSync(path, 'utf8');
    if (
      !/\bprepareProductionContractBuild\s*\(/.test(source) &&
      !sourceRunsNextBuild(source, path)
    ) {
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

  it('registers every test suite that prepares or runs a production build', () => {
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

  it('discovers raw production build runners without matching child-process units', () => {
    const fixtureDirectory = mkdtempSync(
      join(tmpdir(), 'production-contract-inventory-')
    );
    try {
      writeFileSync(
        join(fixtureDirectory, 'raw-run-production-child.test.ts'),
        `runProductionChild({
          command: process.execPath,
          args: [nextBin, 'build'],
        });`
      );
      writeFileSync(
        join(fixtureDirectory, 'raw-spawn-sync.test.ts'),
        `spawnSync(process.execPath, [nextBin, 'build']);`
      );
      writeFileSync(
        join(fixtureDirectory, 'child-process-unit.test.ts'),
        `runProductionChild({
          command: process.execPath,
          args: ['-e', childScript],
        });`
      );

      expect(
        productionBuildSuites(fixtureDirectory).map((path) => basename(path)).sort()
      ).toEqual([
        'raw-run-production-child.test.ts',
        'raw-spawn-sync.test.ts',
      ]);
    } finally {
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
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
