/**
 * HTML del PDF de historial de un paciente (GET /logs/patient/{id}/report).
 *
 * Módulo puro —sin React Native— para que el mismo HTML se pueda renderizar
 * fuera de la app. Todo va inline (estilos, logo, fuentes del sistema): el
 * WebView que lo convierte a PDF no debe pedir nada a la red, así los datos no
 * salen del teléfono hasta que el usuario decida compartir el archivo.
 */
import { format } from 'date-fns';
import {
  dateFnsLocales,
  dayFormats,
  formatLongDate,
  formatShortDate,
  localeForLanguage,
  parseISODate,
  toISODate,
} from './dates';

export interface ReportLog {
  id: string;
  medication_id: string;
  medication_name?: string;
  scheduled_datetime: string;
  taken_datetime?: string | null;
  status: string;
  notes?: string | null;
  logged_by?: string | null;
  logged_by_name?: string | null;
  is_synthetic?: boolean;
}

export interface ReportMedication {
  id: string;
  name: string;
  dosage?: string | null;
  schedule_times: string[];
  start_date?: string | null;
  end_date?: string | null;
  active: boolean;
  adherence_status: 'full' | 'partial' | 'not_calculable';
  counting_from: string | null;
  counting_reason: 'modified' | 'created' | 'inactive' | null;
  taken: number;
  skipped: number;
  missed: number;
  scheduled: number;
  percent: number | null;
}

export interface AdherenceTotals {
  taken: number;
  skipped: number;
  missed: number;
  scheduled: number;
  percent: number | null;
}

export interface HistoryReport {
  from_date: string;
  to_date: string;
  logs: ReportLog[];
  medications: ReportMedication[];
  adherence: AdherenceTotals;
  has_modified_medications: boolean;
}

export interface ReportPatient {
  name: string;
  age?: number | null;
}

export type Translate = (key: string, options?: Record<string, unknown>) => string;

const STATUS_MARKS: Record<string, { mark: string; cls: string }> = {
  taken: { mark: '✓', cls: 'taken' },
  skipped: { mark: '–', cls: 'skipped' },
  missed: { mark: '✕', cls: 'missed' },
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Misma lectura que la pantalla Historial: la hora programada es local naive;
 *  la real llega en UTC y se muestra en la zona del teléfono. */
const formatTime = (value: string, lang: string): string => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString(localeForLanguage(lang), { hour: '2-digit', minute: '2-digit', hour12: false });
};

const PILL_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="2" y="7" width="20" height="10" rx="5" fill="#2196F3" transform="rotate(-35 12 12)"/>' +
  '<rect x="12" y="7" width="10" height="10" rx="5" fill="#90CAF9" transform="rotate(-35 12 12)"/>' +
  '</svg>';

