/**
 * Internationalization (i18n) Module
 *
 * This module provides internationalization support for the application.
 *
 * ## Usage
 *
 * ### In Components (with hooks)
 * ```tsx
 * import { useLanguage, useTranslation } from '@/contexts/LanguageContext';
 *
 * function MyComponent() {
 *   const { t, locale, setLocale } = useLanguage();
 *
 *   return (
 *     <div>
 *       <p>{t('common.save')}</p>
 *       <button onClick={() => setLocale('pl')}>Switch to Polish</button>
 *     </div>
 *   );
 * }
 * ```
 *
 * ### With Interpolation
 * ```tsx
 * // Translation: "Found {{count}} results"
 * t('search.resultsFound', { count: 42 })
 * // Output: "Found 42 results"
 * ```
 *
 * ### Formatting
 * ```tsx
 * const { formatNumber, formatDate, formatCurrency } = useLanguage();
 *
 * formatNumber(1234.56)        // "1,234.56" (en) or "1 234,56" (pl)
 * formatDate(new Date())       // "12/31/2024" (en) or "31.12.2024" (pl)
 * formatCurrency(99.99)        // "$99.99" (en) or "99,99 PLN" (pl)
 * ```
 *
 * ## Adding Translations
 *
 * 1. Add the key to the type definition in `types.ts`
 * 2. Add the English translation in `translations/en.ts`
 * 3. Add translations for all other supported locales
 *
 * ## Adding a New Locale
 *
 * 1. Add the locale code to `LocaleCode` type in `types.ts`
 * 2. Add locale configuration in `config.ts`
 * 3. Create the translation file in `translations/`
 * 4. Export from `translations/index.ts`
 * 5. Add to `AVAILABLE_LOCALES` in `config.ts`
 */

// Re-export types
export type {
  LocaleCode,
  TextDirection,
  LocaleConfig,
  Translations,
  TranslationKey,
  InterpolationValues,
  CommonTranslations,
  NavigationTranslations,
  ChatTranslations,
  SearchTranslations,
  DocumentTranslations,
  ExtractionTranslations,
  AuthTranslations,
  ErrorTranslations,
  LegalTranslations,
} from './types';

// Re-export config
export {
  localeConfigs,
  DEFAULT_LOCALE,
  AVAILABLE_LOCALES,
  RTL_LOCALES,
  LOCALE_STORAGE_KEY,
  LOCALE_COOKIE_NAME,
  isValidLocale,
  getLocaleConfig,
  getTextDirection,
  isRTL,
  getAvailableLocales,
  detectBrowserLocale,
  getPersistedLocale,
  persistLocale,
  getBestLocale,
  getLocaleFromCookie,
} from './config';

// Re-export translations
export { getTranslations } from './translations';

// Re-export utilities
export {
  createTranslator,
  formatNumber,
  formatDate,
  formatCurrency,
  formatRelativeTime,
  getOrdinal,
  pluralize,
} from './utils';
