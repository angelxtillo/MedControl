import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// URL del backend - usar la de producción en Render
const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL 
  || process.env.EXPO_PUBLIC_BACKEND_URL 
  || 'https://medcontrol-api-a7vo.onrender.com';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 60000,
});

// Invoked when an authenticated request returns 401 (token missing/expired/invalid).
// AuthContext registers a handler that clears the in-memory session so the route
// guards redirect to login. Kept as a registry to avoid importing React here.
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

// Add token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout');
    }
    const status = error?.response?.status;
    // Solo 401 = sesión inválida (token ausente/expirado/inválido) → cerrar sesión
    // y redirigir a login. Un 403 significa "autenticado pero sin permiso para
    // ESTA acción" (p. ej. solo el dueño puede gestionar cuidadores): la sesión
    // es válida, así que NO cerramos sesión; dejamos que el error se propague
    // para que la pantalla muestre su mensaje y el usuario permanezca donde está.
    if (status === 401) {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

export default api;
