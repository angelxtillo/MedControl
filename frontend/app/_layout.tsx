import '../i18n'; // initialize i18n before any component calls t()
import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { TermsGate } from '../components/TermsGate';

// Route groups that require a valid session. Public routes (index/login,
// onboarding) are intentionally excluded so the guard never interrupts them.
const PROTECTED_ROOTS = ['(tabs)', 'patient', 'medication'];

function AppStack() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inProtectedRoute = PROTECTED_ROOTS.includes(segments[0] as string);
    if (!user && inProtectedRoute) {
      router.replace('/');
    }
  }, [user, loading, segments]);
  return (
    <>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="patient/[id]"
        options={{
          headerShown: true,
          title: t('patients.patientDetail'),
          headerStyle: { backgroundColor: '#2196F3' },
          headerTintColor: 'white',
        }}
      />
      <Stack.Screen
        name="medication/add-wizard"
        options={{
          headerShown: true,
          title: t('medications.newMedication'),
          headerStyle: { backgroundColor: '#2196F3' },
          headerTintColor: 'white',
        }}
      />
      <Stack.Screen
        name="medication/[id]"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: t('medications.editMedication'),
          headerStyle: { backgroundColor: '#2196F3' },
          headerTintColor: 'white',
        }}
      />
    </Stack>
    {/* Gate de aceptación: capa bloqueante para usuarios con sesión que aún no
        han aceptado los términos. Se renderiza sobre cualquier ruta. */}
    <TermsGate />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppStack />
    </AuthProvider>
  );
}
