# 🧪 Guía Completa de Pruebas - MedControl

## 📱 Opciones para Probar tu App (SIN pagar $25 USD)

---

## 🎯 OPCIÓN 1: Expo Go (LA MÁS RÁPIDA) ⚡

**✅ Ventajas:**
- Completamente GRATIS
- Sin necesidad de build (0 minutos de espera)
- Cambios en tiempo real
- Funciona en tu teléfono real

**📋 Requisitos:**
- Teléfono Android o iPhone
- Conexión a internet

### Pasos Detallados:

#### 1️⃣ Descarga Expo Go en tu Teléfono

**Android:**
```
1. Abre Google Play Store
2. Busca "Expo Go"
3. Instala (es gratis)
4. Abre la app
```

**iPhone:**
```
1. Abre App Store
2. Busca "Expo Go"
3. Instala (es gratis)
4. Abre la app
```

#### 2️⃣ Obtén el Link/QR de tu App

Tu app YA está corriendo en Emergent. Solo necesitas el link:

**Opción A - Ver en el Dashboard de Emergent:**
- En Emergent, busca el link de preview
- Cópialo

**Opción B - Generar nuevo QR:**
```bash
cd /app/frontend
npx expo start --tunnel
```
Te mostrará un QR y un link como: `exp://xxx.xxx.xxx.xxx:8081`

#### 3️⃣ Conectar tu Teléfono

**Android:**
1. Abre Expo Go
2. Toca "Scan QR code"
3. Escanea el QR que aparece en tu pantalla
4. ¡Listo! La app se abrirá

**iPhone:**
1. Abre la app Cámara (la normal del iPhone)
2. Apunta al QR
3. Toca la notificación "Abrir en Expo Go"
4. ¡Listo!

**Usando Link Directo:**
1. Copia el link `exp://...`
2. Pégalo en un mensaje o email a ti mismo
3. Ábrelo desde tu teléfono
4. Se abrirá automáticamente en Expo Go

---

## 🎯 OPCIÓN 2: APK Instalable (App Real) 📦

**✅ Ventajas:**
- App real e independiente
- No necesita Expo Go
- Funciona offline
- Se instala como app normal

**⏱️ Tiempo:** 20 minutos (build)

### Pasos Detallados:

#### 1️⃣ Instalar EAS CLI (solo una vez)

```bash
npm install -g eas-cli
```

#### 2️⃣ Iniciar Sesión en Expo

```bash
eas login
```

Te pedirá:
- Email
- Contraseña

Si no tienes cuenta:
```bash
eas register
```

#### 3️⃣ Configurar EAS (solo primera vez)

```bash
cd /app/frontend
eas build:configure
```

Preguntas que te hará:
- Platform: Selecciona **Android**
- Generate a new keystore: **Yes**

#### 4️⃣ Generar APK de Prueba

```bash
eas build --platform android --profile preview
```

Verás:
```
✔ Build started
🔗 Build details: https://expo.dev/accounts/[tu-usuario]/builds/[id]
```

#### 5️⃣ Esperar (10-20 minutos)

El build se hace en la nube de Expo.
Puedes:
- Ver el progreso en el link que te dio
- Hacer otras cosas mientras esperas

#### 6️⃣ Descargar APK

Cuando termine:
```
✔ Build finished!
📦 Download: https://expo.dev/artifacts/eas/[id].apk
```

1. Copia ese link
2. Ábrelo en tu teléfono o computadora
3. Descarga el archivo `.apk`

#### 7️⃣ Instalar en tu Teléfono Android

**Método 1 - Descarga directa:**
1. Abre el link de descarga en tu teléfono
2. Descarga el APK
3. Toca el archivo descargado
4. Si te pide "Instalar de fuentes desconocidas":
   - Ve a Configuración → Seguridad
   - Activa "Fuentes desconocidas" o "Instalar apps desconocidas"
5. Instala

**Método 2 - Por USB:**
1. Descarga el APK en tu PC
2. Conecta tu teléfono por USB
3. Copia el APK a tu teléfono
4. En el teléfono, busca el archivo con un explorador
5. Instala

---

## 🎯 OPCIÓN 3: Emulador Android (En tu PC) 💻

**✅ Ventajas:**
- No necesitas teléfono físico
- Puedes grabar videos
- Ideal para debugging

**⏱️ Tiempo setup:** 30 minutos (solo primera vez)

### Pasos Detallados:

#### 1️⃣ Instalar Android Studio

1. Ve a: https://developer.android.com/studio
2. Descarga Android Studio
3. Ejecuta el instalador
4. Sigue el wizard:
   - ✅ Android SDK
   - ✅ Android SDK Platform
   - ✅ Android Virtual Device
5. Instala todo (puede tardar 20 min)

#### 2️⃣ Crear Dispositivo Virtual

1. Abre Android Studio
2. Menú superior → **Tools** → **Device Manager**
3. Click en **"Create Device"** (+)
4. Selecciona un dispositivo:
   - **Recomendado:** Pixel 5 o Pixel 6
   - Click **Next**
5. Descarga System Image:
   - Selecciona **Tiramisu (API 33)** o **UpsideDownCake (API 34)**
   - Click en el ícono de descarga si no está instalada
   - Espera la descarga
   - Click **Next**
