/**
 * Translations index
 *
 * Exports all translations and provides utilities for accessing them.
 */

import type { LocaleCode, Translations } from '../types';
import { en } from './en';
import { pl } from './pl';

/**
 * All translations keyed by locale code
 */
export const translations: Record<LocaleCode, Translations> = {
  en,
  pl,
};

/**
 * Get translations for a specific locale
 */
export function getTranslations(locale: LocaleCode): Translations {
  return translations[locale];
}

/**
 * Export individual translations for direct import if needed
 */
export { en, pl };
