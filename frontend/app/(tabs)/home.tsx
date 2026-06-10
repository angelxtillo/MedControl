import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { MedicationCard } from '../../components/MedicationCard';
import api from '../../utils/api';
import { useFocusEffect } from '@react-navigation/native';
import { requestNotificationPermissions, syncAllMedicationNotifications, MedicationForSchedule } from '../../utils/notifications';
import { useTranslation } from 'react-i18next';

interface DashboardData {
  medications_today: any[];
  completed: number;
  pending: number;
  missed: number;
}

interface UpcomingMed {
  date: string;
  day_label: string;
  medication_id: string;
  medication_name: string;
  dosage: string;
  scheduled_time: string;
  patient_name: string;
  patient_id: string;
}

interface UpcomingDay {
  date: string;
  day_label: string;
  medications: UpcomingMed[];
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData>({
    medications_today: [],
    completed: 0,
    pending: 0,
    missed: 0,
  });
  const [upcomingDays, setUpcomingDays] = useState<UpcomingDay[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [processingKeys, setProcessingKeys] = useState<Set<string>>(new Set());
  const lastLoad = useRef(0);
  useEffect(() => {
    requestNotificationPermissions();
    cleanOldDoseLogKeys();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [])
  );

  const cleanOldDoseLogKeys = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const today = new Date().toISOString().slice(0, 10);
      const doseKeys = keys.filter(k => k.startsWith('doseLogged:'));
      for (const key of doseKeys) {
        const parts = key.split(':');
        if (parts.length >= 3 && parts[2] < today) {
          await AsyncStorage.removeItem(key);
        }
      }
    } catch (_) {}
  };

  const markDoseLogged = async (medicationId: string, scheduledTime: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const timeOnly = scheduledTime.includes('T')
      ? scheduledTime.split('T')[1].slice(0, 5)
      : scheduledTime.slice(0, 5);
    const key = `doseLogged:${medicationId}:${today}:${timeOnly}`;
    try {
      await AsyncStorage.setItem(key, '1');
    } catch (_) {}
  };

  const reconcileNotifications = async () => {
    const RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;
    try {
      const last = await AsyncStorage.getItem('lastReconcile');
      if (last && Date.now() - Number(last) < RECONCILE_INTERVAL_MS) {
        return;
      }
    } catch (_) {}
    try {
      const patientsRes = await api.get('/patients');
      const patients: { id: string; name: string }[] = patientsRes.data;
      const medsWithPatient: MedicationForSchedule[] = [];
      await Promise.all(
        patients.map(async (p) => {
          const medsRes = await api.get(`/medications/patient/${p.id}`);
          const meds: any[] = medsRes.data;
          for (const med of meds) {
            if (!med.active) continue;
            medsWithPatient.push({
              id: med.id ?? med._id,
              name: med.name,
              patient_name: p.name,
              frequency: med.frequency,
              schedule_times: med.schedule_times,
              notifications_enabled: med.notifications_enabled,
              end_date: med.end_date,
            });
          }
        }),
      );
      await syncAllMedicationNotifications(medsWithPatient);
      try {
        await AsyncStorage.setItem('lastReconcile', String(Date.now()));
      } catch (_) {}
    } catch (err) {
      console.warn('Error reconciliando notificaciones:', err);
    }
  };

  const loadDashboard = async (force = false) => {
    if (!force && Date.now() - lastLoad.current < 30000) {
      return;
    }
    lastLoad.current = Date.now();
    let hadCache = false;

    if (user?.id) {
      try {
        const cached = await AsyncStorage.getItem(`dashboard:${user.id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          setDashboard(parsed.dashboard);
          setUpcomingDays(parsed.upcomingDays);
          setLoading(false);
          setRefreshing(true);
          hadCache = true;
        }
      } catch (_) {}
    }

    const maxAttempts = 3;
    const delay = 3000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) setRetrying(true);
        const offset = new Date().getTimezoneOffset() * -1;
        const [todayRes, upcomingRes] = await Promise.all([
          api.get('/dashboard/today', { params: { timezone_offset: offset } }),
          api.get('/dashboard/upcoming', { params: { timezone_offset: offset } }).catch(() => ({ data: [] })),
        ]);
        setDashboard(todayRes.data);
        setUpcomingDays(upcomingRes.data);
        reconcileNotifications();
        if (user?.id) {
          try {
            await AsyncStorage.setItem(
              `dashboard:${user.id}`,
              JSON.stringify({ dashboard: todayRes.data, upcomingDays: upcomingRes.data }),
            );
          } catch (_) {}
        }
        setRetrying(false);
        setLoading(false);
        setRefreshing(false);
        return;
      } catch (error: any) {
        console.error(`Dashboard load attempt ${attempt} failed:`, error);
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          await logout();
          return;
        }
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          setRetrying(false);
          setLoading(false);
          setRefreshing(false);
          if (!hadCache) {
            Alert.alert(t('common.error'), t('home.errorLoadDashboard'));
          }
        }
      }
    }
  };

  const handleMarkTaken = async (medicationId: string, patientId: string, scheduledDatetime: string, logId: string | null) => {
    const key = `${medicationId}:${scheduledDatetime}`;
    if (processingKeys.has(key)) return;

    // Guardar estado anterior para rollback
    const prevDashboard = { ...dashboard };

    // Actualización optimista
    setProcessingKeys((prev) => new Set(prev).add(key));
    setDashboard((prev) => ({
      ...prev,
      medications_today: prev.medications_today.map((m) =>
        m.medication_id === medicationId && m.scheduled_datetime === scheduledDatetime
          ? { ...m, status: 'taken' }
          : m
      ),
      completed: prev.completed + 1,
      pending: Math.max(0, prev.pending - 1),
    }));

    try {
      if (logId) {
        await api.put(`/logs/${logId}`, {
          status: 'taken',
          taken_datetime: new Date().toISOString(),
        });
      } else {
        await api.post('/logs', {
          medication_id: medicationId,
          patient_id: patientId,
          scheduled_datetime: scheduledDatetime,
          status: 'taken',
          taken_datetime: new Date().toISOString(),
        });
      }
      await markDoseLogged(medicationId, scheduledDatetime);
      // Refrescar en background saltando debounce
      loadDashboard(true);
    } catch (error) {
      // Rollback
      setDashboard(prevDashboard);
      Alert.alert(t('common.error'), t('home.errorUpdateStatus'));
    } finally {
      setProcessingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleMarkSkipped = async (medicationId: string, patientId: string, scheduledDatetime: string, logId: string | null) => {
    const key = `${medicationId}:${scheduledDatetime}`;
    if (processingKeys.has(key)) return;

    // Guardar estado anterior para rollback
    const prevDashboard = { ...dashboard };

    // Actualización optimista
    setProcessingKeys((prev) => new Set(prev).add(key));
    setDashboard((prev) => ({
      ...prev,
      medications_today: prev.medications_today.map((m) =>
        m.medication_id === medicationId && m.scheduled_datetime === scheduledDatetime
          ? { ...m, status: 'skipped' }
          : m
      ),
      pending: Math.max(0, prev.pending - 1),
    }));

    try {
      if (logId) {
        await api.put(`/logs/${logId}`, {
          status: 'skipped',
        });
      } else {
        await api.post('/logs', {
          medication_id: medicationId,
          patient_id: patientId,
          scheduled_datetime: scheduledDatetime,
          status: 'skipped',
        });
      }
      await markDoseLogged(medicationId, scheduledDatetime);
      // Refrescar en background saltando debounce
      loadDashboard(true);
    } catch (error) {
      // Rollback
      setDashboard(prevDashboard);
      Alert.alert(t('common.error'), t('home.errorUpdateStatus'));
    } finally {
      setProcessingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard(true);
  };

  const getVisibleMedications = (medications: any[]): any[] => {
    // Solo mostrar dosis con status === 'pending' (las demás van a Historial)
    const pending = medications.filter(m => m.status === 'pending');
    pending.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
    return pending;
  };

  const groupByPatient = (medications: any[]): Record<string, any[]> => {
    const groups: Record<string, any[]> = {};
    for (const med of medications) {
      const key = med.patient_name || t('common.unknown');
      if (!groups[key]) groups[key] = [];
      groups[key].push(med);
    }
    return groups;
  };

  const formatUpcomingDate = (dateStr: string): string => {
    const locale =
      i18n.language === 'es' ? 'es-CO' :
      i18n.language === 'pt' ? 'pt-BR' :
      i18n.language === 'fr' ? 'fr-FR' : 'en-US';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const getTimeUntil = (scheduledTime: string): string => {
    const parts = scheduledTime.split(':');
    if (parts.length < 2) return '';
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    const diffMs = scheduled.getTime() - now.getTime();
    if (diffMs <= 0) return '';
    const diffMins = Math.floor(diffMs / 60000);
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    if (h > 0 && m > 0) return t('home.inTime', { time: `${h}h ${m}min` });
    if (h > 0) return t('home.inTime', { time: `${h}h` });
    return t('home.inTime', { time: `${m}min` });
  };

  const visibleMeds = getVisibleMedications(dashboard.medications_today);
  const patientGroups = groupByPatient(visibleMeds);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t('home.greeting', { name: user?.name })}</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString(
            i18n.language === 'es' ? 'es-CO' :
            i18n.language === 'pt' ? 'pt-BR' :
            i18n.language === 'fr' ? 'fr-FR' : 'en-US',
            { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
          )}</Text>
        </View>
      </View>

      <View style={styles.summaryBar}>
        <View style={styles.summaryStatItem}>
          <Ionicons name="checkmark-circle" size={14} color="#2E7D32" />
          <Text style={[styles.summaryStatText, { color: '#2E7D32' }]}>
            {dashboard.completed} {t('home.completed')}
          </Text>
        </View>
        <Text style={styles.summarySeparator}>·</Text>
        <View style={styles.summaryStatItem}>
          <Ionicons name="time" size={14} color="#1565C0" />
          <Text style={[styles.summaryStatText, { color: '#1565C0' }]}>
            {dashboard.pending} {t('home.pending')}
          </Text>
        </View>
        <Text style={styles.summarySeparator}>·</Text>
        <View style={styles.summaryStatItem}>
          <Ionicons name="close-circle" size={14} color="#C62828" />
          <Text style={[styles.summaryStatText, { color: '#C62828' }]}>
            {dashboard.missed} {t('home.missed')}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {(() => {
          const now = new Date();
          const nowTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

          // Buscar próxima dosis pendiente con hora >= ahora
          const pendingToday = dashboard.medications_today.filter(m => m.status === 'pending');
          let nextDose = pendingToday.find(m => (m.scheduled_time || '') >= nowTimeStr);

          // Si no hay futuras hoy, mostrar la primera pendiente (dentro de gracia)
          if (!nextDose && pendingToday.length > 0) {
            nextDose = pendingToday[0];
          }

          // Si no hay pendientes hoy, buscar en mañana
          if (!nextDose && upcomingDays.length > 0) {
            const tomorrow = upcomingDays[0];
            if (tomorrow.medications.length > 0) {
              const firstTomorrow = tomorrow.medications[0];
              return (
                <View style={styles.nextDoseCard}>
                  <View style={styles.nextDoseHeader}>
                    <Ionicons name="time-outline" size={18} color="#2196F3" />
                    <Text style={styles.nextDoseLabel}>{t('home.nextDoseTitle')}</Text>
                  </View>
                  <Text style={styles.nextDoseMed}>{firstTomorrow.medication_name}</Text>
                  <Text style={styles.nextDoseTime}>
                    {t('home.tomorrow')} {firstTomorrow.scheduled_time}
                  </Text>
                  {firstTomorrow.patient_name ? (
                    <Text style={styles.nextDosePatient}>{firstTomorrow.patient_name}</Text>
                  ) : null}
                </View>
              );
            }
          }

          if (!nextDose) return null;

          const timeUntil = getTimeUntil(nextDose.next_dose_time || nextDose.scheduled_time);
          return (
            <View style={styles.nextDoseCard}>
              <View style={styles.nextDoseHeader}>
                <Ionicons name="time-outline" size={18} color="#2196F3" />
                <Text style={styles.nextDoseLabel}>{t('home.nextDoseTitle')}</Text>
              </View>
              <Text style={styles.nextDoseMed}>{nextDose.medication_name}</Text>
              <Text style={styles.nextDoseTime}>
                {nextDose.next_dose_time || nextDose.scheduled_time}
                {timeUntil ? `  ·  ${timeUntil}` : ''}
              </Text>
              {nextDose.patient_name ? (
                <Text style={styles.nextDosePatient}>{nextDose.patient_name}</Text>
              ) : null}
            </View>
          );
        })()}

        {retrying && (
          <View style={styles.retryingBanner}>
            <Text style={styles.retryingText}>{t('home.connectingServer')}</Text>
          </View>
        )}

        {refreshing && !retrying && (
          <View style={styles.updatingBanner}>
            <Text style={styles.updatingText}>{t('home.updating')}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>{t('home.medicationsToday')}</Text>

        {loading && visibleMeds.length === 0 ? (
          <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 48 }} />
        ) : visibleMeds.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
            <Text style={styles.emptyText}>{t('home.allCaughtUp')}</Text>
          </View>
        ) : (
          Object.entries(patientGroups).map(([patientName, meds]) => (
            <View key={patientName}>
              <View style={styles.patientGroupHeader}>
                <Ionicons name="person-circle-outline" size={18} color="#666" />
                <Text style={styles.patientGroupName}>{patientName}</Text>
              </View>
              {meds.map((med) => (
                <MedicationCard
                  key={`${med.medication_id}-${med.scheduled_datetime}`}
                  medicationName={med.medication_name}
                  dosage={med.dosage}
                  scheduledTime={med.scheduled_time}
                  patientName={med.patient_name}
                  status={med.status}
                  disabled={processingKeys.has(`${med.medication_id}:${med.scheduled_datetime}`)}
                  onMarkTaken={() => handleMarkTaken(med.medication_id, med.patient_id, med.scheduled_datetime, med.log_id)}
                  onMarkSkipped={() => handleMarkSkipped(med.medication_id, med.patient_id, med.scheduled_datetime, med.log_id)}
                />
              ))}
            </View>
          ))
        )}

        {upcomingDays.length > 0 && (
          <View style={styles.upcomingSection}>
            <Text style={styles.upcomingTitle}>{t('home.upcomingDays')}</Text>
            {upcomingDays.map((day) => (
              <View key={day.date}>
                <View style={styles.upcomingDayHeader}>
                  <Ionicons name="calendar-outline" size={16} color="#2196F3" />
                  <Text style={styles.upcomingDayLabel}>{formatUpcomingDate(day.date)}</Text>
                </View>
                {day.medications.map((med, idx) => (
                  <View key={`${med.medication_id}-${med.scheduled_time}-${idx}`} style={styles.upcomingMedItem}>
                    <View style={styles.upcomingMedInfo}>
                      <Text style={styles.upcomingMedName}>{med.medication_name}</Text>
                      <Text style={styles.upcomingMedDetail}>{med.dosage}  ·  {med.scheduled_time}  ·  {med.patient_name}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#2196F3',
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  date: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  summaryStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summarySeparator: {
    color: '#ccc',
    marginHorizontal: 8,
    fontSize: 16,
  },
  summaryStatText: {
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
  nextDoseCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  nextDoseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  nextDoseLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nextDoseMed: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1565C0',
    marginBottom: 2,
  },
  nextDoseTime: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 2,
  },
  nextDosePatient: {
    fontSize: 13,
    color: '#42A5F5',
  },
  retryingBanner: {
    backgroundColor: '#FFF9C4',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  retryingText: {
    fontSize: 14,
    color: '#F57F17',
    fontWeight: '500',
  },
  updatingBanner: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  updatingText: {
    fontSize: 14,
    color: '#1565C0',
    fontWeight: '500',
  },
  patientGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 6,
  },
  patientGroupName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  upcomingSection: {
    marginTop: 24,
  },
  upcomingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  upcomingDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 6,
  },
  upcomingDayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
    textTransform: 'capitalize',
  },
  upcomingMedItem: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#BBDEFB',
  },
  upcomingMedInfo: {
    flex: 1,
  },
  upcomingMedName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 2,
  },
  upcomingMedDetail: {
    fontSize: 12,
    color: '#757575',
  },
});
