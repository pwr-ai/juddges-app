import { chunkDocumentIds, loadAllCollectionDocuments } from '@/lib/api/collections';
import * as documentsApi from '@/lib/api/documents';
import type { SearchDocument } from '@/types/search';

jest.mock('@/lib/api/documents', () => ({
  fetchDocumentsByIds: jest.fn(),
}));

const fetchMock = documentsApi.fetchDocumentsByIds as jest.MockedFunction<
  typeof documentsApi.fetchDocumentsByIds
>;

function makeDoc(id: string): SearchDocument {
  return { document_id: id } as SearchDocument;
}

describe('chunkDocumentIds', () => {
  it('returns an empty list for no IDs', () => {
    expect(chunkDocumentIds([])).toEqual([]);
  });

  it('keeps a single chunk under the default size', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `d${i}`);
    expect(chunkDocumentIds(ids)).toEqual([ids]);
  });

  it('splits exactly at the default 100-id boundary', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `d${i}`);
    expect(chunkDocumentIds(ids)).toHaveLength(1);
  });

  it('splits 101 ids into 100 + 1', () => {
    const ids = Array.from({ length: 101 }, (_, i) => `d${i}`);
    const chunks = chunkDocumentIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toEqual(['d100']);
  });

  it('splits 250 ids into 100 + 100 + 50', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `d${i}`);
    const chunks = chunkDocumentIds(ids);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it('respects custom chunk size', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    expect(chunkDocumentIds(ids, 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('throws on non-positive chunk size', () => {
    expect(() => chunkDocumentIds(['a'], 0)).toThrow();
    expect(() => chunkDocumentIds(['a'], -1)).toThrow();
  });
});

describe('loadAllCollectionDocuments', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns an empty array without calling the API for no IDs', async () => {
    const result = await loadAllCollectionDocuments([]);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes one batch request for <=100 ids', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `d${i}`);
    fetchMock.mockResolvedValueOnce({ documents: ids.map(makeDoc) });
    const result = await loadAllCollectionDocuments(ids);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith({ document_ids: ids });
    expect(result.map((d) => d.document_id)).toEqual(ids);
  });

  it('splits 250 ids into 3 batched requests and concatenates results in order', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `d${i}`);
    fetchMock
      .mockResolvedValueOnce({ documents: ids.slice(0, 100).map(makeDoc) })
      .mockResolvedValueOnce({ documents: ids.slice(100, 200).map(makeDoc) })
      .mockResolvedValueOnce({ documents: ids.slice(200).map(makeDoc) });

    const result = await loadAllCollectionDocuments(ids);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(250);
    expect(result[0].document_id).toBe('d0');
    expect(result[249].document_id).toBe('d249');
  });

  it('reports progress at each chunk boundary', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `d${i}`);
    fetchMock
      .mockResolvedValueOnce({ documents: ids.slice(0, 100).map(makeDoc) })
      .mockResolvedValueOnce({ documents: ids.slice(100).map(makeDoc) });

    const progress: Array<{ loaded: number; total: number }> = [];
    await loadAllCollectionDocuments(ids, (p) => progress.push(p));

    expect(progress).toEqual([
      { loaded: 0, total: 150 },
      { loaded: 100, total: 150 },
      { loaded: 150, total: 150 },
    ]);
  });
});
