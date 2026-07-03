import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import api from '../../utils/api';
import CaregiversManager from '../../components/CaregiversManager';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_TIMEZONE,
  timezoneCity,
  timezoneOptionsIncluding,
} from '../../utils/timezones';

interface Patient {
  id: string;
  name: string;
  age?: number;
  photo?: string;
  notes?: string;
  timezone?: string;
  is_owner?: boolean;
}

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  schedule_times: string[];
  active: boolean;
  instructions?: string;
  notifications_enabled?: boolean;
}

export default function PatientDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // Estado para el modal de edición
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTimezone, setEditTimezone] = useState(DEFAULT_TIMEZONE);
  const [tzPickerVisible, setTzPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPatientData();
  }, [id]);

  // Sincronizar datos del paciente con el formulario de edición
  useEffect(() => {
    if (patient) {
      setEditName(patient.name);
      setEditAge(patient.age ? patient.age.toString() : '');
      setEditNotes(patient.notes || '');
      setEditTimezone(patient.timezone || DEFAULT_TIMEZONE);
    }
  }, [patient]);

  const loadPatientData = async () => {
    try {
      const [patientsResponse, medicationsResponse] = await Promise.all([
        api.get('/patients'),
        api.get(`/medications/patient/${id}`),
      ]);
      const currentPatient = patientsResponse.data.find((p: Patient) => p.id === id);
      setPatient(currentPatient);
      setMedications(medicationsResponse.data);
    } catch (error) {
      Alert.alert(t('common.error'), t('medications.errorLoadData'));
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPatientData();
  };

  const handleDeletePatient = () => {
    Alert.alert(
      t('patients.deletePatient'),
      t('patients.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/patients/${id}`);
              Alert.alert(t('common.success'), t('medications.patientDeleted'));
              router.back();
            } catch (error: any) {
              // 403 = autenticado pero sin permiso (no es el dueño). La sesión
              // sigue válida (el interceptor ya no expulsa en 403); mostramos un
              // mensaje claro de quién sí puede eliminar.
              if (error?.response?.status === 403) {
                Alert.alert(t('common.error'), t('patients.onlyOwnerCanDelete'));
              } else {
                Alert.alert(t('common.error'), t('medications.errorDeletePatient'));
              }
            }
          },
        },
      ]
    );
  };

  // Solo para cuidadores NO-dueños: desvincularse del paciente (el backend
  // bloquea al dueño con 400). El dueño usa "Borrar paciente" en su lugar.
  const handleLeavePatient = () => {
    Alert.alert(
      t('patients.leavePatient'),
      t('patients.leaveConfirm', { name: patient?.name ?? '' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('patients.leavePatient'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/patients/${id}/leave`);
              Alert.alert(t('common.success'), t('patients.leftPatient'));
              router.back();
            } catch (error: any) {
              const message = error?.response?.data?.detail || t('patients.errorLeave');
              Alert.alert(t('common.error'), message);
            }
          },
        },
      ]
    );
  };

  const handleDeleteMedication = (medicationId: string) => {
    Alert.alert(
      t('medications.deleteMedication'),
      t('medications.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/medications/${medicationId}`);
              Alert.alert(t('common.success'), t('medications.deleted'));
              loadPatientData();
            } catch (error) {
              Alert.alert(t('common.error'), t('medications.errorDelete'));
            }
          },
        },
      ]
    );
  };

  const toggleMedicationStatus = async (medicationId: string, currentStatus: boolean) => {
    try {
      await api.put(`/medications/${medicationId}`, {
        active: !currentStatus,
      });
      loadPatientData();
    } catch (error) {
      Alert.alert(t('common.error'), t('medications.errorUpdateStatus'));
    }
  };

  const toggleNotifications = async (medicationId: string, currentStatus: boolean) => {
    try {
      await api.put(`/medications/${medicationId}`, {
        notifications_enabled: !currentStatus,
      });
      loadPatientData();
    } catch (error) {
      Alert.alert(t('common.error'), t('medications.errorUpdateNotifications'));
    }
  };

  const openEditModal = () => {
    setEditModalVisible(true);
  };

  const handleSavePatient = async () => {
    if (!editName.trim()) {
      Alert.alert(t('common.error'), t('patients.nameRequired2'));
      return;
    }

    setSaving(true);
    try {
      const updateData: any = {
        name: editName.trim(),
      };
      
      if (editAge.trim()) {
        const age = parseInt(editAge, 10);
        if (isNaN(age) || age < 0 || age > 150) {
          Alert.alert(t('common.error'), t('patients.validAge'));
          setSaving(false);
          return;
        }
        updateData.age = age;
      } else {
        updateData.age = null;
      }

      if (editNotes.trim()) {
        updateData.notes = editNotes.trim();
      } else {
        updateData.notes = null;
      }

      updateData.timezone = editTimezone;

      await api.put(`/patients/${id}`, updateData);
      
      Alert.alert(t('common.success'), t('patients.patientUpdated'));
      setEditModalVisible(false);
      loadPatientData();
    } catch (error) {
      Alert.alert(t('common.error'), t('patients.errorSaveChanges'));
    } finally {
      setSaving(false);
    }
  };

  if (!patient) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {patient.photo ? (
              <Image source={{ uri: patient.photo }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={64} color="#2196F3" />
              </View>
            )}
          </View>
          <Text style={styles.patientName}>{patient.name}</Text>
          {patient.age && <Text style={styles.patientAge}>{patient.age} {t('patients.years')}</Text>}
          {patient.notes && <Text style={styles.patientNotes}>{patient.notes}</Text>}

          <View style={styles.timezoneBadge}>
            <Ionicons name="globe-outline" size={16} color="#2196F3" />
            <Text style={styles.timezoneBadgeText}>
              {t('patients.timezone')}: {timezoneCity(patient.timezone)} ({patient.timezone || DEFAULT_TIMEZONE})
            </Text>
          </View>

          <View style={styles.patientActions}>
            <TouchableOpacity style={styles.editPatientButton} onPress={openEditModal}>
              <Ionicons name="pencil-outline" size={20} color="#2196F3" />
              <Text style={styles.editPatientText}>{t('common.edit')}</Text>
            </TouchableOpacity>
            {/* Solo el dueño ve "Borrar"; los no-dueños ven "Dejar de cuidar". */}
            {patient.is_owner ? (
              <TouchableOpacity style={styles.deletePatientButton} onPress={handleDeletePatient}>
                <Ionicons name="trash-outline" size={20} color="#f44336" />
                <Text style={styles.deletePatientText}>{t('common.delete')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.deletePatientButton} onPress={handleLeavePatient}>
                <Ionicons name="exit-outline" size={20} color="#f44336" />
                <Text style={styles.deletePatientText}>{t('patients.leavePatient')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Sección de Cuidadores */}
        <CaregiversManager
          patientId={id as string}
          patientName={patient.name}
          isOwner={!!patient.is_owner}
          onCaregiversChange={loadPatientData}
        />

        <View style={styles.medicationsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('medications.title')}</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push(`/medication/add-wizard?patientId=${id}&patientName=${encodeURIComponent(patient?.name ?? '')}`)}
            >
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {medications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="medical-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>{t('medications.noMedications')}</Text>
              <Text style={styles.emptySubtext}>{t('medications.addFirst')}</Text>
            </View>
          ) : (
            medications.map((med) => (
              <View key={med.id} style={styles.medicationCard}>
                <View style={styles.medicationHeader}>
                  <View style={styles.medicationInfo}>
                    <Text style={styles.medicationName}>{med.name}</Text>
                    <Text style={styles.medicationDosage}>{med.dosage}</Text>
                    <Text style={styles.medicationFrequency}>{med.frequency}</Text>
                    <View style={styles.timesContainer}>
                      {med.schedule_times.map((time, idx) => (
                        <View key={idx} style={styles.timeChip}>
                          <Ionicons name="time-outline" size={14} color="#2196F3" />
                          <Text style={styles.timeText}>{time}</Text>
                        </View>
                      ))}
                    </View>
                    {med.instructions && (
                      <Text style={styles.instructions}>{med.instructions}</Text>
                    )}
                  </View>
                  <View style={styles.medicationActions}>
                    <TouchableOpacity
                      style={[styles.statusToggle, med.active && styles.statusToggleActive]}
                      onPress={() => toggleMedicationStatus(med.id, med.active)}
                    >
                      <Ionicons
                        name={med.active ? 'checkmark-circle' : 'close-circle'}
                        size={24}
                        color={med.active ? '#4CAF50' : '#999'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* Toggle de notificaciones */}
                <View style={styles.notificationRow}>
                  <View style={styles.notificationRowInfo}>
                    <Ionicons 
                      name={med.notifications_enabled !== false ? 'notifications' : 'notifications-off'} 
                      size={18} 
                      color={med.notifications_enabled !== false ? '#FF9800' : '#999'} 
                    />
                    <Text style={[
                      styles.notificationRowText,
                      med.notifications_enabled === false && styles.notificationRowTextOff
                    ]}>
                      {med.notifications_enabled !== false ? t('medications.notificationsOn') : t('medications.notificationsOff')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.notificationToggleBtn,
                      med.notifications_enabled !== false && styles.notificationToggleBtnOn
                    ]}
                    onPress={() => toggleNotifications(med.id, med.notifications_enabled !== false)}
                  >
                    <View style={[
                      styles.notificationToggleKnob,
                      med.notifications_enabled !== false && styles.notificationToggleKnobOn
                    ]} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.medicationFooter}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => router.push(`/medication/${med.id}`)}
                  >
                    <Ionicons name="pencil" size={16} color="#2196F3" />
                    <Text style={styles.editButtonText}>{t('common.edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteMedication(med.id)}
                  >
                    <Ionicons name="trash" size={16} color="#f44336" />
                    <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Modal de Edición de Paciente */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('patients.editPatient')}</Text>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('patients.name')} *</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder={t('auth.fullName')}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('patients.age')}</Text>
                <TextInput
                  style={styles.input}
                  value={editAge}
                  onChangeText={(t) => setEditAge(t.replace(/[^0-9]/g, ''))}
                  placeholder={t('patients.years')}
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('patients.notes')}</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder={t('patients.additionalNotes')}
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('patients.timezone')}</Text>
                <TouchableOpacity
                  style={styles.tzSelect}
                  onPress={() => setTzPickerVisible(true)}
                >
                  <Ionicons name="globe-outline" size={18} color="#2196F3" />
                  <Text style={styles.tzSelectText}>
                    {timezoneCity(editTimezone)} ({editTimezone})
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#999" />
                </TouchableOpacity>
                <Text style={styles.tzHint}>{t('patients.timezoneHint')}</Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSavePatient}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Selector de zona horaria del paciente */}
      <Modal
        visible={tzPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTzPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('patients.timezone')}</Text>
              <TouchableOpacity
                onPress={() => setTzPickerVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalForm}>
              {timezoneOptionsIncluding(editTimezone).map((opt) => {
                const selected = opt.value === editTimezone;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.tzOption, selected && styles.tzOptionSelected]}
                    onPress={() => {
                      setEditTimezone(opt.value);
                      setTzPickerVisible(false);
                    }}
                  >
                    <View style={styles.tzOptionInfo}>
                      <Text style={styles.tzOptionCity}>{opt.city}</Text>
                      <Text style={styles.tzOptionIana}>{opt.value}</Text>
                    </View>
                    {selected && (
                      <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 16,
    color: '#999',
  },
  header: {
    backgroundColor: 'white',
    borderRadius: 16,
    margin: 16,
    marginBottom: 0,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#E3F2FD',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#BBDEFB',
  },
  patientName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1565C0',
    marginBottom: 4,
  },
  patientAge: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  patientNotes: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  timezoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  timezoneBadgeText: {
    fontSize: 12,
    color: '#1565C0',
    fontWeight: '500',
  },
  tzSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tzSelectText: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
  },
  tzHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
  },
  tzOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tzOptionSelected: {
    backgroundColor: '#F1F8E9',
  },
  tzOptionInfo: {
    flex: 1,
  },
  tzOptionCity: {
    fontSize: 16,
    color: '#212121',
    fontWeight: '500',
  },
  tzOptionIana: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  deletePatientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f44336',
  },
  deletePatientText: {
    color: '#f44336',
    marginLeft: 8,
    fontWeight: '500',
  },
  patientActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  editPatientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  editPatientText: {
    color: '#2196F3',
    marginLeft: 8,
    fontWeight: '500',
  },
  medicationsSection: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 4,
  },
  medicationCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  medicationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  medicationInfo: {
    flex: 1,
  },
  medicationName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1565C0',
    marginBottom: 4,
  },
  medicationDosage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  medicationFrequency: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  timesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  timeText: {
    fontSize: 12,
    color: '#2196F3',
    marginLeft: 4,
    fontWeight: '500',
  },
  instructions: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  medicationActions: {
    marginLeft: 12,
  },
  statusToggle: {
    padding: 8,
  },
  statusToggleActive: {},
  medicationFooter: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 12,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 8,
  },
  editButtonText: {
    color: '#2196F3',
    marginLeft: 6,
    fontWeight: '500',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 8,
  },
  deleteButtonText: {
    color: '#f44336',
    marginLeft: 6,
    fontWeight: '500',
  },
  // Estilos del Modal de Edición
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 24,
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
  modalForm: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#90CAF9',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  // Estilos para toggle de notificaciones
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 8,
  },
  notificationRowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationRowText: {
    fontSize: 14,
    color: '#666',
  },
  notificationRowTextOff: {
    color: '#999',
  },
  notificationToggleBtn: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E0E0E0',
    padding: 2,
    justifyContent: 'center',
  },
  notificationToggleBtnOn: {
    backgroundColor: '#4CAF50',
  },
  notificationToggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  notificationToggleKnobOn: {
    alignSelf: 'flex-end',
  },
});
