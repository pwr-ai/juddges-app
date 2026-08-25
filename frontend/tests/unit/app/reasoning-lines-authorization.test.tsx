import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ReasoningLineDetailPage from '@/app/reasoning-lines/[id]/page';
import ReasoningLinesPage from '@/app/reasoning-lines/page';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { LocaleCode } from '@/lib/i18n';

const mockUseAuth = jest.fn();
const mockPush = jest.fn();
const mockDiscoverReasoningLines = jest.fn();
const mockGetReasoningLineDAG = jest.fn();
const mockGetReasoningLineDetail = jest.fn();
const mockGetReasoningLineTimeline = jest.fn();
const mockGetRelatedLines = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/ui/slider', () => ({
  Slider: () => <input aria-label="slider" type="range" />,
}));

jest.mock('@/components/reasoning-lines/ReasoningDAG', () => ({
  ReasoningDAG: () => <div>Reasoning DAG</div>,
}));

jest.mock('@/components/reasoning-lines/OutcomeTimeline', () => ({
  OutcomeTimeline: () => <div>Outcome timeline</div>,
}));

jest.mock('@/components/reasoning-lines/DriftChart', () => ({
  DriftChart: () => <div>Drift chart</div>,
}));

jest.mock('@/lib/api/reasoning-lines', () => ({
  discoverReasoningLines: (...args: unknown[]) => mockDiscoverReasoningLines(...args),
  createReasoningLine: jest.fn(),
  listReasoningLines: jest.fn().mockResolvedValue([]),
  getReasoningLineDAG: (...args: unknown[]) => mockGetReasoningLineDAG(...args),
  detectEvents: jest.fn(),
  searchReasoningLines: jest.fn(),
  getReasoningLineDetail: (...args: unknown[]) => mockGetReasoningLineDetail(...args),
  deleteReasoningLine: jest.fn(),
  getReasoningLineTimeline: (...args: unknown[]) => mockGetReasoningLineTimeline(...args),
  classifyOutcomes: jest.fn(),
  analyzeReasoningLineDrift: jest.fn(),
  getRelatedLines: (...args: unknown[]) => mockGetRelatedLines(...args),
}));

const discoveryResponse = {
  clusters: [
    {
      cluster_id: 1,
      label: 'VAT deduction',
      keywords: ['VAT'],
      legal_bases: ['Article 168'],
      case_count: 1,
      coherence_score: 0.9,
      date_range: { start: '2024-01-01', end: '2024-01-02' },
      top_cases: [
        {
          judgment_id: 'judgment-1',
          signature: 'I FSK 1/24',
          title: 'VAT case',
          court_name: 'NSA',
          decision_date: '2024-01-02',
          similarity_to_centroid: 0.95,
          cited_legislation: [],
        },
      ],
    },
  ],
  statistics: {
    total_documents: 1,
    num_clusters: 1,
    avg_coherence: 0.9,
    processing_time_ms: 10,
  },
  visualization: { nodes: [], edges: [] },
};

const reasoningLine = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'VAT deduction',
  legal_question: 'Can VAT be deducted?',
  keywords: ['VAT'],
  legal_bases: ['Article 168'],
  status: 'active' as const,
  case_count: 0,
  coherence_score: 0.9,
  date_range_start: '2024-01-01',
  date_range_end: '2024-01-02',
  created_at: '2024-01-03',
  updated_at: '2024-01-03',
  members: [],
};

function renderWithQueryClient(ui: React.ReactElement, locale: LocaleCode = 'en') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider initialLocale={locale}>{ui}</LanguageProvider>
    </QueryClientProvider>,
  );
}

