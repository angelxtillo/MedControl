import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../../utils/api';
import { useTranslation } from 'react-i18next';

const TOTAL_STEPS = 5;

// Labels must remain in Spanish — stored as-is in MongoDB and matched on load
const FREQUENCY_OPTIONS = [
  { label: 'Cada 4 horas', value: 'every_4h', hours: 4 },
  { label: 'Cada 6 horas', value: 'every_6h', hours: 6 },
  { label: 'Cada 8 horas', value: 'every_8h', hours: 8 },
  { label: 'Cada 12 horas', value: 'every_12h', hours: 12 },
  { label: 'Una vez al día', value: 'once_daily', hours: 24 },
  { label: 'Personalizado', value: 'custom', hours: 0 },
];

// Labels stay as i18n keys — values are stored in MongoDB as-is
const PRESENTATION_OPTIONS = [
  { labelKey: 'medications.presTablets', value: 'tabletas', icon: 'ellipse' },
  { labelKey: 'medications.presSyrup', value: 'jarabe', icon: 'water' },
  { labelKey: 'medications.presDrops', value: 'gotas', icon: 'water-outline' },
  { labelKey: 'medications.presInjection', value: 'inyeccion', icon: 'medical' },
  { labelKey: 'medications.presCream', value: 'crema', icon: 'color-fill' },
  { labelKey: 'medications.presOther', value: 'otro', icon: 'medical-outline' },
];

// Day abbreviations by language — only for display; Spanish keys are stored in MongoDB
const getDayNames = (lang: string): string[] => {
  const days: Record<string, string[]> = {
    es: ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'],
    en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    pt: ['Se', 'Te', 'Qu', 'Qu', 'Se', 'Sá', 'Do'],
    fr: ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'],
  };
  return days[lang] || days['es'];
};

const SPANISH_DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

