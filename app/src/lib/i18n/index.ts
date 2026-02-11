/**
 * Internationalization (i18n) module for Meridian
 *
 * Supports Japanese (ja) and English (en)
 * Default language: Japanese
 */

import { ja, TranslationKeys } from './ja';
import { en } from './en';

export type Locale = 'ja' | 'en';

export const translations: Record<Locale, TranslationKeys> = {
  ja,
  en,
};

export const defaultLocale: Locale = 'ja';

export const localeNames: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
};

/**
 * Get translations for a specific locale
 */
export function getTranslations(locale: Locale = defaultLocale): TranslationKeys {
  return translations[locale] || translations[defaultLocale];
}

/**
 * Get a nested translation value by key path
 * Example: t('stablecoin.mint.title') => '発行'
 */
export function t(keyPath: string, locale: Locale = defaultLocale): string {
  const keys = keyPath.split('.');
  let value: unknown = translations[locale];

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      // Fallback to default locale
      value = translations[defaultLocale];
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          return keyPath; // Return key if not found
        }
      }
      break;
    }
  }

  return typeof value === 'string' ? value : keyPath;
}

/**
 * Format a translation with interpolation
 * Example: formatT('time.minutesAgo', { count: 5 }, 'ja') => '5分前'
 */
export function formatT(
  keyPath: string,
  params: Record<string, string | number>,
  locale: Locale = defaultLocale
): string {
  let text = t(keyPath, locale);

  Object.entries(params).forEach(([key, value]) => {
    text = text.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  });

  return text;
}

export { ja, en };
export type { TranslationKeys };
