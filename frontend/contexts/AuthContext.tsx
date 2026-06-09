import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
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
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('token');
      const storedUser = await AsyncStorage.getItem('user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
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
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Error al iniciar sesión');
    }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        name,
        email,
        password,
      }, { timeout: 60000 });
      const { token: newToken, user: newUser } = response.data;
      await AsyncStorage.setItem('token', newToken);
      await AsyncStorage.setItem('user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Error al registrarse');
    }
  };

  const logout = async () => {
    if (user?.id) {
      await AsyncStorage.removeItem(`dashboard:${user.id}`);
    }
    await AsyncStorage.removeItem('lastReconcile');
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
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      setToken(null);
      setUser(null);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Error al eliminar la cuenta');
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, deleteAccount, loading }}>
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
