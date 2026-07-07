import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import { setUnauthorizedHandler } from '../utils/api';
import {
  cancelAllScheduledNotifications,
  registerPushToken,
  unregisterPushToken,
  clearLocalPushToken,
} from '../utils/notifications';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface User {
  id: string;
  name: string;
  email: string;
  // null = usuario antiguo que aún no ha aceptado los términos (gate pendiente).
  accepted_terms_at?: string | null;
  terms_version?: string | null;
}

interface RegisterResult {
  requiresVerification: boolean;
  email?: string;
  codeExpiresInSeconds?: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, acceptedTerms: boolean) => Promise<RegisterResult>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<number | undefined>;
  acceptTerms: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Migración a push server-side: versiones anteriores programaban
    // notificaciones LOCALES de dosis (y re-avisos +10/+20). Al arrancar se
    // cancelan todas para que no queden zombis sonando junto al push del
    // servidor. Idempotente: en builds nuevos no hay nada programado.
    cancelAllScheduledNotifications().catch(() => {});
    loadStoredAuth();
  }, []);

  // When any authenticated request returns 401/403, clear the in-memory session.
  // Storage is already cleared by the api interceptor; the route guards then
  // redirect to login automatically once `user` becomes null.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Sesión expirada/invalidada: cancelar notificaciones y forzar re-sync limpio
      // en el próximo login para que no se filtren a otra cuenta.
      cancelAllScheduledNotifications().catch((e) =>
        console.warn('No se pudieron cancelar las notificaciones al expirar la sesión:', e),
      );
      // Sesión inválida: no podemos llamar al backend, pero olvidamos el token
      // local para que el próximo login lo re-registre con la cuenta correcta.
      clearLocalPushToken().catch(() => {});
      setToken(null);
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('token');
      const storedUser = await AsyncStorage.getItem('user');
      if (storedToken && storedUser) {
        try {
          // Validar la sesión y, de paso, refrescar el estado de aceptación de
          // términos: los usuarios antiguos tienen en almacenamiento un `user`
          // sin accepted_terms_at, y el gate necesita ese dato para decidir si
          // debe mostrarse. /auth/me devuelve el usuario actualizado.
          const meRes = await axios.get(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
            timeout: 60000,
          });
          const freshUser = meRes.data?.user ?? JSON.parse(storedUser);
          await AsyncStorage.setItem('user', JSON.stringify(freshUser));
          setToken(storedToken);
          setUser(freshUser);
          // Sesión válida al arrancar: registrar/actualizar el push token.
          registerPushToken().catch(() => {});
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            await AsyncStorage.removeItem('token');
            await AsyncStorage.removeItem('user');
          } else {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
          }
        }
      }
    } catch (error) {
      console.error('Error loading auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password,
      }, { timeout: 60000 });
      const { token: newToken, user: newUser } = response.data;
      await AsyncStorage.setItem('token', newToken);
      await AsyncStorage.setItem('user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
      // Registrar el push token de este dispositivo para la cuenta que entró.
      registerPushToken().catch(() => {});
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Error al iniciar sesión');
    }
  };

  const register = async (name: string, email: string, password: string, acceptedTerms: boolean): Promise<RegisterResult> => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        name,
        email: normalizedEmail,
        password,
        accepted_terms: acceptedTerms,
      }, { timeout: 60000 });

      if (response.data.requires_verification) {
        return {
          requiresVerification: true,
          email: normalizedEmail,
          codeExpiresInSeconds: response.data.code_expires_in_seconds,
        };
      }

      const { token: newToken, user: newUser } = response.data;
      await AsyncStorage.setItem('token', newToken);
      await AsyncStorage.setItem('user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
      // Auto-login sin verificación (si el backend lo permitiera): registrar token.
      registerPushToken().catch(() => {});
      return { requiresVerification: false };
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Error al registrarse');
    }
  };

  const verifyEmail = async (email: string, code: string) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/verify-email`, {
        email: email.trim().toLowerCase(),
        code: code.trim().toUpperCase(),
      }, { timeout: 60000 });
      const { token: newToken, user: newUser } = response.data;
      await AsyncStorage.setItem('token', newToken);
      await AsyncStorage.setItem('user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
      // Verificación exitosa = sesión nueva: registrar el push token.
      registerPushToken().catch(() => {});
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Código inválido');
    }
  };

  const resendVerification = async (email: string): Promise<number | undefined> => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/resend-verification`, {
        email: email.trim().toLowerCase(),
      }, { timeout: 60000 });
      return response.data?.code_expires_in_seconds;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'No se pudo reenviar el código');
    }
  };

  const acceptTerms = async () => {
    // Usuario existente que acepta desde el gate. Persiste en backend y
    // actualiza el user en memoria y almacenamiento para que el gate desaparezca.
    const currentToken = token || (await AsyncStorage.getItem('token'));
    const response = await axios.post(
      `${API_URL}/api/auth/accept-terms`,
      {},
      { headers: { Authorization: `Bearer ${currentToken}` }, timeout: 60000 },
    );
    setUser((prev) => {
      const next = prev
        ? { ...prev, accepted_terms_at: response.data.accepted_terms_at, terms_version: response.data.terms_version }
        : prev;
      if (next) AsyncStorage.setItem('user', JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const logout = async () => {
    // Cancelar las notificaciones locales antes de limpiar la sesión para que los
    // recordatorios de esta cuenta no sigan sonando tras salir / entrar a otra.
    try {
      await cancelAllScheduledNotifications();
    } catch (e) {
      console.warn('No se pudieron cancelar las notificaciones al cerrar sesión:', e);
    }
    // Dar de baja el push token (la sesión aún es válida) para no recibir push
    // de esta cuenta en este dispositivo tras salir.
    await unregisterPushToken();
    if (user?.id) {
      await AsyncStorage.removeItem(`dashboard:${user.id}`);
    }
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const deleteAccount = async (password: string) => {
    const currentToken = token || (await AsyncStorage.getItem('token'));
    try {
      await axios.delete(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${currentToken}` },
        data: { password },
        timeout: 60000,
      });
      try {
        await cancelAllScheduledNotifications();
      } catch (e) {
        console.warn('No se pudieron cancelar las notificaciones al eliminar la cuenta:', e);
      }
      // El JWT sigue siendo válido un momento: dar de baja el token del backend.
      await unregisterPushToken();
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      setToken(null);
      setUser(null);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Error al eliminar la cuenta');
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, verifyEmail, resendVerification, acceptTerms, logout, deleteAccount, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
