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

// BUG CORREGIDO (julio-septiembre 2026): antes se guardaba en AsyncStorage el
// último token enviado al backend y se usaba como "ya registrado" para saltarse
// el POST /devices. Esa caché sobrevivía a los reinicios de la app y al borrado
// del token en el servidor (revoke_user_devices tras un cambio o
// restablecimiento de contraseña), así que el dispositivo se quedaba sin
// notificaciones PARA SIEMPRE mientras la pantalla decía "listo"; lo único que
// la limpiaba era un logout manual.
//
// Ahora el dedupe es EN MEMORIA y por sesión: cada arranque de la app re-registra
// una vez (POST /devices es un upsert idempotente por token, no cuesta nada) y
// nada puede quedar desincronizado más de una sesión. Incluye el userId para que
// un cambio de cuenta siempre re-registre aunque el token sea el mismo, y la
// marca de tiempo para que el re-registro al volver a foreground pueda reparar
// una pérdida ocurrida a mitad de sesión.
let sessionRegistration: { token: string; userId: string | null; at: number } | null = null;

// Cada cuánto, como máximo, se repite el registro dentro de una misma sesión
// (re-registro al volver a foreground). Es la red que repara al dispositivo si
// el servidor pierde su token sin que la app se reinicie.
const REREGISTER_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 h

// Clave heredada de la caché vieja. Se borra en la migración del primer arranque
// para que ningún dispositivo arrastre ese estado mentiroso.
const LEGACY_REGISTERED_TOKEN_KEY = 'expoPushToken';

// Último token conocido de este dispositivo. SOLO informativo: permite dar de
// baja el dispositivo al cerrar sesión (y decirle al backend cuál conservar al
// cambiar la contraseña) sin depender de la red de Expo. NUNCA se usa para
// decidir si hace falta registrar.
const LAST_KNOWN_TOKEN_KEY = 'lastKnownPushToken';

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

// Borra la caché heredada de "ya registrado" (ver sessionRegistration). Se llama
// una vez al arrancar la app: idempotente y barata.
export async function migrateLegacyPushTokenCache(): Promise<void> {
  try {
    const legacy = await AsyncStorage.getItem(LEGACY_REGISTERED_TOKEN_KEY);
    if (legacy === null) return;
    await AsyncStorage.removeItem(LEGACY_REGISTERED_TOKEN_KEY);
    // Se conserva como "último token conocido" (uso informativo) para no perder
    // la capacidad de dar de baja el dispositivo sin red de Expo.
    await AsyncStorage.setItem(LAST_KNOWN_TOKEN_KEY, legacy);
    console.log('[push-token] caché heredada de registro eliminada (migración)');
  } catch (e) {
    console.warn('[push-token] no se pudo migrar la caché heredada:', e);
  }
}

// Expo push token de ESTE dispositivo, preguntándoselo al sistema. Requiere el
// permiso ya concedido; NO lo solicita aquí. Instrumentado con prefijo
// [push-token] para diagnosticar en adb logcat (tag ReactNativeJS) dónde muere
// el registro en builds standalone.
export async function getCurrentPushToken(): Promise<string | null> {
  const perm = await Notifications.getPermissionsAsync();
  console.log(`[push-token] permiso: granted=${perm.granted} status=${perm.status}`);
  if (!perm.granted) return null;

  const projectId =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId;
  console.log(`[push-token] projectId: ${projectId ?? 'NO DISPONIBLE'}`);
  if (!projectId) return null;

  let token: string | undefined;
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
    return null;
  }
  if (!token) {
    console.warn('[push-token] token vacío');
    return null;
  }
  await AsyncStorage.setItem(LAST_KNOWN_TOKEN_KEY, token).catch(() => {});
  return token;
}

// Token de este dispositivo sin pasar por la red de Expo: el de esta sesión o,
// si no hay, el último conocido en almacenamiento. Para el logout y para decirle
// al backend qué dispositivo conservar al cambiar la contraseña.
export async function getKnownPushToken(): Promise<string | null> {
  if (sessionRegistration) return sessionRegistration.token;
  try {
    return await AsyncStorage.getItem(LAST_KNOWN_TOKEN_KEY);
  } catch {
    return null;
  }
}

// Registra el Expo push token de este dispositivo para el usuario de la sesión.
// El backend hace upsert por token, así que llamarla de más es inofensivo.
// `userId`: dueño esperado del token. Se usa en el dedupe para que un cambio de
// cuenta siempre re-registre. `force`: ignora el dedupe (tras un cambio de
// contraseña, o al pulsar el botón de prueba: un diagnóstico no debe confiar en
// ninguna caché). Devuelve el token registrado, o null si no se pudo.
export async function registerPushToken(
  userId?: string | null,
  opts?: { force?: boolean },
): Promise<string | null> {
  try {
    const token = await getCurrentPushToken();
    if (!token) return null;

    const owner = userId ?? null;
    const dedupeHit =
      !opts?.force &&
      sessionRegistration !== null &&
      sessionRegistration.token === token &&
      sessionRegistration.userId === owner &&
      Date.now() - sessionRegistration.at < REREGISTER_MIN_INTERVAL_MS;
    if (dedupeHit) {
      console.log('[push-token] ya registrado en esta sesión, no se reenvía');
      return token;
    }

    try {
      const res = await api.post('/devices', { token, platform: Platform.OS });
      console.log(`[push-token] POST /devices OK: status=${res.status}`);
    } catch (e: any) {
      console.warn(
        `[push-token] POST /devices FALLÓ: status=${e?.response?.status ?? 'sin respuesta'}`,
        e?.response?.data ?? e?.message ?? e,
      );
      // No se marca como registrado: se reintenta en el próximo punto de entrada
      // (foreground, login, arranque).
      return null;
    }
    sessionRegistration = { token, userId: owner, at: Date.now() };
    return token;
  } catch (e) {
    console.warn('[push-token] error inesperado:', e);
    return null;
  }
}

// Token que ESTA sesión confirmó registrar en el backend (null si en esta
// ejecución todavía no se ha registrado). Ya no lee almacenamiento: un valor
// persistido no dice nada sobre lo que tiene el servidor, que es justo el error
// que dejaba la pantalla de Notificaciones mintiendo durante meses.
export async function getRegisteredPushToken(): Promise<string | null> {
  return sessionRegistration?.token ?? null;
}

// Da de baja el token de este dispositivo en el backend (al cerrar sesión /
// borrar cuenta) y olvida el registro de la sesión para que el próximo login lo
// vuelva a registrar (re-asociándolo a la cuenta que entre).
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await getKnownPushToken();
    if (token) {
      // Timeout corto: el logout no debe colgarse si el backend está frío.
      await api.delete('/devices', { data: { token }, timeout: 10000 });
    }
  } catch (e) {
    console.warn('No se pudo dar de baja el push token:', e);
  } finally {
    sessionRegistration = null;
  }
}

// Olvida el registro de esta sesión (sin llamar al backend). Para cuando la
// sesión ya es inválida (401) y no podemos llamar a la API: así el próximo login
// re-registra el token y lo re-asocia al usuario correcto. No borra el "último
// token conocido": ese sigue siendo el token de este dispositivo.
export async function clearPushTokenRegistration(): Promise<void> {
  sessionRegistration = null;
}