6. Configuración:
   - Deja el nombre por defecto
   - Click **Finish**

#### 3️⃣ Iniciar Emulador

1. En Device Manager, verás tu dispositivo
2. Click en el ícono ▶️ (Play)
3. Espera 1-2 minutos a que inicie

#### 4️⃣ Conectar con tu App

```bash
cd /app/frontend
npx expo start
```

Presiona la tecla **`a`** (Android)

Tu app se abrirá automáticamente en el emulador.

---

## 🎯 OPCIÓN 4: Firebase App Distribution (Compartir con Otros) 🔥

**✅ Ventajas:**
- Comparte con hasta 100 personas GRATIS
- Links de descarga automáticos
- Sistema de feedback

### Pasos Detallados:

#### 1️⃣ Crear Proyecto Firebase

1. Ve a: https://console.firebase.google.com/
2. Click **"Add project"**
3. Nombre: "MedControl"
4. Desactiva Google Analytics (opcional)
5. Click **"Create project"**

#### 2️⃣ Agregar App Android

1. En tu proyecto Firebase
2. Click en el ícono de Android
3. Package name: `com.angelportillo.medcontrol`
4. Nickname: "MedControl"
5. Click **"Register app"**
6. Descarga `google-services.json` (opcional por ahora)
7. Click **"Continue"** → **"Continue"** → **"Continue to console"**

#### 3️⃣ Habilitar App Distribution

1. En el menú lateral: **Release & Monitor** → **App Distribution**
2. Click **"Get started"**

#### 4️⃣ Subir tu APK

1. Genera el APK (ver Opción 2)
2. En App Distribution, click **"Releases"**
3. Click **"Upload new release"**
4. Arrastra tu APK
5. Agrega notas de versión: "Primera versión de prueba"
6. Click **"Next"**

#### 5️⃣ Invitar Testers

1. Click **"Testers & Groups"** → **"Add testers"**
2. Ingresa emails separados por comas:
   ```
   amigo1@email.com, amigo2@email.com
   ```
3. Click **"Add testers"**
4. Ellos recibirán un email con el link de descarga

---

## 🎯 OPCIÓN 5: Web Preview (Solo para Ver UI) 🌐

**⚠️ Limitaciones:**
- No todas las funciones móviles funcionan
- Solo para ver diseño
- Notificaciones no funcionan

### Uso Rápido:

```bash
cd /app/frontend
npx expo start --web
```

Abre: http://localhost:3000

---

## 📊 Comparación de Opciones

| Opción | Tiempo Setup | Costo | Funcionalidad | Mejor Para |
|--------|-------------|-------|---------------|------------|
| **Expo Go** | 5 min | GRATIS | 95% | Testing rápido |
| **APK** | 20 min | GRATIS | 100% | Testing real |
| **Emulador** | 30 min | GRATIS | 100% | Development |
| **Firebase** | 15 min | GRATIS | 100% | Compartir |
| **Web** | 1 min | GRATIS | 60% | UI Preview |

---

## 🏆 MI RECOMENDACIÓN

### Para ti (primera prueba):
1. **EMPIEZA CON Expo Go** (5 minutos)
2. Si te gusta, genera el **APK** (20 minutos)
3. Comparte con amigos/familia usando **Firebase**

### Orden sugerido:
1. 📱 Expo Go → Prueba rápida
2. 📦 APK → Instalación real
3. 👥 Firebase → Feedback de usuarios
4. 💰 Play Store → Cuando estés listo ($25)

---

## 🐛 Solución de Problemas

### Expo Go no se conecta:
1. Verifica que tu teléfono y PC estén en la misma red WiFi
2. Intenta con el comando:
   ```bash
   npx expo start --tunnel
   ```
3. Usa el link `exp://` directamente

### APK no instala:
1. Ve a: Configuración → Seguridad
2. Activa "Fuentes desconocidas"
3. O busca "Instalar apps desconocidas" y actívalo para tu navegador

### Emulador muy lento:
1. En Android Studio: Tools → AVD Manager
2. Click en ✏️ del dispositivo
3. Show Advanced Settings
4. RAM: Aumenta a 4GB
5. VM Heap: 512 MB

---

## 💡 Tips Importantes

1. **Expo Go** es perfecto para desarrollo diario
2. **APK** te da la experiencia real del usuario
3. **Firebase** es ideal para beta testing con amigos
4. Guarda el **link del APK** que genera EAS (lo puedes reusar)

---

## 🎓 Videos Tutoriales Recomendados

- Expo Go: https://www.youtube.com/watch?v=0-S5a0eXPoc
- EAS Build: https://www.youtube.com/watch?v=v1qzKv8Eg1M
- Android Emulator: https://www.youtube.com/watch?v=5OczvXRx3Xo

---

## 📞 Siguiente Paso

Una vez que hayas probado con cualquiera de estas opciones y estés satisfecho:

1. Consigue los $25 USD para Play Console
2. Genera el **AAB de producción**:
   ```bash
   eas build --platform android --profile production
   ```
3. Sube a Play Store

¡Tu app está LISTA para producción! 🚀
