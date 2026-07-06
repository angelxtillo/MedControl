import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

interface Options {
  /** Tiempo mínimo en background para disparar el refresco (default 60s). */
  minBackgroundMs?: number;
}

/**
 * Dispara `onRefresh` cuando la app vuelve de background a primer plano,
 * solo si la pantalla que usa el hook está enfocada y se cumple al menos
 * una de estas condiciones:
 *   - la app estuvo en background más de `minBackgroundMs` (evita spam de
 *     requests por minimizados rápidos), o
 *   - cambió el día calendario mientras estaba en background (cruce de
 *     medianoche: el "hoy" del dashboard quedaría obsoleto aunque el
 *     background haya sido corto).
 *
 * El callback va en un ref para que el listener no se re-suscriba en cada
 * render y siempre invoque la versión más reciente.
 */
export function useRefreshOnResume(onRefresh: () => void, options: Options = {}) {
  const { minBackgroundMs = 60_000 } = options;
  const isFocused = useIsFocused();

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;

  const backgroundedAt = useRef<number | null>(null);
  const backgroundedDay = useRef<string | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        // 'inactive' (iOS) puede preceder a 'background'; conservar la primera marca.
        if (backgroundedAt.current === null) {
          backgroundedAt.current = Date.now();
          backgroundedDay.current = new Date().toDateString();
        }
        return;
      }
      if (state !== 'active' || backgroundedAt.current === null) return;

      const elapsed = Date.now() - backgroundedAt.current;
      const dayChanged = backgroundedDay.current !== new Date().toDateString();
      backgroundedAt.current = null;
      backgroundedDay.current = null;

      if (isFocusedRef.current && (elapsed >= minBackgroundMs || dayChanged)) {
        onRefreshRef.current();
      }
    });
    return () => sub.remove();
  }, [minBackgroundMs]);
}
