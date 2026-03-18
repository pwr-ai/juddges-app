import { render, screen } from '@testing-library/react';
import {
  ChatMessageSkeleton,
  SearchResultsSkeleton,
  SkeletonCard,
  SkeletonText,
  TableSkeleton,
} from '@/components/ui/skeletons';

describe('skeleton components', () => {
  it('renders configurable text skeleton lines', () => {
    const { container } = render(<SkeletonText lines={4} widths={['100%', '90%', '80%', '70%']} />);
    const lines = container.querySelectorAll('[aria-hidden="true"]');

    expect(lines).toHaveLength(4);
    expect(lines[3]).toHaveStyle({ width: '70%' });
  });

  it('renders card and search-results wrappers with accessible labels', () => {
    render(
      <>
        <SkeletonCard />
        <SearchResultsSkeleton count={3} />
      </>
    );

    expect(screen.getAllByLabelText('Loading card')).toHaveLength(4);
    expect(screen.getByLabelText('Loading search results')).toBeInTheDocument();
  });

  it('renders chat and table skeleton structures', () => {
    const { container } = render(
      <>
        <ChatMessageSkeleton lines={5} />
        <TableSkeleton rows={2} columns={3} />
      </>
    );

    expect(screen.getByLabelText('Loading message')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading table')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });
});
