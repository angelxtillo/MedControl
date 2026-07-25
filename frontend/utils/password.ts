/**
 * Espejo de validate_password() del backend (server.py). El backend sigue siendo
 * la autoridad; validar aquí evita el viaje de ida y vuelta y, sobre todo, permite
 * decir en el idioma del usuario QUÉ requisito falló: los mensajes del backend
 * solo existen en español.
 *
 * Compartido por el registro y el restablecimiento (app/index.tsx) y por el
 * cambio de contraseña (app/(tabs)/settings.tsx): una sola copia de la política.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** Clave i18n del primer requisito incumplido, o null si la contraseña es válida. */
export const passwordErrorKey = (pwd: string): string | null => {
  if (pwd.length < PASSWORD_MIN_LENGTH) return 'auth.passwordTooShort';
  if (pwd.length > PASSWORD_MAX_LENGTH) return 'auth.passwordTooLong';
  if (!/[a-zA-Z]/.test(pwd)) return 'auth.passwordNeedsLetter';
  if (!/[0-9]/.test(pwd)) return 'auth.passwordNeedsNumber';
  return null;
};
