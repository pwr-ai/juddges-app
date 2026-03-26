import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumberAbbreviated(num: number): string {
  if (num >= 1000000) {
    const millions = num / 1000000;
    return `${millions.toFixed(1).replace(/\.0$/, '')}M+`;
  }
  if (num >= 1000) {
    const thousands = num / 1000;
    return `${thousands.toFixed(1).replace(/\.0$/, '')}K+`;
  }
  return num.toString();
}

/**
 * Converts snake_case strings to human-readable format.
 * Example: "ustawa_wprowadzajaca_super_agentow" -> "Ustawa wprowadzajaca super agentow"
 *
 * @param value - The snake_case string to convert
 * @returns Human-readable string with spaces and title case
 */
export function formatSnakeCaseToHumanReadable(value: string): string {
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
