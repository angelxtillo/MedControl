// Zona horaria del paciente (Fase 3A).
//
// Guardamos la zona como nombre IANA (ej. "America/Bogota"), no como offset,
// para que la Fase 3B calcule el instante UTC de cada dosis manejando bien el
// horario de verano (DST). Aquí solo vive la lista de zonas comunes para el
// selector y los helpers de presentación.

export const DEFAULT_TIMEZONE = 'America/Bogota';

export interface TimezoneOption {
  value: string; // nombre IANA
  city: string; // nombre legible (lugar, no se traduce)
}

// Subconjunto razonable: LatAm + las principales. No hace falta la lista
// exhaustiva de ~400 zonas; la autodetectada se añade dinámicamente si falta.
export const COMMON_TIMEZONES: TimezoneOption[] = [
  { value: 'America/Bogota', city: 'Bogotá' },
  { value: 'America/Mexico_City', city: 'Ciudad de México' },
  { value: 'America/Lima', city: 'Lima' },
  { value: 'America/Santiago', city: 'Santiago' },
  { value: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires' },
  { value: 'America/Caracas', city: 'Caracas' },
  { value: 'America/Guayaquil', city: 'Quito' },
  { value: 'America/La_Paz', city: 'La Paz' },
  { value: 'America/Asuncion', city: 'Asunción' },
  { value: 'America/Montevideo', city: 'Montevideo' },
  { value: 'America/Panama', city: 'Panamá' },
  { value: 'America/Costa_Rica', city: 'San José' },
  { value: 'America/Guatemala', city: 'Guatemala' },
  { value: 'America/El_Salvador', city: 'San Salvador' },
  { value: 'America/Tegucigalpa', city: 'Tegucigalpa' },
  { value: 'America/Managua', city: 'Managua' },
  { value: 'America/Santo_Domingo', city: 'Santo Domingo' },
  { value: 'America/Sao_Paulo', city: 'São Paulo' },
  { value: 'America/New_York', city: 'Nueva York' },
  { value: 'America/Chicago', city: 'Chicago' },
  { value: 'America/Denver', city: 'Denver' },
  { value: 'America/Los_Angeles', city: 'Los Ángeles' },
  { value: 'Europe/Madrid', city: 'Madrid' },
  { value: 'Europe/London', city: 'Londres' },
  { value: 'Europe/Paris', city: 'París' },
  { value: 'Europe/Lisbon', city: 'Lisboa' },
];

// Zona del dispositivo (ej. "America/Bogota"). Si por alguna razón no está
// disponible, cae al default para no enviar algo inválido al backend.
export function getDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

// Nombre legible de una zona: usa la ciudad conocida; si no, deriva del último
// segmento del IANA (ej. "Africa/Cairo" -> "Cairo").
export function timezoneCity(tz: string | undefined | null): string {
  if (!tz) return '';
  const known = COMMON_TIMEZONES.find((o) => o.value === tz);
  if (known) return known.city;
  const last = tz.split('/').pop() ?? tz;
  return last.replace(/_/g, ' ');
}

// Lista para el selector: las comunes + la zona actual si no estuviera ya,
// para que siempre se pueda ver/seleccionar la zona detectada del dispositivo.
export function timezoneOptionsIncluding(current: string | undefined | null): TimezoneOption[] {
  if (!current || COMMON_TIMEZONES.some((o) => o.value === current)) {
    return COMMON_TIMEZONES;
  }
  return [{ value: current, city: timezoneCity(current) }, ...COMMON_TIMEZONES];
}
