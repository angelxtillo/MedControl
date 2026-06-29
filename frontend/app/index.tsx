import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const ONBOARDING_KEY = '@medcontrol_onboarding_complete';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// El botón "Reenviar" se rehabilita 60s después de cada envío.
const RESEND_COOLDOWN_MS = 60 * 1000;
// Fuente de verdad de la expiración: el backend devuelve code_expires_in_seconds.
// Este valor solo es un fallback por si una respuesta antigua no lo trae; debe
// coincidir con EMAIL_CODE_TTL_MINUTES del backend (10 min). El contador se
// calcula contra un timestamp absoluto para no pausarse en segundo plano.
const DEFAULT_CODE_TTL_SECONDS = 10 * 60;

function LoadingLogo() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.iconCircle, animatedStyle]}>
      <Ionicons name="medical" size={48} color="#2196F3" />
    </Animated.View>
  );
}

export default function Index() {
  const { t } = useTranslation();
  const { login, register, verifyEmail, resendVerification, user, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // Estado para verificación de email
  const [showVerification, setShowVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  // Timestamps absolutos (epoch ms): la fuente de verdad del tiempo restante.
  // El tick solo refresca `nowTs` para re-renderizar; el tiempo real se deriva
  // de estos timestamps, así que minimizar la app no "pausa" la cuenta.
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  useEffect(() => {
    if (!authLoading && !checkingOnboarding && user) {
      router.replace('/(tabs)/home');
    }
  }, [user, authLoading, checkingOnboarding]);

  const checkOnboardingStatus = async () => {
    try {
      const onboardingComplete = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (!onboardingComplete) {
        // Primera vez - mostrar onboarding
        router.replace('/onboarding');
        return;
      }
    } catch (error) {
      console.error('Error checking onboarding:', error);
    } finally {
      setCheckingOnboarding(false);
    }
  };

  // Mientras la pantalla de verificación está activa, refrescamos `nowTs` cada
  // segundo y, sobre todo, al volver de segundo plano (AppState 'active'), para
  // recalcular el tiempo restante REAL inmediatamente al regresar de Gmail.
  useEffect(() => {
    if (!showVerification) return;
    const update = () => setNowTs(Date.now());
    update();
    tickRef.current = setInterval(update, 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      sub.remove();
    };
  }, [showVerification]);

  // Llamar cada vez que el backend emite un código nuevo (registro o reenvío):
  // arma el cooldown del botón y el contador de expiración real, usando la
  // duración que indica el backend (alineada: backend y frontend, mismo valor).
  const onCodeIssued = (expiresInSeconds?: number) => {
    const ttl = (expiresInSeconds && expiresInSeconds > 0)
      ? expiresInSeconds
      : DEFAULT_CODE_TTL_SECONDS;
    const now = Date.now();
    setNowTs(now);
    setResendAvailableAt(now + RESEND_COOLDOWN_MS);
    setCodeExpiresAt(now + ttl * 1000);
  };

  // Para entradas donde NO emitimos un código nuevo (p. ej. login con email sin
  // verificar): solo armamos el cooldown del botón, sin contador de expiración
  // porque no sabemos cuándo expira el código pendiente.
  const armResendCooldownOnly = () => {
    const now = Date.now();
    setNowTs(now);
    setResendAvailableAt(now + RESEND_COOLDOWN_MS);
    setCodeExpiresAt(null);
  };

  const validateEmail = (emailToCheck: string): boolean => {
    return EMAIL_REGEX.test(emailToCheck.trim());
  };

  const handleSubmit = async () => {
    if (!email || !password || (!isLogin && !name)) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!validateEmail(trimmedEmail)) {
      Alert.alert(t('common.error'), t('auth.invalidEmail'));
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(trimmedEmail, password);
        router.replace('/(tabs)/home');
      } else {
        const result = await register(name, trimmedEmail, password);
        if (result.requiresVerification && result.email) {
          setVerificationEmail(result.email);
          setShowVerification(true);
          onCodeIssued(result.codeExpiresInSeconds);
        } else {
          router.replace('/(tabs)/home');
        }
      }
    } catch (error: any) {
      if (error.message?.includes('no verificado') || error.message?.includes('Email no verificado')) {
        setVerificationEmail(trimmedEmail);
        setShowVerification(true);
        armResendCooldownOnly();
      } else {
        Alert.alert(t('common.error'), error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      Alert.alert(t('common.error'), t('auth.invalidCode'));
      return;
    }

    setLoading(true);
    try {
      await verifyEmail(verificationEmail, verificationCode);
      router.replace('/(tabs)/home');
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendAvailableAt != null && Date.now() < resendAvailableAt) return;

    setLoading(true);
    try {
      const expiresInSeconds = await resendVerification(verificationEmail);
      Alert.alert(t('common.success'), t('auth.codeSent'));
      onCodeIssued(expiresInSeconds);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    } finally {
      setLoading(false);
    }
  };

  // Mostrar loading mientras verifica onboarding
  if (checkingOnboarding || authLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <LoadingLogo />
          <Text style={styles.loadingTitle}>MedControl</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Pantalla de verificación de email
  if (showVerification) {
    // Tiempo restante derivado de timestamps absolutos contra `nowTs`.
    const resendRemainingMs = resendAvailableAt ? Math.max(0, resendAvailableAt - nowTs) : 0;
    const resendDisabled = resendRemainingMs > 0;
    const resendCountdown = Math.ceil(resendRemainingMs / 1000);

    const expiryRemainingMs = codeExpiresAt ? Math.max(0, codeExpiresAt - nowTs) : 0;
    const codeExpired = codeExpiresAt != null && expiryRemainingMs <= 0;
    const expiryMinutes = Math.floor(expiryRemainingMs / 60000);
    const expirySeconds = Math.floor((expiryRemainingMs % 60000) / 1000);
    const expiryLabel = `${expiryMinutes}:${expirySeconds.toString().padStart(2, '0')}`;

    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Ionicons name="mail" size={48} color="#2196F3" />
              </View>
              <Text style={styles.title}>{t('auth.verifyEmailTitle')}</Text>
              <Text style={styles.subtitle}>{t('auth.verifyEmailSubtitle')}</Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.verificationInfo}>
                {t('auth.verifyEmailInfo', { email: verificationEmail })}
              </Text>

              {codeExpiresAt != null && (
                <Text style={[styles.expiryInfo, codeExpired && styles.expiryInfoExpired]}>
                  {codeExpired
                    ? t('auth.codeExpiredResend')
                    : t('auth.codeExpiresIn', { time: expiryLabel })}
                </Text>
              )}

              <View style={styles.inputContainer}>
                <Ionicons name="key-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="ABC123"
                  placeholderTextColor="#999"
                  value={verificationCode}
                  onChangeText={(text) => setVerificationCode(text.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={6}
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleVerifyCode}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? t('auth.processing') : t('auth.verifyButton')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resendButton, resendDisabled && styles.resendButtonDisabled]}
                onPress={handleResendCode}
                disabled={resendDisabled || loading}
              >
                <Text style={[styles.resendText, resendDisabled && styles.resendTextDisabled]}>
                  {resendDisabled
                    ? t('auth.resendIn', { seconds: resendCountdown })
                    : t('auth.resendCode')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchButton}
                onPress={() => {
                  setShowVerification(false);
                  setVerificationCode('');
                }}
              >
                <Text style={styles.switchText}>{t('auth.backToLogin')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="medical" size={48} color="#2196F3" />
            </View>
            <Text style={styles.title}>MedControl</Text>
            <Text style={styles.subtitle}>
              {isLogin ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}
            </Text>
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.namePlaceholder')}
                  placeholderTextColor="#999"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.passwordPlaceholder')}
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(v => !v)}
                style={styles.eyeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>

            {!isLogin && (
              <Text style={styles.passwordHint}>{t('auth.passwordHint')}</Text>
            )}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? t('auth.processing') : (isLogin ? t('auth.login') : t('auth.register'))}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => setIsLogin(!isLogin)}
            >
              <Text style={styles.switchText}>
                {isLogin ? `${t('auth.noAccount')} ${t('auth.register')}` : `${t('auth.hasAccount')} ${t('auth.login')}`}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  inputIcon: {
    marginRight: 12,
  },
  eyeButton: {
    padding: 8,
    marginRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: '#212121',
  },
  button: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonDisabled: {
    backgroundColor: '#BBDEFB',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  loadingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#212121',
  },
  verificationInfo: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  expiryInfo: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  expiryInfoExpired: {
    color: '#E53935',
    fontWeight: '600',
  },
  codeInput: {
    letterSpacing: 4,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  resendButton: {
    marginTop: 16,
    alignItems: 'center',
    padding: 12,
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '500',
  },
  resendTextDisabled: {
    color: '#999',
  },
  passwordHint: {
    fontSize: 12,
    color: '#999',
    marginTop: -8,
    marginBottom: 16,
    marginLeft: 4,
  },
});
