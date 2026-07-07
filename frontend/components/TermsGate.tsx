import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { TermsCheckbox } from './TermsCheckbox';

/**
 * Gate de aceptación para usuarios EXISTENTES que se registraron antes de que
 * la aceptación de términos fuera obligatoria (user.accepted_terms_at == null).
 * Se muestra como capa bloqueante a pantalla completa sobre la app: no pueden
 * usarla sin aceptar. Al aceptar, persiste en backend y desaparece. También
 * pueden cerrar sesión si no desean aceptar.
 */
export function TermsGate() {
  const { t } = useTranslation();
  const { user, acceptTerms, logout } = useAuth();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Solo aplica a usuarios con sesión activa que aún no han aceptado.
  if (!user || user.accepted_terms_at) return null;

  const handleAccept = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    try {
      await acceptTerms();
    } catch (e: any) {
      Alert.alert(t('common.error'), t('legal.acceptError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.overlay}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="shield-checkmark" size={40} color="#2196F3" />
        </View>
        <Text style={styles.title}>{t('legal.gateTitle')}</Text>
        <Text style={styles.body}>{t('legal.gateBody')}</Text>

        <View style={styles.checkboxWrap}>
          <TermsCheckbox checked={checked} onToggle={() => setChecked(v => !v)} />
        </View>

        <TouchableOpacity
          style={[styles.button, (!checked || submitting) && styles.buttonDisabled]}
          onPress={handleAccept}
          disabled={!checked || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>{t('legal.gateAccept')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={logout} disabled={submitting}>
          <Text style={styles.logoutText}>{t('auth.logout')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5F7FA',
    zIndex: 1000,
    elevation: 1000,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  checkboxWrap: {
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#BBDEFB',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  logoutButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  logoutText: {
    color: '#f44336',
    fontSize: 15,
    fontWeight: '500',
  },
});
