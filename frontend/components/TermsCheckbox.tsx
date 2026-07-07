import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../utils/legal';

interface Props {
  checked: boolean;
  onToggle: () => void;
}

/**
 * Checkbox de aceptación con el texto "He leído y acepto los Términos y
 * Condiciones y la Política de Privacidad", donde ambos nombres son enlaces
 * que abren los documentos publicados. Reutilizado en el registro y en el
 * gate de aceptación de usuarios existentes.
 */
export function TermsCheckbox({ checked, onToggle }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.checkboxHit}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Ionicons name="checkmark" size={16} color="white" />}
        </View>
      </TouchableOpacity>
      <Text style={styles.text}>
        {t('legal.acceptPrefix')}
        <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
          {t('legal.termsLink')}
        </Text>
        {t('legal.acceptMiddle')}
        <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          {t('legal.privacyLink')}
        </Text>
        {t('legal.acceptSuffix')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  checkboxHit: {
    paddingTop: 1,
    paddingRight: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  checkboxChecked: {
    backgroundColor: '#2196F3',
  },
  text: {
    flex: 1,
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  link: {
    color: '#2196F3',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
