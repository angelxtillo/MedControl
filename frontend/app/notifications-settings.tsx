import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useAuth } from '../contexts/AuthContext';
import {
  requestNotificationPermissions,
  registerPushToken,
  verifyDeviceRegistration,
} from '../utils/notifications';
import api from '../utils/api';
import { getApiErrorMessage } from '../utils/errors';

export default function NotificationsSettingsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { granted, canAskAgain, loading, refresh } = useNotificationPermission();
  // Tres estados, y el servidor decide cuál: 'checking' mientras se consulta,
  // 'ready' solo si el backend confirma que tiene el token de este dispositivo,
  // 'missing' si no lo tiene, 'unknown' si no se pudo comprobar (sin red). Antes
  // esto era un booleano leído de AsyncStorage, que decía "listo" aunque el
  // servidor no tuviera el token: el bug que dejó un teléfono sin notificaciones
  // durante dos meses sin una sola pista en la interfaz.
  const [deviceState, setDeviceState] =
    useState<'checking' | 'ready' | 'missing' | 'unknown'>('checking');
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const wasGranted = useRef(false);

  const loadToken = useCallback(async () => {
    setDeviceState('checking');
    const status = await verifyDeviceRegistration();
    setDeviceToken(status.token);
    setDeviceState(
      status.registered === null ? 'unknown' : status.registered ? 'ready' : 'missing',
    );
  }, []);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  // Reintento manual del estado 'missing'/'unknown': registra y vuelve a
  // comprobar contra el servidor.
  const handleRetryRegistration = async () => {
    setRetrying(true);
    try {
      await registerPushToken(user?.id, { force: true });
      await loadToken();
    } finally {
      setRetrying(false);
    }
  };

  // Cuando el permiso pasa a concedido (p. ej. al volver de los ajustes del
  // sistema, que el hook detecta al re-enfocar), registrar el token: sin esto el
  // permiso estaría OK pero el backend no tendría a dónde enviar. Idempotente.
  useEffect(() => {
    if (!loading && granted && !wasGranted.current) {
      registerPushToken(user?.id).then(loadToken).catch(() => {});
    }
    wasGranted.current = granted;
  }, [granted, loading, loadToken, user?.id]);

  const handleEnable = async () => {
    // canAskAgain true: el sistema todavía muestra el diálogo -> pedirlo dentro
    // de la app (mejor experiencia). Si ya no (denegado permanente), la única
    // vía es abrir los ajustes del SO.
    if (canAskAgain) {
      setRequesting(true);
      try {
        const ok = await requestNotificationPermissions();
        if (ok) await registerPushToken(user?.id);
      } finally {
        setRequesting(false);
        await refresh();
        await loadToken();
      }
    } else {
      Linking.openSettings();
    }
  };

  const handleTest = async () => {
    setSending(true);
    try {
      // Asegura el token antes de pedir la prueba: quien acaba de conceder el
      // permiso puede no tenerlo registrado aún, y /devices/test-push responde
      // 400 si el usuario no tiene dispositivos. force: un botón de diagnóstico
      // NO debe confiar en ninguna caché (antes se saltaba el POST /devices y la
      // prueba se enviaba a los tokens viejos, sin el de este dispositivo).
      const registered = await registerPushToken(user?.id, { force: true });
      await loadToken();
      const res = await api.post('/devices/test-push');
      // El backend devuelve los últimos 6 caracteres de cada token al que envió.
      // Si el de este dispositivo no está en la lista, la prueba salió a otros
      // teléfonos y decir "enviada" sería repetir la mentira de siempre.
      const tails: string[] = Array.isArray(res.data?.devices)
        ? res.data.devices.map((d: any) => String(d?.token_tail ?? ''))
        : [];
      const mine = (registered ?? deviceToken)?.slice(-6);
      if (mine && tails.length > 0 && !tails.includes(mine)) {
        Alert.alert(t('common.error'), t('settings.notificationsScreen.testNotInList'));
        return;
      }
      Alert.alert(
        t('settings.notificationsScreen.testSuccessTitle'),
        t('settings.notificationsScreen.testSuccessBody')
      );
    } catch (e: any) {
      const msg =
        e?.response?.status === 400
          ? t('settings.notificationsScreen.testNoDevice')
          : getApiErrorMessage(e, t('settings.notificationsScreen.testError'));
      Alert.alert(t('common.error'), msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('settings.notificationsScreen.intro')}</Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color="#2196F3" />
        ) : (
          <>
            {/* Estado del permiso */}
            <View
              style={[
                styles.statusCard,
                granted ? styles.statusCardOk : styles.statusCardWarn,
              ]}
            >
              <Ionicons
                name={granted ? 'notifications' : 'notifications-off'}
                size={28}
                color={granted ? '#2E7D32' : '#C62828'}
              />
              <View style={styles.statusTextWrap}>
                <Text
                  style={[
                    styles.statusTitle,
                    { color: granted ? '#2E7D32' : '#C62828' },
                  ]}
                >
                  {granted
                    ? t('settings.notificationsScreen.statusGranted')
                    : t('settings.notificationsScreen.statusDenied')}
                </Text>
                <Text style={styles.statusDesc}>
                  {granted
                    ? t('settings.notificationsScreen.statusGrantedDesc')
                    : t('settings.notificationsScreen.statusDeniedDesc')}
                </Text>
              </View>
            </View>

            {/* Acción para activar (solo si no está concedido) */}
            {!granted && (
              <>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleEnable}
                  disabled={requesting}
                >
                  {requesting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name={canAskAgain ? 'notifications' : 'settings-outline'}
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.primaryButtonText}>
                        {canAskAgain
                          ? t('settings.notificationsScreen.enableButton')
                          : t('settings.notificationsScreen.openSettingsButton')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                {!canAskAgain && (
                  <Text style={styles.hint}>
                    {t('settings.notificationsScreen.openSettingsHint')}
                  </Text>
                )}
              </>
            )}

            {/* Estado del dispositivo + prueba (solo con permiso concedido) */}
            {granted && (
              <>
                <View style={styles.deviceRow}>
                  <Ionicons
                    name={
                      deviceState === 'ready'
                        ? 'checkmark-circle'
                        : deviceState === 'missing'
                          ? 'alert-circle'
                          : 'time-outline'
                    }
                    size={18}
                    color={
                      deviceState === 'ready'
                        ? '#2E7D32'
                        : deviceState === 'missing'
                          ? '#C62828'
                          : '#FF9800'
                    }
                  />
                  <Text
                    style={[
                      styles.deviceText,
                      deviceState === 'missing' && styles.deviceTextError,
                    ]}
                  >
                    {deviceState === 'ready'
                      ? t('settings.notificationsScreen.tokenRegistered')
                      : deviceState === 'missing'
                        ? t('settings.notificationsScreen.tokenNotRegistered')
                        : deviceState === 'unknown'
                          ? t('settings.notificationsScreen.tokenCheckFailed')
                          : t('settings.notificationsScreen.tokenMissing')}
                  </Text>
                </View>

                {(deviceState === 'missing' || deviceState === 'unknown') && (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleRetryRegistration}
                    disabled={retrying}
                  >
                    {retrying ? (
                      <ActivityIndicator color="#2196F3" />
                    ) : (
                      <>
                        <Ionicons name="refresh-outline" size={20} color="#2196F3" />
                        <Text style={styles.secondaryButtonText}>
                          {t('settings.notificationsScreen.tokenRetryButton')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleTest}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator color="#2196F3" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane-outline" size={20} color="#2196F3" />
                      <Text style={styles.secondaryButtonText}>
                        {t('settings.notificationsScreen.testButton')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.hint}>
                  {t('settings.notificationsScreen.testHint')}
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: {
    padding: 16,
  },
  intro: {
    fontSize: 15,
    color: '#666',
    lineHeight: 21,
    marginBottom: 20,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    gap: 14,
    borderWidth: 1,
  },
  statusCardOk: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
  },
  statusCardWarn: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF9A9A',
  },
  statusTextWrap: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  statusDesc: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 20,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderColor: '#2196F3',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 20,
    gap: 8,
  },
  secondaryButtonText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '700',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  deviceTextError: {
    color: '#C62828',
    fontWeight: '600',
  },
  deviceText: {
    fontSize: 14,
    color: '#555',
    flex: 1,
  },
  hint: {
    fontSize: 13,
    color: '#999',
    marginTop: 10,
    lineHeight: 18,
  },
});
