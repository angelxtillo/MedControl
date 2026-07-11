import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import api from './api';

// MIGRACIÓN A PUSH SERVER-SIDE: las notificaciones de dosis (la de la hora y
// los re-avisos +10/+20) las envía el backend (scheduler) a TODOS los
// cuidadores, consultando el estado REAL de la dosis antes de cada envío.
// Este módulo ya NO programa notificaciones locales; conserva solo lo
// necesario para RECIBIR push: canal Android, permiso, handler de foreground
// y registro del Expo push token.

// Canal v2: estrena el sonido propio de Dosaria. El sonido de un canal Android
// es INMUTABLE tras crearlo, así que no se puede cambiar el del canal viejo
// (medication-reminders, con sonido default que ya tienen todos los usuarios
// actuales); la única vía es un id nuevo. El backend debe enviar este mismo
// channelId, pero SOLO después de que este build esté instalado y abierto al
// menos una vez (así el canal existe antes de recibir el primer push a v2).
export const MEDICATION_CHANNEL = 'medication-reminders-v2';
// Canal legado que se borra al crear el v2 para no dejar dos entradas en los
// ajustes del sistema.
const LEGACY_MEDICATION_CHANNEL = 'medication-reminders';
// Archivo empaquetado en android/app/src/main/res/raw (ver "sounds" en app.json,
// que el config plugin copia durante el prebuild de EAS).
const MEDICATION_SOUND = 'dosaria_alert.wav';

// Último Expo push token enviado al backend (por dispositivo). Sirve para no
// reenviarlo en cada arranque y para re-registrarlo si cambia o si se cambia de
// cuenta en el mismo dispositivo.
const LAST_PUSH_TOKEN_KEY = 'expoPushToken';

// Cómo mostrar una notificación cuando llega con la app en PRIMER PLANO
// (en background/cerrada la muestra el sistema). El push del servidor ya
// verificó el estado de la dosis antes de enviar: se muestra siempre.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// El permiso sigue siendo necesario para RECIBIR push (Android 13+ lo exige).
// El canal es el que usa el backend en sus mensajes (channelId).
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL, {
      name: 'Recordatorios de medicamentos',
      importance: Notifications.AndroidImportance.MAX,
      sound: MEDICATION_SOUND,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    // Borrar el canal viejo (sonido default) para no dejar dos entradas en los
    // ajustes del sistema. Idempotente: no falla si ya no existe.
    await Notifications.deleteNotificationChannelAsync(LEGACY_MEDICATION_CHANNEL).catch(() => {});
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// Cancela TODAS las notificaciones locales programadas. Usos: (1) limpieza de
// migración al arrancar — versiones anteriores dejaban programadas las
// notificaciones locales de dosis y sus re-avisos; sin esto seguirían sonando
// como zombis junto al push del servidor; (2) al cerrar sesión / borrar cuenta.
// Idempotente y barata: se puede llamar en cada arranque.
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// FASE 1 (push compartido): obtiene el Expo push token de ESTE dispositivo y lo
// registra en el backend, solo si cambió (para no spamear en cada arranque).
// Requiere el permiso de notificaciones ya concedido; NO lo solicita aquí.
// Instrumentado con prefijo [push-token] para diagnosticar en adb logcat
// (tag ReactNativeJS) dónde muere el registro en builds standalone.
export async function registerPushToken(): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    console.log(`[push-token] permiso: granted=${perm.granted} status=${perm.status}`);
    if (!perm.granted) return;

    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    console.log(`[push-token] projectId: ${projectId ?? 'NO DISPONIBLE'}`);
    if (!projectId) return;

    let token: string;
    try {
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      token = result.data;
      console.log(`[push-token] getExpoPushTokenAsync OK: ${token}`);
    } catch (e: any) {
      // Excepción completa: en builds sin google-services.json aquí sale
      // "Default FirebaseApp is not initialized" (o similar de FCM).
      console.warn(
        `[push-token] getExpoPushTokenAsync FALLÓ: ${e?.message ?? e}`,
        e?.code ?? '',
        e,
      );
      return;
    }
    if (!token) {
      console.warn('[push-token] token vacío, no se registra');
      return;
    }

    const lastSent = await AsyncStorage.getItem(LAST_PUSH_TOKEN_KEY);
    if (lastSent === token) {
      console.log('[push-token] sin cambios (ya registrado), no se reenvía');
      return;
    }

    try {
      const res = await api.post('/devices', { token, platform: Platform.OS });
      console.log(`[push-token] POST /devices OK: status=${res.status}`);
    } catch (e: any) {
      console.warn(
        `[push-token] POST /devices FALLÓ: status=${e?.response?.status ?? 'sin respuesta'}`,
        e?.response?.data ?? e?.message ?? e,
      );
      return; // no cachear: así se reintenta en el próximo arranque/login
    }
    await AsyncStorage.setItem(LAST_PUSH_TOKEN_KEY, token);
  } catch (e) {
    console.warn('[push-token] error inesperado:', e);
  }
}

// Devuelve el Expo push token que ya quedó registrado en el backend para este
// dispositivo (o null si aún no se registró). Solo lectura del cache local; la
// pantalla de Notificaciones lo usa para mostrar si el dispositivo está listo.
export async function getRegisteredPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_PUSH_TOKEN_KEY);
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
