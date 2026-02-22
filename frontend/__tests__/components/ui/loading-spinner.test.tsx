/**
 * Tests for LoadingSpinner Component
 */

import { render, screen } from '@testing-library/react';
import { LoadingSpinner, InlineSpinner } from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toHaveClass('sr-only');
  });

  it('renders with custom message', () => {
    const message = 'Processing your request...';
    render(<LoadingSpinner message={message} />);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText(message)).not.toHaveClass('sr-only');
  });

  it('applies size variants correctly', () => {
    const { container: smContainer } = render(<LoadingSpinner size="sm" />);
    const { container: mdContainer } = render(<LoadingSpinner size="md" />);
    const { container: lgContainer } = render(<LoadingSpinner size="lg" />);
    const { container: xlContainer } = render(<LoadingSpinner size="xl" />);

    const smSpinner = smContainer.querySelector('.animate-spin');
    const mdSpinner = mdContainer.querySelector('.animate-spin');
    const lgSpinner = lgContainer.querySelector('.animate-spin');
    const xlSpinner = xlContainer.querySelector('.animate-spin');

    expect(smSpinner).toHaveClass('w-4', 'h-4', 'border-2');
    expect(mdSpinner).toHaveClass('w-8', 'h-8', 'border-3');
    expect(lgSpinner).toHaveClass('w-12', 'h-12', 'border-4');
    expect(xlSpinner).toHaveClass('w-16', 'h-16', 'border-4');
  });

  it('applies variant styles correctly', () => {
    const { container: primaryContainer } = render(<LoadingSpinner variant="primary" />);
    const { container: secondaryContainer } = render(<LoadingSpinner variant="secondary" />);
    const { container: mutedContainer } = render(<LoadingSpinner variant="muted" />);

    const primarySpinner = primaryContainer.querySelector('.animate-spin');
    const secondarySpinner = secondaryContainer.querySelector('.animate-spin');
    const mutedSpinner = mutedContainer.querySelector('.animate-spin');

    expect(primarySpinner).toHaveClass('border-t-primary');
    expect(secondarySpinner).toHaveClass('border-t-secondary');
    expect(mutedSpinner).toHaveClass('border-t-muted-foreground');
  });

  it('applies custom className', () => {
    const { container } = render(<LoadingSpinner className="custom-spinner" />);
    expect(container.firstChild).toHaveClass('custom-spinner');
  });

  it('has proper accessibility attributes', () => {
    const message = 'Loading data';
    render(<LoadingSpinner message={message} />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-label', message);
  });

  it('has aria-hidden on the spinning element', () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('InlineSpinner', () => {
  it('renders with correct classes', () => {
    const { container } = render(<InlineSpinner />);
    const spinner = container.querySelector('.animate-spin');

    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('w-4', 'h-4', 'border-2', 'rounded-full');
  });

  it('applies custom className', () => {
    const { container } = render(<InlineSpinner className="ml-2" />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('ml-2');
  });

  it('has proper accessibility attributes', () => {
    const { container } = render(<InlineSpinner />);
    const spinner = container.querySelector('[role="status"]');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
  });
});
