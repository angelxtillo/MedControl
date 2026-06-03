import '../i18n'; // initialize i18n before any component calls t()
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="patient/[id]"
          options={{
            headerShown: true,
            title: 'Detalle del Paciente',
            headerStyle: { backgroundColor: '#2196F3' },
            headerTintColor: 'white',
          }}
        />
        <Stack.Screen
          name="medication/add"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: 'Agregar Medicamento',
            headerStyle: { backgroundColor: '#2196F3' },
            headerTintColor: 'white',
          }}
        />
        <Stack.Screen
          name="medication/add-wizard"
          options={{
            headerShown: true,
            title: 'Nuevo Medicamento',
            headerStyle: { backgroundColor: '#2196F3' },
            headerTintColor: 'white',
          }}
        />
        <Stack.Screen
          name="medication/[id]"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: 'Editar Medicamento',
            headerStyle: { backgroundColor: '#2196F3' },
            headerTintColor: 'white',
          }}
        />
      </Stack>
    </AuthProvider>
  );
}
