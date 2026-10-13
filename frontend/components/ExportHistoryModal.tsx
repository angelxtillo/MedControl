import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { formatLongDate, startOfToday } from '../utils/dates';
import { getApiErrorMessage } from '../utils/errors';
import { exportHistoryPdf, MAX_EXPORT_DAYS, SharingUnavailableError } from '../utils/historyPdf';
import type { ReportPatient } from '../utils/historyReport';

type Preset = 7 | 30 | 90 | 'custom';

const PRESETS: { key: Preset; labelKey: string }[] = [
  { key: 7, labelKey: 'export.range7' },
  { key: 30, labelKey: 'export.range30' },
  { key: 90, labelKey: 'export.range90' },
  { key: 'custom', labelKey: 'export.rangeCustom' },
];

const DAY_MS = 86_400_000;

const daysBefore = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);

/** Días de calendario entre dos medianoches locales, ambos incluidos (robusto al cambio de horario). */
const spanDays = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;

interface Props {
  visible: boolean;
  onClose: () => void;
  patientId: string;
  patient: ReportPatient;
}

/**
 * Selector de rango + generación del PDF del historial. Compartido por la
 * pantalla del paciente y la de Historial.
 */
export const ExportHistoryModal: React.FC<Props> = ({ visible, onClose, patientId, patient }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const lang = i18n.language?.split('-')[0] || 'es';

  const [preset, setPreset] = useState<Preset>(30);
  const [customFrom, setCustomFrom] = useState(() => daysBefore(startOfToday(), 29));
  const [customTo, setCustomTo] = useState(startOfToday);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [busy, setBusy] = useState(false);

  // Cada apertura parte de "hoy" (el modal puede quedar montado de un día a otro).
  useEffect(() => {
    if (!visible) return;
    const today = startOfToday();
    setCustomTo(today);
    setCustomFrom(daysBefore(today, 29));
    setPicker(null);
  }, [visible]);

  const today = startOfToday();
  const to = preset === 'custom' ? customTo : today;
  const from = preset === 'custom' ? customFrom : daysBefore(today, preset - 1);
  const tooLong = spanDays(from, to) > MAX_EXPORT_DAYS;

  const close = () => {
    if (!busy) onClose();
  };

  const generate = async () => {
    setBusy(true);
    try {
      await exportHistoryPdf({ patientId, patient, from, to, t, lang });
      onClose();
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof SharingUnavailableError
          ? t('export.sharingUnavailable')
          : getApiErrorMessage(error, t('export.error')),
      );
    } finally {
      setBusy(false);
    }
  };

  const onPick = (which: 'from' | 'to') => (event: { type: string }, date?: Date) => {
    setPicker(null);
    if (event?.type === 'dismissed' || !date) return;
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (which === 'from') {
      setCustomFrom(day);
      if (day > customTo) setCustomTo(day);
    } else {
      setCustomTo(day);
      if (day < customFrom) setCustomFrom(day);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('export.title')}</Text>
            <TouchableOpacity onPress={close} style={styles.closeButton} disabled={busy}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.subtitle}>{t('export.subtitle', { name: patient.name })}</Text>

            <View style={styles.presetRow}>
              {PRESETS.map(p => {
                const active = preset === p.key;
                return (
                  <TouchableOpacity
                    key={String(p.key)}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    onPress={() => setPreset(p.key)}
                    disabled={busy}
                  >
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>{t(p.labelKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {preset === 'custom' ? (
              <View style={styles.customBox}>
                {(['from', 'to'] as const).map(which => (
                  <TouchableOpacity
                    key={which}
                    style={styles.dateRow}
                    onPress={() => setPicker(which)}
                    disabled={busy}
                  >
                    <Text style={styles.dateLabel}>{t(`export.${which}`)}</Text>
                    <Text style={styles.dateValue}>
                      {formatLongDate(which === 'from' ? customFrom : customTo, lang)}
                    </Text>
                    <Ionicons name="calendar-outline" size={18} color="#2196F3" />
                  </TouchableOpacity>
                ))}
                <Text style={[styles.hint, tooLong && styles.hintError]}>
                  {tooLong
                    ? t('export.rangeTooLong', { days: MAX_EXPORT_DAYS })
                    : t('export.maxRange', { days: MAX_EXPORT_DAYS })}
                </Text>
              </View>
            ) : (
              <Text style={styles.rangeSummary}>
                {formatLongDate(from, lang)} – {formatLongDate(to, lang)}
              </Text>
            )}

            {picker && (
              <DateTimePicker
                value={picker === 'from' ? customFrom : customTo}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={today}
                onChange={onPick(picker)}
              />
            )}

            <View style={styles.privacyRow}>
              <Ionicons name="lock-closed-outline" size={14} color="#757575" />
              <Text style={styles.privacyText}>{t('export.privacyNote')}</Text>
            </View>

            <TouchableOpacity
              style={[styles.generateButton, (busy || tooLong) && styles.generateButtonDisabled]}
              onPress={generate}
              disabled={busy || tooLong}
            >
              {busy ? (
                <>
                  <ActivityIndicator color="white" />
                  <Text style={styles.generateText}>{t('export.generating')}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={20} color="white" />
                  <Text style={styles.generateText}>{t('export.generate')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

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
    maxHeight: '85%',
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
  body: {
    padding: 20,
    gap: 16,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    lineHeight: 21,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  presetChipActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  presetText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  presetTextActive: {
    color: 'white',
  },
  rangeSummary: {
    fontSize: 15,
    color: '#212121',
    fontWeight: '500',
  },
  customBox: {
    gap: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateLabel: {
    width: 56,
    fontSize: 14,
    color: '#757575',
  },
  dateValue: {
    flex: 1,
    fontSize: 15,
    color: '#212121',
    fontWeight: '500',
  },
  hint: {
    fontSize: 13,
    color: '#757575',
  },
  hintError: {
    color: '#C62828',
    fontWeight: '500',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    color: '#757575',
    lineHeight: 18,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 14,
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
