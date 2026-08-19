import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AdminDashboardPage from '@/app/admin/page';
import {
  useAdminActivity,
  useAdminStats,
  useAdminSystemHealth,
} from '@/lib/api/admin';
import { useDashboardStats } from '@/lib/api/dashboard';

jest.mock('@/lib/api/admin', () => ({
  useAdminActivity: jest.fn(),
  useAdminStats: jest.fn(),
  useAdminSystemHealth: jest.fn(),
}));

jest.mock('@/lib/api/dashboard', () => ({
  useDashboardStats: jest.fn(),
}));

const successfulQuery = (data: unknown) => ({
  data,
  error: null,
  isError: false,
  isLoading: false,
  refetch: jest.fn(),
});

const failedQuery = (error: Error, refetch = jest.fn()) => ({
  data: undefined,
  error,
  isError: true,
  isLoading: false,
  refetch,
});

const healthyStats = {
  total_users: 1,
  total_documents: 42,
  searches_today: 2,
  active_sessions_24h: 1,
  documents_added_this_week: 3,
};

/** Every query succeeds unless a test overrides one of them. */
function mockAllHealthy() {
  jest.mocked(useAdminStats).mockReturnValue(
    successfulQuery(healthyStats) as unknown as ReturnType<typeof useAdminStats>,
  );
  jest.mocked(useAdminActivity).mockReturnValue(
    successfulQuery([]) as unknown as ReturnType<typeof useAdminActivity>,
  );
  jest.mocked(useAdminSystemHealth).mockReturnValue(
    successfulQuery({ status: 'healthy', services: {} }) as unknown as ReturnType<
      typeof useAdminSystemHealth
    >,
  );
  jest.mocked(useDashboardStats).mockReturnValue(
    successfulQuery({
      total_judgments: 42,
      data_completeness: { embeddings_pct: 90, with_summary_pct: 50 },
    }) as unknown as ReturnType<typeof useDashboardStats>,
  );
}

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAllHealthy();
  });

  it('explains a corpus statistics failure instead of hiding the tile', () => {
    jest.mocked(useDashboardStats).mockReturnValue(
      failedQuery(new Error('ECONNREFUSED 127.0.0.1:8004')) as unknown as ReturnType<
        typeof useDashboardStats
      >,
    );

    render(<AdminDashboardPage />);

    const alert = screen.getByRole('alert');
    // What happened
    expect(alert).toHaveTextContent('Corpus data-quality figures could not be loaded');
    // Why, and what is/is not affected
    expect(alert).toHaveTextContent('The corpus statistics endpoint did not respond');
    // What next
    expect(alert).toHaveTextContent('check Admin → System for service health');
    // And never the raw exception
    expect(alert).not.toHaveTextContent('ECONNREFUSED');
  });

  it('offers a retry that re-runs the failed corpus statistics query', async () => {
    const refetch = jest.fn();
    jest.mocked(useDashboardStats).mockReturnValue(
      failedQuery(new Error('boom'), refetch) as unknown as ReturnType<
        typeof useDashboardStats
      >,
    );

    render(<AdminDashboardPage />);

    await userEvent.click(screen.getByRole('button', { name: /reload data quality/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('offers a retry for the platform statistics failure', async () => {
    const refetch = jest.fn();
    jest.mocked(useAdminStats).mockReturnValue(
      failedQuery(new Error('HTTP 500'), refetch) as unknown as ReturnType<
        typeof useAdminStats
      >,
    );

    render(<AdminDashboardPage />);

    expect(screen.getByText(/platform statistics could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/HTTP 500/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /reload statistics/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('offers retries for the activity and health failures', async () => {
    const activityRefetch = jest.fn();
    const healthRefetch = jest.fn();
    jest.mocked(useAdminActivity).mockReturnValue(
      failedQuery(new Error('activity down'), activityRefetch) as unknown as ReturnType<
        typeof useAdminActivity
      >,
    );
    jest.mocked(useAdminSystemHealth).mockReturnValue(
      failedQuery(new Error('health down'), healthRefetch) as unknown as ReturnType<
        typeof useAdminSystemHealth
      >,
    );

    render(<AdminDashboardPage />);

    expect(screen.queryByText(/activity down/)).not.toBeInTheDocument();
    expect(screen.queryByText(/health down/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /reload activity/i }));
    await userEvent.click(screen.getByRole('button', { name: /re-run health check/i }));

    expect(activityRefetch).toHaveBeenCalledTimes(1);
    expect(healthRefetch).toHaveBeenCalledTimes(1);
  });
});
