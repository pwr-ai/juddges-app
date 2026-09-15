import { render, screen } from '@testing-library/react';
import { SkeletonCard, SkeletonText } from '@/components/ui/skeletons';

describe('skeleton components', () => {
  it('renders identical placeholder widths on every render', () => {
    // These widths came from Math.random() in the render body, so each render
    // produced different bars and the server and client markup disagreed.
    // Re-rendering must now yield exactly the same widths (#605).
    const widthsOf = (): string[] => {
      const { container, unmount } = render(<SkeletonText lines={4} />);
      const widths = Array.from(
        container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')
      ).map((el) => el.style.width);
      unmount();
      return widths;
    };

    const first = widthsOf();
    const second = widthsOf();

    expect(first.length).toBeGreaterThan(0);
    expect(first.every((width) => width !== '')).toBe(true);
    expect(second).toEqual(first);
  });

  it('renders configurable text skeleton lines', () => {
    const { container } = render(<SkeletonText lines={4} widths={['100%', '90%', '80%', '70%']} />);
    const lines = container.querySelectorAll('[aria-hidden="true"]');

    expect(lines).toHaveLength(4);
    expect(lines[3]).toHaveStyle({ width: '70%' });
  });

  it('renders the card wrapper with an accessible label', () => {
    render(<SkeletonCard />);

    expect(screen.getByLabelText('Loading card')).toBeInTheDocument();
  });
});
