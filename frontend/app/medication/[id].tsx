import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../../utils/api';

export default function EditMedication() {
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(['']);
  const [endDate, setEndDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [active, setActive] = useState(true);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);

  useEffect(() => {
    loadMedication();
  }, [id]);

  const loadMedication = async () => {
    try {
      // Get all medications and find the one we need
      const patientsResponse = await api.get('/patients');
      for (const patient of patientsResponse.data) {
        const medsResponse = await api.get(`/medications/patient/${patient.id}`);
        const medication = medsResponse.data.find((m: any) => m.id === id);
        if (medication) {
          setName(medication.name);
          setDosage(medication.dosage);
          setFrequency(medication.frequency);
          setScheduleTimes(medication.schedule_times);
          setEndDate(medication.end_date || '');
          setInstructions(medication.instructions || '');
          setActive(medication.active);
          break;
        }
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo cargar el medicamento');
    } finally {
      setLoading(false);
    }
  };

  const addTimeSlot = () => {
    setScheduleTimes([...scheduleTimes, '']);
  };

  const removeTimeSlot = (index: number) => {
    const newTimes = scheduleTimes.filter((_, i) => i !== index);
    setScheduleTimes(newTimes);
  };

  const updateTimeSlot = (index: number, value: string) => {
    const newTimes = [...scheduleTimes];
    newTimes[index] = value;
    setScheduleTimes(newTimes);
  };

  const openTimePicker = (index: number) => {
    setEditingTimeIndex(index);
    setShowTimePicker(true);
  };

  const onTimePickerChange = (_event: any, selectedDate?: Date) => {
    setShowTimePicker(false);
    if (selectedDate !== undefined && editingTimeIndex !== null) {
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      updateTimeSlot(editingTimeIndex, `${hours}:${minutes}`);
    }
    setEditingTimeIndex(null);
  };

  const getTimeAsDate = (timeStr: string): Date => {
    const now = new Date();
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      now.setHours(parseInt(parts[0], 10));
      now.setMinutes(parseInt(parts[1], 10));
      now.setSeconds(0);
    }
    return now;
  };

  const handleSave = async () => {
    if (!name || !dosage || !frequency) {
      Alert.alert('Error', 'Por favor completa todos los campos obligatorios');
      return;
    }

    const validTimes = scheduleTimes.filter(t => t.trim() !== '');
    if (validTimes.length === 0) {
      Alert.alert('Error', 'Agrega al menos un horario');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/medications/${id}`, {
        name,
        dosage,
        frequency,
        schedule_times: validTimes,
        end_date: endDate || null,
        instructions: instructions || null,
        active,
      });

      Alert.alert('Éxito', 'Medicamento actualizado correctamente');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el medicamento');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView style={styles.content}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre del Medicamento *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Paracetamol"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dosis *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 500mg"
              value={dosage}
              onChangeText={setDosage}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Frecuencia *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Cada 8 horas"
              value={frequency}
              onChangeText={setFrequency}
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Horarios *</Text>
              <TouchableOpacity onPress={addTimeSlot} style={styles.addTimeButton}>
                <Ionicons name="add-circle" size={24} color="#2196F3" />
                <Text style={styles.addTimeText}>Agregar Horario</Text>
              </TouchableOpacity>
            </View>
            {scheduleTimes.map((time, index) => (
              <View key={index} style={styles.timeRow}>
                <TouchableOpacity
                  style={[styles.input, styles.timeInput, styles.timeButton]}
                  onPress={() => openTimePicker(index)}
                >
                  <Ionicons name="time-outline" size={20} color="#2196F3" />
                  <Text style={styles.timeButtonText}>
                    {time || 'Seleccionar hora'}
                  </Text>
                </TouchableOpacity>
                {scheduleTimes.length > 1 && (
                  <TouchableOpacity onPress={() => removeTimeSlot(index)}>
                    <Ionicons name="close-circle" size={28} color="#f44336" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {showTimePicker && editingTimeIndex !== null && (
              <DateTimePicker
                value={scheduleTimes[editingTimeIndex] ? getTimeAsDate(scheduleTimes[editingTimeIndex]) : new Date()}
                mode="time"
                display="default"
                is24Hour={true}
                onChange={onTimePickerChange}
              />
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fecha de Fin (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DD"
              value={endDate}
              onChangeText={setEndDate}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Instrucciones (opcional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ej: Tomar con alimentos"
              value={instructions}
              onChangeText={setInstructions}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Medicamento Activo</Text>
              <TouchableOpacity
                onPress={() => setActive(!active)}
                style={[styles.switch, active && styles.switchActive]}
              >
                <View style={[styles.switchThumb, active && styles.switchThumbActive]} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Ionicons name="checkmark-circle" size={24} color="white" />
            <Text style={styles.saveButtonText}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  addTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addTimeText: {
    color: '#2196F3',
    marginLeft: 6,
    fontWeight: '500',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeInput: {
    flex: 1,
    marginRight: 8,
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeButtonText: {
    fontSize: 16,
    color: '#212121',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ccc',
    padding: 2,
    justifyContent: 'center',
  },
  switchActive: {
    backgroundColor: '#4CAF50',
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'white',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  saveButtonDisabled: {
    backgroundColor: '#BBDEFB',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});
