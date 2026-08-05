import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ReasoningLineDetailPage from '@/app/reasoning-lines/[id]/page';
import ReasoningLinesPage from '@/app/reasoning-lines/page';

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

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
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

    fireEvent.click(screen.getByRole('button', { name: 'Odkryj linie' }));
    expect(await screen.findByText('VAT deduction')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zapisz jako linie' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Graf DAG' }));
    await waitFor(() => expect(mockGetReasoningLineDAG).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Wykryj zdarzenia' })).not.toBeInTheDocument();
  });

  it('shows save and event detection controls to an admin user', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'admin-1', app_metadata: { is_admin: true } },
      loading: false,
    });

    renderWithQueryClient(<ReasoningLinesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Odkryj linie' }));
    expect(await screen.findByRole('button', { name: 'Zapisz jako linie' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Graf DAG' }));
    expect(await screen.findByRole('button', { name: 'Wykryj zdarzenia' })).toBeInTheDocument();
  });

  it('hides detail mutations from a non-admin while retaining read-only data', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', app_metadata: {} },
      loading: false,
    });

    renderWithQueryClient(<ReasoningLineDetailPage />);

    expect(await screen.findByRole('heading', { name: 'VAT deduction' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Usun linie' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Klasyfikuj orzeczenia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analizuj dryf' })).not.toBeInTheDocument();
  });

  it('shows detail mutations to an admin user', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'admin-1', app_metadata: { is_admin: true } },
      loading: false,
    });

    renderWithQueryClient(<ReasoningLineDetailPage />);

    expect(await screen.findByRole('button', { name: 'Usun linie' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Klasyfikuj orzeczenia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analizuj dryf' })).toBeInTheDocument();
  });
});
