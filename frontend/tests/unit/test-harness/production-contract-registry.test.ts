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

const CHILD_PROCESS_MODULES = new Set(['child_process', 'node:child_process']);
const CHILD_PROCESS_RUNNERS = new Set([
  'exec',
  'execFile',
  'execFileSync',
  'execSync',
  'spawn',
  'spawnSync',
]);

type SourceBindings = {
  constants: Map<string, ts.Expression>;
  childProcessFunctions: Map<string, string>;
  childProcessNamespaces: Set<string>;
  productionChildFunctions: Set<string>;
  productionBuildFunctions: Set<string>;
};

function importName(specifier: ts.ImportSpecifier): string {
  return specifier.propertyName?.text ?? specifier.name.text;
}

function bindingPropertyName(element: ts.BindingElement): string {
  if (element.propertyName && ts.isIdentifier(element.propertyName)) {
    return element.propertyName.text;
  }
  return ts.isIdentifier(element.name) ? element.name.text : '';
}

function requiredModule(expression: ts.Expression | undefined): string | null {
  if (
    !expression ||
    !ts.isCallExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    expression.expression.text !== 'require'
  ) {
    return null;
  }
  const moduleName = expression.arguments[0];
  return moduleName && ts.isStringLiteralLike(moduleName)
    ? moduleName.text
    : null;
}

