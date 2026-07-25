import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import es from './locales/es.json';
import en from './locales/en.json';
import pt from './locales/pt.json';
import fr from './locales/fr.json';

const LANGUAGE_KEY = '@medcontrol_language';

const resources = {
  es: { translation: es },
  en: { translation: en },
  pt: { translation: pt },
  fr: { translation: fr },
};

export const SUPPORTED_LANGUAGES = ['es', 'en', 'pt', 'fr'];
export const DEFAULT_LANGUAGE = 'es';

// Idioma del primer arranque: el del sistema si Dosaria lo habla, español si no.
// Solo decide cuando NO hay preferencia guardada; la elección explícita del
// usuario (LANGUAGE_KEY) se aplica después y manda siempre.
// El try/catch cubre el caso en que el módulo nativo no esté disponible: esto
// corre en el ámbito del módulo, así que una excepción aquí impediría arrancar.
const getDeviceLanguage = (): string => {
  try {
    const deviceLang = Localization.getLocales()[0]?.languageCode || DEFAULT_LANGUAGE;
    return SUPPORTED_LANGUAGES.includes(deviceLang) ? deviceLang : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

// Initialize synchronously so t() works from the very first render.
// Resources are bundled locally so init is effectively synchronous.
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

// Load and apply any saved language preference after the first paint.
AsyncStorage.getItem(LANGUAGE_KEY)
  .then((savedLang) => {
    if (savedLang && savedLang !== i18n.language) {
      i18n.changeLanguage(savedLang);
    }
  })
  .catch(() => {});

export const changeLanguage = async (lang: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    await i18n.changeLanguage(lang);
  } catch (error) {
    console.error('Error changing language:', error);
  }
};

export const getCurrentLanguage = (): string => i18n.language;

// Cada idioma con su nombre en sí mismo (endónimo), sin banderas: una bandera no
// identifica un idioma, y las que había excluían justo al público principal de
// Dosaria (🇪🇸 para el español de Latinoamérica, 🇧🇷 para el portugués de Portugal).
export const availableLanguages = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'pt', name: 'Português' },
  { code: 'fr', name: 'Français' },
];

/** Nombre mostrable del idioma; cae al español si el código es desconocido. */
export const getLanguageName = (code: string): string =>
  availableLanguages.find((l) => l.code === code)?.name
  ?? availableLanguages[0].name;

export default i18n;
