import { fireEvent, render, screen } from '@testing-library/react';

const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/compare',
}));
jest.mock('@/components/charts/BivariateBarChart', () => ({
  BivariateBarChart: () => <div data-testid="bivariate" />,
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));
const useCompare = jest.fn();
jest.mock('@/lib/compare/api', () => ({
  useCompare: (...args: unknown[]) => useCompare(...args),
  downloadCompareCsv: jest.fn(),
  createCollectionPair: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { CompareContent } from '@/app/compare/_components/CompareContent';
import { encodeFilters } from '@/lib/extractions/use-extracted-data-filters';

const idle = { data: undefined, error: null, isError: false, isPending: true, isFetching: false, refetch: jest.fn() };

describe('CompareContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = '';
    useCompare.mockReturnValue(idle);
  });

  it('does not run the comparison until something is filtered', () => {
    render(<CompareContent />);
    expect(screen.getByText('compare.emptyTitle')).toBeInTheDocument();
    expect(useCompare).toHaveBeenLastCalledWith({ filters: {}, text_query: null }, false);
    expect(screen.queryByText('compare.loading')).not.toBeInTheDocument();
  });

  it('reads ?f= and ?q= from the URL and enables the query', () => {
    search = `f=${encodeFilters({ appellant: ['offender'] })}&q=fraud`;
    render(<CompareContent />);
    expect(useCompare).toHaveBeenLastCalledWith(
      { filters: { appellant: ['offender'] }, text_query: 'fraud' },
      true,
    );
    expect(screen.getByText('compare.loading')).toBeInTheDocument();
  });

  it('shows the friendly error card, never the raw exception', () => {
    search = 'q=fraud';
    useCompare.mockReturnValue({ ...idle, isPending: false, isError: true, error: new Error('HTTP 500 boom') });
    render(<CompareContent />);
    expect(screen.getByRole('alert')).toHaveTextContent('compare.loadError');
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
  });

  it('applies the free-text box on Enter', () => {
    render(<CompareContent />);
    const box = screen.getByLabelText('compare.askQuestion');
    fireEvent.change(box, { target: { value: 'fraud' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(useCompare).toHaveBeenLastCalledWith({ filters: {}, text_query: 'fraud' }, true);
  });

  it('hands the save-pair request up when a handler is given', () => {
    search = 'q=fraud';
    useCompare.mockReturnValue({
      ...idle,
      isPending: false,
      data: {
        jurisdictions: ['PL', 'UK'], totals: { PL: 1, UK: 1 }, fields: [], ignored_filter_keys: [],
        filters: {}, text_query: 'fraud', pair: null,
      },
    });
    const onSavePair = jest.fn();
    render(<CompareContent onSavePair={onSavePair} />);
    fireEvent.click(screen.getByRole('button', { name: 'compare.savePair' }));
    expect(onSavePair).toHaveBeenCalledWith({ filters: {}, text_query: 'fraud' });
  });
});
