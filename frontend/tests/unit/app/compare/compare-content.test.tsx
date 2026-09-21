import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/components/charts/BivariateBarChart', () => ({
  BivariateBarChart: (props: { categories: string[]; plData: number[]; ukData: number[] }) => (
    <div
      data-testid="bivariate"
      data-categories={props.categories.join('|')}
      data-pl={props.plData.join('|')}
      data-uk={props.ukData.join('|')}
    />
  ),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values
        ? `${key} ${Object.entries(values)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')}`
        : key,
    locale: 'en',
  }),
}));
jest.mock('@/lib/compare/api', () => ({
  downloadCompareCsv: jest.fn(() => Promise.resolve()),
  createCollectionPair: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { toast } from 'sonner';

import { CompareView } from '@/app/compare/_components/CompareContent';
import { downloadCompareCsv } from '@/lib/compare/api';
import type { CompareRequest, CompareResponse } from '@/lib/compare/types';

const data: CompareResponse = {
  jurisdictions: ['PL', 'UK'],
  totals: { PL: 812, UK: 430 },
  ignored_filter_keys: ['jurisdiction'],
  filters: { appellant: ['offender'] },
  text_query: null,
  pair: null,
  fields: [
    {
      field: 'appeal_outcome',
      label: 'Appeal Outcome',
      source: 'base',
      kind: 'enum_array',
      coverage: {
        PL: { covered: 812, total: 812, ratio: 1 },
        UK: { covered: 430, total: 430, ratio: 1 },
      },
      tier: 'primary',
      missing_in: [],
      values: [
        {
          value: 'outcome_dismissed_or_refused',
          counts: { PL: 500, UK: 200 },
          shares: { PL: 0.6158, UK: 0.4651 },
        },
      ],
    },
    {
      field: 'sentence_serve',
      label: 'Sentence Type',
      source: 'base',
      kind: 'enum_array',
      coverage: {
        PL: { covered: 600, total: 812, ratio: 0.7389 },
        UK: { covered: 420, total: 430, ratio: 0.9767 },
      },
      tier: 'partial',
      missing_in: [],
      values: [
        { value: 'serve_concurrent', counts: { PL: 300, UK: 200 }, shares: { PL: 0.5, UK: 0.4762 } },
      ],
    },
    {
      field: 'plea_point',
      label: 'Plea Point',
      source: 'base',
      kind: 'enum',
      coverage: {
        PL: { covered: 700, total: 812, ratio: 0.8621 },
        UK: { covered: 0, total: 430, ratio: 0 },
      },
      tier: 'unavailable',
      missing_in: ['UK'],
      values: [],
    },
    {
      field: 'did_offender_confess',
      label: 'Confession',
      source: 'base',
      kind: 'boolean',
      coverage: {
        PL: { covered: 0, total: 812, ratio: 0 },
        UK: { covered: 0, total: 430, ratio: 0 },
      },
      tier: 'empty',
      missing_in: ['PL', 'UK'],
      values: [],
    },
  ],
};

const request: CompareRequest = { filters: data.filters, text_query: null };

describe('CompareView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('with a mixed-tier response', () => {
    beforeEach(() => render(<CompareView data={data} request={request} />));

    it('shows N_PL and N_UK', () => {
      expect(screen.getByText('812')).toBeInTheDocument();
      expect(screen.getByText('430')).toBeInTheDocument();
    });

    it('renders primary fields as share charts in percent', () => {
      const charts = screen.getAllByTestId('bivariate');
      expect(charts[0]).toHaveAttribute('data-pl', '61.6');
      expect(charts[0]).toHaveAttribute('data-uk', '46.5');
    });

    it('numbers the figures continuously across sections', () => {
      expect(screen.getByText(/FIG\.\s*01/)).toBeInTheDocument();
      expect(screen.getByText(/FIG\.\s*02/)).toBeInTheDocument();
    });

    it('badges partial-coverage fields and keeps them out of the first section', () => {
      expect(screen.getByText('compare.coverageBadge pl=74 uk=98')).toBeInTheDocument();
      const primary = screen.getByRole('region', { name: 'compare.sectionPrimary' });
      const partial = screen.getByRole('region', { name: 'compare.sectionPartial' });
      expect(primary).toHaveTextContent('Appeal Outcome');
      expect(primary).not.toHaveTextContent('Sentence Type');
      expect(partial).toHaveTextContent('Sentence Type');
    });

    it('hides zero-coverage fields behind a message instead of drawing 0', () => {
      expect(screen.getAllByTestId('bivariate')).toHaveLength(2);
      expect(
        screen.getByText('compare.unavailableOne field=Plea Point jurisdiction=UK covered=0 total=430'),
      ).toBeInTheDocument();
    });

    it('does not list fields that are empty on both sides', () => {
      expect(screen.queryByText(/Confession/)).not.toBeInTheDocument();
      expect(screen.queryByText(/compare\.unavailableBoth/)).not.toBeInTheDocument();
    });

    it('tells the user the jurisdiction condition was ignored', () => {
      expect(screen.getByText('compare.jurisdictionIgnored')).toBeInTheDocument();
    });

    it('does not render a save-pair control without a handler', () => {
      expect(screen.queryByRole('button', { name: 'compare.savePair' })).not.toBeInTheDocument();
    });

    it('exports CSV for the current request', () => {
      fireEvent.click(screen.getByRole('button', { name: 'compare.exportCsv' }));
      expect(downloadCompareCsv).toHaveBeenCalledWith(request);
    });

    it('copies the permalink and confirms with a toast', async () => {
      const writeText = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
      Object.assign(navigator, { clipboard: { writeText } });

      fireEvent.click(screen.getByRole('button', { name: 'compare.copyLink' }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('compare.linkCopied'));
      const copied = writeText.mock.calls[0][0];
      expect(copied).toContain('/compare?');
      expect(copied).toContain('f=');
    });
  });

  it('lists fields missing in both jurisdictions when they are unavailable (not empty)', () => {
    const both: CompareResponse = {
      ...data,
      fields: [{ ...data.fields[2], missing_in: ['PL', 'UK'], tier: 'unavailable' }],
    };
    render(<CompareView data={both} request={request} />);
    expect(screen.getByText('compare.unavailableBoth field=Plea Point')).toBeInTheDocument();
  });

  it('renders the save-pair slot when a handler is provided', () => {
    const onSavePair = jest.fn();
    render(<CompareView data={data} request={request} onSavePair={onSavePair} />);
    fireEvent.click(screen.getByRole('button', { name: 'compare.savePair' }));
    expect(onSavePair).toHaveBeenCalledTimes(1);
  });

  it('shows the no-match state instead of figures when both totals are zero', () => {
    render(
      <CompareView
        data={{ ...data, totals: { PL: 0, UK: 0 }, fields: [] }}
        request={request}
      />,
    );
    expect(screen.getByText('compare.noMatchesTitle')).toBeInTheDocument();
    expect(screen.queryAllByTestId('bivariate')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'compare.savePair' })).not.toBeInTheDocument();
  });
});
