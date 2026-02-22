/**
 * Tests for Skeleton Components
 */

import { render, screen } from '@testing-library/react';
import {
  SkeletonText,
  SkeletonCard,
  SearchResultsSkeleton,
  ChatMessageSkeleton,
  TableSkeleton
} from '@/components/ui/skeletons';

describe('SkeletonText', () => {
  it('renders with default 3 lines', () => {
    const { container } = render(<SkeletonText />);
    const lines = container.querySelectorAll('[aria-hidden="true"]');
    expect(lines).toHaveLength(3);
  });

  it('renders custom number of lines', () => {
    const { container } = render(<SkeletonText lines={5} />);
    const lines = container.querySelectorAll('[aria-hidden="true"]');
    expect(lines).toHaveLength(5);
  });

  it('applies custom widths', () => {
    const widths = ['100%', '90%', '75%'];
    const { container } = render(<SkeletonText lines={3} widths={widths} />);
    const lines = container.querySelectorAll('[aria-hidden="true"]');

    widths.forEach((width, index) => {
      expect(lines[index]).toHaveStyle({ width });
    });
  });

  it('makes last line 75% width by default', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const lines = container.querySelectorAll('[aria-hidden="true"]');
    expect(lines[2]).toHaveStyle({ width: '75%' });
  });

  it('has proper accessibility attributes', () => {
    render(<SkeletonText />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading text')).toBeInTheDocument();
    expect(screen.getByText('Loading content...')).toHaveClass('sr-only');
  });

  it('applies custom className', () => {
    const { container } = render(<SkeletonText className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});

describe('SkeletonCard', () => {
  it('renders with all elements', () => {
    const { container } = render(<SkeletonCard />);

    // Should have title skeleton
    const elements = container.querySelectorAll('[aria-hidden="true"]');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('renders without metadata when showMetadata is false', () => {
    const { container } = render(<SkeletonCard showMetadata={false} />);

    // Count skeleton elements - should not include metadata badges
    const metadataElements = container.querySelectorAll('.pt-2');
    expect(metadataElements).toHaveLength(0);
  });

  it('renders custom number of content lines', () => {
    render(<SkeletonCard contentLines={5} />);
    // SkeletonText with 5 lines should be rendered
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<SkeletonCard />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading card')).toBeInTheDocument();
    expect(screen.getByText('Loading card content...')).toHaveClass('sr-only');
  });
});

describe('SearchResultsSkeleton', () => {
  it('renders default 5 skeleton cards', () => {
    render(<SearchResultsSkeleton />);
    const cards = screen.getAllByLabelText('Loading card');
    expect(cards).toHaveLength(5);
  });

  it('renders custom number of cards', () => {
    render(<SearchResultsSkeleton count={10} />);
    const cards = screen.getAllByLabelText('Loading card');
    expect(cards).toHaveLength(10);
  });

  it('has proper accessibility attributes', () => {
    render(<SearchResultsSkeleton />);
    expect(screen.getByLabelText('Loading search results')).toBeInTheDocument();
    expect(screen.getByText('Loading search results...')).toHaveClass('sr-only');
  });
});

describe('ChatMessageSkeleton', () => {
  it('renders avatar and message content', () => {
    const { container } = render(<ChatMessageSkeleton />);

    // Should have avatar (circular skeleton)
    const avatar = container.querySelector('.rounded-full');
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveClass('w-8', 'h-8');
  });

  it('renders custom number of message lines', () => {
    render(<ChatMessageSkeleton lines={5} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<ChatMessageSkeleton />);
    expect(screen.getByLabelText('Loading message')).toBeInTheDocument();
    expect(screen.getByText('Loading message...')).toHaveClass('sr-only');
  });
});

describe('TableSkeleton', () => {
  it('renders with default rows and columns', () => {
    const { container } = render(<TableSkeleton />);
    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(5); // default
  });

  it('renders custom rows and columns', () => {
    const { container } = render(<TableSkeleton rows={10} columns={6} />);

    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(10);

    const firstRowCells = bodyRows[0].querySelectorAll('td');
    expect(firstRowCells).toHaveLength(6);
  });

  it('renders header when showHeader is true', () => {
    const { container } = render(<TableSkeleton showHeader={true} />);
    const thead = container.querySelector('thead');
    expect(thead).toBeInTheDocument();
  });

  it('does not render header when showHeader is false', () => {
    const { container } = render(<TableSkeleton showHeader={false} />);
    const thead = container.querySelector('thead');
    expect(thead).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<TableSkeleton />);
    expect(screen.getByLabelText('Loading table')).toBeInTheDocument();
    expect(screen.getByText('Loading table data...')).toHaveClass('sr-only');
  });
});

describe('Skeleton Animations', () => {
  it('all skeletons have animate-pulse or animate-shimmer', () => {
    const { container: textContainer } = render(<SkeletonText />);
    const { container: cardContainer } = render(<SkeletonCard />);

    const textElements = textContainer.querySelectorAll('.animate-shimmer, .animate-pulse');
    const cardElements = cardContainer.querySelectorAll('.animate-shimmer, .animate-pulse');

    expect(textElements.length).toBeGreaterThan(0);
    expect(cardElements.length).toBeGreaterThan(0);
  });
});
