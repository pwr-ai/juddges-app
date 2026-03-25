/**
 * i18n Configuration
 *
 * Central configuration for internationalization settings.
 * Similar to brand/config.ts pattern for consistency.
 */

import type { LocaleCode, LocaleConfig, TextDirection } from './types';

/**
 * Supported locales configuration
 */
export const localeConfigs: Record<LocaleCode, LocaleConfig> = {
  en: {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    direction: 'ltr',
    dateFormat: 'MM/DD/YYYY',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    defaultCurrency: 'USD',
    flag: '🇺🇸',
  },
  pl: {
    code: 'pl',
    nativeName: 'Polski',
    englishName: 'Polish',
    direction: 'ltr',
    dateFormat: 'DD.MM.YYYY',
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    defaultCurrency: 'PLN',
    flag: '🇵🇱',
  },
  uk: {
    code: 'uk',
    nativeName: 'Українська',
    englishName: 'Ukrainian',
    direction: 'ltr',
    dateFormat: 'DD.MM.YYYY',
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    defaultCurrency: 'UAH',
    flag: '🇺🇦',
  },
  ar: {
    code: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    direction: 'rtl',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: '٫',
    thousandsSeparator: '٬',
    defaultCurrency: 'SAR',
    flag: '🇸🇦',
  },
  he: {
    code: 'he',
    nativeName: 'עברית',
    englishName: 'Hebrew',
    direction: 'rtl',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    defaultCurrency: 'ILS',
    flag: '🇮🇱',
  },
};

/**
 * Default locale code
 */
export const DEFAULT_LOCALE: LocaleCode = 'en';

/**
 * Available locales (can be a subset of all defined locales)
 * This allows enabling/disabling locales without removing their configs
 */
export const AVAILABLE_LOCALES: LocaleCode[] = ['en', 'pl', 'uk', 'ar', 'he'];

/**
 * RTL locales for quick lookup
 */
export const RTL_LOCALES: LocaleCode[] = ['ar', 'he'];

/**
 * Storage key for persisting locale preference
 */
export const LOCALE_STORAGE_KEY = 'preferred-locale';

/**
 * Cookie name for server-side locale detection
 */
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

/**
 * Check if a locale code is valid
 */
export function isValidLocale(code: string): code is LocaleCode {
  return AVAILABLE_LOCALES.includes(code as LocaleCode);
}

/**
 * Get locale configuration by code
 */
export function getLocaleConfig(code: LocaleCode): LocaleConfig {
  return localeConfigs[code];
}

/**
 * Get text direction for a locale
 */
export function getTextDirection(code: LocaleCode): TextDirection {
  return localeConfigs[code].direction;
}

/**
 * Check if a locale is RTL
 */
export function isRTL(code: LocaleCode): boolean {
  return RTL_LOCALES.includes(code);
}

/**
 * Get available locales for display
 */
export function getAvailableLocales(): LocaleConfig[] {
  return AVAILABLE_LOCALES.map((code) => localeConfigs[code]);
}

/**
 * Detect browser locale and return best match
 */
export function detectBrowserLocale(): LocaleCode {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  // Get browser languages (ordered by preference)
  const browserLanguages = navigator.languages || [navigator.language];

  for (const lang of browserLanguages) {
    // Try exact match first (e.g., 'en-US' -> 'en')
    const primaryLang = lang.split('-')[0].toLowerCase();

    if (isValidLocale(primaryLang)) {
      return primaryLang;
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * Get persisted locale from storage
 */
export function getPersistedLocale(): LocaleCode | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isValidLocale(stored)) {
      return stored;
    }
  } catch {
    // localStorage not available
  }

  return null;
}

/**
 * Persist locale preference to storage
 */
export function persistLocale(code: LocaleCode): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
    // Also set a cookie for server-side detection
    document.cookie = `${LOCALE_COOKIE_NAME}=${code};path=/;max-age=31536000;samesite=lax`;
  } catch {
    // Storage not available
  }
}

/**
 * Get the best locale based on:
 * 1. Persisted preference
 * 2. Browser language
 * 3. Default locale
 */
export function getBestLocale(): LocaleCode {
  // First check persisted preference
  const persisted = getPersistedLocale();
  if (persisted) {
    return persisted;
  }

  // Then try browser detection
  return detectBrowserLocale();
}

/**
 * Get locale from cookie (for server-side)
 */
export function getLocaleFromCookie(cookies: string): LocaleCode | null {
  const match = cookies.match(new RegExp(`${LOCALE_COOKIE_NAME}=([^;]+)`));
  if (match && isValidLocale(match[1])) {
    return match[1] as LocaleCode;
  }
  return null;
}
