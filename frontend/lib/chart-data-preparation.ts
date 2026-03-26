import { JudgmentData } from '../app/use-cases/swiss-franc/types';

export interface ChartDataItem {
  year: string;
  values: Record<string, number>;
}

export interface ChartDataPreparationOptions {
  minYear?: number;
  maxYear?: number;
  selectedColumn: keyof JudgmentData;
}

export function prepareChartData(
  data: JudgmentData[],
  options: ChartDataPreparationOptions
): ChartDataItem[] {
  if (!data || data.length === 0) {
    console.warn('No data provided to prepareChartData');
    return [];
  }

  const { selectedColumn } = options;

  // Process dates to extract years
  data = data.map(item => {
    if (item.data_wyroku) {
      const dateStr = String(item.data_wyroku);
      return {
        ...item,
        data_wyroku: dateStr.split('-')[0]
      };
    }
    return item;
  });

  if (data.length === 0) {
    console.warn('No valid data after filtering');
    return [];
  }

  // Initialize year-based data structure
  const yearData: Record<string, Record<string, number>> = {};

  // Process all data into year-based structure
  data.forEach(item => {
    const year = item.data_wyroku;
    // Skip if year is unknown/undefined
    if (!year || year === 'Unknown') return;

    const value = String(item[selectedColumn] || 'Unknown');
    // Skip if value is 'Unknown'
    if (value === 'Unknown') return;

    if (!yearData[year]) {
      yearData[year] = {};
    }

    yearData[year][value] = (yearData[year][value] || 0) + 1;
  });

  // Convert counts to percentages and filter out years with less than 10 judgments
  const formattedData: ChartDataItem[] = Object.entries(yearData)
    .filter(([, values]) => {
      const totalJudgments = Object.values(values).reduce((sum, count) => sum + count, 0);
      return totalJudgments >= 10;
    })
    .map(([year, values]) => {
      const totalJudgments = Object.values(values).reduce((sum, count) => sum + count, 0);
      const percentageValues = Object.fromEntries(
        Object.entries(values).map(([key, count]) => [key, (count / totalJudgments) * 100])
      );
      return {
        year,
        values: percentageValues
      };
    })
    .sort((a, b) => a.year.localeCompare(b.year));

  return formattedData;
}
