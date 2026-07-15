import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PatientCard } from '../../components/PatientCard';
import { router, useFocusEffect } from 'expo-router';
import { useRefreshOnResume } from '../../hooks/useRefreshOnResume';
import api from '../../utils/api';
import { markMutation, hasMutatedSince } from '../../utils/mutations';
import { pickPatientPhoto } from '../../utils/patientPhoto';
import { useTranslation } from 'react-i18next';
import { getDeviceTimezone } from '../../utils/timezones';
import { AcceptInvitationModal } from '../../components/AcceptInvitationModal';

interface Patient {
  id: string;
  name: string;
  age?: number;
  photo?: string;
  notes?: string;
}

export default function Patients() {
  const { t } = useTranslation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptInviteVisible, setAcceptInviteVisible] = useState(false);

  const lastRefresh = useRef(0);

  // Revalidar al foco (throttle 30s) y al volver de background (>60s o cambio
  // de día). Las recargas explícitas (guardar paciente, pull-to-refresh)
  // llaman a loadPatients() directo y no pasan por el throttle.
  useFocusEffect(
    useCallback(() => {
      // El throttle se perdona si hubo una mutación (p. ej. editar o eliminar
      // un paciente en su perfil) después de la última carga.
      if (!hasMutatedSince(lastRefresh.current) && Date.now() - lastRefresh.current < 30000) return;
      lastRefresh.current = Date.now();
      loadPatients();
    }, [])
  );

  useRefreshOnResume(() => {
    lastRefresh.current = Date.now();
    loadPatients();
  });

  const loadPatients = async () => {
    try {
      const response = await api.get('/patients');
      setPatients(response.data);
    } catch (error) {
      Alert.alert(t('common.error'), t('patients.errorLoad'));
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPatients();
  };

  const pickImage = async () => {
    const photoUri = await pickPatientPhoto();
    if (photoUri) setPhoto(photoUri);
  };

  const handleAddPatient = async () => {
    if (!name) {
      Alert.alert(t('common.error'), t('patients.nameRequired'));
      return;
    }

    if (age) {
      const ageNum = parseInt(age, 10);
      if (isNaN(ageNum) || ageNum < 0 || ageNum > 150) {
        Alert.alert(t('common.error'), t('patients.validAge'));
        return;
      }
    }

    setLoading(true);
    try {
      // Autodetecta la zona del dispositivo (ej. "America/Bogota"); el
      // cuidador no hace nada en el caso normal y puede cambiarla luego en la ficha.
      await api.post('/patients', {
        name,
        age: age ? parseInt(age, 10) : null,
        notes,
        photo,
        timezone: getDeviceTimezone(),
      });
      markMutation();
      Alert.alert(t('common.success'), t('patients.patientAdded'));
      setModalVisible(false);
      resetForm();
      loadPatients();
    } catch (error) {
      Alert.alert(t('common.error'), t('patients.errorCreate'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setAge('');
    setNotes('');
    setPhoto(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {patients.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>{t('patients.noPatients')}</Text>
            <Text style={styles.emptySubtext}>{t('patients.addFirstPatient')}</Text>
            <TouchableOpacity
              style={styles.acceptInviteButton}
              onPress={() => setAcceptInviteVisible(true)}
            >
              <Ionicons name="mail-open-outline" size={20} color="#2196F3" />
              <Text style={styles.acceptInviteButtonText}>{t('caregivers.acceptInvitation')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.inviteLinkRow}
              onPress={() => setAcceptInviteVisible(true)}
            >
              <Ionicons name="mail-open-outline" size={16} color="#2196F3" />
              <Text style={styles.inviteLinkPrompt}>{t('caregivers.gotInvitePrompt')} </Text>
              <Text style={styles.inviteLinkAction}>{t('caregivers.acceptCode')}</Text>
              <Ionicons name="chevron-forward" size={14} color="#2196F3" />
            </TouchableOpacity>
            {patients.map((patient) => (
              <PatientCard
                key={patient.id}
                {...patient}
                onPress={() => router.push(`/patient/${patient.id}`)}
              />
            ))}
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('patients.addPatient')}</Text>
              <TouchableOpacity onPress={() => {
                setModalVisible(false);
                resetForm();
              }}>
                <Ionicons name="close" size={28} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera" size={32} color="#999" />
                    <Text style={styles.photoText}>{t('patients.addPhoto')}</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('patients.name')} *</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.fullName')}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('patients.age')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('patients.years')}
                  value={age}
                  onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('patients.notes')}</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder={t('patients.additionalNotes')}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                onPress={handleAddPatient}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>
                  {loading ? t('patients.saving') : t('common.save')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <AcceptInvitationModal
        visible={acceptInviteVisible}
        onClose={() => setAcceptInviteVisible(false)}
        onAccepted={loadPatients}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
  },
  acceptInviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2196F3',
    backgroundColor: '#fff',
  },
  acceptInviteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2196F3',
  },
  inviteLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebef',
  },
  inviteLinkPrompt: {
    fontSize: 13,
    color: '#666',
  },
  inviteLinkAction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2196F3',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#212121',
  },
  modalBody: {
    padding: 20,
  },
  photoButton: {
    alignSelf: 'center',
    marginBottom: 24,
  },
  photoPreview: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#212121',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#BBDEFB',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});
