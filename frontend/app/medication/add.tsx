import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import api from '../../utils/api';
import { scheduleMedicationNotification } from '../../utils/notifications';

export default function AddMedication() {
  const { patientId } = useLocalSearchParams();
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(['']);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [refillAlertDays, setRefillAlertDays] = useState('7');
  const [loading, setLoading] = useState(false);

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

    setLoading(true);
    try {
      const response = await api.post('/medications', {
        patient_id: patientId,
        name,
        dosage,
        frequency,
        schedule_times: validTimes,
        start_date: startDate,
        end_date: endDate || null,
        instructions: instructions || null,
        refill_alert_days: parseInt(refillAlertDays) || 7,
        active: true,
      });

      // Schedule notifications
      for (const time of validTimes) {
        await scheduleMedicationNotification(name, time, response.data.id);
      }

      Alert.alert('Éxito', 'Medicamento agregado correctamente');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'No se pudo agregar el medicamento');
    } finally {
      setLoading(false);
    }
  };

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
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  placeholder="HH:MM (ej: 08:00)"
                  value={time}
                  onChangeText={(value) => updateTimeSlot(index, value)}
                />
                {scheduleTimes.length > 1 && (
                  <TouchableOpacity onPress={() => removeTimeSlot(index)}>
                    <Ionicons name="close-circle" size={28} color="#f44336" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fecha de Inicio *</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DD"
              value={startDate}
              onChangeText={setStartDate}
            />
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
            <Text style={styles.label}>Días antes de alerta de reabastecimiento</Text>
            <TextInput
              style={styles.input}
              placeholder="7"
              value={refillAlertDays}
              onChangeText={setRefillAlertDays}
              keyboardType="number-pad"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Ionicons name="checkmark-circle" size={24} color="white" />
            <Text style={styles.saveButtonText}>
              {loading ? 'Guardando...' : 'Guardar Medicamento'}
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
