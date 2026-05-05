import { prepareChartData } from '@/lib/chart-data-preparation';
import { JudgmentData } from '@/app/use-cases/swiss-franc/types';

function buildJudgment(overrides: Partial<JudgmentData> = {}): JudgmentData {
  return {
    id: 1,
    apelacja: 'Warszawa',
    typ_sadu: 'Sąd Apelacyjny',
    instancja_sadu: 'II',
    podstawa_prawna: 'art. 358 KC',
    podstawa_prawna_podana: true,
    rodzaj_roszczenia: 'odfrankowienie',
    modyfikacje: false,
    wynik_sprawy: 'wygrana',
    data_wyroku: '2020-05-01',
    ...overrides,
  };
}

function buildBatch(year: string, value: string, count: number): JudgmentData[] {
  return Array.from({ length: count }, (_, i) =>
    buildJudgment({
      id: i,
      data_wyroku: `${year}-01-01`,
      wynik_sprawy: value,
    })
  );
}

describe('prepareChartData', () => {
  it('returns empty array for null/undefined data', () => {
    // @ts-expect-error testing runtime guard
    expect(prepareChartData(null, { selectedColumn: 'wynik_sprawy' })).toEqual([]);
    // @ts-expect-error testing runtime guard
    expect(prepareChartData(undefined, { selectedColumn: 'wynik_sprawy' })).toEqual([]);
  });

  it('returns empty array for empty data array', () => {
    expect(prepareChartData([], { selectedColumn: 'wynik_sprawy' })).toEqual([]);
  });

  it('filters out years with fewer than 10 judgments', () => {
    const data = buildBatch('2019', 'wygrana', 5);
    expect(prepareChartData(data, { selectedColumn: 'wynik_sprawy' })).toEqual([]);
  });

  it('returns percentages summing to 100 for years with at least 10 judgments', () => {
    const data = [
      ...buildBatch('2020', 'wygrana', 7),
      ...buildBatch('2020', 'przegrana', 3),
    ];
    const result = prepareChartData(data, { selectedColumn: 'wynik_sprawy' });
    expect(result).toHaveLength(1);
    expect(result[0].year).toBe('2020');
    expect(result[0].values.wygrana).toBeCloseTo(70);
    expect(result[0].values.przegrana).toBeCloseTo(30);
  });

  it('extracts year from full date strings', () => {
    const data = [
      ...buildBatch('2021', 'wygrana', 6),
      ...buildBatch('2021', 'przegrana', 4),
    ];
    const result = prepareChartData(data, { selectedColumn: 'wynik_sprawy' });
    expect(result[0].year).toBe('2021');
  });

  it('skips entries with Unknown values', () => {
    const data = [
      ...buildBatch('2022', 'wygrana', 8),
      ...buildBatch('2022', 'Unknown', 5),
    ];
    const result = prepareChartData(data, { selectedColumn: 'wynik_sprawy' });
    expect(result).toHaveLength(0);
  });

  it('sorts results by year ascending', () => {
    const data = [
      ...buildBatch('2023', 'wygrana', 10),
      ...buildBatch('2020', 'wygrana', 10),
      ...buildBatch('2021', 'wygrana', 10),
    ];
    const result = prepareChartData(data, { selectedColumn: 'wynik_sprawy' });
    expect(result.map(r => r.year)).toEqual(['2020', '2021', '2023']);
  });

  it('skips entries without data_wyroku', () => {
    const dataWithoutYear = Array.from({ length: 10 }, (_, i) =>
      buildJudgment({ id: i, data_wyroku: undefined })
    );
    const result = prepareChartData(dataWithoutYear, { selectedColumn: 'wynik_sprawy' });
    expect(result).toEqual([]);
  });
});
