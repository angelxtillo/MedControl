import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  
  // Calcular padding inferior para evitar superposición con botones del sistema
  const bottomPadding = Platform.OS === 'android' ? Math.max(insets.bottom, 20) + 10 : insets.bottom + 10;
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2196F3',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 0,
          borderTopColor: '#e0e0e0',
          height: 65 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          elevation: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginBottom: 4,
        },
        headerStyle: {
          backgroundColor: '#2196F3',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerTintColor: 'white',
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          title: t('tabs.patients'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('tabs.history'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-assistant"
        options={{
          title: t('tabs.assistant'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.more'),
          headerTitle: t('settings.title'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
