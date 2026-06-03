import '../i18n'; // initialize i18n before any component calls t()
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

function AppStack() {
  const { t } = useTranslation();
  return (
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
        name="medication/add"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: t('medications.addMedication'),
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
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppStack />
    </AuthProvider>
  );
}
