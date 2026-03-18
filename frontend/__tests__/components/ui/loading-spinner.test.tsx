import { render, screen } from '@testing-library/react';
import { LoadingSpinner, InlineSpinner } from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders the default screen-reader loading text', () => {
    render(<LoadingSpinner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toHaveClass('sr-only');
  });

  it('renders both visible and accessible text for a custom message', () => {
    render(<LoadingSpinner message="Processing your request..." />);

    const matches = screen.getAllByText('Processing your request...');
    expect(matches).toHaveLength(2);
    expect(matches.some((node) => !node.classList.contains('sr-only'))).toBe(true);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Processing your request...'
    );
  });

  it('applies the requested size and variant classes', () => {
    const { container } = render(<LoadingSpinner size="lg" variant="secondary" />);
    const spinner = container.querySelector('.animate-spin');

    expect(spinner).toHaveClass('w-12', 'h-12', 'border-4', 'border-t-secondary');
  });
});

describe('InlineSpinner', () => {
  it('renders an inline animated spinner', () => {
    const { container } = render(<InlineSpinner className="ml-2" />);
    const spinner = container.querySelector('.animate-spin');

    expect(spinner).toHaveClass('ml-2');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
  });
});
