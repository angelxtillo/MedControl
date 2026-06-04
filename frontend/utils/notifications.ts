import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const MEDICATION_CHANNEL = 'medication-reminders';
const BACKGROUND_FETCH_TASK = 'background-medication-check';

async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL, {
      name: 'Recordatorios de Medicamentos',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  }
}

export async function requestNotificationPermissions() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  await ensureAndroidChannel();
  return true;
}

export async function scheduleMedicationNotification(
  medicationId: string,
  medicationName: string,
  patientName: string,
  secondsUntil: number,
): Promise<string | null> {
  if (secondsUntil <= 0) return null;

  await ensureAndroidChannel();

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '💊 Recordatorio de medicamento',
      body: `Es hora de tomar ${medicationName} — Paciente: ${patientName}`,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250],
      data: { medicationId },
    },
    trigger: {
      seconds: secondsUntil,
      channelId: MEDICATION_CHANNEL,
    },
  });

  return notificationId;
}

export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ============= BACKGROUND TASK =============

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const token = await AsyncStorage.getItem('token');
    if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

    const offset = new Date().getTimezoneOffset() * -1;
    const response = await fetch(
      `https://medcontrol-api-a7vo.onrender.com/api/dashboard/today?timezone_offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) return BackgroundFetch.BackgroundFetchResult.Failed;

    const data = await response.json();
    const medications: any[] = data.medications_today || [];

    await Notifications.cancelAllScheduledNotificationsAsync();
    await ensureAndroidChannel();

    const now = new Date();
    for (const med of medications) {
      if (med.status !== 'pending') continue;
      const [h, m] = (med.scheduled_time as string).split(':').map(Number);
      const triggerTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      const secondsUntil = Math.floor((triggerTime.getTime() - now.getTime()) / 1000);
      if (secondsUntil <= 60) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '💊 Recordatorio de medicamento',
          body: `Es hora de tomar ${med.medication_name} — Paciente: ${med.patient_name}`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { medicationId: med.medication_id },
        },
        trigger: { seconds: secondsUntil, channelId: MEDICATION_CHANNEL },
      });
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTask() {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return;
    }
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (err) {
    console.log('Error registrando background task:', err);
  }
}
