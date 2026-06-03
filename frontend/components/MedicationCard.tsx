import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface MedicationCardProps {
  medicationName: string;
  dosage: string;
  scheduledTime: string;
  patientName: string;
  status: string;
  onMarkTaken: () => void;
  onMarkSkipped: () => void;
}

export const MedicationCard: React.FC<MedicationCardProps> = ({
  medicationName,
  dosage,
  scheduledTime,
  patientName,
  status,
  onMarkTaken,
  onMarkSkipped,
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'taken':
        return '#4CAF50';
      case 'missed':
        return '#f44336';
      case 'skipped':
        return '#FF9800';
      default:
        return '#2196F3';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'taken':
        return 'checkmark-circle';
      case 'missed':
        return 'close-circle';
      case 'skipped':
        return 'remove-circle';
      default:
        return 'time';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'taken':
        return 'Tomado';
      case 'missed':
        return 'Perdido';
      case 'skipped':
        return 'Saltado';
      default:
        return 'Pendiente';
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="medical" size={24} color="#2196F3" />
        </View>
        <View style={styles.infoContainer}>
          <Text style={styles.medicationName}>{medicationName}</Text>
          <Text style={styles.dosage}>{dosage}</Text>
          <Text style={styles.patient}>Paciente: {patientName}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Ionicons name={getStatusIcon() as any} size={20} color="white" />
        </View>
      </View>

      <View style={styles.timeContainer}>
        <Ionicons name="time-outline" size={16} color="#666" />
        <Text style={styles.time}>{scheduledTime}</Text>
        <Text style={styles.statusText}>{getStatusText()}</Text>
      </View>

      {status === 'pending' && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.takenButton} onPress={onMarkTaken}>
            <Ionicons name="checkmark" size={20} color="white" />
            <Text style={styles.buttonText}>Tomado</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={onMarkSkipped}>
            <Ionicons name="close" size={20} color="white" />
            <Text style={styles.buttonText}>Saltar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoContainer: {
    flex: 1,
  },
  medicationName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  dosage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  patient: {
    fontSize: 13,
    color: '#999',
  },
  statusBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  time: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
    fontWeight: '500',
  },
  statusText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 'auto',
  },
  actionsContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  takenButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FF9800',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 6,
    fontSize: 14,
  },
});
