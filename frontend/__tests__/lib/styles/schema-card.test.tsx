/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { SchemaCard } from '@/lib/styles/components/schemas/SchemaCard';
import { EmptyState } from '@/lib/styles/components/empty-state';
import { firstHeadingJump } from '../../helpers/heading-order';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const schema = {
  id: 's1',
  name: 'Tax schema',
  description: 'Extracts tax fields',
  status: 'published',
  is_verified: false,
  user_id: 'u1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-02T00:00:00Z',
  field_count: 3,
  text: {},
} as never;

describe.each(['grid', 'list'] as const)('SchemaCard (%s) accessibility semantics', (viewMode) => {
  it('exposes the title as a link and has no interactive wrapper around other controls', () => {
    const { container } = render(<SchemaCard schema={schema} viewMode={viewMode} currentUserId="u1" />);
    const link = screen.getByRole('link', { name: 'Tax schema' });
    expect(link).toHaveAttribute('href', '/schemas/s1');
    expect(link.closest('h2')).not.toBeNull();

    const wrappers = Array.from(container.querySelectorAll('[role="button"]')).filter(
      (el) => el.querySelector('a[href], button, input, select, textarea, [tabindex]') !== null,
    );
    expect(wrappers).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Start extraction' })).toBeInTheDocument();
  });
});

describe('EmptyState titleAs', () => {
  it('renders h3 by default and h2 on request', () => {
    const { rerender } = render(<EmptyState title="Nothing" />);
    expect(screen.getByRole('heading', { name: 'Nothing', level: 3 })).toBeInTheDocument();
    rerender(<EmptyState title="Nothing" titleAs="h2" />);
    expect(screen.getByRole('heading', { name: 'Nothing', level: 2 })).toBeInTheDocument();
  });

  it('does not skip a level under an h1 when used as h2', () => {
    const { container } = render(
      <main>
        <h1>Page</h1>
        <EmptyState title="Nothing" titleAs="h2" />
      </main>,
    );
    expect(firstHeadingJump(container)).toBeNull();
  });
});
