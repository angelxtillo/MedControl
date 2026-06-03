import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { MedicationCard } from '../../components/MedicationCard';
import api from '../../utils/api';
import { useFocusEffect } from '@react-navigation/native';
import { requestNotificationPermissions } from '../../utils/notifications';

interface DashboardData {
  medications_today: any[];
  completed: number;
  pending: number;
  missed: number;
}

export default function Home() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData>({
    medications_today: [],
    completed: 0,
    pending: 0,
    missed: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
      requestNotificationPermissions();
    }, [])
  );

  const loadDashboard = async () => {
    const maxAttempts = 3;
    const delay = 3000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) setRetrying(true);
        const offset = new Date().getTimezoneOffset() * -1;
        const response = await api.get('/dashboard/today', { params: { timezone_offset: offset } });
        setDashboard(response.data);
        setRetrying(false);
        setLoading(false);
        setRefreshing(false);
        return;
      } catch (error: any) {
        console.error(`Dashboard load attempt ${attempt} failed:`, error);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          setRetrying(false);
          setLoading(false);
          setRefreshing(false);
          Alert.alert('Error', 'No se pudo cargar el dashboard');
        }
      }
    }
  };

  const handleMarkTaken = async (medicationId: string, patientId: string, scheduledDatetime: string, logId: string | null) => {
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
      loadDashboard();
      Alert.alert('Éxito', 'Medicamento marcado como tomado');
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el estado');
    }
  };

  const handleMarkSkipped = async (medicationId: string, patientId: string, scheduledDatetime: string, logId: string | null) => {
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
      loadDashboard();
      Alert.alert('Éxito', 'Medicamento marcado como saltado');
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el estado');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const getVisibleMedications = (medications: any[]): any[] => {
    const groups: Record<string, any[]> = {};
    for (const med of medications) {
      if (!groups[med.medication_id]) groups[med.medication_id] = [];
      groups[med.medication_id].push(med);
    }
    const result: any[] = [];
    for (const group of Object.values(groups)) {
      const pending = group.filter(m => m.status === 'pending');
      result.push(pending.length > 0 ? pending[0] : group[group.length - 1]);
    }
    result.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
    return result;
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
    if (h > 0 && m > 0) return `en ${h}h ${m}min`;
    if (h > 0) return `en ${h}h`;
    return `en ${m}min`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {user?.name} 👋</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: '#4CAF50' }]}>
          <Ionicons name="checkmark-circle" size={32} color="white" />
          <Text style={styles.statNumber}>{dashboard.completed}</Text>
          <Text style={styles.statLabel}>Completados</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#2196F3' }]}>
          <Ionicons name="time" size={32} color="white" />
          <Text style={styles.statNumber}>{dashboard.pending}</Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#f44336' }]}>
          <Ionicons name="close-circle" size={32} color="white" />
          <Text style={styles.statNumber}>{dashboard.missed}</Text>
          <Text style={styles.statLabel}>Perdidos</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {(() => {
          const nextDose = dashboard.medications_today.find(m => m.status === 'pending');
          if (!nextDose) return null;
          const timeUntil = getTimeUntil(nextDose.next_dose_time || nextDose.scheduled_time);
          return (
            <View style={styles.nextDoseCard}>
              <View style={styles.nextDoseHeader}>
                <Ionicons name="time-outline" size={18} color="#2196F3" />
                <Text style={styles.nextDoseLabel}>Próxima toma</Text>
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
            <Text style={styles.retryingText}>Conectando con el servidor...</Text>
          </View>
        )}
        <Text style={styles.sectionTitle}>Medicamentos de Hoy</Text>
        {loading ? (
          <Text style={styles.emptyText}>Cargando...</Text>
        ) : dashboard.medications_today.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No hay medicamentos programados para hoy</Text>
          </View>
        ) : (
          getVisibleMedications(dashboard.medications_today).map((med) => (
            <MedicationCard
              key={`${med.medication_id}-${med.scheduled_datetime}`}
              medicationName={med.medication_name}
              dosage={med.dosage}
              scheduledTime={med.scheduled_time}
              patientName={med.patient_name}
              status={med.status}
              onMarkTaken={() => handleMarkTaken(med.medication_id, med.patient_id, med.scheduled_datetime, med.log_id)}
              onMarkSkipped={() => handleMarkSkipped(med.medication_id, med.patient_id, med.scheduled_datetime, med.log_id)}
            />
          ))
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
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: 'white',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
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
});
