/**
 * Tests for collection-export flattening, covering:
 *  - COLLECTION_EXPORT_COLUMNS has base_* columns appended after standard ones
 *  - flattenDocumentForExport writes base_fields through formatValue correctly
 *  - Null/missing base_fields produce empty strings for every base_* key
 *  - Standard column flattening is unaffected by the base_* additions
 */

import {
  COLLECTION_EXPORT_COLUMNS,
  flattenDocumentForExport,
} from '@/lib/collection-export';
import type { SearchDocument } from '@/types/search';

const makeDoc = (overrides: Partial<SearchDocument> = {}): SearchDocument =>
  ({
    document_id: 'X-1',
    title: 'Case X',
    date_issued: null,
    issuing_body: null,
    language: null,
    document_number: null,
    country: 'GB',
    full_text: null,
    summary: null,
    thesis: null,
    legal_references: null,
    legal_concepts: null,
    keywords: null,
    score: null,
    court_name: null,
    department_name: null,
    presiding_judge: null,
    judges: null,
    parties: null,
    outcome: null,
    legal_bases: null,
    extracted_legal_bases: null,
    references: null,
    factual_state: null,
    legal_state: null,
    ...overrides,
  } as SearchDocument);

describe('collection-export', () => {
  it('includes base_* columns in COLLECTION_EXPORT_COLUMNS after standard ones', () => {
    const keys = COLLECTION_EXPORT_COLUMNS.map((c) => c.key);
    const firstBaseIdx = keys.findIndex((k) => k.startsWith('base_'));
    const lastStandardIdx = keys.findIndex((k) => k === 'source_url');
    expect(firstBaseIdx).toBeGreaterThan(lastStandardIdx);
    expect(keys).toContain('base_appellant');
    expect(keys).toContain('base_appeal_outcome');
    expect(keys).toContain('base_num_victims');
  });

  it('omits the search-only `score` column from collection exports', () => {
    const keys = COLLECTION_EXPORT_COLUMNS.map((c) => c.key);
    expect(keys).not.toContain('score');
  });

  it('reads source_url from top-level when metadata.source_url is absent', () => {
    const doc = makeDoc({
      // Batch endpoint returns source_url at top level (LegalDocument shape),
      // not nested under metadata — make sure the flatten still picks it up.
    } as Partial<SearchDocument>) as SearchDocument & { source_url?: string };
    doc.source_url = 'https://example.test/case-x';
    const row = flattenDocumentForExport(doc);
    expect(row.source_url).toBe('https://example.test/case-x');
  });

  it('prefers metadata.source_url over top-level source_url when both exist', () => {
    const doc = makeDoc({
      metadata: { source_url: 'https://nested.test/x' },
    } as Partial<SearchDocument>) as SearchDocument & { source_url?: string };
    doc.source_url = 'https://top.test/x';
    const row = flattenDocumentForExport(doc);
    expect(row.source_url).toBe('https://nested.test/x');
  });

  it('flattens base_fields into the row using formatValue', () => {
    const doc = makeDoc({
      base_fields: {
        base_appellant: 'offender',
        base_num_victims: 3,
        base_did_offender_confess: true,
        base_appeal_outcome: ['outcome_conviction_quashed'],
      },
    });
    const row = flattenDocumentForExport(doc);
    expect(row.base_appellant).toBe('Offender');
    expect(row.base_num_victims).toBe('3');
    expect(row.base_did_offender_confess).toBe('Yes');
    expect(row.base_appeal_outcome).toBe('Conviction quashed');
  });

  it('emits empty strings for base_* keys when base_fields is null', () => {
    const doc = makeDoc({ base_fields: null });
    const row = flattenDocumentForExport(doc);
    expect(row.base_appellant).toBe('');
    expect(row.base_num_victims).toBe('');
  });

  it('emits empty strings for base_* keys when base_fields is absent', () => {
    const doc = makeDoc();
    // No base_fields key at all on this doc
    delete (doc as Record<string, unknown>).base_fields;
    const row = flattenDocumentForExport(doc);
    expect(row.base_appellant).toBe('');
    expect(row.base_num_victims).toBe('');
  });

  it('preserves existing standard column flattening', () => {
    const doc = makeDoc({
      title: 'Case X',
      keywords: ['a', 'b'],
      judges: ['J. Doe'],
    });
    const row = flattenDocumentForExport(doc);
    expect(row.title).toBe('Case X');
    expect(row.keywords).toBe('a\nb');
    expect(row.judges).toBe('J. Doe');
  });
});
