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
import {
  requestNotificationPermissions,
  registerPushToken,
  getRegisteredPushToken,
} from '../utils/notifications';
import api from '../utils/api';
import { getApiErrorMessage } from '../utils/errors';

export default function NotificationsSettingsScreen() {
  const { t } = useTranslation();
  const { granted, canAskAgain, loading, refresh } = useNotificationPermission();
  const [tokenRegistered, setTokenRegistered] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const wasGranted = useRef(false);

  const loadToken = useCallback(async () => {
    const tok = await getRegisteredPushToken();
    setTokenRegistered(!!tok);
  }, []);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  // Cuando el permiso pasa a concedido (p. ej. al volver de los ajustes del
  // sistema, que el hook detecta al re-enfocar), registrar el token: sin esto el
  // permiso estaría OK pero el backend no tendría a dónde enviar. Idempotente.
  useEffect(() => {
    if (!loading && granted && !wasGranted.current) {
      registerPushToken().then(loadToken).catch(() => {});
    }
    wasGranted.current = granted;
  }, [granted, loading, loadToken]);

  const handleEnable = async () => {
    // canAskAgain true: el sistema todavía muestra el diálogo -> pedirlo dentro
    // de la app (mejor experiencia). Si ya no (denegado permanente), la única
    // vía es abrir los ajustes del SO.
    if (canAskAgain) {
      setRequesting(true);
      try {
        const ok = await requestNotificationPermissions();
        if (ok) await registerPushToken();
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
      // 400 si el usuario no tiene dispositivos.
      await registerPushToken();
      await loadToken();
      await api.post('/devices/test-push');
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
                    name={tokenRegistered ? 'checkmark-circle' : 'time-outline'}
                    size={18}
                    color={tokenRegistered ? '#2E7D32' : '#FF9800'}
                  />
                  <Text style={styles.deviceText}>
                    {tokenRegistered
                      ? t('settings.notificationsScreen.tokenRegistered')
                      : t('settings.notificationsScreen.tokenMissing')}
                  </Text>
                </View>

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
