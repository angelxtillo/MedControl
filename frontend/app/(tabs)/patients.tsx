import React, { useState, useCallback } from 'react';
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
import api from '../../utils/api';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';

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
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadPatients();
    }, [])
  );

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
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
      if (editingPatient) {
        await api.put(`/patients/${editingPatient.id}`, {
          name,
          age: age ? parseInt(age, 10) : null,
          notes,
          photo,
        });
        Alert.alert(t('common.success'), t('patients.patientUpdated'));
      } else {
        await api.post('/patients', {
          name,
          age: age ? parseInt(age, 10) : null,
          notes,
          photo,
        });
        Alert.alert(t('common.success'), t('patients.patientAdded'));
      }
      setModalVisible(false);
      resetForm();
      loadPatients();
    } catch (error) {
      Alert.alert(t('common.error'), editingPatient ? t('patients.errorUpdate') : t('patients.errorCreate'));
    } finally {
      setLoading(false);
    }
  };

  const handleEditPatient = (patient: Patient) => {
    setEditingPatient(patient);
    setName(patient.name);
    setAge(patient.age?.toString() || '');
    setNotes(patient.notes || '');
    setPhoto(patient.photo || null);
    setModalVisible(true);
  };

  const resetForm = () => {
    setName('');
    setAge('');
    setNotes('');
    setPhoto(null);
    setEditingPatient(null);
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
          </View>
        ) : (
          patients.map((patient) => (
            <View key={patient.id} style={styles.patientItem}>
              <PatientCard
                {...patient}
                onPress={() => router.push(`/patient/${patient.id}`)}
              />
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => handleEditPatient(patient)}
              >
                <Ionicons name="pencil" size={20} color="#2196F3" />
              </TouchableOpacity>
            </View>
          ))
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
              <Text style={styles.modalTitle}>
                {editingPatient ? t('patients.editPatient') : t('patients.addPatient')}
              </Text>
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
  patientItem: {
    position: 'relative',
  },
  editButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#E3F2FD',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
