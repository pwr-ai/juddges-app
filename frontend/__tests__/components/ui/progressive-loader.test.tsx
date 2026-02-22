/**
 * Tests for ProgressiveLoader Component
 */

import { render, screen, waitFor } from '@testing-library/react';
import { ProgressiveLoader } from '@/components/ui/ProgressiveLoader';

describe('ProgressiveLoader', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows nothing initially when loading (before delay)', () => {
    const { container } = render(
      <ProgressiveLoader
        isLoading={true}
        skeleton={<div>Skeleton</div>}
      >
        <div>Content</div>
      </ProgressiveLoader>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows skeleton after delay', () => {
    render(
      <ProgressiveLoader
        isLoading={true}
        skeleton={<div>Skeleton</div>}
        delay={200}
      >
        <div>Content</div>
      </ProgressiveLoader>
    );

    // Before delay
    expect(screen.queryByText('Skeleton')).not.toBeInTheDocument();

    // After delay
    jest.advanceTimersByTime(200);
    expect(screen.getByText('Skeleton')).toBeInTheDocument();
  });

  it('shows content when not loading', () => {
    render(
      <ProgressiveLoader
        isLoading={false}
        skeleton={<div>Skeleton</div>}
      >
        <div>Content</div>
      </ProgressiveLoader>
    );

    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.queryByText('Skeleton')).not.toBeInTheDocument();
  });

  it('enforces minimum loading time', async () => {
    const { rerender } = render(
      <ProgressiveLoader
        isLoading={true}
        skeleton={<div>Skeleton</div>}
        delay={100}
        minLoadingTime={500}
      >
        <div>Content</div>
      </ProgressiveLoader>
    );

    // Show skeleton after delay
    jest.advanceTimersByTime(100);
    expect(screen.getByText('Skeleton')).toBeInTheDocument();

    // Loading finishes after only 200ms
    jest.advanceTimersByTime(100);
    rerender(
      <ProgressiveLoader
        isLoading={false}
        skeleton={<div>Skeleton</div>}
        delay={100}
        minLoadingTime={500}
      >
        <div>Content</div>
      </ProgressiveLoader>
    );

    // Should still show skeleton (enforcing minimum time)
    expect(screen.getByText('Skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    // After remaining time (300ms more to reach 500ms total)
    jest.advanceTimersByTime(300);
    await waitFor(() => {
      expect(screen.queryByText('Skeleton')).not.toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  it('does not enforce minimum time if already exceeded', () => {
    const { rerender } = render(
      <ProgressiveLoader
        isLoading={true}
        skeleton={<div>Skeleton</div>}
        delay={100}
        minLoadingTime={500}
      >
        <div>Content</div>
      </ProgressiveLoader>
    );

    // Show skeleton
    jest.advanceTimersByTime(100);
    expect(screen.getByText('Skeleton')).toBeInTheDocument();

    // Loading finishes after 600ms (exceeds minimum)
    jest.advanceTimersByTime(500);
    rerender(
      <ProgressiveLoader
        isLoading={false}
        skeleton={<div>Skeleton</div>}
        delay={100}
        minLoadingTime={500}
      >
        <div>Content</div>
      </ProgressiveLoader>
    );

    // Should immediately show content
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('handles rapid loading state changes', () => {
    const { rerender } = render(
      <ProgressiveLoader
        isLoading={true}
        skeleton={<div>Skeleton</div>}
        delay={200}
      >
        <div>Content</div>
      </ProgressiveLoader>
    );

    // Loading finishes before delay
    jest.advanceTimersByTime(100);
    rerender(
      <ProgressiveLoader
        isLoading={false}
        skeleton={<div>Skeleton</div>}
        delay={200}
      >
        <div>Content</div>
      </ProgressiveLoader>
    );

    // Should show content without ever showing skeleton
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.queryByText('Skeleton')).not.toBeInTheDocument();
  });

  it('uses custom delay', () => {
    render(
      <ProgressiveLoader
        isLoading={true}
        skeleton={<div>Skeleton</div>}
        delay={500}
      >
        <div>Content</div>
      </ProgressiveLoader>
    );

    // Should not show skeleton yet
    jest.advanceTimersByTime(400);
    expect(screen.queryByText('Skeleton')).not.toBeInTheDocument();

    // Should show skeleton after custom delay
    jest.advanceTimersByTime(100);
    expect(screen.getByText('Skeleton')).toBeInTheDocument();
  });
});
