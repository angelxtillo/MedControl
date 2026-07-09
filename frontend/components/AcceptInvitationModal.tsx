import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';

interface AcceptInvitationModalProps {
  visible: boolean;
  onClose: () => void;
  /** Se llama tras aceptar con éxito (antes de cerrar), p. ej. para recargar pacientes. */
  onAccepted?: (patientName: string) => void;
}

/**
 * Flujo de "Aceptar invitación" (código de 6 caracteres). Fuente única de verdad:
 * lo usan tanto Ajustes como la pantalla de Pacientes. Mantiene su propio estado
 * del código para no filtrar detalles a las pantallas que lo montan.
 */
export function AcceptInvitationModal({ visible, onClose, onAccepted }: AcceptInvitationModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [inviteCode, setInviteCode] = useState('');
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  const close = () => {
    setInviteCode('');
    onClose();
  };

  const handleAcceptInvitation = async () => {
    if (!inviteCode.trim()) {
      Alert.alert(t('common.error'), t('caregivers.acceptInvitationDesc'));
      return;
    }
    setAcceptingInvite(true);
    try {
      const response = await api.post('/caregivers/accept-invitation', {
        code: inviteCode.trim().toUpperCase(),
      });
      const patientName = response.data.patient_name;
      Alert.alert(
        t('common.success'),
        t('caregivers.nowCaregiver', { name: patientName }),
        [{
          text: t('common.confirm'),
          onPress: () => {
            onAccepted?.(patientName);
            close();
          },
        }]
      );
    } catch (error: any) {
      const status = error.response?.status;
      let msg: string;
      if (status === 404)      msg = t('caregivers.codeInvalid');
      else if (status === 400) msg = t('caregivers.codeExpired');
      else if (status === 403) msg = t('caregivers.codeWrongEmail');
      else                     msg = t('caregivers.errorAccept');
      Alert.alert(t('common.error'), msg);
    } finally {
      setAcceptingInvite(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('caregivers.acceptInvitation')}</Text>
            <TouchableOpacity onPress={close} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.inviteIconBox}>
              <Ionicons name="mail-open" size={40} color="#2196F3" />
            </View>
            <Text style={styles.inviteDescription}>
              {t('caregivers.acceptInvitationDesc')}
            </Text>

            <TextInput
              style={styles.inviteCodeInput}
              value={inviteCode}
              onChangeText={(text) => setInviteCode(text.toUpperCase())}
              placeholder={t('caregivers.codePlaceholder')}
              placeholderTextColor="#bbb"
              maxLength={6}
              autoCapitalize="characters"
              keyboardType="default"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.inviteAcceptButton, acceptingInvite && { opacity: 0.7 }]}
              onPress={handleAcceptInvitation}
              disabled={acceptingInvite}
            >
              {acceptingInvite ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.inviteAcceptButtonText}>{t('caregivers.acceptCode')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.inviteCancelButton} onPress={close}>
              <Text style={styles.inviteCancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  inviteIconBox: {
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  inviteCodeInput: {
    borderWidth: 2,
    borderColor: '#2196F3',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    color: '#1565C0',
    backgroundColor: '#E3F2FD',
    marginBottom: 20,
  },
  inviteAcceptButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  inviteAcceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  inviteCancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  inviteCancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
});
