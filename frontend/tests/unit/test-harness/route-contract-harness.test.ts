/** @jest-environment node */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('route-contract harness lifecycle', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve('package.json'), 'utf8'),
  ) as { scripts: Record<string, string> };

  it('prepares and starts the standalone production artifact', () => {
    expect(packageJson.scripts['prepare:e2e:route-contract']).toBe(
      'node scripts/prepare-route-contract-standalone.mjs',
    );
    expect(packageJson.scripts['pretest:e2e:route-contract']).toBe(
      'npm run prepare:e2e:route-contract',
    );
    expect(packageJson.scripts['start:e2e:route-contract']).toBe(
      'node .next/standalone/frontend/server.js',
    );

    const preparationPath = resolve(
      'scripts/prepare-route-contract-standalone.mjs',
    );
    expect(existsSync(preparationPath)).toBe(true);
    const preparation = readFileSync(preparationPath, 'utf8');
    expect(preparation).toContain("resolve(frontendRoot, 'public')");
    expect(preparation).toContain("resolve(frontendRoot, '.next/static')");
    expect(preparation).toContain(
      "resolve(frontendRoot, '.next/standalone/frontend/public')",
    );
    expect(preparation).toContain(
      "resolve(frontendRoot, '.next/standalone/frontend/.next/static')",
    );

    const config = readFileSync(
      resolve('playwright.route-contract.config.ts'),
      'utf8',
    );
    expect(config).toContain("command: 'npm run start:e2e:route-contract'");
    expect(config).not.toContain("command: 'npm start'");
    expect(config).toContain("PORT: '3006'");
    expect(config).toContain("HOSTNAME: '127.0.0.1'");
  });

  it('lints every checked-in route-contract harness source during validation', () => {
    expect(packageJson.scripts['lint:route-contract-harness']).toBe(
      'eslint playwright.route-contract.config.ts scripts/prepare-route-contract-standalone.mjs tests/route-contract-e2e',
    );
    expect(packageJson.scripts.validate).toContain(
      'npm run lint:route-contract-harness',
    );
  });
});
