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
import { useTranslation } from 'react-i18next';

// Labels must remain in Spanish — stored as-is in MongoDB and matched on load
const FREQUENCY_OPTIONS = [
  { label: 'Cada 4 horas', value: 'every_4h', hours: 4 },
  { label: 'Cada 6 horas', value: 'every_6h', hours: 6 },
  { label: 'Cada 8 horas', value: 'every_8h', hours: 8 },
  { label: 'Cada 12 horas', value: 'every_12h', hours: 12 },
  { label: 'Una vez al día', value: 'once_daily', hours: 24 },
  { label: 'Personalizado', value: 'custom', hours: 0 },
];

// Day names must remain in Spanish — used to reconstruct frequency strings stored in MongoDB
const DAY_NAMES: Record<string, string> = {
  Lu: 'Lunes', Ma: 'Martes', Mi: 'Miércoles',
  Ju: 'Jueves', Vi: 'Viernes', Sa: 'Sábado', Do: 'Domingo',
};

export default function EditMedication() {
  const { id } = useLocalSearchParams();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [selectedFreq, setSelectedFreq] = useState('');
  const [customType, setCustomType] = useState<'hours' | 'days' | null>(null);
  const [customHours, setCustomHours] = useState(3);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
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
      const patientsResponse = await api.get('/patients');
      for (const patient of patientsResponse.data) {
        const medsResponse = await api.get(`/medications/patient/${patient.id}`);
        const medication = medsResponse.data.find((m: any) => m.id === id);
        if (medication) {
          setName(medication.name);
          setDosage(medication.dosage);
          const matchedOpt = FREQUENCY_OPTIONS.find(o => o.label === medication.frequency);
          if (matchedOpt) {
            setSelectedFreq(matchedOpt.value);
          } else {
            setSelectedFreq('custom');
            const hoursMatch = medication.frequency.match(/^Cada (\d+) horas?$/);
            if (hoursMatch) {
              setCustomType('hours');
              setCustomHours(parseInt(hoursMatch[1], 10));
            } else {
              const dayParts = medication.frequency.split(', ');
              const days = dayParts.map((p: string) =>
                Object.keys(DAY_NAMES).find(k => DAY_NAMES[k] === p) || ''
              ).filter(Boolean);
              if (days.length > 0) {
                setCustomType('days');
                setSelectedDays(days);
              }
            }
          }
          setScheduleTimes(medication.schedule_times);
          setEndDate(medication.end_date || '');
          setInstructions(medication.instructions || '');
          setActive(medication.active);
          break;
        }
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('medications.errorLoad'));
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

  // Returns Spanish string — stored as-is in MongoDB and matched by loadMedication()
  const getFrequencyLabel = (): string => {
    if (selectedFreq === 'custom') {
      if (customType === 'hours') return `Cada ${customHours} horas`;
      if (customType === 'days') return selectedDays.map(d => DAY_NAMES[d]).join(', ') || 'Personalizado';
      return 'Personalizado';
    }
    return FREQUENCY_OPTIONS.find(f => f.value === selectedFreq)?.label || '';
  };

  const expandScheduleTimes = (baseTime: string): string[] => {
    let intervalHours: number;
    if (selectedFreq === 'custom' && customType === 'hours') {
      intervalHours = customHours;
    } else {
      const freqOpt = FREQUENCY_OPTIONS.find(f => f.value === selectedFreq);
      if (!freqOpt || freqOpt.hours === 0 || freqOpt.hours >= 24) return scheduleTimes;
      intervalHours = freqOpt.hours;
    }
    const parts = baseTime.split(':');
    const baseMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    const intervalMinutes = intervalHours * 60;
    const times: string[] = [];
    let current = baseMinutes;
    while (current < 1440) {
      times.push(`${Math.floor(current / 60).toString().padStart(2, '0')}:${(current % 60).toString().padStart(2, '0')}`);
      current += intervalMinutes;
    }
    return times;
  };

  const handleSave = async () => {
    if (!name || !dosage || !selectedFreq) {
      Alert.alert(t('common.error'), t('medications.fillRequired'));
      return;
    }

    const validTimes = scheduleTimes.filter(t => t.trim() !== '');
    if (validTimes.length === 0) {
      Alert.alert(t('common.error'), t('medications.addAtLeastOneSchedule'));
      return;
    }

    const freqOpt = FREQUENCY_OPTIONS.find(f => f.value === selectedFreq);
    const shouldExpand =
      (freqOpt && freqOpt.hours > 0 && freqOpt.hours < 24) ||
      (selectedFreq === 'custom' && customType === 'hours');
    const finalTimes = shouldExpand && validTimes.length > 0
      ? expandScheduleTimes(validTimes[0])
      : validTimes;

    setSaving(true);
    try {
      await api.put(`/medications/${id}`, {
        name,
        dosage,
        frequency: getFrequencyLabel(),
        schedule_times: finalTimes,
        end_date: endDate || null,
        instructions: instructions || null,
        active,
      });

      Alert.alert(t('common.success'), t('medications.medicationUpdated'));
      router.back();
    } catch (error) {
      Alert.alert(t('common.error'), t('medications.errorUpdate'));
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
            <Text style={styles.label}>{t('medications.name')} *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Paracetamol"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('medications.dosage')} *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 500mg"
              value={dosage}
              onChangeText={setDosage}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('medications.frequency')} *</Text>
            <View style={styles.freqOptions}>
              {FREQUENCY_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.freqOption, selectedFreq === opt.value && styles.freqOptionSelected]}
                  onPress={() => setSelectedFreq(opt.value)}
                >
                  <View style={[styles.freqRadio, selectedFreq === opt.value && styles.freqRadioSelected]}>
                    {selectedFreq === opt.value && <View style={styles.freqRadioInner} />}
                  </View>
                  <Text style={[styles.freqOptionText, selectedFreq === opt.value && styles.freqOptionTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedFreq === 'custom' && (
              <View style={styles.customContainer}>
                <View style={styles.customTypeRow}>
                  <TouchableOpacity
                    style={[styles.customTypeButton, customType === 'hours' && styles.customTypeButtonSelected]}
                    onPress={() => setCustomType('hours')}
                  >
                    <Ionicons name="time-outline" size={16} color={customType === 'hours' ? '#2196F3' : '#666'} />
                    <Text style={[styles.customTypeText, customType === 'hours' && styles.customTypeTextSelected]}>
                      {t('medications.everyXHours')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.customTypeButton, customType === 'days' && styles.customTypeButtonSelected]}
                    onPress={() => setCustomType('days')}
                  >
                    <Ionicons name="calendar-outline" size={16} color={customType === 'days' ? '#2196F3' : '#666'} />
                    <Text style={[styles.customTypeText, customType === 'days' && styles.customTypeTextSelected]}>
                      {t('medications.daysOfWeek')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {customType === 'hours' && (
                  <View style={styles.hoursRow}>
                    <TouchableOpacity style={styles.hourBtn} onPress={() => setCustomHours(h => Math.max(1, h - 1))}>
                      <Text style={styles.hourBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.hoursVal}>{customHours}</Text>
                    <TouchableOpacity style={styles.hourBtn} onPress={() => setCustomHours(h => Math.min(23, h + 1))}>
                      <Text style={styles.hourBtnText}>+</Text>
                    </TouchableOpacity>
                    <Text style={styles.hoursUnit}>{t('medications.hoursUnit')}</Text>
                  </View>
                )}

                {customType === 'days' && (
                  <View style={styles.daysRow}>
                    {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map(day => (
                      <TouchableOpacity
                        key={day}
                        style={[styles.dayBtn, selectedDays.includes(day) && styles.dayBtnSelected]}
                        onPress={() => setSelectedDays(prev =>
                          prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                        )}
                      >
                        <Text style={[styles.dayBtnText, selectedDays.includes(day) && styles.dayBtnTextSelected]}>
                          {day}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{t('medications.schedule')} *</Text>
              <TouchableOpacity onPress={addTimeSlot} style={styles.addTimeButton}>
                <Ionicons name="add-circle" size={24} color="#2196F3" />
                <Text style={styles.addTimeText}>{t('medications.addSchedule2')}</Text>
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
                    {time || t('medications.selectTime')}
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
            <Text style={styles.label}>{t('medications.endDateOptional')}</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DD"
              value={endDate}
              onChangeText={setEndDate}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('medications.instructionsOptional')}</Text>
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
              <Text style={styles.label}>{t('medications.medicationActive')}</Text>
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
              {saving ? t('patients.saving') : t('medications.saveChanges')}
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
  freqOptions: {
    gap: 8,
  },
  freqOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  freqOptionSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  freqRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  freqRadioSelected: {
    borderColor: '#2196F3',
  },
  freqRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2196F3',
  },
  freqOptionText: {
    fontSize: 15,
    color: '#212121',
  },
  freqOptionTextSelected: {
    fontWeight: '500',
    color: '#2196F3',
  },
  customContainer: {
    marginTop: 10,
    gap: 10,
  },
  customTypeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  customTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: 'white',
    gap: 6,
  },
  customTypeButtonSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  customTypeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  customTypeTextSelected: {
    color: '#2196F3',
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 4,
  },
  hourBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourBtnText: {
    color: 'white',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 26,
  },
  hoursVal: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#212121',
    minWidth: 44,
    textAlign: 'center',
  },
  hoursUnit: {
    fontSize: 15,
    color: '#666',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  dayBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  dayBtnTextSelected: {
    color: 'white',
  },
});
