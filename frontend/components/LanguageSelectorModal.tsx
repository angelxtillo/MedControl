import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { changeLanguage, availableLanguages } from '../i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Se invoca con el código elegido, para que la pantalla refresque su etiqueta. */
  onChanged?: (langCode: string) => void;
}

/**
 * Selector de idioma compartido por Ajustes y por la pantalla de login/registro.
 *
 * Vive en un componente propio porque el login lo necesita ANTES de que exista
 * sesión: quien no habla español tiene que poder cambiar de idioma para leer los
 * Términos que se le piden aceptar al registrarse.
 *
 * Los nombres van en su propio idioma y SIN banderas: una bandera no identifica
 * un idioma (🇪🇸 deja fuera a toda Latinoamérica, que es el público principal de
 * Dosaria; 🇧🇷 deja fuera a Portugal).
 */
export const LanguageSelectorModal: React.FC<Props> = ({ visible, onClose, onChanged }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const currentLang = i18n.language;

  const handleSelect = async (langCode: string) => {
    await changeLanguage(langCode);
    onChanged?.(langCode);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('languages.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.languageList}>
            {availableLanguages.map((lang) => {
              const active = currentLang === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.languageItem, active && styles.languageItemActive]}
                  onPress={() => handleSelect(lang.code)}
                >
                  <Text style={[styles.languageName, active && styles.languageNameActive]}>
                    {lang.name}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={24} color="#2196F3" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // Copiados tal cual del modal que vivía embebido en Ajustes, para que el
  // selector se vea idéntico en las dos pantallas.
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 16,
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
  languageList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 4,
  },
  languageItemActive: {
    backgroundColor: '#E3F2FD',
  },
  languageName: {
    fontSize: 16,
    color: '#212121',
    flex: 1,
  },
  languageNameActive: {
    color: '#2196F3',
    fontWeight: '600',
  },
});
