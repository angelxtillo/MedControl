import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import i18n from '../i18n';
import api from './api';

export const MEDICATION_CHANNEL = 'medication-reminders';

// Último Expo push token enviado al backend (por dispositivo). Sirve para no
// reenviarlo en cada arranque y para re-registrarlo si cambia o si se cambia de
// cuenta en el mismo dispositivo.
const LAST_PUSH_TOKEN_KEY = 'expoPushToken';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as any;

    // Supresión de follow-ups si la dosis ya fue marcada
    if (data?.followUp === true && data?.medicationId && data?.baseTime) {
      const today = new Date().toISOString().slice(0, 10);
      const key = `doseLogged:${data.medicationId}:${today}:${data.baseTime}`;
      try {
        const logged = await AsyncStorage.getItem(key);
        if (logged) {
          return {
            shouldShowBanner: false,
            shouldShowList: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
          };
        }
      } catch (_) {}
    }

    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL, {
      name: 'Recordatorios de medicamentos',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

const DAY_TO_WEEKDAY: Record<string, number> = {
  domingo: 1,
  lunes: 2,
  martes: 3,
  miercoles: 4,
  jueves: 5,
  viernes: 6,
  sabado: 7,
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function parseWeekdays(frequency: string): number[] {
  const norm = normalize(frequency || '');
  const result: number[] = [];
  for (const [name, wd] of Object.entries(DAY_TO_WEEKDAY)) {
    if (norm.includes(name)) result.push(wd);
  }
  return result;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

interface TimeOffset {
  hour: number;
  minute: number;
  dayOffset: number;
  weekdayOffset: number;
}

function addMinutesToTime(hour: number, minute: number, addMinutes: number): TimeOffset {
  const totalMinutes = hour * 60 + minute + addMinutes;
  const dayOffset = Math.floor(totalMinutes / (24 * 60));
  const adjustedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  return {
    hour: Math.floor(adjustedMinutes / 60),
    minute: adjustedMinutes % 60,
    dayOffset,
    weekdayOffset: dayOffset % 7,
  };
}

function isExpired(endDate?: string | null): boolean {
  if (!endDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > endDate;
}

export interface MedicationForSchedule {
  id: string;
  name: string;
  patient_name?: string;
  frequency: string;
  schedule_times: string[];
  notifications_enabled?: boolean;
  end_date?: string | null;
}

export async function scheduleMedicationNotifications(
  med: MedicationForSchedule,
): Promise<void> {
  await cancelMedicationNotifications(med.id);
  if (med.notifications_enabled === false) return;
  if (isExpired(med.end_date)) return;

  const weekdays = parseWeekdays(med.frequency);
  const mainBody = med.patient_name
    ? i18n.t('notifications.mainBodyWithPatient', { med: med.name, patient: med.patient_name })
    : i18n.t('notifications.mainBody', { med: med.name });
  const followUpBody = med.patient_name
    ? i18n.t('notifications.followUpBodyWithPatient', { med: med.name, patient: med.patient_name })
    : i18n.t('notifications.followUpBody', { med: med.name });

  for (const time of med.schedule_times) {
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;

    const baseTimeStr = `${pad(h)}:${pad(m)}`;

    const mainContent = {
      title: i18n.t('notifications.mainTitle'),
      body: mainBody,
      sound: 'default' as const,
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { medicationId: med.id },
    };

    // Notificación principal
    if (weekdays.length > 0) {
      for (const wd of weekdays) {
        await Notifications.scheduleNotificationAsync({
          identifier: `med-${med.id}-w${wd}-${pad(h)}${pad(m)}`,
          content: mainContent,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: wd,
            hour: h,
            minute: m,
            channelId: MEDICATION_CHANNEL,
          },
        });

        // Follow-ups a +10 y +20 minutos
        for (const offsetMin of [10, 20]) {
          const offset = addMinutesToTime(h, m, offsetMin);
          const adjustedWd = ((wd - 1 + offset.weekdayOffset) % 7) + 1;

          await Notifications.scheduleNotificationAsync({
            identifier: `med-${med.id}-w${wd}-f${offsetMin}-${pad(h)}${pad(m)}`,
            content: {
              title: i18n.t('notifications.followUpTitle'),
              body: followUpBody,
              sound: 'default' as const,
              priority: Notifications.AndroidNotificationPriority.MAX,
              data: { medicationId: med.id, followUp: true, baseTime: baseTimeStr },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: adjustedWd,
              hour: offset.hour,
              minute: offset.minute,
              channelId: MEDICATION_CHANNEL,
            },
          });
        }
      }
    } else {
      await Notifications.scheduleNotificationAsync({
        identifier: `med-${med.id}-${pad(h)}${pad(m)}`,
        content: mainContent,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: h,
          minute: m,
          channelId: MEDICATION_CHANNEL,
        },
      });

      // Follow-ups a +10 y +20 minutos (daily)
      for (const offsetMin of [10, 20]) {
        const offset = addMinutesToTime(h, m, offsetMin);

        await Notifications.scheduleNotificationAsync({
          identifier: `med-${med.id}-f${offsetMin}-${pad(h)}${pad(m)}`,
          content: {
            title: '⏰ Recordatorio pendiente',
            body: followUpBody,
            sound: 'default' as const,
            priority: Notifications.AndroidNotificationPriority.MAX,
            data: { medicationId: med.id, followUp: true, baseTime: baseTimeStr },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: offset.hour,
            minute: offset.minute,
            channelId: MEDICATION_CHANNEL,
          },
        });
      }
    }
  }
}

// Limitación: si la app está cerrada al dispararse el follow-up, sonará aunque la dosis
// ya esté marcada en el backend. Se resolverá en v2 con FCM server-side.

export async function cancelMedicationNotifications(medId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    const byData = (n.content?.data as any)?.medicationId === medId;
    const byId =
      typeof n.identifier === 'string' && n.identifier.startsWith(`med-${medId}-`);
    if (byData || byId) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// Cancela TODAS las notificaciones programadas. Se usa al cerrar sesión / borrar
// cuenta para que los recordatorios de una cuenta no suenen en la siguiente.
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// FASE 1 (push compartido): obtiene el Expo push token de ESTE dispositivo y lo
// registra en el backend, solo si cambió (para no spamear en cada arranque).
// Requiere el permiso de notificaciones ya concedido (lo pide permissions.tsx);
// NO lo solicita aquí. Si algo falla (p. ej. emulador sin Google Play, sin
// credenciales FCM), es no-op silencioso: las notificaciones LOCALES siguen
// funcionando igual. Todavía no se envía push; esto solo guarda el token.
export async function registerPushToken(): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;

    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    if (!projectId) {
      console.warn('Sin EAS projectId: no se puede obtener el Expo push token');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    const lastSent = await AsyncStorage.getItem(LAST_PUSH_TOKEN_KEY);
    if (lastSent === token) return; // sin cambios: no reenviar

    await api.post('/devices', { token, platform: Platform.OS });
    await AsyncStorage.setItem(LAST_PUSH_TOKEN_KEY, token);
  } catch (e) {
    console.warn('No se pudo registrar el push token:', e);
  }
}

// Da de baja el token de este dispositivo en el backend (al cerrar sesión /
// borrar cuenta) y limpia el cache local para que el próximo login lo vuelva a
// registrar (re-asociándolo a la cuenta que entre).
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(LAST_PUSH_TOKEN_KEY);
    if (token) {
      // Timeout corto: el logout no debe colgarse si el backend está frío.
      await api.delete('/devices', { data: { token }, timeout: 10000 });
    }
  } catch (e) {
    console.warn('No se pudo dar de baja el push token:', e);
  } finally {
    await AsyncStorage.removeItem(LAST_PUSH_TOKEN_KEY).catch(() => {});
  }
}

// Solo limpia el cache local del token (sin llamar al backend). Para cuando la
// sesión ya es inválida (401) y no podemos llamar a la API: así el próximo login
// re-registra el token y lo re-asocia al usuario correcto.
export async function clearLocalPushToken(): Promise<void> {
  await AsyncStorage.removeItem(LAST_PUSH_TOKEN_KEY).catch(() => {});
}

export async function syncAllMedicationNotifications(
  meds: MedicationForSchedule[],
): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const med of meds) {
    try {
      await scheduleMedicationNotifications(med);
    } catch (e) {
      console.warn('No se pudo agendar el medicamento', med.id, e);
    }
  }
}