const STYLES = `
  @page { size: A4; margin: 14mm 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
         font-size: 10pt; color: #212121; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { border-collapse: collapse; width: 100%; }
  .layout > tbody > tr > td, .layout > tfoot > tr > td { padding: 0; }
  .footer { padding-top: 8px; margin-top: 10px; border-top: 1px solid #e0e0e0;
            font-size: 7.5pt; color: #757575; line-height: 1.4; }
  header { display: flex; justify-content: space-between; align-items: center;
           padding-bottom: 10px; border-bottom: 2px solid #2196F3; }
  .brand { display: flex; align-items: center; gap: 6px; font-size: 15pt; font-weight: 700; color: #1976D2; }
  .doc-title { font-size: 13pt; font-weight: 600; color: #424242; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; margin: 12px 0 4px; font-size: 10pt; }
  .meta dt { color: #757575; }
  .meta dd { margin: 0; font-weight: 500; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .06em; color: #1976D2;
       margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #BBDEFB; }
  .summary { display: flex; gap: 16px; align-items: center; }
  .score { min-width: 104px; padding: 10px 8px; border: 1.5px solid #2196F3; border-radius: 10px; text-align: center; }
  .score .pct { font-size: 24pt; font-weight: 700; color: #1565C0; line-height: 1.1; }
  .score .lbl { font-size: 8pt; color: #616161; text-transform: uppercase; letter-spacing: .05em; }
  .counts { flex: 1; }
  .counts .row { display: flex; gap: 14px; flex-wrap: wrap; font-size: 10pt; }
  .counts b { font-weight: 600; }
  .bar { height: 8px; background: #ECEFF1; border-radius: 4px; overflow: hidden; margin-top: 8px; }
  .bar span { display: block; height: 100%; background: #4CAF50; }
  .warning { margin-top: 10px; padding: 8px 10px; border-left: 4px solid #FF9800; background: #FFF3E0;
             color: #6D4C00; font-size: 9pt; font-weight: 500; }
  .grid th { text-align: left; font-size: 8pt; font-weight: 600; color: #616161; text-transform: uppercase;
             letter-spacing: .04em; padding: 5px 6px; border-bottom: 1px solid #BDBDBD; background: #F5F5F5; }
  .grid td { padding: 5px 6px; border-bottom: 1px solid #EEEEEE; vertical-align: top; }
  .grid tr { break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .sub { display: block; font-size: 8pt; color: #757575; margin-top: 1px; }
  .sub.warn { color: #E65100; font-weight: 500; }
  .tag { font-size: 7.5pt; color: #616161; border: 1px solid #BDBDBD; border-radius: 3px; padding: 0 3px; margin-left: 4px; }
  .grid td { padding: 4px 6px; }
  .detail tbody.day { break-inside: avoid; }
  .detail tr.day-title td { padding: 10px 6px 3px; font-weight: 600; color: #1565C0;
                            border-bottom: 1px solid #BBDEFB; }
  .status { white-space: nowrap; font-weight: 500; }
  .status .mk { display: inline-block; width: 12px; font-weight: 700; }
  .status.taken { color: #2E7D32; }
  .status.skipped { color: #E65100; }
  .status.missed { color: #C62828; }
  .muted { color: #9E9E9E; }
  .empty { color: #757575; font-style: italic; }
  .legend { margin-top: 14px; font-size: 8pt; color: #616161; line-height: 1.5; }
  .legend p { margin: 0; }
`;

