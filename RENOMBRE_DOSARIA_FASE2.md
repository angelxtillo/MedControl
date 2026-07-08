# FASE 2 — Cambio de package a `com.angelportillo.dosaria`

Guía paso a paso. **Orden obligatorio**: primero Firebase, luego el `google-services.json`,
luego `app.json`, luego EAS/credenciales, y por último el rebuild. Si cambias `app.json`
antes de tener el nuevo `google-services.json`, el build falla o el push deja de registrarse.

Package **actual**: `com.angelportillo.medcontrol`
Package **nuevo**:   `com.angelportillo.dosaria`

> Contexto que NO cambia: Firebase project id sigue siendo `medcontrol-ccdec`,
> la URL de Render sigue siendo `medcontrol-api-a7vo.onrender.com`, el repo sigue
> siendo `MedControl`. Solo cambia el *package* de la app Android dentro del mismo
> proyecto Firebase.

---

## Paso 1 — Registrar la nueva app Android en Firebase

1. Entra a <https://console.firebase.google.com/> → proyecto **medcontrol-ccdec**.
2. ⚙️ *Configuración del proyecto* → pestaña **General** → sección *Tus apps*.
3. Clic en **Agregar app** → icono **Android**.
4. **Nombre del paquete de Android**: `com.angelportillo.dosaria`  ← exacto, en minúsculas.
5. Sobrenombre (opcional): `Dosaria`.
6. **SHA-1 / SHA-256**: se puede dejar vacío por ahora y añadir después (ver Paso 4b).
   Si EAS gestiona tu keystore, el SHA lo sacas con `eas credentials`.
7. **Registrar app** → **Descargar `google-services.json`**.
   - Ese archivo nuevo contiene AMBAS apps (la vieja `medcontrol` y la nueva `dosaria`),
     así que sirve aunque todavía exista la vieja. Bien.
8. **NO borres** la app Android vieja (`com.angelportillo.medcontrol`) todavía; déjala
   hasta confirmar que la nueva funciona. Luego, si quieres, la eliminas.

## Paso 2 — Reemplazar `google-services.json` en el proyecto

1. Copia el archivo descargado a `frontend/google-services.json`
   (misma ruta que indica `app.json` → `android.googleServicesFile`).
2. Reemplaza el existente. Verifica dentro del JSON que aparezca un bloque con
   `"package_name": "com.angelportillo.dosaria"` bajo `client[].client_info.android_client_info`.

   > Recordatorio de tu historial: el `google-services.json` del cliente es lo que hace
   > que el token de push se registre. La Service Account de FCM V1 en EAS solo ENVÍA.
   > Por eso este archivo es imprescindible y debe tener el package nuevo.

## Paso 3 — Actualizar `app.json`

Cambia estas líneas (deja `slug` y `scheme` como decidas; el mínimo obligatorio es `package`):

```jsonc
"android": {
  "package": "com.angelportillo.dosaria",   // ← obligatorio
  ...
}
```

Opcionales (coherencia, no obligatorios y con efectos):
- `"bundleIdentifier": "com.angelportillo.dosaria"` (iOS) — solo si algún día publicas iOS.
- `"slug"` / `"scheme"`: **NO los cambies** salvo que quieras. El `scheme` (`medcontrol`)
  afecta deep links; cambiarlo no rompe nada crítico hoy, pero es cosmético.

> El `extra.eas.projectId` **no se toca**: el proyecto EAS es el mismo, solo cambia el package.

## Paso 4 — Reconfigurar credenciales en EAS

El package nuevo necesita su propio keystore de firma (Android liga la firma al package).

### 4a. Ver el estado actual
```bash
cd frontend
eas credentials
# Plataforma: Android → selecciona el perfil (production/preview)
```

### 4b. Keystore
Tienes dos caminos:

- **Recomendado (dejar que EAS lo genere):** al hacer el primer build con el package nuevo,
  EAS detecta que no hay keystore para `com.angelportillo.dosaria` y ofrece **generar uno nuevo**.
  Acepta. Como aún NO has subido a Play, no hay problema de "huella que no coincide".

- **Reusar el keystore existente** (`@angelxtillo__medcontrol.jks`, el que ignora `.easignore`):
  posible, pero innecesario si no has publicado. Solo tiene sentido si ya distribuiste APKs
  firmados y quieres que actualicen sin reinstalar. En tu caso (nada en Play) → genera uno nuevo.

Tras generar/asignar el keystore, copia su **SHA-1** y **SHA-256** y pégalos en la app
Android nueva de Firebase (Paso 1.6) si dejaste ese campo vacío. Esto asegura que las APIs
de Google (si algún día usas Auth/Maps) validen la firma.

### 4c. FCM V1 (envío de push)
La Service Account de FCM V1 está a nivel de **proyecto Firebase**, no de package.
Como el proyecto sigue siendo `medcontrol-ccdec`, **no necesitas resubir la Service Account**
a EAS. El envío de push seguirá funcionando. Verifícalo igualmente:
```bash
eas credentials   # Android → FCM V1 debe seguir mostrando la Service Account cargada
```

## Paso 5 — Rebuild y verificación

```bash
cd frontend
npx expo-doctor
eas build --platform android --profile preview
```

Instala el APK en un dispositivo real y comprueba, **en este orden**:

1. La app aparece como **Dosaria** en el launcher.
2. Splash y login muestran **Dosaria** + "Cuida las dosis".
3. Inicia sesión → ve a Ajustes → el token de push se registra
   (revisa en backend/logs que llega el device token, o usa el endpoint de push de prueba).
4. Dispara una notificación de prueba y confirma que llega con título **Dosaria**.
5. Si el token NO se registra: casi siempre es que el `google-services.json` no tiene el
   package nuevo, o `app.json` quedó con el package viejo. Revisa Pasos 2 y 3.

## Paso 6 — Limpieza (opcional, tras confirmar que todo va)

- En Firebase puedes eliminar la app Android vieja `com.angelportillo.medcontrol`.
- Si generaste keystore nuevo, el viejo `@angelxtillo__medcontrol.jks` queda huérfano;
  puedes conservarlo por seguridad o retirarlo del `.easignore` cuando ya no lo uses.

---

## Checklist rápido

- [ ] App Android `com.angelportillo.dosaria` registrada en Firebase (proyecto medcontrol-ccdec)
- [ ] `frontend/google-services.json` reemplazado y contiene el package nuevo
- [ ] `app.json` → `android.package` = `com.angelportillo.dosaria`
- [ ] Keystore para el package nuevo generado/asignado en EAS
- [ ] SHA-1/256 del keystore pegados en la app de Firebase
- [ ] FCM V1 (Service Account) sigue cargada en EAS (no requiere cambio)
- [ ] `expo-doctor` limpio
- [ ] Rebuild EAS instalado en dispositivo real
- [ ] Token de push se registra y llega notificación con título "Dosaria"
