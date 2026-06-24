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

// Invoked when an authenticated request returns 401/403 (token missing/expired).
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
    if (status === 401 || status === 403) {
      // Token missing/expired/invalid: drop the stored session and let the
      // registered handler clear app state so the guards redirect to login.
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

export default api;
