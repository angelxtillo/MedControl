import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRefreshOnResume } from '../../hooks/useRefreshOnResume';
import api from '../../utils/api';
import { hasMutatedSince } from '../../utils/mutations';
import { format, isToday, isYesterday } from 'date-fns';
import { es, enUS, ptBR, fr as frLocale } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

interface Patient {
  id: string;
  name: string;
}

interface Log {
  id: string;
  medication_id: string;
  medication_name?: string;
  patient_id: string;
  scheduled_datetime: string;
  taken_datetime?: string;
  status: string;
  notes?: string;
  // Atribución: id del cuidador que marcó y su nombre resuelto por el backend
  // (null si la cuenta fue eliminada → mostrar "Cuidador" genérico).
  logged_by?: string | null;
  logged_by_name?: string | null;
  is_synthetic?: boolean;
}

type StatusFilter = 'all' | 'taken' | 'skipped' | 'missed';

const FILTER_BUTTONS: { key: StatusFilter; labelKey: string; activeColor: string }[] = [
  { key: 'all',     labelKey: 'history.filterAll',     activeColor: '#2196F3' },
  { key: 'taken',   labelKey: 'history.filterTaken',   activeColor: '#4CAF50' },
  { key: 'skipped', labelKey: 'history.filterSkipped', activeColor: '#FF9800' },
  { key: 'missed',  labelKey: 'history.filterMissed',  activeColor: '#f44336' },
];

const dateFnsLocales: Record<string, typeof es> = { es, en: enUS, pt: ptBR, fr: frLocale };

// Header de cada grupo de día; el año solo aparece cuando no es el año en curso.
const dayFormats: Record<string, { sameYear: string; otherYear: string }> = {
  es: { sameYear: "EEEE, d 'de' MMMM", otherYear: "EEEE, d 'de' MMMM 'de' yyyy" },
  en: { sameYear: 'EEEE, MMMM d', otherYear: 'EEEE, MMMM d, yyyy' },
  pt: { sameYear: "EEEE, d 'de' MMMM", otherYear: "EEEE, d 'de' MMMM 'de' yyyy" },
  fr: { sameYear: 'EEEE d MMMM', otherYear: 'EEEE d MMMM yyyy' },
};

// Tinte suave + color de ícono/texto por estado — los mismos pares que usan
// los badges de estadísticas del header, para que todo quede en una paleta.
const STATUS_STYLES: Record<string, { icon: any; tint: string; iconColor: string; textColor: string }> = {
  taken:   { icon: 'checkmark-circle', tint: '#E8F5E9', iconColor: '#4CAF50', textColor: '#2E7D32' },
  skipped: { icon: 'remove-circle',    tint: '#FFF3E0', iconColor: '#FF9800', textColor: '#E65100' },
  missed:  { icon: 'close-circle',     tint: '#FFEBEE', iconColor: '#f44336', textColor: '#C62828' },
  pending: { icon: 'time',             tint: '#F0F0F0', iconColor: '#999',    textColor: '#666' },
};

