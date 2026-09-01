import { render, screen } from '@testing-library/react';

import { GuestLimitBanner } from '@/components/onboarding/GuestLimitBanner';

describe('GuestLimitBanner', () => {
  it.each([null, undefined])(
    'renders nothing for a %s allowance (signed-in visitor)',
    (allowance) => {
      const { container } = render(<GuestLimitBanner allowance={allowance} />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('stays out of the way while the visitor has room to explore', () => {
    const { container } = render(
      <GuestLimitBanner allowance={{ limit: 5, remaining: 3 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('nudges once the allowance is nearly spent', () => {
    render(<GuestLimitBanner allowance={{ limit: 5, remaining: 2 }} />);

    expect(screen.getByText('Guest access')).toBeInTheDocument();
    expect(screen.getByText('2 searches')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create free account/i })).toHaveAttribute(
      'href',
      '/auth/sign-up',
    );
  });

  it('uses the singular for the last free search', () => {
    render(<GuestLimitBanner allowance={{ limit: 5, remaining: 1 }} />);
    expect(screen.getByText('1 search')).toBeInTheDocument();
  });

  it('hardens into a wall once the allowance is spent', () => {
    render(<GuestLimitBanner allowance={{ limit: 5, remaining: 0 }} />);

    expect(screen.getByText('Free searches used')).toBeInTheDocument();
    expect(
      screen.getByText(/used all of your free searches/i),
    ).toBeInTheDocument();
  });

  it('announces itself politely rather than interrupting', () => {
    render(<GuestLimitBanner allowance={{ limit: 5, remaining: 0 }} />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });
});
