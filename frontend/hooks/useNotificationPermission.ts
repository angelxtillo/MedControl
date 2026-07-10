import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';

export interface NotificationPermissionState {
  /** El permiso del sistema está concedido: los push pueden llegar. */
  granted: boolean;
  /** El sistema aún permite volver a pedir el permiso con un diálogo. Cuando es
   *  false y no está concedido, la única vía es abrir los ajustes del SO. */
  canAskAgain: boolean;
  /** Primera lectura aún en curso: no mostrar banner ni estado hasta resolver,
   *  para no parpadear un "denegado" falso. */
  loading: boolean;
}

/**
 * Lee el estado del permiso de notificaciones y lo re-verifica cuando la
 * pantalla que usa el hook recupera el foco y cuando la app vuelve a primer
 * plano (p. ej. tras volver de los ajustes del sistema). Expone `refresh` para
 * releer manualmente tras pedir el permiso.
 */
export function useNotificationPermission() {
  const [state, setState] = useState<NotificationPermissionState>({
    granted: false,
    canAskAgain: true,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      setState({
        granted: perm.granted,
        canAskAgain: perm.canAskAgain ?? true,
        loading: false,
      });
    } catch {
      // Ante un fallo de lectura, no afirmamos "denegado" (evita banner falso).
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { ...state, refresh };
}
