/**
 * @jest-environment node
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const retiredProxyRoutes = [
  'app/api/documents/search/direct/route.ts',
  'app/api/documents/chunks/by-document-ids/route.ts',
  'app/api/documents/chunks/fetch/route.ts',
  'app/api/documents/similarity-graph/route.ts',
];

describe('documents route contract', () => {
  it('does not expose proxies for backend routes that do not exist', () => {
    for (const route of retiredProxyRoutes) {
      expect(existsSync(join(process.cwd(), route))).toBe(false);
    }
  });

  it('does not export clients for retired proxy routes', () => {
    const searchClient = readFileSync(
      join(process.cwd(), 'lib/api/search.ts'),
      'utf8'
    );
    const documentsClient = readFileSync(
      join(process.cwd(), 'lib/api/documents.ts'),
      'utf8'
    );

    expect(searchClient).not.toContain('searchDocumentsDirect');
    expect(documentsClient).not.toContain('getChunksForDocuments');
    expect(documentsClient).not.toContain('fetchChunksByUuid');
  });
});
