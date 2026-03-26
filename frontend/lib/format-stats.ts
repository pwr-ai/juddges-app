/**
 * Format large numbers for dashboard statistics display
 *
 * Examples:
 * - 3,233,134 → "3M"
 * - 2,691,279 → "2.5M"
 * - 479,209 → "450K"
 * - 164,202 → "150K"
 */
export function formatStatNumber(value: number | undefined | null): string {
  // Handle undefined/null values gracefully
  if (value === undefined || value === null) {
    return "0";
  }

  if (value >= 1_000_000) {
    // Round to nearest 0.5M
    const rounded = Math.floor((value / 1_000_000) * 2) / 2;
    return rounded % 1 === 0 ? `${rounded}M` : `${rounded.toFixed(1)}M`;
  }

  if (value >= 100_000) {
    // Round to nearest 50K
    return `${Math.floor(value / 50_000) * 50}K`;
  }

  if (value >= 10_000) {
    // Round to nearest 10K
    return `${Math.floor(value / 10_000) * 10}K`;
  }

  if (value >= 1_000) {
    // Round to nearest 1K
    return `${Math.floor(value / 1_000)}K`;
  }

  return value.toLocaleString();
}