function collectSourceBindings(sourceFile: ts.SourceFile): SourceBindings {
  const bindings: SourceBindings = {
    constants: new Map(),
    childProcessFunctions: new Map(),
    childProcessNamespaces: new Set(),
    productionChildFunctions: new Set(),
    productionBuildFunctions: new Set(),
  };

  const registerNamedImport = (
    imported: string,
    local: string,
    moduleName: string
  ): void => {
    if (CHILD_PROCESS_MODULES.has(moduleName) && CHILD_PROCESS_RUNNERS.has(imported)) {
      bindings.childProcessFunctions.set(local, imported);
    }
    if (moduleName.includes('production-child-process') && imported === 'runProductionChild') {
      bindings.productionChildFunctions.add(local);
    }
    if (
      moduleName.includes('production-contract-build') &&
      imported === 'prepareProductionContractBuild'
    ) {
      bindings.productionBuildFunctions.add(local);
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      node.importClause
    ) {
      const moduleName = node.moduleSpecifier.text;
      const namedBindings = node.importClause.namedBindings;
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        if (CHILD_PROCESS_MODULES.has(moduleName)) {
          bindings.childProcessNamespaces.add(namedBindings.name.text);
        }
      } else if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const specifier of namedBindings.elements) {
          registerNamedImport(importName(specifier), specifier.name.text, moduleName);
        }
      }
      if (node.importClause.name && CHILD_PROCESS_MODULES.has(moduleName)) {
        bindings.childProcessNamespaces.add(node.importClause.name.text);
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      if (ts.isIdentifier(node.name)) {
        bindings.constants.set(node.name.text, node.initializer);
        const moduleName = requiredModule(node.initializer);
        if (moduleName && CHILD_PROCESS_MODULES.has(moduleName)) {
          bindings.childProcessNamespaces.add(node.name.text);
        }
      } else if (ts.isObjectBindingPattern(node.name)) {
        const moduleName = requiredModule(node.initializer);
        if (moduleName) {
          for (const element of node.name.elements) {
            if (!ts.isIdentifier(element.name)) continue;
            registerNamedImport(
              bindingPropertyName(element),
              element.name.text,
              moduleName
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function resolveConstant(
  expression: ts.Expression | undefined,
  bindings: SourceBindings,
  seen = new Set<string>()
): ts.Expression | undefined {
  if (!expression) return undefined;
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) {
    return resolveConstant(expression.expression, bindings, seen);
  }
  if (ts.isIdentifier(expression) && bindings.constants.has(expression.text)) {
    if (seen.has(expression.text)) return expression;
    seen.add(expression.text);
    return resolveConstant(bindings.constants.get(expression.text), bindings, seen);
  }
  return expression;
}

function stringValue(
  expression: ts.Expression | undefined,
  bindings: SourceBindings
): string | null {
  const resolved = resolveConstant(expression, bindings);
  return resolved && ts.isStringLiteralLike(resolved) ? resolved.text : null;
}

function objectProperty(
  expression: ts.Expression | undefined,
  name: string,
  bindings: SourceBindings
): ts.Expression | undefined {
  const resolved = resolveConstant(expression, bindings);
  if (!resolved || !ts.isObjectLiteralExpression(resolved)) return undefined;
  for (const property of resolved.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === name) ||
        (ts.isStringLiteralLike(property.name) && property.name.text === name))
    ) {
      return property.initializer;
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      return property.name;
    }
  }
  return undefined;
}

function isProcessExecPath(expression: ts.Expression | undefined): boolean {
  return Boolean(
    expression &&
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'process' &&
      expression.name.text === 'execPath'
  );
}

function isNextExecutable(
  expression: ts.Expression | undefined,
  bindings: SourceBindings
): boolean {
  const resolved = resolveConstant(expression, bindings);
  if (!resolved) return false;
  const literal = stringValue(resolved, bindings);
  if (literal) {
    return /(?:^|[/\\])next(?:\.cmd)?$/.test(literal) ||
      literal.includes('next/dist/bin/next');
  }
  if (ts.isIdentifier(resolved) && /^next(?:Js)?Bin$/i.test(resolved.text)) {
    return true;
  }
  if (ts.isCallExpression(resolved)) {
    const combinedArguments = resolved.arguments
      .map((argument) => stringValue(argument, bindings))
      .filter((argument): argument is string => argument !== null)
      .join('/');
    return combinedArguments.includes('next/dist/bin/next') ||
      combinedArguments.includes('node_modules/next/dist/bin/next');
  }
  return false;
}

function executableName(
  expression: ts.Expression | undefined,
  bindings: SourceBindings
): string | null {
  const value = stringValue(expression, bindings);
  if (!value) return null;
  return value.split(/[/\\]/).at(-1)?.toLowerCase() ?? null;
}

function processCallRunsFrontendBuild(
  command: ts.Expression | undefined,
  args: ts.Expression | undefined,
  bindings: SourceBindings
): boolean {
  const resolvedCommand = resolveConstant(command, bindings);
  const resolvedArgs = resolveConstant(args, bindings);
  if (!resolvedArgs || !ts.isArrayLiteralExpression(resolvedArgs)) return false;
  const elements = [...resolvedArgs.elements];
  if (isProcessExecPath(resolvedCommand)) {
    return (
      isNextExecutable(elements[0], bindings) &&
      stringValue(elements[1], bindings) === 'build'
    );
  }
  if (isNextExecutable(resolvedCommand, bindings)) {
    return stringValue(elements[0], bindings) === 'build';
  }
  const executable = executableName(resolvedCommand, bindings);
  if (executable === 'npm' || executable === 'npm.cmd') {
    const values = elements.map((element) => stringValue(element, bindings));
    return (
      (values[0] === 'run' && values[1] === 'build') || values[0] === 'build'
    );
  }
  if (executable === 'npx' || executable === 'npx.cmd') {
    return (
      stringValue(elements[0], bindings) === 'next' &&
      stringValue(elements[1], bindings) === 'build'
    );
  }
  return false;
}

function shellCommandRunsFrontendBuild(command: string | null): boolean {
  if (!command) return false;
  const normalized = command.trim().replace(/\s+/g, ' ');
  return (
    /^(?:npx\s+)?next\s+build(?:\s|$)/.test(normalized) ||
    /^npm(?:\.cmd)?\s+(?:run\s+)?build(?:\s|$)/.test(normalized)
  );
}

function childProcessMethod(
  expression: ts.LeftHandSideExpression,
  bindings: SourceBindings
): string | null {
  if (ts.isIdentifier(expression)) {
    return bindings.childProcessFunctions.get(expression.text) ?? null;
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    bindings.childProcessNamespaces.has(expression.expression.text) &&
    CHILD_PROCESS_RUNNERS.has(expression.name.text)
  ) {
    return expression.name.text;
  }
  return null;
}

function callRunsNextBuild(
  node: ts.CallExpression,
  bindings: SourceBindings
): boolean {
  if (
    ts.isIdentifier(node.expression) &&
    bindings.productionBuildFunctions.has(node.expression.text)
  ) {
    return true;
  }
  if (
    ts.isIdentifier(node.expression) &&
    bindings.productionChildFunctions.has(node.expression.text)
  ) {
    const options = node.arguments[0];
    return processCallRunsFrontendBuild(
      objectProperty(options, 'command', bindings),
      objectProperty(options, 'args', bindings),
      bindings
    );
  }

  const method = childProcessMethod(node.expression, bindings);
  if (!method) return false;
  if (method === 'exec' || method === 'execSync') {
    return shellCommandRunsFrontendBuild(stringValue(node.arguments[0], bindings));
  }
  return processCallRunsFrontendBuild(
    node.arguments[0],
    node.arguments[1],
    bindings
  );
}

function sourceRunsNextBuild(source: string, path: string): boolean {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const bindings = collectSourceBindings(sourceFile);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && callRunsNextBuild(node, bindings)) {
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
    if (!sourceRunsNextBuild(source, path)) {
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

  it('discovers imported frontend build runners without matching other builds', () => {
    const fixtureDirectory = mkdtempSync(
      join(tmpdir(), 'production-contract-inventory-')
    );
    try {
      writeFileSync(
        join(fixtureDirectory, 'namespace-spawn.test.ts'),
        `import * as childProcess from 'node:child_process';
        const nextBin = require.resolve('next/dist/bin/next');
        childProcess.spawnSync(process.execPath, [nextBin, 'build']);`
      );
      writeFileSync(
        join(fixtureDirectory, 'const-args-spawn.test.ts'),
        `import { spawnSync } from 'node:child_process';
        const nextBin = require.resolve('next/dist/bin/next');
        const command = process.execPath;
        const args = [nextBin, 'build'];
        spawnSync(command, args);`
      );
      writeFileSync(
        join(fixtureDirectory, 'exec-next.test.ts'),
        `import { exec } from 'node:child_process';
        exec('next build');`
      );
      writeFileSync(
        join(fixtureDirectory, 'aliased-import.test.ts'),
        `import { spawnSync as runSync } from 'child_process';
        const nextBin = require.resolve('next/dist/bin/next');
        runSync(process.execPath, [nextBin, 'build']);`
      );
      writeFileSync(
        join(fixtureDirectory, 'aliased-exec-sync.test.ts'),
        `import { execSync as runCommand } from 'node:child_process';
        const command = 'npm run build';
        runCommand(command);`
      );
      writeFileSync(
        join(fixtureDirectory, 'aliased-helper.test.ts'),
        `import { runProductionChild as runChild } from '../../support/production-child-process';
        const nextBin = require.resolve('next/dist/bin/next');
        const command = process.execPath;
        const args = [nextBin, 'build'];
        runChild({ command, args });`
      );
      writeFileSync(
        join(fixtureDirectory, 'prepare-helper.test.ts'),
        `import { prepareProductionContractBuild as prepare } from '../../support/production-contract-build';
        prepare('tests/unit/app/example/http-status-contract.test.ts');`
      );
      writeFileSync(
        join(fixtureDirectory, 'child-process-unit.test.ts'),
        `import { spawnSync } from 'node:child_process';
        spawnSync(process.execPath, ['-e', childScript]);`
      );
      writeFileSync(
        join(fixtureDirectory, 'cargo-build.test.ts'),
        `import { spawnSync } from 'node:child_process';
        spawnSync('cargo', ['build']);`
      );
      writeFileSync(
        join(fixtureDirectory, 'cargo-exec.test.ts'),
        `import { exec } from 'node:child_process';
        exec('cargo build');`
      );
      writeFileSync(
        join(fixtureDirectory, 'fake-local-runner.test.ts'),
        `const spawnSync = () => undefined;
        spawnSync(process.execPath, [nextBin, 'build']);`
      );

      expect(
        productionBuildSuites(fixtureDirectory).map((path) => basename(path)).sort()
      ).toEqual([
        'aliased-exec-sync.test.ts',
        'aliased-helper.test.ts',
        'aliased-import.test.ts',
        'const-args-spawn.test.ts',
        'exec-next.test.ts',
        'namespace-spawn.test.ts',
        'prepare-helper.test.ts',
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
