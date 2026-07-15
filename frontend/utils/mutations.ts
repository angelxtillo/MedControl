// Señal global de "hubo una mutación": cada escritura exitosa al backend la
// marca, y las pantallas que refetchean al recuperar el foco perdonan su
// throttle anti-spam cuando la última carga es anterior a la última mutación.
// Así, al volver de guardar/eliminar, la lista se actualiza de inmediato sin
// perder el ahorro de requests al navegar entre tabs sin cambios.
let lastMutationAt = 0;

export function markMutation() {
  lastMutationAt = Date.now();
}

export function hasMutatedSince(ts: number) {
  return lastMutationAt > ts;
}
