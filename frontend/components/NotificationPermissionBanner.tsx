import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useNotificationPermission } from '../hooks/useNotificationPermission';

/**
 * Aviso visible en Home SOLO cuando el permiso de notificaciones está denegado:
 * sin él no llega ningún recordatorio de dosis, y el usuario atrapado no irá a
 * buscar la pantalla de Notificaciones por su cuenta. Al tocarlo, lleva a esa
 * pantalla para activarlo. Con el permiso concedido no se renderiza nada.
 */
export function NotificationPermissionBanner() {
  const { t } = useTranslation();
  const { granted, loading } = useNotificationPermission();

  if (loading || granted) return null;

  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={() => router.push('/notifications-settings')}
      activeOpacity={0.8}
    >
      <Ionicons name="notifications-off" size={20} color="#C62828" />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{t('home.notifDisabledTitle')}</Text>
        <Text style={styles.desc}>{t('home.notifDisabledDesc')}</Text>
      </View>
      <Text style={styles.action}>{t('home.notifDisabledAction')}</Text>
      <Ionicons name="chevron-forward" size={16} color="#C62828" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderColor: '#EF9A9A',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C62828',
  },
  desc: {
    fontSize: 12,
    color: '#8B2E2E',
    marginTop: 1,
  },
  action: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C62828',
  },
});
