/**
 * @jest-environment jsdom
 *
 * Regression tests for #218: the /judge-fingerprint child components used to
 * hardcode Polish strings, so English/UK users saw a mixed-language UI.
 *
 * Mode C (retrofit): the code already works, so each behavior is locked by
 * asserting it under BOTH locales. A dual-locale assertion "bites" — if any
 * string were hardcoded again, it would fail on exactly one locale. The
 * explicit no-Polish-diacritics check under `en` is the direct guard for #218.
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { JudgeProfileCard } from '@/components/judge-fingerprint/JudgeProfileCard';
import { JudgeSearch } from '@/components/judge-fingerprint/JudgeSearch';
import { useDimensionLabels } from '@/components/judge-fingerprint/dimensionLabels';
import type { JudgeProfile } from '@/types/judge-fingerprint';

// JudgeRadarChart pulls recharts (+ d3 ESM) which jest can't transform here,
// and the chart is irrelevant to these i18n assertions — stub it out.
jest.mock('@/components/judge-fingerprint/JudgeRadarChart', () => ({
  JudgeRadarChart: () => null,
  JUDGE_COLORS: [],
}));

type Locale = 'en' | 'pl';

/** Latin-script Polish diacritics — their presence under `en` means a leak. */
const POLISH_DIACRITICS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

function wrapper(locale: Locale) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return (
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </QueryClientProvider>
    );
  };
}

const PROFILE: JudgeProfile = {
  judge_name: 'Jan Kowalski',
  total_cases: 42,
  cases_analyzed: 30,
  dominant_style: 'policy', // -> "Purposive" / "Celowościowa"
  style_scores: { textual: 60, deductive: 40, analogical: 55, policy: 80, teleological: 30 },
  period: { first_case: '2018-01-15', last_case: '2023-11-20' },
  sample_cases: [
    { document_id: 'doc-1', title: 'Sample case A', date: '2020-05-01', reasoning_pattern: 'textual' },
  ],
};

describe('useDimensionLabels', () => {
  it('maps the five dimensions to localized labels (policy -> purposive)', () => {
    const en = renderHook(() => useDimensionLabels(), { wrapper: wrapper('en') });
    expect(en.result.current.textual).toBe('Textual');
    expect(en.result.current.policy).toBe('Purposive');
    expect(en.result.current.teleological).toBe('Teleological');

    const pl = renderHook(() => useDimensionLabels(), { wrapper: wrapper('pl') });
    expect(pl.result.current.textual).toBe('Tekstualna');
    expect(pl.result.current.policy).toBe('Celowościowa');
    expect(pl.result.current.teleological).toBe('Teleologiczna');
  });
});

describe('JudgeProfileCard i18n', () => {
  it('renders English labels and no Polish leakage under en locale', () => {
    render(<JudgeProfileCard profile={PROFILE} />, { wrapper: wrapper('en') });

    expect(screen.getByText('Dominant style')).toBeInTheDocument();
    expect(screen.getByText('Cases')).toBeInTheDocument();
    expect(screen.getByText('Analyzed')).toBeInTheDocument();
    expect(screen.getByText('Sample cases')).toBeInTheDocument();
    // dominant_style 'policy' must surface the reused "Purposive" label
    expect(screen.getByText('Purposive')).toBeInTheDocument();

    // #218 guard: nothing Polish should render in the English UI
    expect(screen.queryByText(POLISH_DIACRITICS)).toBeNull();
    expect(screen.queryByText(/Dominujący styl|Spraw|Przeanalizowanych|Przykładowe/)).toBeNull();
  });

  it('renders Polish labels under pl locale', () => {
    render(<JudgeProfileCard profile={PROFILE} />, { wrapper: wrapper('pl') });

    expect(screen.getByText('Dominujący styl')).toBeInTheDocument();
    expect(screen.getByText('Spraw')).toBeInTheDocument();
    expect(screen.getByText('Przeanalizowanych')).toBeInTheDocument();
    expect(screen.getByText('Przykładowe sprawy')).toBeInTheDocument();
    expect(screen.getByText('Celowościowa')).toBeInTheDocument();
  });

  it('formats the case period in the active locale, not a hardcoded pl-PL', () => {
    const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    const enDate = new Date(PROFILE.period.first_case).toLocaleDateString('en', opts);
    const plDate = new Date(PROFILE.period.first_case).toLocaleDateString('pl', opts);
    // Sanity: the two locales must format differently, else the test can't bite.
    expect(enDate).not.toBe(plDate);

    const { unmount } = render(<JudgeProfileCard profile={PROFILE} />, { wrapper: wrapper('en') });
    expect(screen.getByText(enDate)).toBeInTheDocument();
    expect(screen.queryByText(plDate)).toBeNull();
    unmount();

    render(<JudgeProfileCard profile={PROFILE} />, { wrapper: wrapper('pl') });
    expect(screen.getByText(plDate)).toBeInTheDocument();
  });
});

describe('JudgeSearch i18n', () => {
  const noop = () => {};

  it('renders English placeholder and hint, no Polish leakage under en locale', () => {
    render(
      <JudgeSearch selectedJudges={[]} onSelectJudge={noop} onRemoveJudge={noop} />,
      { wrapper: wrapper('en') }
    );

    expect(
      screen.getByPlaceholderText('Search for a judge by surname...')
    ).toBeInTheDocument();
    expect(screen.getByText(/Search for up to 3 judges/)).toBeInTheDocument();
    expect(screen.queryByText(POLISH_DIACRITICS)).toBeNull();
  });

  it('renders Polish placeholder and hint under pl locale', () => {
    render(
      <JudgeSearch selectedJudges={[]} onSelectJudge={noop} onRemoveJudge={noop} />,
      { wrapper: wrapper('pl') }
    );

    expect(
      screen.getByPlaceholderText('Wyszukaj sędziego po nazwisku...')
    ).toBeInTheDocument();
    expect(screen.getByText(/Wyszukaj do 3 sędziów/)).toBeInTheDocument();
  });

  it('localizes the remove-judge aria-label for selected judges', () => {
    const { unmount } = render(
      <JudgeSearch selectedJudges={['Jan Kowalski']} onSelectJudge={noop} onRemoveJudge={noop} />,
      { wrapper: wrapper('en') }
    );
    expect(screen.getByLabelText('Remove Jan Kowalski')).toBeInTheDocument();
    unmount();

    render(
      <JudgeSearch selectedJudges={['Jan Kowalski']} onSelectJudge={noop} onRemoveJudge={noop} />,
      { wrapper: wrapper('pl') }
    );
    expect(screen.getByLabelText('Usuń Jan Kowalski')).toBeInTheDocument();
  });
});