export default function AddMedicationWizard() {
  const { patientId } = useLocalSearchParams();
  const { t, i18n } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [medicationName, setMedicationName] = useState('');
  const [presentation, setPresentation] = useState('');

  const [frequency, setFrequency] = useState('');
  const [customType, setCustomType] = useState<'hours' | 'days' | null>(null);
  const [customHours, setCustomHours] = useState(3);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  const [scheduleTimes, setScheduleTimes] = useState<string[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempTime, setTempTime] = useState(new Date());

  const [dosage, setDosage] = useState('');

  const [startDate, setStartDate] = useState(new Date());
  const [endDateOption, setEndDateOption] = useState<'indefinite' | 'specific'>('indefinite');
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return medicationName.trim().length > 0;
      case 2:
        if (frequency === '') return false;
        if (frequency !== 'custom') return true;
        if (customType === 'hours') return true;
        if (customType === 'days') return selectedDays.length > 0;
        return false;
      case 3:
        return scheduleTimes.length > 0;
      case 4:
        return dosage.trim().length > 0;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSave();
    }
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      router.back();
    }
  };

  const addTime = (event: any, selectedDate?: Date) => {
    setShowTimePicker(false);
    if (selectedDate) {
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      if (!scheduleTimes.includes(timeString)) {
        setScheduleTimes([...scheduleTimes, timeString].sort());
      }
    }
  };

  const removeTime = (time: string) => {
    setScheduleTimes(scheduleTimes.filter(t => t !== time));
  };

  // Returns Spanish string — stored as-is in MongoDB and matched on load
  const getFrequencyLabel = () => {
    if (frequency === 'custom') {
      if (customType === 'hours') return `Cada ${customHours} horas`;
      if (customType === 'days') {
        const dayNames: Record<string, string> = {
          Lu: 'Lunes', Ma: 'Martes', Mi: 'Miércoles',
          Ju: 'Jueves', Vi: 'Viernes', Sa: 'Sábado', Do: 'Domingo',
        };
        return selectedDays.map(d => dayNames[d]).join(', ') || 'Personalizado';
      }
      return 'Personalizado';
    }
    const option = FREQUENCY_OPTIONS.find(f => f.value === frequency);
    return option?.label || '';
  };

  const expandScheduleTimes = (baseTime: string, frequencyValue: string): string[] => {
    let intervalHours: number;
    if (frequencyValue === 'custom' && customType === 'hours') {
      intervalHours = customHours;
    } else {
      const freqOption = FREQUENCY_OPTIONS.find(f => f.value === frequencyValue);
      if (!freqOption || freqOption.hours === 0 || freqOption.hours >= 24) return scheduleTimes;
      intervalHours = freqOption.hours;
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
    setSaving(true);
    try {
      const freqOption = FREQUENCY_OPTIONS.find(f => f.value === frequency);
      const shouldExpand =
        (freqOption && freqOption.hours > 0 && freqOption.hours < 24) ||
        (frequency === 'custom' && customType === 'hours');
      const finalTimes =
        shouldExpand && scheduleTimes.length > 0
          ? expandScheduleTimes(scheduleTimes[0], frequency)
          : scheduleTimes;

      const medicationData = {
        patient_id: patientId,
        name: medicationName.trim(),
        dosage: dosage.trim() || t('medications.noSpecified'),
        frequency: getFrequencyLabel(),
        schedule_times: finalTimes,
        start_date: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`,
        end_date: endDateOption === 'specific' && endDate
          ? `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
          : null,
        instructions: presentation ? `Presentación: ${presentation}` : null,
        notifications_enabled: notificationsEnabled,
        active: true,
      };

      await api.post('/medications', medicationData);
      Alert.alert(t('common.success'), t('medications.successAdded'), [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Alert.alert(t('common.error'), t('medications.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(currentStep / TOTAL_STEPS) * 100}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {t('onboarding.step', { current: currentStep, total: TOTAL_STEPS })}
      </Text>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Ionicons name="medical" size={40} color="#2196F3" />
        <Text style={styles.stepTitle}>{t('medications.whatMedication')}</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('medications.name')} *</Text>
        <TextInput
          style={styles.input}
          value={medicationName}
          onChangeText={setMedicationName}
          placeholder="Ej: Paracetamol, Ibuprofeno..."
          placeholderTextColor="#999"
          autoFocus
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('medications.presentation')} ({t('common.optional')})</Text>
        <View style={styles.optionsGrid}>
          {PRESENTATION_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionChip,
                presentation === option.value && styles.optionChipSelected
              ]}
              onPress={() => setPresentation(option.value === presentation ? '' : option.value)}
            >
              <Ionicons
                name={option.icon as any}
                size={18}
                color={presentation === option.value ? 'white' : '#666'}
              />
              <Text style={[
                styles.optionChipText,
                presentation === option.value && styles.optionChipTextSelected
              ]}>
                {t(option.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Ionicons name="repeat" size={40} color="#FF9800" />
        <Text style={styles.stepTitle}>{t('medications.howOften')}</Text>
      </View>

      <View style={styles.frequencyOptions}>
        {FREQUENCY_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.frequencyOption,
              frequency === option.value && styles.frequencyOptionSelected
            ]}
            onPress={() => setFrequency(option.value)}
          >
            <View style={[
              styles.radioCircle,
              frequency === option.value && styles.radioCircleSelected
            ]}>
              {frequency === option.value && <View style={styles.radioInner} />}
            </View>
            <Text style={[
              styles.frequencyOptionText,
              frequency === option.value && styles.frequencyOptionTextSelected
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {frequency === 'custom' && (
        <View style={styles.customContainer}>
          <View style={styles.customTypeRow}>
            <TouchableOpacity
              style={[styles.customTypeButton, customType === 'hours' && styles.customTypeButtonSelected]}
              onPress={() => setCustomType('hours')}
            >
              <Ionicons name="time-outline" size={18} color={customType === 'hours' ? '#2196F3' : '#666'} />
              <Text style={[styles.customTypeText, customType === 'hours' && styles.customTypeTextSelected]}>
                {t('medications.everyXHours')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.customTypeButton, customType === 'days' && styles.customTypeButtonSelected]}
              onPress={() => setCustomType('days')}
            >
              <Ionicons name="calendar-outline" size={18} color={customType === 'days' ? '#2196F3' : '#666'} />
              <Text style={[styles.customTypeText, customType === 'days' && styles.customTypeTextSelected]}>
                {t('medications.daysOfWeek')}
              </Text>
            </TouchableOpacity>
          </View>

          {customType === 'hours' && (
            <View style={styles.customSubSection}>
              <View style={styles.hoursSelector}>
                <TouchableOpacity
                  style={styles.hourButton}
                  onPress={() => setCustomHours(h => Math.max(1, h - 1))}
                >
                  <Text style={styles.hourButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.hoursValue}>{customHours}</Text>
                <TouchableOpacity
                  style={styles.hourButton}
                  onPress={() => setCustomHours(h => Math.min(23, h + 1))}
                >
                  <Text style={styles.hourButtonText}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.customInfoText}>
                {t('medications.willTakeEvery', { hours: customHours })}
              </Text>
            </View>
          )}

          {customType === 'days' && (
            <View style={styles.customSubSection}>
              <View style={styles.daysRow}>
                {SPANISH_DAYS.map((day, index) => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayButton, selectedDays.includes(day) && styles.dayButtonSelected]}
                    onPress={() => setSelectedDays(prev =>
                      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                    )}
                  >
                    <Text style={[styles.dayButtonText, selectedDays.includes(day) && styles.dayButtonTextSelected]}>
                      {getDayNames(i18n.language)[index]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {selectedDays.length > 0 && (
                <Text style={styles.customInfoText}>
                  {t('medications.willTakeOnDays')}
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );

  const renderStep3 = () => {
    const freqOption = FREQUENCY_OPTIONS.find(f => f.value === frequency);
    const isFixedInterval =
      (freqOption && freqOption.hours > 0 && freqOption.hours < 24) ||
      (frequency === 'custom' && customType === 'hours');
    const hintHours = frequency === 'custom' && customType === 'hours'
      ? customHours
      : (freqOption?.hours ?? 0);
    return (
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Ionicons name="time" size={40} color="#4CAF50" />
          <Text style={styles.stepTitle}>{t('medications.whatTime')}</Text>
        </View>

        {isFixedInterval && (
          <View style={styles.intervalHint}>
            <Ionicons name="information-circle-outline" size={18} color="#1976D2" />
            <Text style={styles.intervalHintText}>
              {t('medications.intervalHint', { hours: hintHours })}
            </Text>
          </View>
        )}

        <View style={styles.timesContainer}>
          {scheduleTimes.length > 0 ? (
            <View style={styles.timesList}>
              {scheduleTimes.map((time) => (
                <View key={time} style={styles.timeChip}>
                  <Ionicons name="alarm" size={18} color="#4CAF50" />
                  <Text style={styles.timeChipText}>{time}</Text>
                  <TouchableOpacity onPress={() => removeTime(time)}>
                    <Ionicons name="close-circle" size={22} color="#f44336" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyTimes}>
              <Ionicons name="alarm-outline" size={48} color="#ccc" />
              <Text style={styles.emptyTimesText}>{t('medications.noSchedules')}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.addTimeButton}
            onPress={() => {
              setTempTime(new Date());
              setShowTimePicker(true);
            }}
          >
            <Ionicons name="add-circle" size={24} color="white" />
            <Text style={styles.addTimeButtonText}>{t('medications.addSchedule')}</Text>
          </TouchableOpacity>
        </View>

        {showTimePicker && (
          <DateTimePicker
            value={tempTime}
            mode="time"
            is24Hour={true}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={addTime}
          />
        )}
      </View>
    );
  };

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Ionicons name="eyedrop" size={40} color="#9C27B0" />
        <Text style={styles.stepTitle}>{t('medications.howMuch')}</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('medications.dosage')}</Text>
        <TextInput
          style={styles.input}
          value={dosage}
          onChangeText={setDosage}
          placeholder="Ej: 1 tableta, 5 ml, 10 gotas..."
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.suggestionsContainer}>
        <Text style={styles.suggestionsTitle}>{t('medications.quickSuggestions')}</Text>
        <View style={styles.suggestionsGrid}>
          {([
            t('medications.dose1tablet'),
            t('medications.dose2tablets'),
            t('medications.dose5ml'),
            t('medications.dose10ml'),
            t('medications.dose10drops'),
            t('medications.dose15drops'),
          ]).map((suggestion) => (
            <TouchableOpacity
              key={suggestion}
              style={[
                styles.suggestionChip,
                dosage === suggestion && styles.suggestionChipSelected
              ]}
              onPress={() => setDosage(suggestion)}
            >
              <Text style={[
                styles.suggestionChipText,
                dosage === suggestion && styles.suggestionChipTextSelected
              ]}>
                {suggestion}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Ionicons name="calendar" size={40} color="#E91E63" />
        <Text style={styles.stepTitle}>{t('medications.howLong')}</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('medications.startDate')}</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowStartDatePicker(true)}
        >
          <Ionicons name="calendar-outline" size={20} color="#2196F3" />
          <Text style={styles.dateButtonText}>
            {startDate.toLocaleDateString(
              i18n.language === 'es' ? 'es-CO' :
              i18n.language === 'pt' ? 'pt-BR' :
              i18n.language === 'fr' ? 'fr-FR' : 'en-US',
              { weekday: 'long', day: 'numeric', month: 'long' }
            )}
          </Text>
        </TouchableOpacity>
      </View>

      {showStartDatePicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setShowStartDatePicker(false);
            if (date) setStartDate(date);
          }}
        />
      )}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('medications.endDate')}</Text>

        <TouchableOpacity
          style={[
            styles.endDateOption,
            endDateOption === 'indefinite' && styles.endDateOptionSelected
          ]}
          onPress={() => setEndDateOption('indefinite')}
        >
          <View style={[
            styles.radioCircle,
            endDateOption === 'indefinite' && styles.radioCircleSelected
          ]}>
            {endDateOption === 'indefinite' && <View style={styles.radioInner} />}
          </View>
          <Text style={styles.endDateOptionText}>{t('medications.indefinite')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.endDateOption,
            endDateOption === 'specific' && styles.endDateOptionSelected
          ]}
          onPress={() => setEndDateOption('specific')}
        >
          <View style={[
            styles.radioCircle,
            endDateOption === 'specific' && styles.radioCircleSelected
          ]}>
            {endDateOption === 'specific' && <View style={styles.radioInner} />}
          </View>
          <Text style={styles.endDateOptionText}>{t('medications.specificDate')}</Text>
        </TouchableOpacity>

        {endDateOption === 'specific' && (
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowEndDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#2196F3" />
            <Text style={styles.dateButtonText}>
              {endDate
                ? endDate.toLocaleDateString(
                    i18n.language === 'es' ? 'es-CO' :
                    i18n.language === 'pt' ? 'pt-BR' :
                    i18n.language === 'fr' ? 'fr-FR' : 'en-US',
                    { weekday: 'long', day: 'numeric', month: 'long' }
                  )
                : t('medications.selectDate')
              }
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {showEndDatePicker && (
        <DateTimePicker
          value={endDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={startDate}
          onChange={(event, date) => {
            setShowEndDatePicker(false);
            if (date) setEndDate(date);
          }}
        />
      )}

      <View style={styles.notificationToggle}>
        <View style={styles.notificationInfo}>
          <Ionicons name="notifications" size={24} color="#FF9800" />
          <View style={styles.notificationTextContainer}>
            <Text style={styles.notificationTitle}>{t('medications.notifications')}</Text>
            <Text style={styles.notificationSubtitle}>
              {t('medications.notificationsDesc')}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.toggleSwitch,
            notificationsEnabled && styles.toggleSwitchOn
          ]}
          onPress={() => setNotificationsEnabled(!notificationsEnabled)}
        >
          <View style={[
            styles.toggleKnob,
            notificationsEnabled && styles.toggleKnobOn
          ]} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      default: return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {renderProgressBar()}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderCurrentStep()}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <Ionicons name="arrow-back" size={20} color="#666" />
          <Text style={styles.backButtonText}>
            {currentStep === 1 ? t('common.cancel') : t('common.back')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.nextButton, !canGoNext() && styles.nextButtonDisabled]}
          onPress={goNext}
          disabled={!canGoNext() || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Text style={styles.nextButtonText}>
                {currentStep === TOTAL_STEPS ? t('common.save') : t('common.next')}
              </Text>
              {currentStep < TOTAL_STEPS && (
                <Ionicons name="arrow-forward" size={20} color="white" />
              )}
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  progressContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  stepContent: {
    flex: 1,
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#212121',
    marginTop: 16,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 10,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 6,
  },
  optionChipSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  optionChipText: {
    fontSize: 14,
    color: '#666',
  },
  optionChipTextSelected: {
    color: 'white',
  },
  frequencyOptions: {
    gap: 12,
  },
  frequencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  frequencyOptionSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioCircleSelected: {
    borderColor: '#2196F3',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
  },
  frequencyOptionText: {
    fontSize: 16,
    color: '#212121',
  },
  frequencyOptionTextSelected: {
    fontWeight: '500',
    color: '#2196F3',
  },
  intervalHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  intervalHintText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
  },
  customContainer: {
    marginTop: 8,
    gap: 12,
  },
  customTypeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  customTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: 'white',
    gap: 8,
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
  customSubSection: {
    alignItems: 'center',
    gap: 8,
  },
  hoursSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
    paddingVertical: 8,
  },
  hourButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourButtonText: {
    color: 'white',
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 30,
  },
  hoursValue: {
    fontSize: 52,
    fontWeight: 'bold',
    color: '#212121',
    minWidth: 64,
    textAlign: 'center',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
  },
  dayButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButtonSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  dayButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  dayButtonTextSelected: {
    color: 'white',
  },
  customInfoText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  timesContainer: {
    gap: 20,
  },
  timesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4CAF50',
    gap: 8,
  },
  timeChipText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  emptyTimes: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTimesText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  addTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  addTimeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  suggestionsContainer: {
    marginTop: 8,
  },
  suggestionsTitle: {
    fontSize: 13,
    color: '#999',
    marginBottom: 12,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  suggestionChip: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  suggestionChipSelected: {
    backgroundColor: '#9C27B0',
    borderColor: '#9C27B0',
  },
  suggestionChipText: {
    fontSize: 14,
    color: '#666',
  },
  suggestionChipTextSelected: {
    color: 'white',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 12,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#212121',
    textTransform: 'capitalize',
  },
  endDateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 12,
  },
  endDateOptionSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  endDateOptionText: {
    fontSize: 16,
    color: '#212121',
  },
  notificationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 16,
  },
  notificationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  notificationTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
  },
  notificationSubtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  toggleSwitch: {
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E0E0E0',
    padding: 2,
  },
  toggleSwitchOn: {
    backgroundColor: '#4CAF50',
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleKnobOn: {
    transform: [{ translateX: 22 }],
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    paddingBottom: Platform.OS === 'android' ? 30 : 20,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  nextButtonDisabled: {
    backgroundColor: '#BBDEFB',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
