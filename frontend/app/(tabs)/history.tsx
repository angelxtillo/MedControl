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
import { format } from 'date-fns';
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

const dateFormats: Record<string, string> = {
  es: "d 'de' MMMM, yyyy",
  en: 'MMMM d, yyyy',
  pt: "d 'de' MMMM, yyyy",
  fr: 'd MMMM yyyy',
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
      if (Date.now() - lastRefresh.current < 30000) return;
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'taken':   return '#4CAF50';
      case 'missed':  return '#f44336';
      case 'skipped': return '#FF9800';
      default:        return '#999';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'taken':   return t('history.taken');
      case 'missed':  return t('history.missed');
      case 'skipped': return t('history.skipped');
      default:        return t('history.pending');
    }
  };

  const getStatusIcon = (status: string): any => {
    switch (status) {
      case 'taken':   return 'checkmark-circle';
      case 'missed':  return 'close-circle';
      case 'skipped': return 'remove-circle';
      default:        return 'time';
    }
  };

  const formatTime = (datetimeStr: string): string => {
    try {
      return new Date(datetimeStr).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return '--:--';
    }
  };

  const getTimeDetail = (log: Log): string | null => {
    switch (log.status) {
      case 'taken':
        if (log.taken_datetime) return t('history.takenAt', { time: formatTime(log.taken_datetime) });
        return t('history.takenNoTime');
      case 'missed':
        return t('history.notTaken', { time: formatTime(log.scheduled_datetime) });
      case 'skipped':
        if (log.taken_datetime) return t('history.skippedAt', { time: formatTime(log.taken_datetime) });
        return t('history.skipped');
      default:
        return null;
    }
  };

  const filteredLogs = statusFilter === 'all'
    ? logs
    : logs.filter(log => log.status === statusFilter);

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
                filteredLogs.map((log) => (
                  <View key={log.id} style={styles.logCard}>
                    <View style={styles.logHeader}>
                      <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(log.status) }]}>
                        <Ionicons name={getStatusIcon(log.status)} size={20} color="white" />
                      </View>
                      <View style={styles.logInfo}>
                        <Text style={styles.medicationName}>{getMedicationName(log)}</Text>
                        <Text style={styles.logDate}>
                          {(() => {
                            const lang = i18n.language?.split('-')[0] || 'es';
                            return format(new Date(log.scheduled_datetime), dateFormats[lang] ?? dateFormats.es, { locale: dateFnsLocales[lang] ?? es });
                          })()}
                        </Text>
                        <Text style={styles.scheduledTime}>
                          {t('history.scheduled', { time: formatTime(log.scheduled_datetime) })}
                        </Text>
                        {getTimeDetail(log) !== null && (
                          <Text style={[
                            styles.timeDetail,
                            log.status === 'taken'   && styles.timeDetailTaken,
                            log.status === 'missed'  && styles.timeDetailMissed,
                            log.status === 'skipped' && styles.timeDetailSkipped,
                          ]}>
                            {getTimeDetail(log)}
                          </Text>
                        )}
                        {log.logged_by && (
                          <View style={styles.loggedByRow}>
                            <Ionicons name="person-outline" size={12} color="#999" />
                            <Text style={styles.loggedByText}>
                              {t('history.markedBy', { name: log.logged_by_name || t('history.genericCaregiver') })}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(log.status) }]}>
                        <Text style={styles.statusBadgeText}>{getStatusText(log.status)}</Text>
                      </View>
                    </View>
                    {log.notes && (
                      <Text style={styles.logNotes}>{t('history.note')}: {log.notes}</Text>
                    )}
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
  logCard: {
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
  logHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logInfo: {
    flex: 1,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1565C0',
    marginBottom: 4,
  },
  logDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  takenDate: {
    fontSize: 12,
    color: '#4CAF50',
  },
  scheduledTime: {
    fontSize: 13,
    color: '#888',
    marginBottom: 2,
  },
  timeDetail: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  timeDetailTaken: {
    color: '#4CAF50',
  },
  timeDetailMissed: {
    color: '#f44336',
  },
  timeDetailSkipped: {
    color: '#FF9800',
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
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  logNotes: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
});