export function buildHistoryReportHtml(
  report: HistoryReport,
  patient: ReportPatient,
  t: Translate,
  lang: string,
  generatedAt: Date = new Date(),
): string {
  const longDate = (iso: string) => {
    const d = parseISODate(iso.slice(0, 10));
    return d ? formatLongDate(d, lang) : iso;
  };
  const shortDate = (iso: string) => {
    const d = parseISODate(iso.slice(0, 10));
    return d ? formatShortDate(d, lang) : iso;
  };
  const generatedLabel = `${formatLongDate(generatedAt, lang)}, ${formatTime(generatedAt.toISOString(), lang)}`;

  const from = parseISODate(report.from_date)!;
  const to = parseISODate(report.to_date)!;
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

  // ---- Encabezado ----
  const patientLine =
    escapeHtml(patient.name) + (patient.age ? ` · ${escapeHtml(patient.age)} ${escapeHtml(t('patients.years'))}` : '');
  const header = `
    <header>
      <div class="brand">${PILL_SVG}Dosaria</div>
      <div class="doc-title">${escapeHtml(t('export.pdf.documentTitle'))}</div>
    </header>
    <dl class="meta">
      <dt>${escapeHtml(t('export.pdf.patient'))}</dt><dd>${patientLine}</dd>
      <dt>${escapeHtml(t('export.pdf.period'))}</dt>
      <dd>${escapeHtml(longDate(report.from_date))} – ${escapeHtml(longDate(report.to_date))}
          (${escapeHtml(days === 1 ? t('export.pdf.periodOneDay') : t('export.pdf.periodDays', { count: days }))})</dd>
      <dt>${escapeHtml(t('export.pdf.generated'))}</dt><dd>${escapeHtml(generatedLabel)}</dd>
    </dl>`;

  // ---- Resumen ----
  const a = report.adherence;
  const score = a.percent === null
    ? `<div class="pct">—</div><div class="lbl">${escapeHtml(t('export.pdf.adherence'))}</div>`
    : `<div class="pct">${a.percent}%</div><div class="lbl">${escapeHtml(t('export.pdf.adherence'))}</div>`;
  const counts = a.percent === null
    ? `<div class="empty">${escapeHtml(t('export.pdf.noCalculable'))}</div>`
    : `<div class="row">
         <span>${escapeHtml(t('export.pdf.taken'))} <b>${a.taken}</b></span>
         <span>${escapeHtml(t('export.pdf.skipped'))} <b>${a.skipped}</b></span>
         <span>${escapeHtml(t('export.pdf.missed'))} <b>${a.missed}</b></span>
         <span>${escapeHtml(t('export.pdf.scheduled'))} <b>${a.scheduled}</b></span>
       </div>
       <div class="bar"><span style="width:${a.percent}%"></span></div>`;
  const warning = report.has_modified_medications
    ? `<div class="warning">${escapeHtml(t('export.pdf.modifiedWarning'))}</div>`
    : '';

  const medNote = (m: ReportMedication): string => {
    if (m.adherence_status === 'not_calculable') {
      const text = m.counting_reason === 'inactive'
        ? t('export.pdf.notCalculableInactive')
        : t('export.pdf.notCalculableModified', { date: shortDate(m.counting_from ?? '') });
      return `<span class="sub warn">${escapeHtml(text)}</span>`;
    }
    if (m.adherence_status === 'partial' && m.counting_from) {
      if (m.counting_reason === 'modified') {
        return `<span class="sub warn">${escapeHtml(t('export.pdf.adherenceSinceModified', { date: shortDate(m.counting_from) }))}</span>`;
      }
      // Alta en Dosaria después del inicio del tratamiento: si coincide con la
      // fecha de inicio la columna "Desde" ya lo dice.
      if (m.counting_from.slice(0, 10) > (m.start_date ?? '').slice(0, 10)) {
        return `<span class="sub">${escapeHtml(t('export.pdf.adherenceSinceCreated', { date: shortDate(m.counting_from) }))}</span>`;
      }
    }
    return '';
  };
  const medAdherence = (m: ReportMedication): string => {
    if (m.percent === null) return '<span class="muted">—</span>';
    return `<b>${m.percent}%</b><span class="sub">${m.taken}/${m.scheduled}</span>`;
  };
  const medRows = report.medications
    .map(m => `
      <tr>
        <td><b>${escapeHtml(m.name)}</b>${m.active ? '' : `<span class="tag">${escapeHtml(t('export.pdf.inactive'))}</span>`}${medNote(m)}</td>
        <td>${escapeHtml(m.dosage ?? '')}</td>
        <td>${escapeHtml(m.schedule_times.join(', '))}</td>
        <td class="num">${m.start_date ? escapeHtml(shortDate(m.start_date)) : ''}</td>
        <td class="num">${medAdherence(m)}</td>
      </tr>`)
    .join('');
  const medTable = report.medications.length
    ? `<table class="grid" style="margin-top:12px">
         <thead><tr>
           <th>${escapeHtml(t('export.pdf.colMedication'))}</th>
           <th>${escapeHtml(t('export.pdf.colDose'))}</th>
           <th>${escapeHtml(t('export.pdf.colSchedule'))}</th>
           <th class="num">${escapeHtml(t('export.pdf.colSince'))}</th>
           <th class="num">${escapeHtml(t('export.pdf.colAdherence'))}</th>
         </tr></thead>
         <tbody>${medRows}</tbody>
       </table>`
    : '';

  const summary = `
    <h2>${escapeHtml(t('export.pdf.summary'))}</h2>
    <div class="summary"><div class="score">${score}</div><div class="counts">${counts}</div></div>
    ${warning}
    ${medTable}`;

  // ---- Detalle por día (ascendente) ----
  const dayPattern = (dayFormats[lang] ?? dayFormats.es).otherYear;
  const dayLocale = dateFnsLocales[lang] ?? dateFnsLocales.es;
  const groups: { date: string; items: ReportLog[] }[] = [];
  for (const log of report.logs) {
    const date = log.scheduled_datetime.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.items.push(log);
    else groups.push({ date, items: [log] });
  }

  const actualTime = (log: ReportLog): string => {
    if (!log.taken_datetime || (log.status !== 'taken' && log.status !== 'skipped')) {
      return '<span class="muted">—</span>';
    }
    const taken = new Date(log.taken_datetime);
    if (isNaN(taken.getTime())) return '<span class="muted">—</span>';
    const time = formatTime(log.taken_datetime, lang);
    // Tomada otro día (p. ej. pasada la medianoche): indicar la fecha.
    return toISODate(taken) === log.scheduled_datetime.slice(0, 10)
      ? escapeHtml(time)
      : `${escapeHtml(formatShortDate(taken, lang))} ${escapeHtml(time)}`;
  };
  const statusCell = (status: string): string => {
    const s = STATUS_MARKS[status];
    const label = status === 'taken' ? t('history.taken')
      : status === 'skipped' ? t('history.skipped')
      : status === 'missed' ? t('history.missed')
      : t('history.pending');
    return s
      ? `<span class="status ${s.cls}"><span class="mk">${s.mark}</span>${escapeHtml(label)}</span>`
      : `<span class="status">${escapeHtml(label)}</span>`;
  };
  const byCell = (log: ReportLog): string =>
    log.logged_by
      ? escapeHtml(log.logged_by_name || t('history.genericCaregiver'))
      : '<span class="muted">—</span>';

  const dayBlocks = groups
    .map(g => {
      const d = parseISODate(g.date);
      const title = d ? capitalize(format(d, dayPattern, { locale: dayLocale })) : g.date;
      const rows = g.items
        .map(log => `
          <tr>
            <td>${escapeHtml(log.medication_name || t('common.unknown'))}${
              log.notes ? `<span class="sub">${escapeHtml(t('history.note'))}: ${escapeHtml(log.notes)}</span>` : ''
            }</td>
            <td>${escapeHtml(formatTime(log.scheduled_datetime, lang))}</td>
            <td>${actualTime(log)}</td>
            <td>${statusCell(log.status)}</td>
            <td>${byCell(log)}</td>
          </tr>`)
        .join('');
      return `
        <tbody class="day">
          <tr class="day-title"><td colspan="5">${escapeHtml(title)}</td></tr>
          ${rows}
        </tbody>`;
    })
    .join('');

  const detail = `
    <h2>${escapeHtml(t('export.pdf.detail'))}</h2>
    ${dayBlocks
      ? `<table class="grid detail">
           <colgroup><col style="width:34%"><col style="width:12%"><col style="width:16%"><col style="width:16%"><col style="width:22%"></colgroup>
           <thead><tr>
             <th>${escapeHtml(t('export.pdf.colMedication'))}</th>
             <th>${escapeHtml(t('export.pdf.colScheduled'))}</th>
             <th>${escapeHtml(t('export.pdf.colActual'))}</th>
             <th>${escapeHtml(t('export.pdf.colStatus'))}</th>
             <th>${escapeHtml(t('export.pdf.colBy'))}</th>
           </tr></thead>
           ${dayBlocks}
         </table>`
      : `<p class="empty">${escapeHtml(t('export.pdf.noDoses'))}</p>`}
    <div class="legend">
      <p>${escapeHtml(t('export.pdf.legendMissed'))}</p>
      <p>${escapeHtml(t('export.pdf.legendAdherence'))}</p>
      <p>${escapeHtml(t('export.pdf.legendTimes'))}</p>
    </div>`;

  // El pie va en el <tfoot> de una tabla de maquetación: los motores de
  // impresión lo repiten al final de cada página.
  const footer = escapeHtml(t('export.pdf.footer', { date: formatLongDate(generatedAt, lang) }));

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t('export.pdf.documentTitle'))} – ${escapeHtml(patient.name)}</title>
<style>${STYLES}</style>
</head>
<body>
<table class="layout">
  <tfoot><tr><td><div class="footer">${footer}</div></td></tr></tfoot>
  <tbody><tr><td>
    ${header}
    ${summary}
    ${detail}
  </td></tr></tbody>
</table>
</body>
</html>`;
}
