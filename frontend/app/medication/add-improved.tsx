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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import api from '../../utils/api';

const FREQUENCIES = [
  { label: 'Cada 4 horas', value: 'cada_4h', hours: 4, timesPerDay: 6 },
  { label: 'Cada 6 horas', value: 'cada_6h', hours: 6, timesPerDay: 4 },
  { label: 'Cada 8 horas', value: 'cada_8h', hours: 8, timesPerDay: 3 },
  { label: 'Cada 12 horas', value: 'cada_12h', hours: 12, timesPerDay: 2 },
  { label: '1 vez al día', value: '1_vez', hours: 24, timesPerDay: 1 },
  { label: '2 veces al día', value: '2_veces', hours: 12, timesPerDay: 2 },
  { label: '3 veces al día', value: '3_veces', hours: 8, timesPerDay: 3 },
  { label: 'Personalizado', value: 'custom', hours: 0, timesPerDay: 0 },
];

export default function AddMedicationImproved() {
  const { patientId } = useLocalSearchParams();
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [selectedFrequency, setSelectedFrequency] = useState('');
  const [frequencySelectorVisible, setFrequencySelectorVisible] = useState(false);
  const [startTime, setStartTime] = useState('08:00');
  const [scheduleTimes, setScheduleTimes] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [refillAlertDays, setRefillAlertDays] = useState('7');
  const [loading, setLoading] = useState(false);
  const [showAutoGenerate, setShowAutoGenerate] = useState(false);

  const getFrequencyLabel = () => {
    const freq = FREQUENCIES.find(f => f.value === selectedFrequency);
    return freq ? freq.label : 'Seleccionar frecuencia';
  };

  const generateScheduleTimes = () => {
    const freq = FREQUENCIES.find(f => f.value === selectedFrequency);
    if (!freq || freq.value === 'custom' || !startTime) return;

    const times: string[] = [];
    const [hours, minutes] = startTime.split(':').map(Number);
    
    for (let i = 0; i < freq.timesPerDay; i++) {
      const totalHours = hours + (freq.hours * i);
      const finalHours = totalHours % 24;
      const formattedTime = `${String(finalHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      times.push(formattedTime);
    }

    setScheduleTimes(times);
    setShowAutoGenerate(false);
    Alert.alert(
      'Horarios Generados',
      `Se generaron ${times.length} horarios automáticamente. Puedes editarlos si lo deseas.`,
      [{ text: 'Entendido' }]
    );
  };

  const handleFrequencySelect = (freq: typeof FREQUENCIES[0]) => {
    setSelectedFrequency(freq.value);
    setFrequencySelectorVisible(false);

    if (freq.value !== 'custom') {
      setShowAutoGenerate(true);
    } else {
      setScheduleTimes(['']);
      setShowAutoGenerate(false);
    }
  };

  const addTimeSlot = () => {
    if (scheduleTimes.length >= 24) {
      Alert.alert('Límite Alcanzado', 'No puedes agregar más de 24 tomas por día');
      return;
    }
    setScheduleTimes([...scheduleTimes, '']);
  };

  const removeTimeSlot = (index: number) => {
    const newTimes = scheduleTimes.filter((_, i) => i !== index);
    setScheduleTimes(newTimes.length === 0 ? [''] : newTimes);
  };

  const updateTimeSlot = (index: number, value: string) => {
    const newTimes = [...scheduleTimes];
    newTimes[index] = value;
    setScheduleTimes(newTimes);
  };

  const validateTimes = () => {
    const validTimes = scheduleTimes.filter(t => t.trim() !== '');
    
    if (validTimes.length === 0) {
      Alert.alert('Error', 'Agrega al menos un horario');
      return false;
    }

    // Verificar formato HH:MM
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    for (const time of validTimes) {
      if (!timeRegex.test(time)) {
        Alert.alert('Error', `El horario "${time}" no tiene el formato correcto. Usa HH:MM (ej: 08:00)`);
        return false;
      }
    }

    // Verificar duplicados
    const uniqueTimes = new Set(validTimes);
    if (uniqueTimes.size !== validTimes.length) {
      Alert.alert('Error', 'No puedes tener horarios duplicados');
      return false;
    }

    // Validar que coincida con frecuencia si no es personalizado
    const freq = FREQUENCIES.find(f => f.value === selectedFrequency);
    if (freq && freq.value !== 'custom' && validTimes.length !== freq.timesPerDay) {
      Alert.alert(
        'Advertencia',
        `La frecuencia seleccionada (${freq.label}) indica ${freq.timesPerDay} tomas, pero has ingresado ${validTimes.length} horarios.\n\n¿Deseas continuar de todos modos?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', onPress: () => proceedToSave(validTimes) }
        ]
      );
      return false;
    }

    return validTimes;
  };

  const proceedToSave = async (validTimes: string[]) => {
    setLoading(true);
    try {
      // Normalizar horarios a formato HH:MM
      const normalizedTimes = validTimes.map(time => {
        const [h, m] = time.split(':');
        return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
      });

      const response = await api.post('/medications', {
        patient_id: patientId,
        name,
        dosage: dosage ? `${dosage}mg` : '',
        frequency: getFrequencyLabel(),
        schedule_times: normalizedTimes,
        start_date: startDate,
        end_date: endDate || null,
        instructions: instructions || null,
        refill_alert_days: parseInt(refillAlertDays) || 7,
        active: true,
      });

      Alert.alert('Éxito', 'Medicamento agregado correctamente');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'No se pudo agregar el medicamento');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name) {
      Alert.alert('Error', 'El nombre del medicamento es requerido');
      return;
    }

    if (!selectedFrequency) {
      Alert.alert('Error', 'Selecciona una frecuencia');
      return;
    }

    const validTimes = validateTimes();
    if (validTimes) {
      proceedToSave(validTimes);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView style={styles.content}>
          {/* CAMPOS OBLIGATORIOS PRIMERO */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre del Medicamento *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Paracetamol, Jarabe para la tos"
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.helperText}>
              💊 Funciona para pastillas, jarabes, inyecciones y más
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Frecuencia *</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setFrequencySelectorVisible(true)}
            >
              <Text style={selectedFrequency ? styles.selectorTextSelected : styles.selectorTextPlaceholder}>
                {getFrequencyLabel()}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {showAutoGenerate && (
            <View style={styles.autoGenerateCard}>
              <Ionicons name="bulb" size={24} color="#FF9800" />
              <View style={styles.autoGenerateText}>
                <Text style={styles.autoGenerateTitle}>¿Generar horarios automáticamente?</Text>
                <Text style={styles.autoGenerateDesc}>
                  Ingresa la hora de inicio y generaremos los horarios según la frecuencia seleccionada
                </Text>
              </View>
            </View>
          )}

          {(selectedFrequency && selectedFrequency !== 'custom') && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Hora de Inicio *</Text>
              <View style={styles.timeInputContainer}>
                <TextInput
                  style={[styles.input, styles.timeInputField]}
                  placeholder="HH:MM (ej: 08:00)"
                  value={startTime}
                  onChangeText={setStartTime}
                  keyboardType="numbers-and-punctuation"
                />
                {showAutoGenerate && (
                  <TouchableOpacity
                    style={styles.generateButton}
                    onPress={generateScheduleTimes}
                  >
                    <Ionicons name="flash" size={20} color="white" />
                    <Text style={styles.generateButtonText}>Generar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <View>
                <Text style={styles.label}>Horarios *</Text>
                <Text style={styles.helperText}>
                  ℹ️ Estos son los horarios exactos en los que se tomará el medicamento
                </Text>
              </View>
              {(selectedFrequency === 'custom' || scheduleTimes.length > 0) && (
                <TouchableOpacity onPress={addTimeSlot} style={styles.addTimeButton}>
                  <Ionicons name="add-circle" size={24} color="#2196F3" />
                </TouchableOpacity>
              )}
            </View>
            {scheduleTimes.map((time, index) => (
              <View key={index} style={styles.timeRow}>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  placeholder="HH:MM (ej: 08:00)"
                  value={time}
                  onChangeText={(value) => updateTimeSlot(index, value)}
                  keyboardType="numbers-and-punctuation"
                />
                {scheduleTimes.length > 1 && (
                  <TouchableOpacity onPress={() => removeTimeSlot(index)}>
                    <Ionicons name="close-circle" size={28} color="#f44336" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* CAMPOS OPCIONALES */}
          <View style={styles.optionalSection}>
            <Text style={styles.optionalTitle}>Información Adicional (Opcional)</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dosis (opcional)</Text>
            <View style={styles.dosisContainer}>
              <TextInput
                style={[styles.input, styles.dosisInput]}
                placeholder="500 o 10ml"
                value={dosage}
                onChangeText={setDosage}
              />
              <Text style={styles.dosisSuffix}>mg / ml</Text>
            </View>
            <Text style={styles.helperText}>
              💡 Ingresa la cantidad (ej: 500, 10ml, 1 cucharada)
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fecha de Inicio</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DD"
              value={startDate}
              onChangeText={setStartDate}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.helperText}>Por defecto: hoy</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fecha de Fin</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DD (dejar vacío si es indefinido)"
              value={endDate}
              onChangeText={setEndDate}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Instrucciones</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ej: Tomar con alimentos, agitar antes de usar"
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

      {/* Frequency Selector Modal */}
      <Modal
        visible={frequencySelectorVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFrequencySelectorVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Frecuencia</Text>
              <TouchableOpacity onPress={() => setFrequencySelectorVisible(false)}>
                <Ionicons name="close" size={28} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {FREQUENCIES.map((freq) => (
                <TouchableOpacity
                  key={freq.value}
                  style={styles.frequencyOption}
                  onPress={() => handleFrequencySelect(freq)}
                >
                  <Text style={styles.frequencyLabel}>{freq.label}</Text>
                  {freq.timesPerDay > 0 && (
                    <Text style={styles.frequencyDesc}>{freq.timesPerDay} tomas por día</Text>
                  )}
                  {selectedFrequency === freq.value && (
                    <Ionicons name="checkmark-circle" size={24} color="#2196F3" />
                  )}
                </TouchableOpacity>
              ))}
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
    alignItems: 'flex-start',
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
  helperText: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
    lineHeight: 18,
  },
  dosisContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dosisInput: {
    flex: 1,
    marginRight: 12,
  },
  dosisSuffix: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2196F3',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectorTextPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  selectorTextSelected: {
    fontSize: 16,
    color: '#212121',
    fontWeight: '500',
  },
  autoGenerateCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  autoGenerateText: {
    flex: 1,
    marginLeft: 12,
  },
  autoGenerateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 4,
  },
  autoGenerateDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeInputField: {
    flex: 1,
    marginRight: 8,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  generateButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 6,
  },
  addTimeButton: {
    marginLeft: 8,
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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
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
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
  },
  modalBody: {
    padding: 20,
  },
  frequencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 12,
  },
  frequencyLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
    flex: 1,
  },
  frequencyDesc: {
    fontSize: 13,
    color: '#666',
    marginRight: 12,
  },
  optionalSection: {
    marginTop: 24,
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#e0e0e0',
  },
  optionalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