export default function History() {
  const { t } = useTranslation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const lastRefresh = useRef(0);

  // Revalidar al foco y al volver de background, con throttle de 30s para no
  // duplicar requests al navegar rápido entre tabs. El resume salta el throttle
  // (el hook ya exige >60s en background o cambio de día).
  useFocusEffect(
    useCallback(() => {
      // El throttle se perdona si hubo una mutación (p. ej. marcar una dosis
      // en Inicio) después de la última carga.
      if (!hasMutatedSince(lastRefresh.current) && Date.now() - lastRefresh.current < 30000) return;
      refreshData();
    }, [selectedPatient])
  );

  useRefreshOnResume(() => refreshData());

  const refreshData = () => {
    lastRefresh.current = Date.now();
    loadPatients();
    if (selectedPatient) {
      // Revalidación en background: mantener los logs visibles, sin spinner.
      loadHistoryForPatient(selectedPatient, { silent: true });
    }
  };

  const loadPatients = async () => {
    try {
      const response = await api.get('/patients');
      setPatients(response.data);
      if (response.data.length > 0 && !selectedPatient) {
        setSelectedPatient(response.data[0].id);
        loadHistoryForPatient(response.data[0].id);
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('history.errorLoadPatients'));
    }
  };

  const loadHistoryForPatient = async (patientId: string, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setIsLoading(true);
    try {
      const offset = new Date().getTimezoneOffset() * -1;
      const [logsResponse, medsResponse] = await Promise.all([
        api.get(`/logs/patient/${patientId}`, {
          params: { include_missed: true, timezone_offset: offset },
        }),
        api.get(`/medications/patient/${patientId}`),
      ]);
      setLogs(logsResponse.data);
      setMedications(medsResponse.data);
    } catch (error) {
      // En revalidación silenciosa se conservan los datos ya visibles; no
      // interrumpir con una alerta por un fallo de red en background.
      if (!opts.silent) Alert.alert(t('common.error'), t('history.errorLoadHistory'));
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (selectedPatient) {
      // silent: el RefreshControl ya indica la recarga; no reemplazar la lista
      // por el spinner de pantalla completa.
      loadHistoryForPatient(selectedPatient, { silent: true });
    } else {
      loadPatients();
    }
  };

  const getMedicationName = (log: Log): string => {
    if (log.medication_name) return log.medication_name;
    const med = medications.find(m => m.id === log.medication_id);
    return med ? med.name : t('common.unknown');
  };

  const styleFor = (status: string) => STATUS_STYLES[status] ?? STATUS_STYLES.pending;

  const getStatusText = (status: string) => {
    switch (status) {
      case 'taken':   return t('history.taken');
      case 'missed':  return t('history.missed');
      case 'skipped': return t('history.skipped');
      default:        return t('history.pending');
    }
  };

  const formatTime = (datetimeStr: string): string => {
    try {
      return new Date(datetimeStr).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return '--:--';
    }
  };

  // "08:00 · Tomado a las 08:12": hora programada siempre; la hora real solo
  // cuando existe. Para perdidos basta la programada — el chip ya dice el estado.
  const timeLine = (log: Log): string => {
    const scheduled = formatTime(log.scheduled_datetime);
    let detail: string | null = null;
    if (log.status === 'taken') {
      detail = log.taken_datetime
        ? t('history.takenAt', { time: formatTime(log.taken_datetime) })
        : t('history.takenNoTime');
    } else if (log.status === 'skipped' && log.taken_datetime) {
      detail = t('history.skippedAt', { time: formatTime(log.taken_datetime) });
    }
    return detail ? `${scheduled} · ${detail}` : scheduled;
  };

  const dayLabel = (dateStr: string): string => {
    const d = new Date(`${dateStr}T00:00:00`);
    if (isToday(d)) return t('history.today');
    if (isYesterday(d)) return t('history.yesterday');
    const lang = i18n.language?.split('-')[0] || 'es';
    const formats = dayFormats[lang] ?? dayFormats.es;
    const pattern = d.getFullYear() === new Date().getFullYear()
      ? formats.sameYear
      : formats.otherYear;
    return format(d, pattern, { locale: dateFnsLocales[lang] ?? es });
  };

  const filteredLogs = statusFilter === 'all'
    ? logs
    : logs.filter(log => log.status === statusFilter);

  // Los logs llegan ordenados desc por scheduled_datetime; agrupar por día
  // preservando ese orden.
  const groupedLogs: { date: string; items: Log[] }[] = [];
  for (const log of filteredLogs) {
    const date = log.scheduled_datetime.slice(0, 10);
    const last = groupedLogs[groupedLogs.length - 1];
    if (last && last.date === date) last.items.push(log);
    else groupedLogs.push({ date, items: [log] });
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {patients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>{t('history.noHistory')}</Text>
          <Text style={styles.emptySubtext}>{t('history.addPatientsFirst')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.headerSection}>
            <View style={styles.historyStatsRow}>
              <View style={[styles.historyStatBadge, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="checkmark" size={14} color="#2E7D32" />
                <Text style={[styles.historyStatText, { color: '#2E7D32' }]}>
                  {logs.filter(l => l.status === 'taken').length} {t('history.taken')}
                </Text>
              </View>
              <View style={[styles.historyStatBadge, { backgroundColor: '#FFEBEE' }]}>
                <Ionicons name="close" size={14} color="#C62828" />
                <Text style={[styles.historyStatText, { color: '#C62828' }]}>
                  {logs.filter(l => l.status === 'missed').length} {t('history.missed')}
                </Text>
              </View>
              <View style={[styles.historyStatBadge, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="remove" size={14} color="#E65100" />
                <Text style={[styles.historyStatText, { color: '#E65100' }]}>
                  {logs.filter(l => l.status === 'skipped').length} {t('history.skipped')}
                </Text>
              </View>
            </View>
            <ScrollView
              horizontal
              style={styles.patientTabsScroll}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}
            >
              {patients.map((patient) => (
                <TouchableOpacity
                  key={patient.id}
                  style={[
                    styles.patientTabNew,
                    selectedPatient === patient.id
                      ? { backgroundColor: '#2196F3', borderColor: '#2196F3' }
                      : { backgroundColor: '#f5f5f5', borderColor: '#e0e0e0' },
                  ]}
                  onPress={() => {
                    setSelectedPatient(patient.id);
                    setStatusFilter('all');
                    loadHistoryForPatient(patient.id);
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '500', color: selectedPatient === patient.id ? 'white' : '#666' }}>
                    {patient.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.filterRow}>
            {FILTER_BUTTONS.map(btn => {
              const isActive = statusFilter === btn.key;
              return (
                <TouchableOpacity
                  key={btn.key}
                  style={[
                    styles.filterButton,
                    isActive
                      ? { backgroundColor: btn.activeColor, borderColor: btn.activeColor }
                      : styles.filterButtonInactive,
                  ]}
                  onPress={() => setStatusFilter(btn.key)}
                >
                  <Text style={[styles.filterButtonText, isActive && styles.filterButtonTextActive]}>
                    {t(btn.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2196F3" />
            </View>
          ) : (
            <ScrollView
              style={styles.content}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
            >
              {filteredLogs.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="document-outline" size={64} color="#ccc" />
                  <Text style={styles.emptyText}>{t('history.noHistoryForPatient')}</Text>
                </View>
              ) : (
                groupedLogs.map((group) => (
                  <View key={group.date}>
                    <Text style={styles.dayHeader}>{dayLabel(group.date)}</Text>
                    <View style={styles.dayCard}>
                      {group.items.map((log, idx) => {
                        const s = styleFor(log.status);
                        return (
                          <View key={log.id} style={[styles.logRow, idx > 0 && styles.logRowBorder]}>
                            <View style={[styles.statusCircle, { backgroundColor: s.tint }]}>
                              <Ionicons name={s.icon} size={20} color={s.iconColor} />
                            </View>
                            <View style={styles.logInfo}>
                              <Text style={styles.medicationName}>{getMedicationName(log)}</Text>
                              <Text style={styles.timeLine}>{timeLine(log)}</Text>
                              {log.logged_by && (
                                <View style={styles.loggedByRow}>
                                  <Ionicons name="person-outline" size={12} color="#999" />
                                  <Text style={styles.loggedByText}>
                                    {t('history.markedBy', { name: log.logged_by_name || t('history.genericCaregiver') })}
                                  </Text>
                                </View>
                              )}
                              {log.notes && (
                                <Text style={styles.logNotes}>{t('history.note')}: {log.notes}</Text>
                              )}
                            </View>
                            <View style={[styles.statusChip, { backgroundColor: s.tint }]}>
                              <Ionicons name={s.icon} size={12} color={s.textColor} />
                              <Text style={[styles.statusChipText, { color: s.textColor }]}>
                                {getStatusText(log.status)}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  headerSection: {
    backgroundColor: 'white',
    paddingTop: 12,
  },
  historyStatsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  historyStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  historyStatText: {
    fontSize: 13,
    fontWeight: '600',
  },
  patientTabsScroll: {
    marginBottom: 16,
  },
  patientTabNew: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterButtonInactive: {
    backgroundColor: 'white',
    borderColor: '#e0e0e0',
  },
  filterButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: 'white',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
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
    textAlign: 'center',
  },
  dayHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A94A6',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  dayCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
  },
  logRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statusCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logInfo: {
    flex: 1,
  },
  medicationName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1565C0',
  },
  timeLine: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  loggedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  loggedByText: {
    fontSize: 12,
    color: '#999',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  logNotes: {
    marginTop: 6,
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
});
