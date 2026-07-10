/**
 * Fechas "de calendario" (YYYY-MM-DD, sin hora ni zona) tal como las guarda el
 * backend en start_date / end_date.
 */

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
