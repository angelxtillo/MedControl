import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const MEDICATION_CHANNEL = 'medication-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
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
  const body =
    `Es hora de tomar ${med.name}` +
    (med.patient_name ? ` — Paciente: ${med.patient_name}` : '');

  for (const time of med.schedule_times) {
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;

    const content = {
      title: '💊 Recordatorio de medicamento',
      body,
      sound: 'default' as const,
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { medicationId: med.id },
    };

    if (weekdays.length > 0) {
      for (const wd of weekdays) {
        await Notifications.scheduleNotificationAsync({
          identifier: `med-${med.id}-w${wd}-${pad(h)}${pad(m)}`,
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: wd,
            hour: h,
            minute: m,
            channelId: MEDICATION_CHANNEL,
          },
        });
      }
    } else {
      await Notifications.scheduleNotificationAsync({
        identifier: `med-${med.id}-${pad(h)}${pad(m)}`,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: h,
          minute: m,
          channelId: MEDICATION_CHANNEL,
        },
      });
    }
  }
}

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
