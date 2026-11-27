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

let mockUser: { id: string; app_metadata: { is_admin?: boolean } } | null = null;

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
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

const olderWorkshop: PublicationWithResources = {
  ...publication,
  id: 'older-workshop',
  title: 'An older workshop publication',
  year: 2025,
  type: PublicationType.WORKSHOP,
};

describe('PublicationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPublications).mockReset();
    mockUser = null;
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
      screen.queryByRole('heading', { name: 'Curated reference bibliography' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Year filter: All years' }),
    ).toHaveAttribute('aria-label', 'Year filter: All years');
    expect(
      screen.getByRole('button', { name: 'Type filter: All types' }),
    ).toHaveAttribute('aria-label', 'Type filter: All types');
    expect(
      screen.getByRole('button', { name: 'Sort publications: Date (newest first)' }),
    ).toHaveAttribute('aria-label', 'Sort publications: Date (newest first)');
  });

  it('announces the loading state to assistive technology (admin)', () => {
    mockUser = { id: 'admin-1', app_metadata: { is_admin: true } };
    jest.mocked(getPublications).mockReturnValue(new Promise(() => undefined));

    render(<PublicationsPage />);

    const status = screen.getByRole('status', { name: 'Loading publications' });
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('renders the verified project publications when the catalog is empty (#762)', async () => {
    jest.mocked(getPublications).mockResolvedValue([]);

    render(<PublicationsPage />);

    const link = await screen.findByRole('link', { name: /Bridging AI and Law/ });
    expect(link).toHaveAttribute('href', 'https://openreview.net/forum?id=hWjsyTSWrY');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('heading', { name: 'Project publications' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Partner publications' })).toBeInTheDocument();
    expect(screen.getByText(/Judges on Trial/)).toBeInTheDocument();

    // AppLayoutWrapper already provides the page's <main> landmark.
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.queryByText('No publications available')).not.toBeInTheDocument();
    expect(screen.queryByText(/FactSelfCheck/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unseen Influence/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Illusion of Progress/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Filter & Sort/)).not.toBeInTheDocument();
  });

  it('hides the catalog error from a non-admin visitor', async () => {
    jest.mocked(getPublications).mockRejectedValue(new Error('backend unavailable'));

    render(<PublicationsPage />);

    await screen.findByRole('link', { name: /Bridging AI and Law/ });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/temporarily unavailable/)).not.toBeInTheDocument();
  });

  it('keeps the empty catalog state for admins', async () => {
    mockUser = { id: 'admin-1', app_metadata: { is_admin: true } };
    jest.mocked(getPublications).mockResolvedValue([]);

    render(<PublicationsPage />);

    expect(
      await screen.findByRole('heading', { name: 'No publications available' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bridging AI and Law/ })).toBeInTheDocument();
  });

  it('shows admins an error with a retry that can recover to real data', async () => {
    mockUser = { id: 'admin-1', app_metadata: { is_admin: true } };
    const user = userEvent.setup();
    jest
      .mocked(getPublications)
      .mockRejectedValueOnce(new Error('backend unavailable'))
      .mockResolvedValueOnce([publication]);

    render(<PublicationsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not load the publications catalog.');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByText('A real catalog publication')).toBeInTheDocument();
    });
    expect(getPublications).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('filters the live catalog by year', async () => {
    const user = userEvent.setup();
    jest.mocked(getPublications).mockResolvedValue([publication, olderWorkshop]);

    render(<PublicationsPage />);
    await screen.findByText('A real catalog publication');

    await user.click(screen.getByRole('button', { name: 'Year filter: All years' }));
    await user.click(screen.getByRole('menuitem', { name: '2025' }));
    await user.keyboard('{Escape}');

    expect(screen.getByText('An older workshop publication')).toBeInTheDocument();
    expect(screen.queryByText('A real catalog publication')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 publication (filtered)')).toBeInTheDocument();
  });

  it('filters the live catalog by publication type', async () => {
    const user = userEvent.setup();
    jest.mocked(getPublications).mockResolvedValue([publication, olderWorkshop]);

    render(<PublicationsPage />);
    await screen.findByText('A real catalog publication');

    await user.click(screen.getByRole('button', { name: 'Type filter: All types' }));
    await user.click(screen.getByRole('menuitem', { name: 'Workshop' }));
    await user.keyboard('{Escape}');

    expect(screen.getByText('An older workshop publication')).toBeInTheDocument();
    expect(screen.queryByText('A real catalog publication')).not.toBeInTheDocument();
  });

  it('distinguishes filtered no-results from an empty catalog and resets filters', async () => {
    const user = userEvent.setup();
    jest.mocked(getPublications).mockResolvedValue([publication, olderWorkshop]);

    render(<PublicationsPage />);
    await screen.findByText('A real catalog publication');

    await user.click(screen.getByRole('button', { name: 'Type filter: All types' }));
    await user.click(screen.getByRole('menuitem', { name: 'Conference' }));
    await user.keyboard('{Escape}');

    expect(
      screen.getByRole('heading', { name: 'No publications match your filters' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'No publications available' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(screen.getByText('A real catalog publication')).toBeInTheDocument();
    expect(screen.getByText('An older workshop publication')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'No publications match your filters' }),
    ).not.toBeInTheDocument();
  });
});
