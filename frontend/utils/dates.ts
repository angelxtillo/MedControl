/**
 * Fechas "de calendario" (YYYY-MM-DD, sin hora ni zona) tal como las guarda el
 * backend en start_date / end_date.
 */
import type { Locale } from 'date-fns';
import { es, enUS, ptBR, fr as frLocale } from 'date-fns/locale';

export const localeForLanguage = (lang: string): string =>
  lang === 'es' ? 'es-CO' :
  lang === 'pt' ? 'pt-BR' :
  lang === 'fr' ? 'fr-FR' : 'en-US';

/** Medianoche local: `new Date('2026-07-15')` se interpreta como UTC y puede caer un día antes. */
export const parseISODate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return isNaN(date.getTime()) ? null : date;
};

export const toISODate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** "15 de julio de 2026" */
export const formatLongDate = (date: Date, lang: string): string =>
  date.toLocaleDateString(localeForLanguage(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/** Hoy a medianoche local, para comparar contra fechas de calendario. */
export const startOfToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export const dateFnsLocales: Record<string, Locale> = { es, en: enUS, pt: ptBR, fr: frLocale };

/** Encabezado de un día del historial; el año solo hace falta fuera del año en curso. */
export const dayFormats: Record<string, { sameYear: string; otherYear: string }> = {
  es: { sameYear: "EEEE, d 'de' MMMM", otherYear: "EEEE, d 'de' MMMM 'de' yyyy" },
  en: { sameYear: 'EEEE, MMMM d', otherYear: 'EEEE, MMMM d, yyyy' },
  pt: { sameYear: "EEEE, d 'de' MMMM", otherYear: "EEEE, d 'de' MMMM 'de' yyyy" },
  fr: { sameYear: 'EEEE d MMMM', otherYear: 'EEEE d MMMM yyyy' },
};

/** "12/10/26" (en: "10/12/26") */
export const formatShortDate = (date: Date, lang: string): string =>
  date.toLocaleDateString(localeForLanguage(lang), {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
