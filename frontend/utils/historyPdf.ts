/**
 * Exportación del historial de un paciente a PDF.
 *
 * El PDF se genera en el teléfono (expo-print convierte el HTML en un WebView
 * local) a partir del mismo backend que ya usa la pantalla Historial. El
 * archivo solo sale del dispositivo si el usuario lo comparte desde el menú del
 * sistema.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import api from './api';
import { toISODate } from './dates';
import {
  buildHistoryReportHtml,
  type HistoryReport,
  type ReportPatient,
  type Translate,
} from './historyReport';

/** Rango máximo del selector; el backend acepta hasta 92 por el desfase horario. */
export const MAX_EXPORT_DAYS = 90;

// A4 en puntos (72 por pulgada).
const A4 = { width: 595, height: 842 };

export class SharingUnavailableError extends Error {}

const exportsDir = () => new Directory(Paths.cache, 'exports');

/** Los PDF de exportaciones anteriores se borran al empezar una nueva, no al
 *  terminar de compartir: en Android shareAsync resuelve antes de que la app
 *  destino haya leído el archivo. */
const clearPreviousExports = () => {
  try {
    const dir = exportsDir();
    if (dir.exists) dir.delete();
  } catch {
    // Es caché: si no se puede borrar, el sistema lo hará.
  }
};

/** "María López" → "Maria_Lopez": nombres de archivo seguros en cualquier app destino. */
const fileSafe = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

export async function exportHistoryPdf(opts: {
  patientId: string;
  patient: ReportPatient;
  from: Date;
  to: Date;
  t: Translate;
  lang: string;
}): Promise<void> {
  const { patientId, patient, from, to, t, lang } = opts;
  if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError();

  const { data } = await api.get<HistoryReport>(`/logs/patient/${patientId}/report`, {
    params: {
      from_date: toISODate(from),
      to_date: toISODate(to),
      timezone_offset: new Date().getTimezoneOffset() * -1,
    },
  });

  const html = buildHistoryReportHtml(data, patient, t, lang);
  const { uri } = await Print.printToFileAsync({ html, ...A4 });

  // printToFileAsync deja un nombre aleatorio; se renombra para que el
  // destinatario sepa qué es al recibirlo.
  let shareUri = uri;
  try {
    clearPreviousExports();
    const dir = exportsDir();
    dir.create({ intermediates: true, idempotent: true });
    const name = [
      'Dosaria',
      fileSafe(t('export.fileName')),
      fileSafe(patient.name) || 'paciente',
      data.from_date,
      data.to_date,
    ].join('_');
    const target = new File(dir, `${name}.pdf`);
    new File(uri).move(target);
    shareUri = target.uri;
  } catch {
    // Sin renombrar sigue siendo un PDF válido.
  }

  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: t('export.shareDialogTitle'),
  });
}
