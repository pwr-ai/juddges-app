/**
 * @jest-environment node
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('GraphQL browser surface contract', () => {
  it('does not expose the retired Next.js GraphQL bridge', () => {
    expect(existsSync(join(process.cwd(), 'app/api/graphql/route.ts'))).toBe(false);
  });

  it('does not ship the retired browser GraphQL client', () => {
    expect(existsSync(join(process.cwd(), 'lib/graphql-client.ts'))).toBe(false);
  });
});
