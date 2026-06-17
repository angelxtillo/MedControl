import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface MedicationCardProps {
  medicationName: string;
  dosage: string;
  scheduledTime: string;
  patientName: string;
  status: string;
  onMarkTaken: () => void;
  onMarkSkipped: () => void;
  disabled?: boolean;
}

export const MedicationCard: React.FC<MedicationCardProps> = ({
  medicationName,
  dosage,
  scheduledTime,
  patientName,
  status,
  onMarkTaken,
  onMarkSkipped,
  disabled = false,
}) => {
  const { t } = useTranslation();

  const takenScale = useSharedValue(1);
  const skipScale = useSharedValue(1);

  const takenAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: takenScale.value }],
  }));

  const skipAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: skipScale.value }],
  }));

  const handleTakenPressIn = () => {
    takenScale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };
  const handleTakenPressOut = () => {
    takenScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };
  const handleSkipPressIn = () => {
    skipScale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };
  const handleSkipPressOut = () => {
    skipScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const getStatusColor = () => {
    switch (status) {
      case 'taken':
        return '#4CAF50';
      case 'missed':
        return '#F44336';
      case 'skipped':
        return '#FF9800';
      default:
        return '#2196F3';
    }
  };

  const getStatusBgColor = () => {
    switch (status) {
      case 'taken':
        return '#E8F5E9';
      case 'missed':
        return '#FFEBEE';
      case 'skipped':
        return '#FFF3E0';
      default:
        return '#E3F2FD';
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
      case 'taken':   return t('medications.statusTaken');
      case 'missed':  return t('medications.statusMissed');
      case 'skipped': return t('medications.statusSkipped');
      default:        return t('medications.statusPending');
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
          <Text style={styles.patient}>{t('medications.patientLabel', { name: patientName })}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Ionicons name={getStatusIcon() as any} size={20} color="white" />
        </View>
      </View>

      <View style={styles.timeContainer}>
        <Ionicons name="time-outline" size={16} color="#666" />
        <Text style={styles.time}>{scheduledTime}</Text>
        <View style={[styles.statusPill, { backgroundColor: getStatusBgColor() }]}>
          <Text style={[styles.statusPillText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
        </View>
      </View>

      {status === 'pending' && (
        <View style={styles.actionsContainer}>
          <Animated.View style={[{ flex: 1 }, takenAnimatedStyle]}>
            <Animated.View
              style={[styles.takenButton, disabled && styles.buttonDisabled]}
              onTouchStart={handleTakenPressIn}
              onTouchEnd={() => {
                handleTakenPressOut();
                if (!disabled) onMarkTaken();
              }}
              onTouchCancel={handleTakenPressOut}
            >
              <Ionicons name="checkmark" size={20} color="white" />
              <Text style={styles.buttonText}>{t('home.taken')}</Text>
            </Animated.View>
          </Animated.View>
          <Animated.View style={[{ flex: 1 }, skipAnimatedStyle]}>
            <Animated.View
              style={[styles.skipButton, disabled && styles.buttonDisabled]}
              onTouchStart={handleSkipPressIn}
              onTouchEnd={() => {
                handleSkipPressOut();
                if (!disabled) onMarkSkipped();
              }}
              onTouchCancel={handleSkipPressOut}
            >
              <Ionicons name="close" size={20} color="white" />
              <Text style={styles.buttonText}>{t('home.skip')}</Text>
            </Animated.View>
          </Animated.View>
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
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
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
    fontWeight: '700',
    color: '#1565C0',
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
  statusPill: {
    marginLeft: 'auto',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  buttonDisabled: {
    opacity: 0.5,
  },
});
