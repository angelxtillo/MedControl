/**
 * Extracción del mensaje de error de una respuesta del backend.
 *
 * FastAPI usa `detail` con dos formas distintas:
 *  - HTTPException  -> detail es un string:  {"detail": "Contraseña incorrecta"}
 *  - 422 de Pydantic -> detail es un array:  {"detail": [{"loc": [...], "msg": "..."}]}
 *
 * Pasar el array directo a `new Error(...)` o a `Alert.alert(...)` lo convierte
 * en "[object Object]", que fue el bug original en el registro. Cualquier
 * endpoint con validación de Pydantic puede devolver la forma de array.
 */

// Pydantic v2 antepone "Value error, " al mensaje de un ValueError lanzado
// dentro de un @field_validator. El texto útil es lo que viene después.
const PYDANTIC_VALUE_ERROR_PREFIX = /^Value error,\s*/i;

type ValidationItem = { msg?: unknown; loc?: unknown };

const cleanMessage = (msg: string): string =>
  msg.replace(PYDANTIC_VALUE_ERROR_PREFIX, '').trim();

const itemToMessage = (item: unknown): string | null => {
  if (typeof item === 'string') return cleanMessage(item);
  if (item && typeof item === 'object') {
    const msg = (item as ValidationItem).msg;
    if (typeof msg === 'string' && msg.trim()) return cleanMessage(msg);
  }
  return null;
};

/**
 * Devuelve siempre un string mostrable. `fallback` se usa cuando el backend no
 * mandó nada legible (error de red, timeout, 500 sin cuerpo, detail vacío).
 */
export const getApiErrorMessage = (error: any, fallback: string): string => {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return cleanMessage(detail);
  }

  if (Array.isArray(detail)) {
    // Varios campos pueden fallar a la vez; se muestran todos, sin repetir.
    const messages = detail
      .map(itemToMessage)
      .filter((m): m is string => !!m)
      .filter((m, i, all) => all.indexOf(m) === i);
    if (messages.length) return messages.join('\n');
  }

  const single = itemToMessage(detail);
  if (single) return single;

  // Un Error propio (p. ej. relanzado por AuthContext) sí trae texto útil; el
  // `message` de axios ("Request failed with status code 422") no lo trae.
  if (!error?.response && !error?.isAxiosError && typeof error?.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
};
