/**
 * Regression: the `q` param of /search must be encoded exactly once.
 * URLSearchParams already percent-encodes; pre-encoding produced %2520 / %25C3.
 *
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useSearchUrlParams } from '@/hooks/useSearchUrlParams';

const QUERY = 'Udzielanie narkotyków małoletnim';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/search',
  useSearchParams: () => mockSearchParams,
}));

const mockSetQuery = jest.fn();
let mockStoreQuery = '';

jest.mock('@/lib/store/searchStore', () => {
  const state = () => ({
    query: mockStoreQuery,
    selectedLanguages: new Set(['pl']),
    searchType: 'thinking',
    searchMode: 'text',
    baseFilters: {},
    currentPage: 1,
    pageSize: 10,
    filters: {
      keywords: new Set(),
      legalConcepts: new Set(),
      issuingBodies: new Set(),
      jurisdictions: new Set(),
      courtLevels: new Set(),
      legalDomains: new Set(),
      customMetadata: {},
      dateFrom: undefined,
      dateTo: undefined,
    },
    setQuery: mockSetQuery,
    setSelectedLanguages: jest.fn(),
    setSearchType: jest.fn(),
    setSearchMode: jest.fn(),
    setBaseFilters: jest.fn(),
    setCurrentPage: jest.fn(),
    setPageSize: jest.fn(),
    setSearchMetadata: jest.fn(),
    clearChunksCache: jest.fn(),
    setError: jest.fn(),
  });
  const useSearchStore = Object.assign(() => state(), {
    getState: state,
    setState: jest.fn(),
  });
  return { useSearchStore };
});

const baseOptions = {
  mounted: true,
  urlParamsProcessed: true,
  setUrlParamsProcessed: jest.fn(),
  hasPerformedSearch: false,
  isSearching: false,
};

describe('useSearchUrlParams q encoding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('writes q percent-encoded once (no %25)', () => {
    mockStoreQuery = QUERY;
    const { result } = renderHook(() => useSearchUrlParams(baseOptions));
    act(() => result.current.updateUrlParams(false, true, true));

    const url = mockReplace.mock.calls[0][0] as string;
    expect(url).not.toContain('%25');
    expect(new URL(url, 'http://x').searchParams.get('q')).toBe(QUERY);
  });

  it('reads q exactly as URLSearchParams decodes it', () => {
    mockStoreQuery = '';
    mockSearchParams = new URLSearchParams({ q: '100% pewności' });
    renderHook(() =>
      useSearchUrlParams({ ...baseOptions, urlParamsProcessed: false })
    );
    expect(mockSetQuery).toHaveBeenCalledWith('100% pewności');
  });
});
