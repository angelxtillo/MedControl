# 🚀 Guía de Deployment para MedControl

## Paso 1: Desplegar Backend en Render (GRATIS)

### 1.1 Crear cuenta en Render
1. Ve a https://render.com
2. Regístrate con GitHub o email

### 1.2 Crear Web Service
1. Click en "New +" → "Web Service"
2. Conecta tu repositorio de GitHub
3. Configura:
   - **Name**: `medcontrol-api`
   - **Region**: Oregon (Free tier)
   - **Branch**: main
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`

### 1.3 Variables de Entorno en Render
Agrega estas variables en "Environment":

| Variable | Valor |
|----------|-------|
| `MONGO_URL` | Tu URL de MongoDB Atlas |
| `DB_NAME` | `medcontrol_prod` |
| `JWT_SECRET` | (genera uno seguro) |
| `EMERGENT_LLM_KEY` | Tu key de Emergent |

### 1.4 MongoDB Atlas (GRATIS)
1. Ve a https://www.mongodb.com/atlas
2. Crea cluster FREE (M0)
3. Crea usuario de base de datos
4. Whitelist IP: 0.0.0.0/0 (para Render)
5. Copia connection string

---

## Paso 2: Actualizar Frontend

Cuando tengas la URL de Render (ej: `https://medcontrol-api.onrender.com`):

1. Edita `/app/frontend/.env`:
```
EXPO_PUBLIC_BACKEND_URL=https://medcontrol-api.onrender.com
```

2. Para EAS, configura en Expo Dashboard → Secrets:
   - `EXPO_PUBLIC_BACKEND_URL` = tu URL de Render

---

## Paso 3: Build de Producción

### Preview APK (para testing):
```bash
cd /app/frontend
eas build --platform android --profile preview
```

### Production AAB (para Play Store):
```bash
cd /app/frontend
eas build --platform android --profile production
```

---

## Paso 4: Subir a Play Store

1. Ve a https://play.google.com/console
2. Crea nueva app
3. Sube el archivo `.aab`
4. Completa:
   - Store listing (descripción, screenshots)
   - Privacy Policy URL
   - Content rating
   - Target audience

### URLs requeridas:
- **Privacy Policy**: Súbela a GitHub Pages o incluye en la app
- **Screenshots**: Mínimo 2 por cada tamaño

---

## Checklist Final

- [ ] Backend en Render funcionando
- [ ] MongoDB Atlas configurado
- [ ] Frontend apuntando a URL de producción
- [ ] Build AAB generado
- [ ] Privacy Policy publicada
- [ ] Screenshots preparados
- [ ] Play Console configurado

---

## Comandos Útiles

```bash
# Ver estado de builds
eas build:list

# Ver logs de build
eas build:view

# Incrementar versionCode (antes de cada update)
# Editar app.json: versionCode: 2, 3, 4...

# Submit a Play Store (después de configurar)
eas submit --platform android
```

---

## Notas para Tesis

Este proyecto demuestra:
1. **Desarrollo móvil multiplataforma** con React Native/Expo
2. **Backend RESTful** con FastAPI y autenticación JWT
3. **Base de datos NoSQL** con MongoDB
4. **Integración de IA** con OpenAI para asistente de medicamentos
5. **Notificaciones locales** para recordatorios
6. **UX/UI** orientado a usuarios no técnicos (cuidadores)
7. **Deployment** en servicios cloud (Render, EAS)
8. **Cumplimiento** de políticas de Play Store

### Arquitectura:
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Expo App      │────▶│   FastAPI       │────▶│   MongoDB       │
│  (React Native) │     │   Backend       │     │   Atlas         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Local Notifs    │     │   OpenAI API    │
│ (expo-notifs)   │     │ (AI Assistant)  │
└─────────────────┘     └─────────────────┘
```
