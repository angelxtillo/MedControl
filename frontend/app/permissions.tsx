import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PermissionsScreen() {
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  const requestNotifications = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setNotificationsGranted(true);
        return true;
      } else {
        Alert.alert(
          'Permisos Requeridos',
          'Los recordatorios de medicamentos necesitan permisos de notificaciones para funcionar correctamente.'
        );
        return false;
      }
    } catch (error) {
      console.error('Error requesting notifications:', error);
      return false;
    }
  };

  const requestCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status === 'granted' && mediaStatus === 'granted') {
        setCameraGranted(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting camera:', error);
      return false;
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    
    // Solicitar permisos obligatorios
    const notifGranted = await requestNotifications();
    
    if (notifGranted) {
      // Marcar que ya pasó por permisos
      await AsyncStorage.setItem('permissionsAsked', 'true');
      router.replace('/(tabs)/home');
    }
    
    setLoading(false);
  };

  const handleSkipCamera = async () => {
    await AsyncStorage.setItem('permissionsAsked', 'true');
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="shield-checkmark" size={64} color="#2196F3" />
        </View>

        <Text style={styles.title}>Permisos Necesarios</Text>
        <Text style={styles.subtitle}>
          Para funcionar correctamente, MedControl necesita los siguientes permisos:
        </Text>

        <View style={styles.permissionsList}>
          {/* Notificaciones - OBLIGATORIO */}
          <View style={styles.permissionCard}>
            <View style={[styles.permissionIcon, { backgroundColor: '#4CAF50' }]}>
              <Ionicons name="notifications" size={32} color="white" />
            </View>
            <View style={styles.permissionInfo}>
              <Text style={styles.permissionTitle}>Notificaciones</Text>
              <Text style={styles.permissionDesc}>
                ✅ Obligatorio - Para recordatorios de medicamentos
              </Text>
            </View>
            {notificationsGranted && (
              <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
            )}
          </View>

          {/* Alarmas Exactas - OBLIGATORIO */}
          <View style={styles.permissionCard}>
            <View style={[styles.permissionIcon, { backgroundColor: '#2196F3' }]}>
              <Ionicons name="alarm" size={32} color="white" />
            </View>
            <View style={styles.permissionInfo}>
              <Text style={styles.permissionTitle}>Alarmas Exactas</Text>
              <Text style={styles.permissionDesc}>
                ✅ Recomendado - Precisión médica en horarios
              </Text>
            </View>
            <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
          </View>

          {/* Cámara - OPCIONAL */}
          <View style={styles.permissionCard}>
            <View style={[styles.permissionIcon, { backgroundColor: '#FF9800' }]}>
              <Ionicons name="camera" size={32} color="white" />
            </View>
            <View style={styles.permissionInfo}>
              <Text style={styles.permissionTitle}>Cámara y Fotos</Text>
              <Text style={styles.permissionDesc}>
                🟡 Opcional - Para fotos de pacientes
              </Text>
            </View>
            {cameraGranted ? (
              <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
            ) : (
              <TouchableOpacity onPress={requestCamera}>
                <Text style={styles.grantText}>Permitir</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.continueButton, loading && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={loading}
        >
          <Text style={styles.continueButtonText}>
            {loading ? 'Configurando...' : 'Continuar'}
          </Text>
        </TouchableOpacity>

        {!notificationsGranted && (
          <TouchableOpacity onPress={handleSkipCamera} style={styles.skipButton}>
            <Text style={styles.skipText}>Configurar después</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.disclaimer}>
          ℹ️ Puedes cambiar estos permisos en cualquier momento desde la configuración de tu dispositivo
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  permissionsList: {
    marginBottom: 32,
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  permissionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  permissionInfo: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  permissionDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  grantText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  continueButtonDisabled: {
    backgroundColor: '#BBDEFB',
  },
  continueButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 16,
    alignItems: 'center',
    padding: 12,
  },
  skipText: {
    color: '#666',
    fontSize: 16,
  },
  disclaimer: {
    marginTop: 24,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
