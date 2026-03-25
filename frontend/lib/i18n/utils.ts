/**
 * i18n Utilities
 *
 * Provides translation functions and formatting utilities.
 */

import type {
  LocaleCode,
  Translations,
  TranslationKey,
  InterpolationValues,
} from './types';
import { getTranslations } from './translations';
import { DEFAULT_LOCALE, getLocaleConfig } from './config';

/**
 * Get a nested value from an object using a dot-notation path
 */
function getNestedValue(obj: object, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Interpolate values into a string template
 * Supports {{key}} syntax for placeholders
 */
function interpolate(template: string, values?: InterpolationValues): string {
  if (!values) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = values[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Create a translation function for a specific locale
 */
export function createTranslator(locale: LocaleCode) {
  const translations = getTranslations(locale);
  const fallbackTranslations = locale !== DEFAULT_LOCALE ? getTranslations(DEFAULT_LOCALE) : null;

  /**
   * Translate a key with optional interpolation values
   */
  function t(key: TranslationKey, values?: InterpolationValues): string {
    // Try to get the translation for the current locale
    let translation = getNestedValue(translations as object, key);

    // Fallback to default locale if not found
    if (translation === undefined && fallbackTranslations) {
      translation = getNestedValue(fallbackTranslations as object, key);

      // Log warning in development
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[i18n] Missing translation for key "${key}" in locale "${locale}", using fallback`);
      }
    }

    // If still not found, return the key with a warning
    if (translation === undefined) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[i18n] Translation key "${key}" not found in any locale`);
      }
      return key;
    }

    return interpolate(translation, values);
  }

  /**
   * Check if a translation key exists
   */
  function hasTranslation(key: TranslationKey): boolean {
    return getNestedValue(translations as object, key) !== undefined;
  }

  /**
   * Get all translations for a namespace
   */
  function getNamespace<K extends keyof Translations>(namespace: K): Translations[K] {
    return translations[namespace];
  }

  return { t, hasTranslation, getNamespace };
}

/**
 * Format a number according to locale conventions
 */
export function formatNumber(
  value: number,
  locale: LocaleCode,
  options?: Intl.NumberFormatOptions
): string {
  const config = getLocaleConfig(locale);

  // Map our locale codes to Intl locale codes
  const intlLocale = locale === 'uk' ? 'uk-UA' : locale === 'pl' ? 'pl-PL' : locale;

  try {
    return new Intl.NumberFormat(intlLocale, options).format(value);
  } catch {
    // Fallback to manual formatting
    const parts = value.toFixed(options?.minimumFractionDigits ?? 0).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSeparator);
    return parts.length > 1
      ? integerPart + config.decimalSeparator + parts[1]
      : integerPart;
  }
}

/**
 * Format a date according to locale conventions
 */
export function formatDate(
  date: Date | string | number,
  locale: LocaleCode,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  // Map our locale codes to Intl locale codes
  const intlLocale = locale === 'uk' ? 'uk-UA' : locale === 'pl' ? 'pl-PL' : locale;

  try {
    return new Intl.DateTimeFormat(intlLocale, options).format(dateObj);
  } catch {
    // Fallback to ISO format
    return dateObj.toISOString().split('T')[0];
  }
}

/**
 * Format a currency amount according to locale conventions
 */
export function formatCurrency(
  value: number,
  locale: LocaleCode,
  currency?: string
): string {
  const config = getLocaleConfig(locale);
  const currencyCode = currency ?? config.defaultCurrency;

  // Map our locale codes to Intl locale codes
  const intlLocale = locale === 'uk' ? 'uk-UA' : locale === 'pl' ? 'pl-PL' : locale;

  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: currencyCode,
    }).format(value);
  } catch {
    // Fallback to basic formatting
    return `${formatNumber(value, locale, { minimumFractionDigits: 2 })} ${currencyCode}`;
  }
}

/**
 * Format a relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(
  date: Date | string | number,
  locale: LocaleCode
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  // Map our locale codes to Intl locale codes
  const intlLocale = locale === 'uk' ? 'uk-UA' : locale === 'pl' ? 'pl-PL' : locale;

  try {
    const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });

    if (diffInSeconds < 60) {
      return rtf.format(-diffInSeconds, 'second');
    } else if (diffInSeconds < 3600) {
      return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
    } else if (diffInSeconds < 86400) {
      return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
    } else if (diffInSeconds < 2592000) {
      return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
    } else if (diffInSeconds < 31536000) {
      return rtf.format(-Math.floor(diffInSeconds / 2592000), 'month');
    } else {
      return rtf.format(-Math.floor(diffInSeconds / 31536000), 'year');
    }
  } catch {
    // Fallback to date formatting
    return formatDate(dateObj, locale);
  }
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 * Note: Only fully supported for English, other locales may have basic support
 */
export function getOrdinal(num: number, locale: LocaleCode): string {
  if (locale === 'en') {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = num % 100;
    return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }

  // For other locales, just return the number
  // Polish, Ukrainian, Arabic, Hebrew typically use different patterns
  return String(num);
}

/**
 * Pluralization helper
 * Returns the correct plural form based on count
 */
export function pluralize(
  count: number,
  locale: LocaleCode,
  forms: { zero?: string; one: string; few?: string; many?: string; other: string }
): string {
  // Use Intl.PluralRules for accurate pluralization
  const intlLocale = locale === 'uk' ? 'uk-UA' : locale === 'pl' ? 'pl-PL' : locale;

  try {
    const pluralRules = new Intl.PluralRules(intlLocale);
    const rule = pluralRules.select(count);

    if (count === 0 && forms.zero !== undefined) {
      return forms.zero;
    }

    switch (rule) {
      case 'one':
        return forms.one;
      case 'few':
        return forms.few ?? forms.other;
      case 'many':
        return forms.many ?? forms.other;
      default:
        return forms.other;
    }
  } catch {
    // Fallback for basic pluralization
    return count === 1 ? forms.one : forms.other;
  }
}
