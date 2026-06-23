import {
  COLLECTION_EXPORT_COLUMNS,
  EXPORT_PRESET_COLUMNS,
  buildCollectionExportRows,
  buildExportFilename,
  flattenDocumentForExport,
  getExportColumns,
} from '@/lib/collection-export';
import type { SearchDocument } from '@/types/search';

function makeDoc(overrides: Partial<SearchDocument> = {}): SearchDocument {
  return {
    document_id: 'doc-1',
    title: 'Sample Judgment',
    date_issued: '2025-01-15',
    country: 'PL',
    language: 'pl',
    document_number: 'II FSK 1234/21',
    full_text: null,
    summary: 'Brief summary.',
    thesis: null,
    keywords: ['tax', 'vat'],
    issuing_body: { name: 'Naczelny Sąd Administracyjny', type: 'court', jurisdiction: 'national' },
    legal_references: [
      { ref_type: 'statute', text: 'Art. 86 ust. 1 ustawy o VAT', normalized_citation: 'art-86-vat' },
    ],
    legal_concepts: [{ concept_name: 'odliczenie VAT', concept_type: 'tax' }],
    court_name: 'NSA',
    department_name: 'Izba Finansowa',
    presiding_judge: 'Jan Kowalski',
    judges: ['Anna Nowak', 'Piotr Wiśniewski'],
    parties: 'Skarżący vs Dyrektor IS',
    outcome: 'Skarga oddalona',
    legal_bases: ['art-86-vat'],
    extracted_legal_bases: 'art. 86 ust. 1',
    references: ['II FSK 5678/20'],
    factual_state: null,
    legal_state: null,
    score: 0.87,
    metadata: { source_url: 'https://example.org/doc-1' },
    ...overrides,
  } as SearchDocument;
}

describe('flattenDocumentForExport', () => {
  it('produces a row with every export column key', () => {
    const row = flattenDocumentForExport(makeDoc());
    for (const col of COLLECTION_EXPORT_COLUMNS) {
      expect(Object.prototype.hasOwnProperty.call(row, col.key)).toBe(true);
    }
  });

  it('flattens issuing_body to three columns', () => {
    const row = flattenDocumentForExport(makeDoc());
    expect(row.issuing_body_name).toBe('Naczelny Sąd Administracyjny');
    expect(row.issuing_body_type).toBe('court');
    expect(row.issuing_body_jurisdiction).toBe('national');
  });

  it('falls back gracefully when issuing_body is a plain string', () => {
    const row = flattenDocumentForExport(
      makeDoc({ issuing_body: 'Sąd Najwyższy' as unknown as SearchDocument['issuing_body'] })
    );
    expect(row.issuing_body_name).toBe('Sąd Najwyższy');
    expect(row.issuing_body_type).toBe('');
    expect(row.issuing_body_jurisdiction).toBe('');
  });

  it('joins array fields with newlines', () => {
    const row = flattenDocumentForExport(makeDoc());
    expect(row.judges).toBe('Anna Nowak\nPiotr Wiśniewski');
    expect(row.keywords).toBe('tax\nvat');
    expect(row.references).toBe('II FSK 5678/20');
  });

  it('formats legal references as labeled lines', () => {
    const row = flattenDocumentForExport(makeDoc());
    expect(row.legal_references).toBe('[statute] Art. 86 ust. 1 ustawy o VAT (art-86-vat)');
  });

  it('formats legal concepts including type when present', () => {
    const row = flattenDocumentForExport(makeDoc());
    expect(row.legal_concepts).toBe('odliczenie VAT (tax)');
  });

  it('returns empty strings (not null) for missing scalar fields', () => {
    const row = flattenDocumentForExport(
      makeDoc({
        title: null,
        date_issued: null,
        summary: null,
        outcome: null,
      })
    );
    expect(row.title).toBe('');
    expect(row.date_issued).toBe('');
    expect(row.summary).toBe('');
    expect(row.outcome).toBe('');
  });

  it('returns empty strings for null arrays and nested objects', () => {
    const row = flattenDocumentForExport(
      makeDoc({
        judges: null,
        keywords: null,
        legal_references: null,
        legal_concepts: null,
      })
    );
    expect(row.judges).toBe('');
    expect(row.keywords).toBe('');
    expect(row.legal_references).toBe('');
    expect(row.legal_concepts).toBe('');
  });

  it('uses metadata.source_url when present', () => {
    const row = flattenDocumentForExport(makeDoc());
    expect(row.source_url).toBe('https://example.org/doc-1');
  });

  it('source_url is empty when metadata missing', () => {
    const row = flattenDocumentForExport(makeDoc({ metadata: undefined }));
    expect(row.source_url).toBe('');
  });
});

describe('buildCollectionExportRows', () => {
  it('maps every document to a row preserving order', () => {
    const docs = [makeDoc({ document_id: 'a' }), makeDoc({ document_id: 'b' }), makeDoc({ document_id: 'c' })];
    const rows = buildCollectionExportRows(docs);
    expect(rows.map((r) => r.document_id)).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for empty input', () => {
    expect(buildCollectionExportRows([])).toEqual([]);
  });

  it('default preset projects only the default column keys', () => {
    const [row] = buildCollectionExportRows([makeDoc()], 'default');
    const defaultKeys = EXPORT_PRESET_COLUMNS.default.map((c) => c.key).sort();
    expect(Object.keys(row).sort()).toEqual(defaultKeys);
  });

  it('full preset includes structure_*/deep_* extraction columns', () => {
    const [row] = buildCollectionExportRows([makeDoc()], 'full');
    expect(Object.prototype.hasOwnProperty.call(row, 'structure_facts_summary')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(row, 'deep_precedential_value')).toBe(true);
  });

  it('research preset carries deep signals but not the full base set', () => {
    const research = getExportColumns('research').map((c) => c.key);
    expect(research).toContain('deep_complexity_score');
    expect(research).not.toContain('base_appellant');
  });
});

describe('extraction_fields flattening (issue #198)', () => {
  it('writes structure_*/deep_* values through formatValue in the full preset', () => {
    const doc = makeDoc({
      extraction_fields: {
        structure_facts_summary: 'The defendant was charged.',
        deep_complexity_score: 4,
        deep_legal_domains: ['criminal', 'appeal'],
        deep_precedential_value: 'high',
      },
    });
    const [row] = buildCollectionExportRows([doc], 'full');
    expect(row.structure_facts_summary).toBe('The defendant was charged.');
    expect(row.deep_complexity_score).toBe('4');
    expect(row.deep_legal_domains).toBe('criminal, appeal');
    expect(row.deep_precedential_value).toBe('high');
  });

  it('leaves extraction columns empty when extraction_fields is absent', () => {
    const [row] = buildCollectionExportRows([makeDoc()], 'full');
    expect(row.structure_facts_summary).toBe('');
    expect(row.deep_complexity_score).toBe('');
  });
});

describe('buildExportFilename', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:00:00Z'));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('slugifies the collection name and appends date', () => {
    expect(buildExportFilename('VAT — orzecznictwo 2024!')).toBe('vat-orzecznictwo-2024-2026-05-11');
  });

  it('falls back to "collection" when name has no usable characters', () => {
    expect(buildExportFilename('***')).toBe('collection-2026-05-11');
  });

  it('truncates long names to keep filenames manageable', () => {
    const long = 'a'.repeat(120);
    const result = buildExportFilename(long);
    expect(result.startsWith('a'.repeat(60))).toBe(true);
    expect(result.endsWith('-2026-05-11')).toBe(true);
  });
});
