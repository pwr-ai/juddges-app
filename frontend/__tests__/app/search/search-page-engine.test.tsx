/**
 * `/search` engine choice (#867): the full corpus is the default for a
 * signed-in user, `?engine=` is honoured and written back, curated-only state
 * in the URL picks the curated engine with a visible reason (never silently),
 * and guests get the curated engine with the full corpus shown but locked.
 *
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/contexts/LanguageContext';
import SearchPage from '@/app/search/page';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockAuth: { user: { id: string } | null; loading: boolean } | null = null;
const mockSearchUrlParamsHook = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, prefetch: jest.fn() }),
  usePathname: () => '/search',
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/contexts/AuthContext', () => ({
  useOptionalAuth: () => mockAuth,
}));

jest.mock('@/hooks/useSearchUrlParams', () => ({
  useSearchUrlParams: (...args: unknown[]) => mockSearchUrlParamsHook(...args),
}));

jest.mock('@/hooks/useSearchResults', () => ({
  useSearchResults: () => ({
    search: jest.fn(),
    loadMore: jest.fn(),
    isLoadingMore: false,
    paginationMetadata: null,
    cachedEstimatedTotal: null,
    convertMetadataToSearchDocument: jest.fn((m: unknown) => m),
    fullDocumentsMapRef: { current: new Map() },
  }),
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode }) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: { children?: React.ReactNode }) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// Mock search store
function createDefaultSearchStore(): Record<string, any> {
  return {
    query: '',
    setQuery: jest.fn(),
    selectedLanguages: new Set(['pl']),
    setSelectedLanguages: jest.fn(),
    isSearching: false,
    setIsSearching: jest.fn(),
    error: null as string | null,
    setError: jest.fn(),
    showSaveAllPopover: false,
    setShowSaveAllPopover: jest.fn(),
    selectedDoc: null,
    selectedChunks: [],
    searchType: 'thinking',
    setSearchType: jest.fn(),
    searchMode: 'text',
    setSearchMode: jest.fn(),
    baseFilters: {},
    setBaseFilter: jest.fn(),
    setBaseFilters: jest.fn(),
    resetBaseFilters: jest.fn(),
    isDialogOpen: false,
    filters: {
      keywords: new Set(),
      legalConcepts: new Set(),
      issuingBodies: new Set(),
      languages: new Set(),
      jurisdictions: new Set(),
      courtLevels: new Set(),
      legalDomains: new Set(),
      customMetadata: {},
      dateFrom: null,
      dateTo: null,
    },
    filterVersion: 0,
    toggleFilter: jest.fn(),
    setDateFilter: jest.fn(),
    toggleCustomMetadataFilter: jest.fn(),
    clearCustomMetadataFilter: jest.fn(),
    resetFilters: jest.fn(),
    getActiveFilterCount: jest.fn(() => 0),
    closeDocumentDialog: jest.fn(),
    searchMetadata: [] as any[],
    chunksCache: {},
    loadingChunks: new Set<string>(),
    setSearchMetadata: jest.fn(),
    clearChunksCache: jest.fn(),
    toggleDocumentSelection: jest.fn(),
    selectAllDocuments: jest.fn(),
    clearSelection: jest.fn(),
    getSelectedDocumentCount: jest.fn(() => 0),
    currentPage: 1,
    setCurrentPage: jest.fn(),
    pageSize: 10,
    setPageSize: jest.fn(),
    selectedDocumentIds: new Set<string>(),
    getFilteredMetadata: jest.fn(() => [] as any[]),
    getFilteredMetadataCount: jest.fn(() => 0),
    getAvailableFiltersFromMetadata: jest.fn(() => ({
      keywords: [],
      legalConcepts: [],
      issuingBodies: [],
      languages: [],
      jurisdictions: [],
      courtLevels: [],
      legalDomains: [],
      customMetadataKeys: [],
    })),
  };
}

const mockSearchStore: Record<string, any> = createDefaultSearchStore();

jest.mock('@/lib/store/searchStore', () => {
  const useSearchStore = (selector: any) => {
    if (typeof selector === 'function') {
      return selector(mockSearchStore);
    }
    return mockSearchStore;
  };

  useSearchStore.getState = () => mockSearchStore;

  return { useSearchStore };
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <LanguageProvider initialLocale="en">
      <QueryClientProvider client={client}>
        <SearchPage />
      </QueryClientProvider>
    </LanguageProvider>
  );
}

const fullRadio = () => screen.getByRole('radio', { name: /Pełna baza/ });
const curatedRadio = () => screen.getByRole('radio', { name: /Baza kuratorowana/ });

describe('/search engine choice', () => {
  beforeAll(() => {
    class MockIntersectionObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    }
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      value: MockIntersectionObserver,
    });
  });

  beforeEach(() => {
    Object.assign(mockSearchStore, createDefaultSearchStore());
    mockSearchParams = new URLSearchParams();
    mockAuth = { user: { id: 'user-1' }, loading: false };
    mockReplace.mockClear();
    mockSearchUrlParamsHook.mockReset();
    mockSearchUrlParamsHook.mockReturnValue({
      updateUrlParams: jest.fn(),
      updatingUrlRef: { current: false },
    });
  });

  it('defaults a signed-in user to the full corpus, switch above the query input', async () => {
    renderPage();

    await waitFor(() => expect(fullRadio()).toHaveAttribute('aria-checked', 'true'));
    expect(curatedRadio()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Szukaj w ~2,7 mln orzeczeń/)).toBeInTheDocument();
    // The switch precedes the query input in document order.
    expect(
      screen.getByRole('radiogroup').compareDocumentPosition(screen.getByRole('searchbox')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // The engine reaches the URL sync, so `?engine=full` is written back.
    expect(mockSearchUrlParamsHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ engine: 'full' })
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('honours ?engine=curated', async () => {
    mockSearchParams = new URLSearchParams('engine=curated&q=zachowek');
    renderPage();

    await waitFor(() => expect(curatedRadio()).toHaveAttribute('aria-checked', 'true'));
    expect(screen.queryByPlaceholderText(/Szukaj w ~2,7 mln orzeczeń/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('prefills the full-corpus query from the store (?q=)', async () => {
    mockSearchParams = new URLSearchParams('engine=full&q=zachowek');
    mockSearchStore.query = 'zachowek';
    renderPage();

    expect(await screen.findByRole('searchbox')).toHaveValue('zachowek');
  });

  it('writes the chosen engine to the URL when switching', async () => {
    window.history.replaceState(null, '', '/search?q=zachowek');
    renderPage();
    await waitFor(() => expect(fullRadio()).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(curatedRadio());

    expect(curatedRadio()).toHaveAttribute('aria-checked', 'true');
    expect(mockReplace).toHaveBeenCalledWith('/search?q=zachowek&engine=curated', {
      scroll: false,
    });
  });

  it('picks curated for extraction filters in the URL and says why, with a way back', async () => {
    mockSearchParams = new URLSearchParams('extracted={"appeal_outcome":["dismissed"]}');
    renderPage();

    await waitFor(() => expect(curatedRadio()).toHaveAttribute('aria-checked', 'true'));
    const hint = screen.getByRole('status');
    expect(hint).toHaveTextContent('Wybrano bazę kuratorowaną');
    expect(hint).toHaveTextContent('filtry pól ekstrakcji');

    fireEvent.click(screen.getByRole('button', { name: 'Przełącz na pełną bazę' }));
    expect(fullRadio()).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText(/Wybrano bazę kuratorowaną/)).not.toBeInTheDocument();
  });

  it('picks curated for a UK-only language selection', async () => {
    mockSearchParams = new URLSearchParams('lang=uk');
    renderPage();

    await waitFor(() => expect(curatedRadio()).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('status')).toHaveTextContent('orzeczenia UK/EN');
  });

  it('on the full corpus, suggests curated for curated-only state instead of switching', async () => {
    mockSearchParams = new URLSearchParams('engine=full');
    mockSearchStore.selectedLanguages = new Set(['uk']);
    renderPage();

    await waitFor(() => expect(fullRadio()).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('status')).toHaveTextContent('Pełna baza nie obsługuje: orzeczenia UK/EN');

    fireEvent.click(screen.getByRole('button', { name: 'Przełącz na bazę kuratorowaną' }));
    expect(curatedRadio()).toHaveAttribute('aria-checked', 'true');
  });

  it('gives guests the curated engine with the full corpus locked', async () => {
    mockAuth = { user: null, loading: false };
    mockSearchParams = new URLSearchParams('engine=full');
    renderPage();

    await waitFor(() => expect(curatedRadio()).toHaveAttribute('aria-checked', 'true'));
    expect(fullRadio()).toHaveAttribute('aria-disabled', 'true');
    expect(fullRadio()).toHaveTextContent('Dostępna po zalogowaniu.');
  });

  it('waits for the session before choosing, so no engine flashes', () => {
    mockAuth = { user: null, loading: true };
    renderPage();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});
