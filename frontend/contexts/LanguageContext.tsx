'use client';

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useEffect,
} from 'react';
import type {
  LocaleCode,
  LocaleConfig,
  TextDirection,
  Translations,
  TranslationKey,
  InterpolationValues,
} from '@/lib/i18n/types';
import {
  DEFAULT_LOCALE,
  getBestLocale,
  getLocaleConfig,
  getAvailableLocales,
  isRTL,
  persistLocale,
} from '@/lib/i18n/config';
import { getTranslations } from '@/lib/i18n/translations';
import {
  createTranslator,
  formatNumber,
  formatDate,
  formatCurrency,
  formatRelativeTime,
} from '@/lib/i18n/utils';

/**
 * Language context value interface
 */
interface LanguageContextValue {
  /** Current locale code */
  locale: LocaleCode;
  /** Current locale configuration */
  config: LocaleConfig;
  /** Text direction (ltr or rtl) */
  direction: TextDirection;
  /** Whether current locale is RTL */
  isRTL: boolean;
  /** All current locale translations */
  translations: Translations;
  /** Available locales for switching */
  availableLocales: LocaleConfig[];

  /** Translation function */
  t: (key: TranslationKey, values?: InterpolationValues) => string;
  /** Check if translation exists */
  hasTranslation: (key: TranslationKey) => boolean;
  /** Get all translations for a namespace */
  getNamespace: <K extends keyof Translations>(namespace: K) => Translations[K];

  /** Change the current locale */
  setLocale: (locale: LocaleCode) => void;

  /** Formatting functions */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatCurrency: (value: number, currency?: string) => string;
  formatRelativeTime: (date: Date | string | number) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  children: React.ReactNode;
  /** Override initial locale (for testing/SSR) */
  initialLocale?: LocaleCode;
}

/**
 * Language provider component
 *
 * Provides language configuration and translation functions to all child components.
 * The locale is determined by:
 * 1. initialLocale prop (if provided)
 * 2. Persisted preference in localStorage
 * 3. Browser language detection
 * 4. Default locale ('en')
 */
export function LanguageProvider({ children, initialLocale }: LanguageProviderProps) {
  // Initialize with default locale to avoid hydration mismatch
  const [locale, setLocaleState] = useState<LocaleCode>(initialLocale ?? DEFAULT_LOCALE);
  const [isHydrated, setIsHydrated] = useState(false);

  // Detect and set best locale after hydration
  useEffect(() => {
    if (!initialLocale) {
      const bestLocale = getBestLocale();
      setLocaleState(bestLocale);
    }
    setIsHydrated(true);
  }, [initialLocale]);

  // Update HTML attributes when locale changes
  useEffect(() => {
    if (isHydrated) {
      const config = getLocaleConfig(locale);
      document.documentElement.lang = locale;
      document.documentElement.dir = config.direction;

      // Add/remove RTL class for styling
      if (config.direction === 'rtl') {
        document.documentElement.classList.add('rtl');
      } else {
        document.documentElement.classList.remove('rtl');
      }
    }
  }, [locale, isHydrated]);

  // Set locale and persist
  const setLocale = useCallback((newLocale: LocaleCode) => {
    setLocaleState(newLocale);
    persistLocale(newLocale);
  }, []);

  // Create translator for current locale
  const translator = useMemo(() => createTranslator(locale), [locale]);

  // Memoize formatting functions bound to current locale
  const formatNumberFn = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, locale, options),
    [locale]
  );

  const formatDateFn = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      formatDate(date, locale, options),
    [locale]
  );

  const formatCurrencyFn = useCallback(
    (value: number, currency?: string) => formatCurrency(value, locale, currency),
    [locale]
  );

  const formatRelativeTimeFn = useCallback(
    (date: Date | string | number) => formatRelativeTime(date, locale),
    [locale]
  );

  // Build context value
  const value = useMemo<LanguageContextValue>(() => {
    const config = getLocaleConfig(locale);
    const translations = getTranslations(locale);

    return {
      locale,
      config,
      direction: config.direction,
      isRTL: isRTL(locale),
      translations,
      availableLocales: getAvailableLocales(),

      t: translator.t,
      hasTranslation: translator.hasTranslation,
      getNamespace: translator.getNamespace,

      setLocale,

      formatNumber: formatNumberFn,
      formatDate: formatDateFn,
      formatCurrency: formatCurrencyFn,
      formatRelativeTime: formatRelativeTimeFn,
    };
  }, [locale, translator, setLocale, formatNumberFn, formatDateFn, formatCurrencyFn, formatRelativeTimeFn]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access language context
 *
 * @throws Error if used outside of LanguageProvider
 */
export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }

  return context;
}

/**
 * Hook to get the translation function only
 * Useful for components that only need translations
 */
export function useTranslation() {
  const { t, hasTranslation, getNamespace, locale } = useLanguage();
  return { t, hasTranslation, getNamespace, locale };
}

/**
 * Hook to get formatting functions only
 * Useful for components that only need formatting
 */
export function useFormatting() {
  const {
    formatNumber,
    formatDate,
    formatCurrency,
    formatRelativeTime,
    locale,
  } = useLanguage();

  return { formatNumber, formatDate, formatCurrency, formatRelativeTime, locale };
}

/**
 * Hook to check if current locale is RTL
 */
export function useIsRTL(): boolean {
  const { isRTL } = useLanguage();
  return isRTL;
}

/**
 * Hook to get current text direction
 */
export function useTextDirection(): TextDirection {
  const { direction } = useLanguage();
  return direction;
}
