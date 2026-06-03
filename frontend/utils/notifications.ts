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
    });
  }
  
  return true;
}

export async function scheduleMedicationNotification(
  medicationName: string,
  time: string, // "08:00"
  medicationId: string
) {
  const [hours, minutes] = time.split(':').map(Number);
  
  const trigger = {
    hour: hours,
    minute: minutes,
    repeats: true,
  };
  
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '💊 Recordatorio de Medicamento',
      body: `Es hora de tomar: ${medicationName}`,
      data: { medicationId },
      sound: true,
    },
    trigger,
  });
}

export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
