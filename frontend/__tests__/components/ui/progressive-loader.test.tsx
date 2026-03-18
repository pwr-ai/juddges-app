import { act, render, screen } from '@testing-library/react';
import { ProgressiveLoader } from '@/components/ui/ProgressiveLoader';

describe('ProgressiveLoader', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('shows nothing before the delay elapses', () => {
    const { container } = render(
      <ProgressiveLoader isLoading={true} skeleton={<div>Skeleton</div>}>
        <div>Content</div>
      </ProgressiveLoader>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the skeleton after the delay', () => {
    render(
      <ProgressiveLoader isLoading={true} skeleton={<div>Skeleton</div>} delay={200}>
        <div>Content</div>
      </ProgressiveLoader>
    );

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(screen.getByText('Skeleton')).toBeInTheDocument();
  });

  it('shows content immediately when not loading', () => {
    render(
      <ProgressiveLoader isLoading={false} skeleton={<div>Skeleton</div>}>
        <div>Content</div>
      </ProgressiveLoader>
    );

    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('keeps the skeleton visible until the minimum loading time passes', () => {
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

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByText('Skeleton')).toBeInTheDocument();

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

    expect(screen.getByText('Skeleton')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