describe('reasoning-lines admin-only controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverReasoningLines.mockResolvedValue(discoveryResponse);
    mockGetReasoningLineDAG.mockResolvedValue({
      nodes: [],
      edges: [],
      statistics: { total_nodes: 0, total_edges: 0 },
    });
    mockGetReasoningLineDetail.mockResolvedValue(reasoningLine);
    mockGetReasoningLineTimeline.mockResolvedValue({
      line_id: reasoningLine.id,
      legal_question: reasoningLine.legal_question,
      points: [],
      trend: 'stable',
      trend_slope: 0,
      total_classified: 0,
      total_unclassified: 0,
    });
    mockGetRelatedLines.mockResolvedValue({ related: [] });
  });

  it('keeps discovery read-only and hides global mutations from a non-admin user', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', app_metadata: {} },
      loading: false,
    });

    renderWithQueryClient(<ReasoningLinesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Discover lines' }));
    expect(await screen.findByText('VAT deduction')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save as line' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'DAG graph' }));
    await waitFor(() => expect(mockGetReasoningLineDAG).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Detect events' })).not.toBeInTheDocument();
    // A reader who cannot fix the emptiness is told why it is empty and who can.
    expect(
      await screen.findByText(/The graph is built by an administrator/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/select .Detect events. to build the graph/)).not.toBeInTheDocument();
  });

  it('shows save and event detection controls to an admin user', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'admin-1', app_metadata: { is_admin: true } },
      loading: false,
    });

    renderWithQueryClient(<ReasoningLinesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Discover lines' }));
    expect(await screen.findByRole('button', { name: 'Save as line' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'DAG graph' }));
    expect(await screen.findByRole('button', { name: 'Detect events' })).toBeInTheDocument();
  });

  it('hides detail mutations from a non-admin while retaining read-only data', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', app_metadata: {} },
      loading: false,
    });

    renderWithQueryClient(<ReasoningLineDetailPage />);

    expect(await screen.findByRole('heading', { name: 'VAT deduction' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete line' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Classify judgments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analyse drift' })).not.toBeInTheDocument();
    // Empty states still say what happened and why, without offering an action
    // this reader is not allowed to take.
    expect(
      screen.getByText(/so the outcome timeline is empty/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/so there is nothing to display/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Select .Classify judgments. above/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Select .Analyse drift./)).not.toBeInTheDocument();
  });

  it('shows detail mutations to an admin user', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'admin-1', app_metadata: { is_admin: true } },
      loading: false,
    });

    renderWithQueryClient(<ReasoningLineDetailPage />);

    expect(await screen.findByRole('button', { name: 'Delete line' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Classify judgments' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyse drift' })).toBeInTheDocument();
    // An admin gets the same explanation plus the action that resolves it.
    expect(screen.getByText(/Select .Classify judgments. above/)).toBeInTheDocument();
    expect(screen.getByText(/Select .Analyse drift./)).toBeInTheDocument();
  });
});

/**
 * Regression guard for #519: this subtree used to hardcode stripped-diacritic
 * Polish while the rest of the app was English. Assert both that the English
 * locale is really English, and that the Polish locale is really Polish with
 * correct diacritics — a hardcoded string would fail one side or the other.
 */
describe('reasoning-lines copy is localized, not hardcoded', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 'admin-1', app_metadata: { is_admin: true } },
      loading: false,
    });
  });

  it('renders English copy and no stripped-diacritic Polish under the en locale', () => {
    const { container } = renderWithQueryClient(<ReasoningLinesPage />, 'en');

    expect(screen.getByRole('button', { name: 'Discover lines' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /Ladowanie|Blad|Odkryj|Zapisz|Wykryj|Usun|orzecznicz/,
    );
  });

  it('renders Polish copy with correct diacritics under the pl locale', () => {
    const { container } = renderWithQueryClient(<ReasoningLinesPage />, 'pl');

    // Some Polish diacritic must appear, and the stripped forms must not.
    expect(container.textContent).toMatch(/[ąćęłńóśźż]/);
    expect(container.textContent).not.toMatch(/Ladowanie|Blad ladowania|Brak wynikow/);
  });
});
