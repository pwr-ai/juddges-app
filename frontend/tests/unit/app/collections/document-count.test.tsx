import { render, screen, waitFor } from '@testing-library/react';

import CollectionsPage from '@/app/collections/page';
import { getCollections } from '@/lib/api/collections';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api/collections', () => ({
  createCollection: jest.fn(),
  getCollections: jest.fn(),
  deleteCollection: jest.fn(),
}));

const base = {
  user_id: 'u1',
  description: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('CollectionsPage document count (#738)', () => {
  it('prefers document_count over an empty documents array', async () => {
    (getCollections as jest.Mock).mockResolvedValue([
      { ...base, id: 'c1', name: 'Counted', documents: [], document_count: 5 },
    ]);
    render(<CollectionsPage />);
    // The card is no longer a role=button wrapper (nested-interactive); its title is a link.
    const link = await waitFor(() => screen.getByRole('link', { name: 'Counted' }));
    const card = link.closest('[data-clickable]') as HTMLElement;
    expect(card).toHaveTextContent('5 documents');
  });

  it('falls back to documents.length when document_count is absent', async () => {
    (getCollections as jest.Mock).mockResolvedValue([
      { ...base, id: 'c2', name: 'Legacy', documents: [1, 2, 3] },
    ]);
    render(<CollectionsPage />);
    // The card is no longer a role=button wrapper (nested-interactive); its title is a link.
    const link = await waitFor(() => screen.getByRole('link', { name: 'Legacy' }));
    const card = link.closest('[data-clickable]') as HTMLElement;
    expect(card).toHaveTextContent('3 documents');
  });
});
