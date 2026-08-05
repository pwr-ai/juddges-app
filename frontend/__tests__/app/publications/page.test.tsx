/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PublicationsPage from '@/app/publications/page';
import { getPublications } from '@/lib/api/publications';
import {
  PublicationProject,
  PublicationStatus,
  PublicationType,
  type PublicationWithResources,
} from '@/types/publication';

jest.mock('next/link', () => {
  function MockLink({ children, ...props }: React.ComponentProps<'a'>) {
    return <a {...props}>{children}</a>;
  }

  return MockLink;
});

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

jest.mock('@/lib/api/publications', () => ({
  getPublications: jest.fn(),
}));

jest.mock('@/components/publications/publication-card', () => ({
  PublicationCard: ({ publication }: { publication: PublicationWithResources }) => (
    <article>{publication.title}</article>
  ),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
  logger: {
    error: jest.fn(),
  },
}));

const publication: PublicationWithResources = {
  id: 'real-publication',
  title: 'A real catalog publication',
  authors: [{ name: 'Ada Lovelace' }],
  venue: 'Journal of Legal Research',
  year: 2026,
  abstract: 'Research abstract',
  project: PublicationProject.JUDDGES,
  type: PublicationType.JOURNAL,
  status: PublicationStatus.PUBLISHED,
  links: {},
};

describe('PublicationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows real API records to an anonymous visitor', async () => {
    jest.mocked(getPublications).mockResolvedValue([publication]);

    render(<PublicationsPage />);

    expect(
      await screen.findByText('A real catalog publication'),
    ).toBeInTheDocument();
    expect(screen.getByText('Showing 1 publication')).toBeInTheDocument();
    expect(screen.queryByText('Manage Publications')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Unseen Influence: Computational Propaganda/i),
    ).not.toBeInTheDocument();
  });

  it('shows an explicit empty catalog state without static fallback records', async () => {
    jest.mocked(getPublications).mockResolvedValue([]);

    render(<PublicationsPage />);

    expect(
      await screen.findByRole('heading', { name: 'No publications available' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The research catalog is currently empty. Published work will appear here when it is added.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Clear all filters')).not.toBeInTheDocument();
  });

  it('shows an error with a retry that can recover to real data', async () => {
    const user = userEvent.setup();
    jest
      .mocked(getPublications)
      .mockRejectedValueOnce(new Error('backend unavailable'))
      .mockResolvedValueOnce([publication]);

    render(<PublicationsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not load the publications catalog.');
    expect(
      screen.queryByText(/Unseen Influence: Computational Propaganda/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByText('A real catalog publication')).toBeInTheDocument();
    });
    expect(getPublications).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
