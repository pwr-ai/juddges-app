import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchHistoryPage from '@/app/history/page';
import * as searchHistoryApi from '@/lib/api/search-history';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/api/search-history', () => ({
  getUserSearchHistory: jest.fn(),
  clearUserSearchHistory: jest.fn(),
}));

describe('SearchHistoryPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: true,
    });

    render(<SearchHistoryPage />);
    expect(screen.queryByText('Search History')).not.toBeInTheDocument();
  });

  it('renders history items when loaded', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      loading: false,
    });

    (searchHistoryApi.getUserSearchHistory as jest.Mock).mockResolvedValue([
      {
        query: 'vat deduction ruling',
        hit_count: 5,
        topic_hits_count: 1,
        processing_ms: 28,
        filters: null,
        created_at: '2026-08-13T10:00:00Z',
      },
    ]);

    render(<SearchHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Search History')).toBeInTheDocument();
      expect(screen.getByText('vat deduction ruling')).toBeInTheDocument();
      expect(screen.getByText('5 results')).toBeInTheDocument();
      expect(screen.getByText('28 ms')).toBeInTheDocument();
    });
  });

  it('filters history items based on search input', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      loading: false,
    });

    (searchHistoryApi.getUserSearchHistory as jest.Mock).mockResolvedValue([
      { query: 'alpha query', created_at: '2026-08-13T10:00:00Z' },
      { query: 'beta search', created_at: '2026-08-13T11:00:00Z' },
    ]);

    render(<SearchHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText('alpha query')).toBeInTheDocument();
      expect(screen.getByText('beta search')).toBeInTheDocument();
    });

    const filterInput = screen.getByPlaceholderText('Filter history queries...');
    fireEvent.change(filterInput, { target: { value: 'alpha' } });

    await waitFor(() => {
      expect(screen.getByText('alpha query')).toBeInTheDocument();
      expect(screen.queryByText('beta search')).not.toBeInTheDocument();
    });
  });
});
