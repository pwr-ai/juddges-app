import React from 'react';
import { render } from '@testing-library/react';

const mockUseAuth = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import { CompactFooter } from '@/components/footer/CompactFooter';

const GATED = ['/help', '/dataset-comparison'];

describe('CompactFooter', () => {
  it('hides auth-gated links for guests', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const { container } = render(<CompactFooter />);

    for (const href of GATED) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeInTheDocument();
    }
    expect(container.querySelector('a[href="/about"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/privacy"]')).toBeInTheDocument();
  });

  it('shows auth-gated links for a signed-in user', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
    const { container } = render(<CompactFooter />);

    for (const href of GATED) {
      expect(container.querySelector(`a[href="${href}"]`)).toBeInTheDocument();
    }
  });

  it('keeps them while auth is loading, so signed-in users see no layout shift', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { container } = render(<CompactFooter />);

    for (const href of GATED) {
      expect(container.querySelector(`a[href="${href}"]`)).toBeInTheDocument();
    }
  });

  it('wraps the link row with >=24px tap targets', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
    const { container } = render(<CompactFooter />);
    const link = container.querySelector('a[href="/about"]') as HTMLElement;

    expect(link.parentElement?.className).toContain('flex-wrap');
    expect(link.className).toContain('min-h-6');
  });
});
