import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Modal,
  Switch,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { changeLanguage, availableLanguages, getCurrentLanguage } from '../../i18n';
import api from '../../utils/api';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { logout, user, deleteAccount } = useAuth();
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [donateModalVisible, setDonateModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [invitationModalVisible, setInvitationModalVisible] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      t('auth.logout'),
      t('auth.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.logout'),
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const handleConfirmDelete = async () => {
    if (!deletePassword.trim()) {
      Alert.alert('Error', 'Por favor ingresa tu contraseña');
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo eliminar la cuenta');
    } finally {
      setDeleting(false);
      setDeletePassword('');
      setDeleteModalVisible(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Error', 'Ingresa el código de invitación');
      return;
    }
    setAcceptingInvite(true);
    try {
      const response = await api.post('/caregivers/accept-invitation', {
        code: inviteCode.trim().toUpperCase(),
      });
      Alert.alert(
        '¡Bienvenido!',
        `¡Ahora eres cuidador de ${response.data.patient_name}!`,
        [{ text: 'Genial', onPress: () => { setInvitationModalVisible(false); setInviteCode(''); } }]
      );
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'No se pudo aceptar la invitación';
      Alert.alert('Error', msg);
    } finally {
      setAcceptingInvite(false);
    }
  };

  const handleChangeLanguage = async (langCode: string) => {
    await changeLanguage(langCode);
    setCurrentLang(langCode);
    setLanguageModalVisible(false);
  };

  const getCurrentLanguageName = () => {
    const lang = availableLanguages.find(l => l.code === currentLang);
    return lang ? `${lang.flag} ${lang.name}` : 'Español';
  };

  const openDonationLink = async (platform: string) => {
    let url = '';
    switch (platform) {
      case 'paypal':
        url = 'https://www.paypal.com/ncp/payment/RVPPJA6DAQDZN';
        break;
      case 'nequi':
        Alert.alert(
          'Donar con Nequi',
          'Puedes enviar tu aporte al número:\n\n📱 313 453 8132\n\nA nombre de: Angel Portillo\n\n¡Gracias por tu apoyo! 💙',
          [{ text: 'Entendido', style: 'default' }]
        );
        return;
    }
    
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'No se pudo abrir el enlace');
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo abrir el enlace');
    }
  };

  const MenuItem = ({ 
    icon, 
    title, 
    subtitle, 
    onPress, 
    showArrow = true,
    color = '#212121',
    iconBg = '#E3F2FD',
    iconColor = '#2196F3'
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress: () => void;
    showArrow?: boolean;
    color?: string;
    iconBg?: string;
    iconColor?: string;
  }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIconContainer, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={22} color={iconColor} />
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={[styles.menuTitle, { color }]}>{title}</Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      {showArrow && (
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Perfil del usuario */}
        <View style={styles.profileSection}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person" size={40} color="#2196F3" />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'Cuidador'}</Text>
            <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          </View>
        </View>

        {/* Sección Principal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.application')}</Text>
          
          <MenuItem
            icon="information-circle"
            title={t('settings.aboutApp')}
            subtitle={t('settings.aboutAppDesc')}
            onPress={() => setAboutModalVisible(true)}
          />
          
          <MenuItem
            icon="heart"
            title={t('settings.supportProject')}
            subtitle={t('settings.supportProjectDesc')}
            onPress={() => setDonateModalVisible(true)}
            iconBg="#FCE4EC"
            iconColor="#E91E63"
          />
          
          <MenuItem
            icon="language"
            title={t('settings.language')}
            subtitle={getCurrentLanguageName()}
            onPress={() => setLanguageModalVisible(true)}
            iconBg="#E8F5E9"
            iconColor="#4CAF50"
          />
          
          <MenuItem
            icon="notifications"
            title={t('settings.notifications')}
            subtitle={t('settings.notificationsDesc')}
            onPress={() => Alert.alert(t('settings.comingSoon'), t('settings.comingSoonDesc'))}
          />
        </View>

        {/* Sección de Ayuda */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.help')}</Text>
          
          <MenuItem
            icon="help-circle"
            title={t('settings.faq')}
            subtitle={t('settings.faqDesc')}
            onPress={() => Alert.alert(t('settings.comingSoon'), t('settings.comingSoonDesc'))}
          />
          
          <MenuItem
            icon="mail"
            title={t('settings.contactSupport')}
            subtitle={t('settings.contactSupportDesc')}
            onPress={() => Linking.openURL('mailto:soporte@medcontrol.app')}
          />
        </View>

        {/* Sección de Cuenta */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>

          <MenuItem
            icon="mail"
            title="Aceptar Invitación"
            subtitle="Ingresa un código para unirte como cuidador"
            onPress={() => setInvitationModalVisible(true)}
            iconBg="#E3F2FD"
            iconColor="#2196F3"
          />

          <MenuItem
            icon="log-out"
            title={t('auth.logout')}
            onPress={handleLogout}
            showArrow={false}
            color="#f44336"
            iconBg="#FFEBEE"
            iconColor="#f44336"
          />

          <MenuItem
            icon="trash"
            title={t('settings.deleteAccount')}
            subtitle={t('settings.deleteAccountDesc')}
            onPress={() => setDeleteModalVisible(true)}
            showArrow={false}
            color="#b71c1c"
            iconBg="#FFEBEE"
            iconColor="#b71c1c"
          />
        </View>

        {/* Versión */}
        <Text style={styles.versionText}>MedControl v1.0.0</Text>
      </ScrollView>

      {/* Modal Sobre la App */}
      <Modal
        visible={aboutModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAboutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('about.title')}</Text>
              <TouchableOpacity
                onPress={() => setAboutModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Logo y nombre */}
              <View style={styles.aboutHeader}>
                <View style={styles.aboutLogo}>
                  <Ionicons name="medical" size={48} color="#2196F3" />
                </View>
                <Text style={styles.aboutAppName}>MedControl</Text>
                <Text style={styles.aboutVersion}>Versión 1.0.0</Text>
              </View>

              {/* Propósito */}
              <View style={styles.aboutSection}>
                <View style={styles.aboutSectionHeader}>
                  <Ionicons name="heart" size={20} color="#E91E63" />
                  <Text style={styles.aboutSectionTitle}>{t('about.purpose')}</Text>
                </View>
                <Text style={styles.aboutText}>{t('about.purposeText1')}</Text>
                <Text style={styles.aboutText}>{t('about.purposeText2')}</Text>
              </View>

              {/* Desarrollador */}
              <View style={styles.aboutSection}>
                <View style={styles.aboutSectionHeader}>
                  <Ionicons name="code-slash" size={20} color="#2196F3" />
                  <Text style={styles.aboutSectionTitle}>{t('about.developer')}</Text>
                </View>
                <Text style={styles.aboutText}>{t('about.developerText1')}</Text>
                <Text style={styles.aboutText}>{t('about.developerText2')}</Text>
              </View>

              {/* App 100% Gratuita */}
              <View style={styles.aboutSection}>
                <View style={styles.aboutSectionHeader}>
                  <Ionicons name="gift" size={20} color="#4CAF50" />
                  <Text style={styles.aboutSectionTitle}>{t('about.freeApp')}</Text>
                </View>
                <Text style={styles.aboutText}>{t('about.freeAppText1')}</Text>
                <Text style={styles.aboutText}>{t('about.freeAppText2')}</Text>
              </View>

              {/* Disclaimer Médico */}
              <View style={[styles.aboutSection, styles.disclaimerSection]}>
                <View style={styles.aboutSectionHeader}>
                  <Ionicons name="warning" size={20} color="#FF9800" />
                  <Text style={styles.aboutSectionTitle}>{t('about.importantNotice')}</Text>
                </View>
                <Text style={styles.disclaimerText}>{t('about.disclaimer1')}</Text>
                <Text style={styles.disclaimerText}>{t('about.disclaimer2')}</Text>
              </View>

              {/* Privacidad */}
              <View style={styles.aboutSection}>
                <View style={styles.aboutSectionHeader}>
                  <Ionicons name="shield-checkmark" size={20} color="#9C27B0" />
                  <Text style={styles.aboutSectionTitle}>{t('about.privacy')}</Text>
                </View>
                <Text style={styles.aboutText}>{t('about.privacyText')}</Text>
              </View>

              {/* Botón de donación */}
              <TouchableOpacity 
                style={styles.supportButton}
                onPress={() => {
                  setAboutModalVisible(false);
                  setTimeout(() => setDonateModalVisible(true), 300);
                }}
              >
                <Ionicons name="heart" size={20} color="white" />
                <Text style={styles.supportButtonText}>{t('settings.supportProject')} ❤️</Text>
              </TouchableOpacity>

              <View style={styles.modalFooterSpace} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Donaciones */}
      <Modal
        visible={donateModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDonateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.donateModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('donate.title')}</Text>
              <TouchableOpacity
                onPress={() => setDonateModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Mensaje principal */}
              <View style={styles.donateHeader}>
                <View style={styles.donateHeartIcon}>
                  <Ionicons name="heart" size={40} color="#E91E63" />
                </View>
                <Text style={styles.donateTitle}>{t('donate.thanks')}</Text>
                <Text style={styles.donateSubtitle}>{t('donate.subtitle')}</Text>
              </View>

              {/* Qué logras con tu apoyo */}
              <View style={styles.donateInfoSection}>
                <Text style={styles.donateInfoTitle}>{t('donate.helpsWith')}</Text>
                <View style={styles.donateInfoItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                  <Text style={styles.donateInfoText}>{t('donate.noAds')}</Text>
                </View>
                <View style={styles.donateInfoItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                  <Text style={styles.donateInfoText}>{t('donate.newFeatures')}</Text>
                </View>
                <View style={styles.donateInfoItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                  <Text style={styles.donateInfoText}>{t('donate.serverCosts')}</Text>
                </View>
                <View style={styles.donateInfoItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                  <Text style={styles.donateInfoText}>{t('donate.freeAccess')}</Text>
                </View>
              </View>

              {/* Opciones de donación */}
              <Text style={styles.donateOptionsTitle}>{t('donate.chooseMethod')}</Text>

              <TouchableOpacity 
                style={[styles.donateOption, { backgroundColor: '#0070BA' }]}
                onPress={() => openDonationLink('paypal')}
              >
                <Ionicons name="logo-paypal" size={24} color="white" />
                <Text style={styles.donateOptionText}>PayPal</Text>
                <Ionicons name="open-outline" size={18} color="white" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.donateOption, { backgroundColor: '#E31C5F' }]}
                onPress={() => openDonationLink('nequi')}
              >
                <Ionicons name="phone-portrait" size={24} color="white" />
                <Text style={styles.donateOptionText}>Nequi</Text>
                <Ionicons name="information-circle-outline" size={18} color="white" />
              </TouchableOpacity>

              {/* Mensaje de gratitud */}
              <View style={styles.gratitudeSection}>
                <Text style={styles.gratitudeText}>{t('donate.gratitude1')}</Text>
                <Text style={styles.gratitudeText}>{t('donate.gratitude2')}</Text>
              </View>

              <View style={styles.modalFooterSpace} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Selector de Idioma */}
      <Modal
        visible={languageModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.languageModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('languages.title')}</Text>
              <TouchableOpacity
                onPress={() => setLanguageModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.languageList}>
              {availableLanguages.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.languageItem,
                    currentLang === lang.code && styles.languageItemActive
                  ]}
                  onPress={() => handleChangeLanguage(lang.code)}
                >
                  <Text style={styles.languageFlag}>{lang.flag}</Text>
                  <Text style={[
                    styles.languageName,
                    currentLang === lang.code && styles.languageNameActive
                  ]}>
                    {lang.name}
                  </Text>
                  {currentLang === lang.code && (
                    <Ionicons name="checkmark-circle" size={24} color="#2196F3" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Aceptar Invitación */}
      <Modal
        visible={invitationModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setInvitationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Aceptar Invitación</Text>
              <TouchableOpacity
                onPress={() => { setInvitationModalVisible(false); setInviteCode(''); }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inviteIconBox}>
                <Ionicons name="mail-open" size={40} color="#2196F3" />
              </View>
              <Text style={styles.inviteDescription}>
                Ingresa el código de 6 dígitos que recibiste por email para unirte como cuidador de un paciente.
              </Text>

              <TextInput
                style={styles.inviteCodeInput}
                value={inviteCode}
                onChangeText={(text) => setInviteCode(text.toUpperCase())}
                placeholder="ABC123"
                placeholderTextColor="#bbb"
                maxLength={6}
                autoCapitalize="characters"
                keyboardType="default"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[styles.inviteAcceptButton, acceptingInvite && { opacity: 0.7 }]}
                onPress={handleAcceptInvitation}
                disabled={acceptingInvite}
              >
                {acceptingInvite ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.inviteAcceptButtonText}>Aceptar</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.inviteCancelButton}
                onPress={() => { setInvitationModalVisible(false); setInviteCode(''); }}
              >
                <Text style={styles.inviteCancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Eliminar Cuenta */}
      <Modal
        visible={deleteModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Eliminar Cuenta</Text>
              <TouchableOpacity
                onPress={() => setDeleteModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.deleteWarningBox}>
                <Ionicons name="warning" size={24} color="#b71c1c" />
                <Text style={styles.deleteWarningTitle}>Esta acción es permanente</Text>
              </View>

              <Text style={styles.deleteInfoText}>
                Al eliminar tu cuenta se borrarán de forma irreversible:
              </Text>
              <Text style={styles.deleteInfoText}>
                • Tu perfil de cuidador{'\n'}
                • Todos los pacientes que creaste{'\n'}
                • Todos los medicamentos asociados{'\n'}
                • Todo el historial de dosis registradas
              </Text>

              <Text style={styles.deletePasswordLabel}>Confirma tu contraseña para continuar:</Text>
              <TextInput
                style={styles.deletePasswordInput}
                placeholder="Contraseña"
                secureTextEntry
                value={deletePassword}
                onChangeText={setDeletePassword}
                placeholderTextColor="#999"
              />

              <TouchableOpacity
                style={styles.deleteConfirmButton}
                onPress={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.deleteConfirmButtonText}>Eliminar mi cuenta</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteCancelButton}
                onPress={() => { setDeleteModalVisible(false); setDeletePassword(''); }}
              >
                <Text style={styles.deleteCancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <View style={styles.modalFooterSpace} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  profileSection: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  profileAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    backgroundColor: 'white',
    marginBottom: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextContainer: {
    flex: 1,
    marginLeft: 14,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  menuSubtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  versionText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 13,
    paddingVertical: 24,
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
    maxHeight: '90%',
  },
  donateModalContent: {
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
  modalBody: {
    padding: 20,
  },
  modalFooterSpace: {
    height: 40,
  },
  // About modal styles
  aboutHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  aboutLogo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  aboutAppName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
  },
  aboutVersion: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  aboutSection: {
    marginBottom: 20,
  },
  aboutSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  aboutSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginLeft: 8,
  },
  aboutText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 8,
  },
  disclaimerSection: {
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  disclaimerText: {
    fontSize: 13,
    color: '#E65100',
    lineHeight: 20,
    marginBottom: 8,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E91E63',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  supportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  // Donate modal styles
  donateHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  donateHeartIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FCE4EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  donateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 8,
  },
  donateSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  donateInfoSection: {
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  donateInfoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 12,
  },
  donateInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  donateInfoText: {
    fontSize: 14,
    color: '#2E7D32',
    marginLeft: 10,
  },
  donateOptionsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 16,
  },
  donateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  donateOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 12,
  },
  gratitudeSection: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  gratitudeText: {
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 22,
    marginBottom: 8,
    textAlign: 'center',
  },
  // Invite acceptance modal styles
  inviteIconBox: {
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  inviteCodeInput: {
    borderWidth: 2,
    borderColor: '#2196F3',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    color: '#1565C0',
    backgroundColor: '#E3F2FD',
    marginBottom: 20,
  },
  inviteAcceptButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  inviteAcceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  inviteCancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  inviteCancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  // Delete account modal styles
  deleteWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  deleteWarningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#b71c1c',
    flex: 1,
  },
  deleteInfoText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 22,
    marginBottom: 12,
  },
  deletePasswordLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginTop: 8,
    marginBottom: 8,
  },
  deletePasswordInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#212121',
    marginBottom: 20,
  },
  deleteConfirmButton: {
    backgroundColor: '#b71c1c',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  deleteCancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  deleteCancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
});
