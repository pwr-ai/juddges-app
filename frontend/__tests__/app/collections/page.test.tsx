/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CollectionsPage from '@/app/collections/page';
import { getCollections } from '@/lib/api/collections';
import { firstHeadingJump } from '../../helpers/heading-order';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@/lib/api/collections', () => ({
  getCollections: jest.fn(),
  createCollection: jest.fn(),
  deleteCollection: jest.fn(),
}));

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('@/lib/logger', () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn() };
  logger.child.mockReturnValue(logger);
  return { __esModule: true, default: logger, logger };
});

const collection = (id: string, name: string, docs: string[]) => ({
  id,
  name,
  description: `${name} description`,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-02T00:00:00Z',
  documents: docs,
  document_count: docs.length,
});

describe('CollectionsPage accessibility semantics', () => {
  beforeEach(() => {
    push.mockClear();
    (getCollections as jest.Mock).mockResolvedValue([
      collection('c1', 'Alpha collection', ['d1', 'd2']),
      collection('c2', 'Beta collection', []),
    ]);
  });

  it('gives the sort select an accessible name', async () => {
    render(<CollectionsPage />);
    expect(await screen.findByRole('combobox', { name: /sort by/i })).toBeInTheDocument();
  });

  it('renders each card title as a link and no role=button wrapper around other controls', async () => {
    const { container } = render(<CollectionsPage />);
    const link = await screen.findByRole('link', { name: 'Alpha collection' });
    expect(link).toHaveAttribute('href', '/collections/c1');

    const wrappers = Array.from(container.querySelectorAll('[role="button"]')).filter(
      (el) => el.querySelector('a[href], button, input, select, textarea, [tabindex]') !== null,
    );
    expect(wrappers).toHaveLength(0);
  });

  it('keeps the Open and Delete buttons as separate controls', async () => {
    render(<CollectionsPage />);
    await screen.findByRole('link', { name: 'Alpha collection' });
    const open = screen.getAllByRole('button', { name: 'Open collection' })[0];
    await userEvent.click(open);
    expect(push).toHaveBeenCalledWith('/collections/c1');
    expect(screen.getAllByRole('button', { name: 'Delete collection' })).toHaveLength(2);
  });

  it('puts card titles at h2 under the page h1 (no skipped level)', async () => {
    const { container } = render(<CollectionsPage />);
    const link = await screen.findByRole('link', { name: 'Alpha collection' });
    expect(within(link.closest('h2') as HTMLElement).getByRole('link')).toBe(link);
    await waitFor(() => expect(firstHeadingJump(container)).toBeNull());
  });
});
