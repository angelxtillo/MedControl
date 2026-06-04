import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
  
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('medication-reminders', {
      name: 'Recordatorios de Medicamentos',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  }
  
  return true;
}

export async function scheduleMedicationNotification(
  medicationId: string,
  medicationName: string,
  patientName: string,
  hour: number,
  minute: number,
): Promise<string | null> {
  const now = new Date();
  const trigger = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
  );

  if (trigger <= now) return null;

  // Garantizar que el canal existe antes de programar en Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('medication-reminders', {
      name: 'Recordatorios de Medicamentos',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  }

  const secondsUntilTrigger = Math.floor((trigger.getTime() - now.getTime()) / 1000);

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '💊 Recordatorio de medicamento',
      body: `Es hora de tomar ${medicationName} — Paciente: ${patientName}`,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250],
      data: { medicationId },
    },
    trigger: Platform.OS === 'android'
      ? { seconds: secondsUntilTrigger, channelId: 'medication-reminders' }
      : trigger,
  });

  return notificationId;
}

export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
