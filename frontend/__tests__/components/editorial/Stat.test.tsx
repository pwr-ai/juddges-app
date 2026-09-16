import React from 'react';
import { render, screen } from '@testing-library/react';
import { Stat } from '@/components/editorial/Stat';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      React.createElement('div', { className }, children),
  },
  useInView: () => true,
}));

describe('Stat', () => {
  it('formats numeric values (47K, 1.2M)', () => {
    render(<Stat static value={47_000} label="Judgments" />);
    expect(screen.getByText('47K')).toBeInTheDocument();
  });

  it('renders string values verbatim — years and ranks must not be abbreviated', () => {
    render(<Stat static value="1945" label="Founded" />);
    expect(screen.getByText('1945')).toBeInTheDocument();
  });

  it('accepts non-numeric figures such as "Top 3"', () => {
    render(<Stat static value="Top 3" label="National ranking" />);
    expect(screen.getByText('Top 3')).toBeInTheDocument();
  });

  it('renders the suffix after a string value', () => {
    const { container } = render(<Stat static value="3M" suffix="+" label="Documents" />);
    expect(container.textContent).toContain('3M+');
  });
});
