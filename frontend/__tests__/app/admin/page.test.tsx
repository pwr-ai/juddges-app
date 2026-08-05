import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

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
});

describe('AdminDashboardPage', () => {
  it('shows the dashboard statistics error instead of hiding the corpus tile', () => {
    jest.mocked(useAdminStats).mockReturnValue(
      successfulQuery({
        total_users: 1,
        total_documents: 42,
        searches_today: 2,
        active_sessions_24h: 1,
        documents_added_this_week: 3,
      }) as ReturnType<typeof useAdminStats>,
    );
    jest.mocked(useAdminActivity).mockReturnValue(
      successfulQuery([]) as ReturnType<typeof useAdminActivity>,
    );
    jest.mocked(useAdminSystemHealth).mockReturnValue(
      successfulQuery({ status: 'healthy', services: {} }) as ReturnType<
        typeof useAdminSystemHealth
      >,
    );
    jest.mocked(useDashboardStats).mockReturnValue({
      data: undefined,
      error: new Error('Failed to fetch stats'),
      isError: true,
      isLoading: false,
    } as ReturnType<typeof useDashboardStats>);

    render(<AdminDashboardPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load corpus statistics: Failed to fetch stats',
    );
  });
});
