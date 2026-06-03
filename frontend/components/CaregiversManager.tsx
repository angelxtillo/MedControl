import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useTranslation } from 'react-i18next';

interface Caregiver {
  id: string;
  name: string;
  email: string;
  is_owner: boolean;
}

interface CaregiversManagerProps {
  patientId: string;
  patientName: string;
  onCaregiversChange?: () => void;
}

export default function CaregiversManager({
  patientId,
  patientName,
  onCaregiversChange
}: CaregiversManagerProps) {
  const { t } = useTranslation();
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [directMode, setDirectMode] = useState(false);

  useEffect(() => {
    loadCaregivers();
  }, [patientId]);

  const loadCaregivers = async () => {
    try {
      const response = await api.get(`/patients/${patientId}/caregivers`);
      setCaregivers(response.data);
    } catch (error) {
      console.error('Error loading caregivers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert(t('common.error'), t('caregivers.emailRequired'));
      return;
    }
    setInviting(true);
    try {
      await api.post('/caregivers/invite', {
        patient_id: patientId,
        invitee_email: inviteEmail.trim().toLowerCase(),
      });
      Alert.alert(
        `✉️ ${t('caregivers.inviteSent')}`,
        t('caregivers.inviteSentDesc')
      );
      setInviteEmail('');
      setModalVisible(false);
      setDirectMode(false);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'No se pudo enviar la invitación';
      Alert.alert(t('common.error'), message);
    } finally {
      setInviting(false);
    }
  };

  const handleDirectAdd = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert(t('common.error'), t('caregivers.emailRequired'));
      return;
    }
    setInviting(true);
    try {
      await api.post(`/patients/${patientId}/caregivers/invite`, {
        patient_id: patientId,
        email: inviteEmail.trim().toLowerCase(),
      });
      Alert.alert(t('common.success'), t('caregivers.caregiverAdded'));
      setInviteEmail('');
      setModalVisible(false);
      setDirectMode(false);
      loadCaregivers();
      onCaregiversChange?.();
    } catch (error: any) {
      const message = error.response?.data?.detail || t('caregivers.notFound');
      Alert.alert(t('common.error'), message);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = (caregiver: Caregiver) => {
    if (caregiver.is_owner) {
      Alert.alert(t('common.error'), t('caregivers.cannotRemoveOwner'));
      return;
    }

    Alert.alert(
      t('common.confirm'),
      t('caregivers.removeConfirm', { name: caregiver.name, patient: patientName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('caregivers.removeCaregiver'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/patients/${patientId}/caregivers/${caregiver.id}`);
              Alert.alert(t('common.success'), t('caregivers.caregiverRemoved'));
              loadCaregivers();
              onCaregiversChange?.();
            } catch (error: any) {
              const message = error.response?.data?.detail || t('common.errorDelete');
              Alert.alert(t('common.error'), message);
            }
          },
        },
      ]
    );
  };

  const renderCaregiver = ({ item }: { item: Caregiver }) => (
    <View style={styles.caregiverItem}>
      <View style={styles.caregiverAvatar}>
        <Ionicons 
          name={item.is_owner ? 'star' : 'person'} 
          size={20} 
          color={item.is_owner ? '#FF9800' : '#2196F3'} 
        />
      </View>
      <View style={styles.caregiverInfo}>
        <Text style={styles.caregiverName}>
          {item.name} {item.is_owner && `(${t('caregivers.creator')})`}
        </Text>
        <Text style={styles.caregiverEmail}>{item.email}</Text>
      </View>
      {!item.is_owner && (
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemove(item)}
        >
          <Ionicons name="close-circle" size={24} color="#f44336" />
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="people" size={20} color="#2196F3" />
          <Text style={styles.headerTitle}>{t('caregivers.title')} ({caregivers.length})</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="person-add" size={18} color="white" />
          <Text style={styles.addButtonText}>{t('common.add')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={caregivers}
        renderItem={renderCaregiver}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>{t('caregivers.noCaregivers')}</Text>
        }
      />

      {/* Modal para invitar cuidador */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setModalVisible(false); setDirectMode(false); setInviteEmail(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('caregivers.inviteByEmail')}</Text>
              <TouchableOpacity
                onPress={() => { setModalVisible(false); setDirectMode(false); setInviteEmail(''); }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {!directMode ? (
                <>
                  <Text style={styles.modalDescription}>
                    {t('caregivers.inviteDescription')}
                  </Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t('caregivers.inviteEmailLabel')}</Text>
                    <TextInput
                      style={styles.input}
                      value={inviteEmail}
                      onChangeText={setInviteEmail}
                      placeholder="ejemplo@correo.com"
                      placeholderTextColor="#999"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <View style={styles.infoBox}>
                    <Ionicons name="mail" size={20} color="#2196F3" />
                    <Text style={styles.infoText}>
                      {t('caregivers.inviteDescription')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.directModeLink}
                    onPress={() => setDirectMode(true)}
                  >
                    <Text style={styles.directModeLinkText}>{t('caregivers.directMode')} →</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.modalDescription}>
                    {t('caregivers.inviteEmailLabel')}
                  </Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t('caregivers.inviteEmailLabel')}</Text>
                    <TextInput
                      style={styles.input}
                      value={inviteEmail}
                      onChangeText={setInviteEmail}
                      placeholder="ejemplo@correo.com"
                      placeholderTextColor="#999"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle" size={20} color="#2196F3" />
                    <Text style={styles.infoText}>
                      {t('caregivers.accessInfo', { patient: patientName })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.directModeLink}
                    onPress={() => setDirectMode(false)}
                  >
                    <Text style={styles.directModeLinkText}>{t('caregivers.inviteMode')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => { setModalVisible(false); setDirectMode(false); setInviteEmail(''); }}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteButton, inviting && styles.inviteButtonDisabled]}
                onPress={directMode ? handleDirectAdd : handleSendInvitation}
                disabled={inviting}
              >
                {inviting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Ionicons name={directMode ? 'person-add' : 'mail'} size={18} color="white" />
                    <Text style={styles.inviteButtonText}>
                      {directMode ? t('common.add') : t('caregivers.inviteSend')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  caregiverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  caregiverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caregiverInfo: {
    flex: 1,
    marginLeft: 12,
  },
  caregiverName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#212121',
  },
  caregiverEmail: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  removeButton: {
    padding: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 24,
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
  modalBody: {
    padding: 20,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  inviteButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inviteButtonDisabled: {
    backgroundColor: '#90CAF9',
  },
  inviteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  directModeLink: {
    marginTop: 12,
    alignItems: 'center',
  },
  directModeLinkText: {
    fontSize: 13,
    color: '#2196F3',
    fontWeight: '500',
  },
});
