from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager

MISSED_GRACE_MINUTES = 30  # margen antes de marcar una dosis como "perdida"
from passlib.context import CryptContext
from jose import JWTError, jwt
from bson import ObjectId
import time
from collections import defaultdict
import sendgrid
from sendgrid.helpers.mail import Mail
import random
import string

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# JWT_SECRET sin fallback — error explícito si no está configurado
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required")

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
ALGORITHM = "HS256"
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
SENDGRID_FROM_EMAIL = os.environ.get("SENDGRID_FROM_EMAIL", "")

# Rate limiting (simple in-memory)
rate_limit_store = defaultdict(list)
RATE_LIMIT_REQUESTS = 100  # requests per window
RATE_LIMIT_WINDOW = 60  # seconds

# Rate limiting específico para auth
auth_rate_limit_store = defaultdict(list)
AUTH_RATE_LIMIT_REQUESTS = 5  # intentos de login/register
AUTH_RATE_LIMIT_WINDOW = 900  # 15 minutos

# Rate limiting para resend/invite (3 por hora por usuario)
user_action_rate_limit_store = defaultdict(list)
USER_ACTION_RATE_LIMIT = 3
USER_ACTION_WINDOW = 3600  # 1 hora

def get_client_ip(request: Request) -> str:
    """Obtener IP real del cliente considerando proxies (Render)"""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def check_rate_limit(ip: str, limit: int = RATE_LIMIT_REQUESTS, window: int = RATE_LIMIT_WINDOW) -> bool:
    """Rate limiting genérico por IP"""
    now = time.time()
    rate_limit_store[ip] = [t for t in rate_limit_store[ip] if now - t < window]
    if len(rate_limit_store[ip]) >= limit:
        return False
    rate_limit_store[ip].append(now)
    return True

def check_auth_rate_limit(ip: str) -> bool:
    """Rate limiting estricto para auth endpoints (5 por 15 min)"""
    now = time.time()
    auth_rate_limit_store[ip] = [t for t in auth_rate_limit_store[ip] if now - t < AUTH_RATE_LIMIT_WINDOW]
    if len(auth_rate_limit_store[ip]) >= AUTH_RATE_LIMIT_REQUESTS:
        return False
    auth_rate_limit_store[ip].append(now)
    return True

def check_user_action_rate_limit(user_id: str, action: str) -> bool:
    """Rate limiting por usuario para acciones sensibles (3 por hora)"""
    key = f"{user_id}:{action}"
    now = time.time()
    user_action_rate_limit_store[key] = [t for t in user_action_rate_limit_store[key] if now - t < USER_ACTION_WINDOW]
    if len(user_action_rate_limit_store[key]) >= USER_ACTION_RATE_LIMIT:
        return False
    user_action_rate_limit_store[key].append(now)
    return True

# Lifespan handler para inicialización y cierre
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: crear índices
    try:
        # Índice único en caregivers.email
        await db.caregivers.create_index("email", unique=True)
        # Índices compuestos para rendimiento
        await db.medication_logs.create_index([("patient_id", 1), ("scheduled_datetime", -1)])
        await db.medications.create_index("patient_id")
        # Índice único para evitar logs duplicados (ejecutar cleanup_duplicate_logs.py primero)
        try:
            await db.medication_logs.create_index(
                [("medication_id", 1), ("scheduled_datetime", 1)],
                unique=True,
                name="medication_logs_unique_dose"
            )
        except Exception as idx_err:
            logger.warning(f"Could not create unique index on medication_logs: {idx_err}")
        # TTL para verificaciones de email (15 min)
        await db.email_verifications.create_index("expires_at", expireAfterSeconds=0)
        # TTL para invitaciones (48 horas)
        await db.invitations.create_index("expires_at", expireAfterSeconds=0)
        logging.info("MongoDB indexes created successfully")
    except Exception as e:
        logging.warning(f"Index creation warning: {e}")
    yield
    # Shutdown
    client.close()

# Create the main app
app = FastAPI(
    title="MedControl API",
    description="API para gestión de medicamentos y pacientes",
    version="1.0.0",
    lifespan=lifespan
)
api_router = APIRouter(prefix="/api")

# ============= PASSWORD VALIDATION =============
def validate_password(password: str) -> str:
    """Validar política de contraseñas: 8-72 chars, al menos 1 letra y 1 número"""
    if len(password) < 8:
        raise ValueError("La contraseña debe tener al menos 8 caracteres")
    if len(password) > 72:
        raise ValueError("La contraseña no puede exceder 72 caracteres")
    if not re.search(r'[a-zA-Z]', password):
        raise ValueError("La contraseña debe contener al menos una letra")
    if not re.search(r'[0-9]', password):
        raise ValueError("La contraseña debe contener al menos un número")
    return password

# ============= MODELS =============
class CaregiverCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str

    @field_validator('password')
    @classmethod
    def password_policy(cls, v):
        return validate_password(v)

class CaregiverLogin(BaseModel):
    email: EmailStr
    password: str

class DeleteAccountRequest(BaseModel):
    password: str

class Caregiver(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

class PatientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    age: Optional[int] = Field(None, ge=0, le=150)
    photo: Optional[str] = Field(None, max_length=2_800_000)  # ~2 MB base64
    notes: Optional[str] = Field(None, max_length=1000)

class PatientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    age: Optional[int] = Field(None, ge=0, le=150)
    photo: Optional[str] = Field(None, max_length=2_800_000)
    notes: Optional[str] = Field(None, max_length=1000)

class Patient(BaseModel):
    id: str
    name: str
    age: Optional[int] = None
    photo: Optional[str] = None
    notes: Optional[str] = None
    caregiver_ids: List[str] = []
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

# Multi-caregiver models
class InviteCaregiverRequest(BaseModel):
    patient_id: str
    email: str

class CaregiverInvitation(BaseModel):
    patient_id: str
    invitee_email: str

class AcceptInvitation(BaseModel):
    code: str

class RemoveCaregiverRequest(BaseModel):
    patient_id: str
    caregiver_id: str

class CaregiverInfo(BaseModel):
    id: str
    name: str
    email: str
    is_owner: bool = False
    created_at: datetime

# Validador de formato HH:MM
TIME_PATTERN = re.compile(r'^([01]?[0-9]|2[0-3]):[0-5][0-9]$')

def validate_schedule_times(times: List[str]) -> List[str]:
    if len(times) > 12:
        raise ValueError("No se pueden programar más de 12 horarios por medicamento")
    for t in times:
        if not TIME_PATTERN.match(t):
            raise ValueError(f"Formato de hora inválido: {t}. Use HH:MM")
    return times

class MedicationCreate(BaseModel):
    patient_id: str
    name: str = Field(..., max_length=200)
    dosage: str = Field(..., max_length=200)
    frequency: str  # daily, twice_daily, etc.
    schedule_times: List[str] = Field(..., max_length=12)
    start_date: str
    end_date: Optional[str] = None
    instructions: Optional[str] = Field(None, max_length=1000)
    refill_alert_days: Optional[int] = 7
    active: bool = True
    notifications_enabled: bool = True

    @field_validator('schedule_times')
    @classmethod
    def validate_times(cls, v):
        return validate_schedule_times(v)

class MedicationUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    dosage: Optional[str] = Field(None, max_length=200)
    frequency: Optional[str] = None
    schedule_times: Optional[List[str]] = Field(None, max_length=12)
    end_date: Optional[str] = None
    instructions: Optional[str] = Field(None, max_length=1000)
    refill_alert_days: Optional[int] = None
    active: Optional[bool] = None
    notifications_enabled: Optional[bool] = None

    @field_validator('schedule_times')
    @classmethod
    def validate_times(cls, v):
        if v is not None:
            return validate_schedule_times(v)
        return v

class Medication(BaseModel):
    id: str
    patient_id: str
    name: str
    dosage: str
    frequency: str
    schedule_times: List[str]
    start_date: str
    end_date: Optional[str] = None
    instructions: Optional[str] = None
    refill_alert_days: int
    active: bool
    notifications_enabled: bool = True
    created_at: datetime

class MedicationLogCreate(BaseModel):
    medication_id: str
    patient_id: str
    scheduled_datetime: str
    status: str  # taken, missed, skipped
    taken_datetime: Optional[str] = None
    notes: Optional[str] = None

class MedicationLogUpdate(BaseModel):
    status: str
    taken_datetime: Optional[str] = None
    notes: Optional[str] = None

class MedicationLog(BaseModel):
    id: str
    medication_id: str
    patient_id: str
    scheduled_datetime: str
    taken_datetime: Optional[str] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime

class AIQuery(BaseModel):
    question: str

class DashboardResponse(BaseModel):
    medications_today: List[dict]
    completed: int
    pending: int
    missed: int

# Modelos para verificación de email
class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr

# ============= HELPERS =============
def utc_now_naive() -> datetime:
    """Retorna datetime UTC naive para comparar con strings parseados (YYYY-MM-DDTHH:MM:SS)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

def ensure_naive(dt: datetime) -> datetime:
    """Convierte datetime a naive UTC si es aware (motor puede devolver ambos)."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=30)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)
    return encoded_jwt

def normalize_email(email: str) -> str:
    """Normalizar email: strip + lowercase"""
    return email.strip().lower()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============= SCHEDULING HELPERS =============
WEEKDAY_MAP = {
    "lunes": 0, "martes": 1, "miércoles": 2, "miercoles": 2,
    "jueves": 3, "viernes": 4, "sábado": 5, "sabado": 5,
    "domingo": 6
}

def should_show_today(med: dict, weekday: int) -> bool:
    frequency = med.get("frequency", "").lower()
    day_names = ["lunes", "martes", "miércoles", "miercoles",
                 "jueves", "viernes", "sábado", "sabado", "domingo"]
    has_day_name = any(day in frequency for day in day_names)
    if not has_day_name:
        return True
    for day_name, day_num in WEEKDAY_MAP.items():
        if day_name in frequency and day_num == weekday:
            return True
    return False

def med_baseline_local(med: dict, timezone_offset: int):
    """Hora local desde la cual cuentan las dosis: cuando se creó o editó el medicamento."""
    base = med.get("updated_at") or med.get("created_at")
    if not base:
        return None
    base = ensure_naive(base)
    return base + timedelta(minutes=timezone_offset)

# ============= INVITATION HELPERS =============
def generate_invitation_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=6))

async def send_invitation_email(
    to_email: str,
    inviter_name: str,
    patient_name: str,
    code: str
) -> bool:
    try:
        sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <div style="background: #2196F3; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">&#128138; MedControl</h1>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 12px 12px;">
            <h2 style="color: #212121;">Te han invitado como cuidador</h2>
            <p style="color: #666;">
              <strong>{inviter_name}</strong> te ha invitado a ser
              cuidador de <strong>{patient_name}</strong> en MedControl.
            </p>
            <p style="color: #666;">Para aceptar la invitación:</p>
            <ol style="color: #666;">
              <li>Descarga MedControl desde Play Store</li>
              <li>Crea tu cuenta o inicia sesión</li>
              <li>Ve a Ajustes &rarr; Aceptar invitación</li>
              <li>Ingresa este código:</li>
            </ol>
            <div style="background: #E3F2FD; border: 2px dashed #2196F3; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
              <p style="color: #666; margin: 0 0 8px 0; font-size: 14px;">Tu código de invitación</p>
              <h1 style="color: #1565C0; margin: 0; font-size: 36px; letter-spacing: 8px;">{code}</h1>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">Este código expira en 48 horas.</p>
            <p style="color: #999; font-size: 12px; text-align: center;">Si no esperabas esta invitación, puedes ignorar este email.</p>
          </div>
        </div>
        """
        message = Mail(
            from_email=SENDGRID_FROM_EMAIL,
            to_emails=to_email,
            subject=f"MedControl: {inviter_name} te invita a cuidar a {patient_name}",
            html_content=html_content
        )
        response = sg.send(message)
        return response.status_code in [200, 202]
    except Exception as e:
        print(f"SendGrid error: {e}")
        return False

async def send_verification_email(to_email: str, code: str) -> bool:
    """Enviar código de verificación de email"""
    try:
        sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <div style="background: #2196F3; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">&#128138; MedControl</h1>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 12px 12px;">
            <h2 style="color: #212121;">Verifica tu correo electrónico</h2>
            <p style="color: #666;">
              Gracias por registrarte en MedControl. Para completar tu registro,
              ingresa el siguiente código en la aplicación:
            </p>
            <div style="background: #E3F2FD; border: 2px dashed #2196F3; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
              <p style="color: #666; margin: 0 0 8px 0; font-size: 14px;">Tu código de verificación</p>
              <h1 style="color: #1565C0; margin: 0; font-size: 36px; letter-spacing: 8px;">{code}</h1>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">Este código expira en 15 minutos.</p>
            <p style="color: #999; font-size: 12px; text-align: center;">Si no solicitaste este código, puedes ignorar este email.</p>
          </div>
        </div>
        """
        message = Mail(
            from_email=SENDGRID_FROM_EMAIL,
            to_emails=to_email,
            subject="MedControl: Verifica tu correo electrónico",
            html_content=html_content
        )
        response = sg.send(message)
        return response.status_code in [200, 202]
    except Exception as e:
        print(f"SendGrid verification email error: {e}")
        return False

# ============= AUTH ENDPOINTS =============
@api_router.post("/auth/register")
async def register(caregiver: CaregiverCreate, request: Request):
    ip = get_client_ip(request)
    if not check_auth_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos.")

    email = normalize_email(caregiver.email)

    # Check if user exists
    existing = await db.caregivers.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user with email_verified=False
    user_dict = {
        "name": caregiver.name,
        "email": email,
        "password_hash": hash_password(caregiver.password),
        "email_verified": False,
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.caregivers.insert_one(user_dict)

    # Generate verification code
    code = generate_invitation_code()
    await db.email_verifications.insert_one({
        "email": email,
        "code": code,
        "attempts": 0,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15)
    })

    # Send verification email
    await send_verification_email(email, code)

    return {
        "message": "Registro exitoso. Revisa tu correo para verificar tu cuenta.",
        "email": email,
        "requires_verification": True
    }

@api_router.post("/auth/verify-email")
async def verify_email(data: VerifyEmailRequest, request: Request):
    ip = get_client_ip(request)
    if not check_auth_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos.")

    email = normalize_email(data.email)
    code = data.code.strip().upper()

    verification = await db.email_verifications.find_one({
        "email": email,
        "code": code
    })

    if not verification:
        # Incrementar intentos fallidos
        await db.email_verifications.update_one(
            {"email": email},
            {"$inc": {"attempts": 1}}
        )
        # Verificar si excedió intentos
        current = await db.email_verifications.find_one({"email": email})
        if current and current.get("attempts", 0) >= 5:
            raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Solicita un nuevo código.")
        raise HTTPException(status_code=400, detail="Código inválido")

    if verification["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="El código ha expirado. Solicita uno nuevo.")

    if verification.get("attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Solicita un nuevo código.")

    # Marcar usuario como verificado
    user = await db.caregivers.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    await db.caregivers.update_one(
        {"_id": user["_id"]},
        {"$set": {"email_verified": True}}
    )

    # Eliminar verificación usada
    await db.email_verifications.delete_many({"email": email})

    # Crear token
    token = create_access_token({"sub": str(user["_id"])})

    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"]
        }
    }

@api_router.post("/auth/resend-verification")
async def resend_verification(data: ResendVerificationRequest, request: Request):
    ip = get_client_ip(request)
    if not check_auth_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos.")

    email = normalize_email(data.email)

    # Rate limit por usuario (1 por minuto implícito, 3 por hora)
    last_verification = await db.email_verifications.find_one(
        {"email": email},
        sort=[("created_at", -1)]
    )

    if last_verification:
        time_since = datetime.now(timezone.utc) - last_verification["created_at"]
        if time_since < timedelta(minutes=1):
            raise HTTPException(status_code=429, detail="Espera 1 minuto antes de solicitar otro código.")

    user = await db.caregivers.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.get("email_verified", False):
        raise HTTPException(status_code=400, detail="El email ya está verificado")

    # Eliminar códigos anteriores
    await db.email_verifications.delete_many({"email": email})

    # Generar nuevo código
    code = generate_invitation_code()
    await db.email_verifications.insert_one({
        "email": email,
        "code": code,
        "attempts": 0,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15)
    })

    await send_verification_email(email, code)

    return {"message": "Código enviado. Revisa tu correo."}

@api_router.post("/auth/login")
async def login(credentials: CaregiverLogin, request: Request):
    ip = get_client_ip(request)
    if not check_auth_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos.")

    email = normalize_email(credentials.email)
    user = await db.caregivers.find_one({"email": email})

    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    # Verificar si el email está verificado
    if not user.get("email_verified", False):
        raise HTTPException(
            status_code=403,
            detail="Email no verificado. Revisa tu correo o solicita un nuevo código."
        )

    token = create_access_token({"sub": str(user["_id"])})

    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"]
        }
    }

@api_router.delete("/auth/me")
async def delete_account(body: DeleteAccountRequest, user_id: str = Depends(get_current_user)):
    caregiver = await db.caregivers.find_one({"_id": ObjectId(user_id)})
    if not caregiver:
        raise HTTPException(status_code=404, detail="Cuidador no encontrado")

    if not verify_password(body.password, caregiver["password_hash"]):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    # Delete patients created by this user (and their medications/logs)
    owned_patients = await db.patients.find({"created_by": user_id}).to_list(None)
    for patient in owned_patients:
        pid = str(patient["_id"])
        await db.medications.delete_many({"patient_id": pid})
        await db.medication_logs.delete_many({"patient_id": pid})
    await db.patients.delete_many({"created_by": user_id})

    # Remove user from shared patients where they are not the owner
    await db.patients.update_many(
        {"caregiver_ids": user_id, "created_by": {"$ne": user_id}},
        {"$pull": {"caregiver_ids": user_id}}
    )

    await db.caregivers.delete_one({"_id": ObjectId(user_id)})
    return {"message": "Cuenta eliminada permanentemente"}

# ============= PATIENT ENDPOINTS =============
@api_router.get("/patients")
async def get_patients(user_id: str = Depends(get_current_user)):
    patients = await db.patients.find(
        {"caregiver_ids": user_id},
        {"password_hash": 0}  # Exclude sensitive fields
    ).to_list(100)
    return [
        {
            "id": str(p["_id"]),
            "name": p["name"],
            "age": p.get("age"),
            "photo": p.get("photo"),
            "notes": p.get("notes"),
            "caregiver_ids": p.get("caregiver_ids", []),
            "created_at": p["created_at"].isoformat()
        }
        for p in patients
    ]

@api_router.post("/patients")
async def create_patient(patient: PatientCreate, user_id: str = Depends(get_current_user)):
    patient_dict = {
        "name": patient.name,
        "age": patient.age,
        "photo": patient.photo,
        "notes": patient.notes,
        "caregiver_ids": [user_id],
        "created_by": user_id,  # Track who created the patient
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.patients.insert_one(patient_dict)
    return {
        "id": str(result.inserted_id),
        "name": patient.name,
        "age": patient.age,
        "photo": patient.photo,
        "notes": patient.notes,
        "caregiver_ids": [user_id],
        "created_at": patient_dict["created_at"].isoformat()
    }

@api_router.put("/patients/{patient_id}")
async def update_patient(
    patient_id: str,
    patient: PatientUpdate,
    user_id: str = Depends(get_current_user)
):
    # Verify access
    existing = await db.patients.find_one({
        "_id": ObjectId(patient_id),
        "caregiver_ids": user_id
    })
    if not existing:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    update_data = {k: v for k, v in patient.dict().items() if v is not None}
    if update_data:
        await db.patients.update_one(
            {"_id": ObjectId(patient_id)},
            {"$set": update_data}
        )
    
    updated = await db.patients.find_one({"_id": ObjectId(patient_id)})
    return {
        "id": str(updated["_id"]),
        "name": updated["name"],
        "age": updated.get("age"),
        "photo": updated.get("photo"),
        "notes": updated.get("notes"),
        "caregiver_ids": updated.get("caregiver_ids", []),
        "created_at": updated["created_at"].isoformat()
    }

@api_router.delete("/patients/{patient_id}")
async def delete_patient(patient_id: str, user_id: str = Depends(get_current_user)):
    result = await db.patients.delete_one({
        "_id": ObjectId(patient_id),
        "caregiver_ids": user_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Also delete related medications and logs
    await db.medications.delete_many({"patient_id": patient_id})
    await db.medication_logs.delete_many({"patient_id": patient_id})
    
    return {"message": "Patient deleted successfully"}

# ============= MULTI-CAREGIVER ENDPOINTS =============
@api_router.get("/patients/{patient_id}/caregivers")
async def get_patient_caregivers(patient_id: str, user_id: str = Depends(get_current_user)):
    """Get all caregivers for a patient"""
    patient = await db.patients.find_one({
        "_id": ObjectId(patient_id),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    caregiver_ids = patient.get("caregiver_ids", [])
    created_by = patient.get("created_by", caregiver_ids[0] if caregiver_ids else None)
    
    caregivers = []
    for cid in caregiver_ids:
        caregiver = await db.caregivers.find_one({"_id": ObjectId(cid)})
        if caregiver:
            caregivers.append({
                "id": str(caregiver["_id"]),
                "name": caregiver["name"],
                "email": caregiver["email"],
                "is_owner": str(caregiver["_id"]) == created_by
            })
    
    return caregivers

@api_router.delete("/patients/{patient_id}/caregivers/{caregiver_id}")
async def remove_caregiver(
    patient_id: str,
    caregiver_id: str,
    user_id: str = Depends(get_current_user)
):
    """Remove a caregiver from a patient"""
    # Verify current user has access
    patient = await db.patients.find_one({
        "_id": ObjectId(patient_id),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    created_by = patient.get("created_by", patient.get("caregiver_ids", [None])[0])
    
    # Cannot remove the owner
    if caregiver_id == created_by:
        raise HTTPException(status_code=400, detail="No puedes eliminar al creador del paciente")
    
    # Cannot remove yourself (use leave instead)
    if caregiver_id == user_id:
        raise HTTPException(status_code=400, detail="Usa 'Dejar de cuidar' para removerte a ti mismo")
    
    # Remove caregiver
    result = await db.patients.update_one(
        {"_id": ObjectId(patient_id)},
        {"$pull": {"caregiver_ids": caregiver_id}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="El cuidador no está asignado a este paciente")
    
    return {"message": "Cuidador removido exitosamente"}

@api_router.post("/patients/{patient_id}/leave")
async def leave_patient(patient_id: str, user_id: str = Depends(get_current_user)):
    """Leave a patient (for non-owner caregivers)"""
    patient = await db.patients.find_one({
        "_id": ObjectId(patient_id),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    created_by = patient.get("created_by", patient.get("caregiver_ids", [None])[0])
    
    # Owner cannot leave
    if user_id == created_by:
        raise HTTPException(status_code=400, detail="El creador no puede dejar al paciente. Debe eliminar el paciente.")
    
    # Remove self from caregivers
    await db.patients.update_one(
        {"_id": ObjectId(patient_id)},
        {"$pull": {"caregiver_ids": user_id}}
    )
    
    return {"message": "Has dejado de cuidar a este paciente"}

# ============= MEDICATION ENDPOINTS =============
@api_router.get("/medications/patient/{patient_id}")
async def get_medications(patient_id: str, user_id: str = Depends(get_current_user)):
    # Verify access to patient
    patient = await db.patients.find_one({
        "_id": ObjectId(patient_id),
        "caregiver_ids": user_id
    }, {"_id": 1})  # Only check existence
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    medications = await db.medications.find({"patient_id": patient_id}).to_list(100)
    return [
        {
            "id": str(m["_id"]),
            "patient_id": m["patient_id"],
            "name": m["name"],
            "dosage": m["dosage"],
            "frequency": m["frequency"],
            "schedule_times": m["schedule_times"],
            "start_date": m["start_date"],
            "end_date": m.get("end_date"),
            "instructions": m.get("instructions"),
            "refill_alert_days": m.get("refill_alert_days", 7),
            "active": m.get("active", True),
            "notifications_enabled": m.get("notifications_enabled", True),
            "created_at": m["created_at"].isoformat()
        }
        for m in medications
    ]

@api_router.post("/medications")
async def create_medication(medication: MedicationCreate, user_id: str = Depends(get_current_user)):
    # Verify access to patient
    patient = await db.patients.find_one({
        "_id": ObjectId(medication.patient_id),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Normalize schedule times to HH:MM format
    normalized_times = []
    for time in medication.schedule_times:
        try:
            parts = time.split(':')
            if len(parts) == 2:
                hours = parts[0].zfill(2)  # Add leading zero if needed
                minutes = parts[1].zfill(2)
                normalized_times.append(f"{hours}:{minutes}")
            else:
                normalized_times.append(time)
        except:
            normalized_times.append(time)
    
    med_dict = medication.dict()
    med_dict["schedule_times"] = normalized_times
    med_dict["created_at"] = datetime.now(timezone.utc)
    
    result = await db.medications.insert_one(med_dict)
    return {
        "id": str(result.inserted_id),
        **medication.dict(),
        "schedule_times": normalized_times,
        "created_at": med_dict["created_at"].isoformat()
    }

@api_router.put("/medications/{medication_id}")
async def update_medication(
    medication_id: str,
    medication: MedicationUpdate,
    user_id: str = Depends(get_current_user)
):
    # Get medication and verify access
    existing = await db.medications.find_one({"_id": ObjectId(medication_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Medication not found")
    
    patient = await db.patients.find_one({
        "_id": ObjectId(existing["patient_id"]),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Access denied")
    
    update_data = {k: v for k, v in medication.dict().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await db.medications.update_one(
            {"_id": ObjectId(medication_id)},
            {"$set": update_data}
        )
    
    updated = await db.medications.find_one({"_id": ObjectId(medication_id)})
    return {
        "id": str(updated["_id"]),
        "patient_id": updated["patient_id"],
        "name": updated["name"],
        "dosage": updated["dosage"],
        "frequency": updated["frequency"],
        "schedule_times": updated["schedule_times"],
        "start_date": updated["start_date"],
        "end_date": updated.get("end_date"),
        "instructions": updated.get("instructions"),
        "refill_alert_days": updated.get("refill_alert_days", 7),
        "active": updated.get("active", True),
        "created_at": updated["created_at"].isoformat()
    }

@api_router.delete("/medications/{medication_id}")
async def delete_medication(medication_id: str, user_id: str = Depends(get_current_user)):
    existing = await db.medications.find_one({"_id": ObjectId(medication_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Medication not found")
    
    patient = await db.patients.find_one({
        "_id": ObjectId(existing["patient_id"]),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Access denied")
    
    await db.medications.delete_one({"_id": ObjectId(medication_id)})
    await db.medication_logs.delete_many({"medication_id": medication_id})
    
    return {"message": "Medication deleted successfully"}

# ============= MEDICATION LOG ENDPOINTS =============
@api_router.get("/logs/patient/{patient_id}")
async def get_logs(
    patient_id: str,
    include_missed: bool = False,
    timezone_offset: int = 0,
    user_id: str = Depends(get_current_user)
):
    # Verify access
    patient = await db.patients.find_one({
        "_id": ObjectId(patient_id),
        "caregiver_ids": user_id
    }, {"_id": 1})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if not include_missed:
        logs = await db.medication_logs.find(
            {"patient_id": patient_id}
        ).sort("scheduled_datetime", -1).to_list(200)
        return [
            {
                "id": str(log["_id"]),
                "medication_id": log["medication_id"],
                "patient_id": log["patient_id"],
                "scheduled_datetime": log["scheduled_datetime"],
                "taken_datetime": log.get("taken_datetime"),
                "status": log["status"],
                "notes": log.get("notes"),
                "created_at": log["created_at"].isoformat()
            }
            for log in logs
        ]

    # --- include_missed=True: enrich with synthetic missed logs ---
    now_local = utc_now_naive() + timedelta(minutes=timezone_offset)
    thirty_days_ago = (now_local - timedelta(days=30)).date().isoformat()

    real_logs = await db.medication_logs.find({
        "patient_id": patient_id,
        "scheduled_datetime": {"$gte": thirty_days_ago}
    }).sort("scheduled_datetime", -1).to_list(1000)

    medications = await db.medications.find(
        {"patient_id": patient_id, "active": True}
    ).to_list(100)

    med_name_by_id = {str(m["_id"]): m["name"] for m in medications}

    # Build lookup set for efficiency — avoids O(n) scan per dose
    existing_keys = {
        (log["medication_id"], log["scheduled_datetime"])
        for log in real_logs
    }

    real_logs_out = [
        {
            "id": str(log["_id"]),
            "medication_id": log["medication_id"],
            "medication_name": med_name_by_id.get(log["medication_id"], "Desconocido"),
            "patient_id": log["patient_id"],
            "scheduled_datetime": log["scheduled_datetime"],
            "taken_datetime": log.get("taken_datetime"),
            "status": log["status"],
            "notes": log.get("notes"),
            "is_synthetic": False,
            "created_at": log["created_at"].isoformat()
        }
        for log in real_logs
    ]

    synthetic_missed = []

    for med in medications:
        med_id = str(med["_id"])
        # Only generate missed from the medication's own start_date
        med_start = datetime.fromisoformat(
            med.get("start_date", (now_local - timedelta(days=30)).date().isoformat())
        )
        end_date_str = med.get("end_date")

        for days_back in range(30):
            check_dt = now_local - timedelta(days=days_back)
            check_date = check_dt.date()
            check_date_str = check_date.isoformat()

            if check_date < med_start.date():
                continue
            if end_date_str and check_date_str > end_date_str:
                continue
            if not should_show_today(med, check_dt.weekday()):
                continue

            for time_slot in med.get("schedule_times", []):
                try:
                    parts = time_slot.split(":")
                    normalized_time = (
                        f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
                        if len(parts) == 2 else time_slot
                    )
                except Exception:
                    normalized_time = time_slot

                scheduled_dt = f"{check_date_str}T{normalized_time}:00"

                try:
                    if datetime.fromisoformat(scheduled_dt) + timedelta(minutes=MISSED_GRACE_MINUTES) >= now_local:
                        continue
                except (ValueError, TypeError) as e:
                    logger.warning(f"Error parsing scheduled_dt '{scheduled_dt}' in logs: {e}")
                    continue

                baseline = med_baseline_local(med, timezone_offset)
                if baseline is not None:
                    try:
                        if datetime.fromisoformat(scheduled_dt) < baseline:
                            continue
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Error comparing baseline in logs: {e}")

                if (med_id, scheduled_dt) in existing_keys:
                    continue

                synthetic_missed.append({
                    "id": f"synthetic_{med_id}_{scheduled_dt}",
                    "medication_id": med_id,
                    "medication_name": med["name"],
                    "patient_id": patient_id,
                    "scheduled_datetime": scheduled_dt,
                    "taken_datetime": None,
                    "status": "missed",
                    "notes": None,
                    "is_synthetic": True,
                    "created_at": scheduled_dt
                })

    all_logs = real_logs_out + synthetic_missed
    all_logs.sort(key=lambda x: x["scheduled_datetime"], reverse=True)
    return all_logs

@api_router.post("/logs")
async def create_log(log: MedicationLogCreate, user_id: str = Depends(get_current_user)):
    # Verify access
    patient = await db.patients.find_one({
        "_id": ObjectId(log.patient_id),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    taken_dt = log.taken_datetime
    if log.status == "taken" and not taken_dt:
        taken_dt = datetime.now(timezone.utc).isoformat()

    # Upsert: si ya existe log para (medication_id, scheduled_datetime), actualizar
    existing = await db.medication_logs.find_one({
        "medication_id": log.medication_id,
        "scheduled_datetime": log.scheduled_datetime
    })

    if existing:
        update_fields = {
            "status": log.status,
            "notes": log.notes,
        }
        if taken_dt:
            update_fields["taken_datetime"] = taken_dt

        await db.medication_logs.update_one(
            {"_id": existing["_id"]},
            {"$set": update_fields}
        )
        updated = await db.medication_logs.find_one({"_id": existing["_id"]})
        return {
            "id": str(updated["_id"]),
            "medication_id": updated["medication_id"],
            "patient_id": updated["patient_id"],
            "scheduled_datetime": updated["scheduled_datetime"],
            "taken_datetime": updated.get("taken_datetime"),
            "status": updated["status"],
            "notes": updated.get("notes"),
            "created_at": ensure_naive(updated["created_at"]).isoformat() if updated.get("created_at") else None
        }

    # Crear nuevo log
    log_dict = {
        **log.dict(),
        "created_at": datetime.now(timezone.utc)
    }
    if taken_dt:
        log_dict["taken_datetime"] = taken_dt

    result = await db.medication_logs.insert_one(log_dict)
    return {
        "id": str(result.inserted_id),
        **log.dict(),
        "taken_datetime": taken_dt,
        "created_at": log_dict["created_at"].isoformat()
    }

@api_router.put("/logs/{log_id}")
async def update_log(
    log_id: str,
    log: MedicationLogUpdate,
    user_id: str = Depends(get_current_user)
):
    existing = await db.medication_logs.find_one({"_id": ObjectId(log_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Log not found")
    
    patient = await db.patients.find_one({
        "_id": ObjectId(existing["patient_id"]),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Access denied")
    
    update_data = log.dict()
    if not update_data.get("taken_datetime") and log.status == "taken":
        update_data["taken_datetime"] = datetime.now(timezone.utc).isoformat()
    
    await db.medication_logs.update_one(
        {"_id": ObjectId(log_id)},
        {"$set": update_data}
    )
    
    updated = await db.medication_logs.find_one({"_id": ObjectId(log_id)})
    return {
        "id": str(updated["_id"]),
        "medication_id": updated["medication_id"],
        "patient_id": updated["patient_id"],
        "scheduled_datetime": updated["scheduled_datetime"],
        "taken_datetime": updated.get("taken_datetime"),
        "status": updated["status"],
        "notes": updated.get("notes"),
        "created_at": updated["created_at"].isoformat()
    }

# ============= DASHBOARD ENDPOINT =============
@api_router.get("/dashboard/today")
async def get_today_dashboard(user_id: str = Depends(get_current_user), timezone_offset: int = 0):
    now_local = utc_now_naive() + timedelta(minutes=timezone_offset)
    today_str = now_local.date().isoformat()
    weekday_local = now_local.weekday()  # 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun

    # Get all patients for this caregiver (without photos for performance)
    patients = await db.patients.find(
        {"caregiver_ids": user_id},
        {"name": 1, "_id": 1}  # Only get needed fields
    ).to_list(100)
    patient_ids = [str(p["_id"]) for p in patients]

    if not patient_ids:
        return {
            "medications_today": [],
            "completed": 0,
            "pending": 0,
            "missed": 0
        }

    # Get all active medications for these patients
    medications = await db.medications.find({
        "patient_id": {"$in": patient_ids},
        "active": True,
        "start_date": {"$lte": today_str}
    }).to_list(200)

    medications = [m for m in medications if should_show_today(m, weekday_local)]

    # Fetch all logs for today in one query
    all_logs = await db.medication_logs.find({
        "patient_id": {"$in": patient_ids},
        "scheduled_datetime": {"$regex": f"^{today_str}"}
    }).to_list(1000)
    
    # Create a lookup dictionary for logs keyed by (medication_id, scheduled_datetime)
    logs_by_key = {
        (log["medication_id"], log["scheduled_datetime"]): log
        for log in all_logs
    }
    # Create a lookup dictionary for patients
    patients_by_id = {str(p["_id"]): p["name"] for p in patients}
    
    medications_today = []
    completed = 0
    pending = 0
    missed = 0
    
    for med in medications:
        for time in med["schedule_times"]:
            # Normalize time to HH:MM format
            try:
                parts = time.split(':')
                if len(parts) == 2:
                    hours = parts[0].zfill(2)
                    minutes = parts[1].zfill(2)
                    normalized_time = f"{hours}:{minutes}"
                else:
                    normalized_time = time
            except:
                normalized_time = time
                
            scheduled_datetime = f"{today_str}T{normalized_time}:00"
            log = logs_by_key.get((str(med["_id"]), scheduled_datetime))

            baseline = med_baseline_local(med, timezone_offset)
            if not log and baseline is not None:
                try:
                    if datetime.fromisoformat(scheduled_datetime) < baseline:
                        continue
                except (ValueError, TypeError) as e:
                    logger.warning(f"Error comparing baseline for med {med.get('name')}: {e}")

            # Determine actual status before building the item
            if log:
                item_status = log["status"]
            else:
                try:
                    scheduled = datetime.fromisoformat(scheduled_datetime)
                    grace = timedelta(minutes=MISSED_GRACE_MINUTES)
                    item_status = "missed" if now_local > scheduled + grace else "pending"
                except (ValueError, TypeError) as e:
                    logger.warning(f"Error parsing scheduled_datetime '{scheduled_datetime}': {e}")
                    item_status = "pending"

            item = {
                "medication_id": str(med["_id"]),
                "medication_name": med["name"],
                "dosage": med["dosage"],
                "scheduled_time": time,
                "scheduled_datetime": scheduled_datetime,
                "patient_name": patients_by_id.get(med["patient_id"], "Unknown"),
                "patient_id": med["patient_id"],
                "status": item_status,
                "log_id": str(log["_id"]) if log else None,
                "next_dose_time": normalized_time if item_status == "pending" else None,
            }

            medications_today.append(item)

            if log:
                if log["status"] == "taken":
                    completed += 1
                elif log["status"] == "missed":
                    missed += 1
            elif item_status == "missed":
                missed += 1
            else:
                pending += 1
    
    # Sort by time
    medications_today.sort(key=lambda x: x["scheduled_time"])
    
    return {
        "medications_today": medications_today,
        "completed": completed,
        "pending": pending,
        "missed": missed
    }

# ============= UPCOMING DASHBOARD ENDPOINT =============
@api_router.get("/dashboard/upcoming")
async def get_upcoming_dashboard(
    timezone_offset: int = 0,
    user_id: str = Depends(get_current_user)
):
    now_local = utc_now_naive() + timedelta(minutes=timezone_offset)

    DAYS_ES = {
        0: "Lunes", 1: "Martes", 2: "Miércoles",
        3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"
    }
    MONTHS_ES = {
        1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
        5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
        9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
    }
    # Next 7 days starting from tomorrow
    upcoming_dates = [
        (now_local + timedelta(days=i)).date().isoformat()
        for i in range(1, 8)
    ]
    last_date = upcoming_dates[-1]

    patients = await db.patients.find(
        {"caregiver_ids": user_id},
        {"name": 1, "_id": 1}
    ).to_list(100)
    patient_ids = [str(p["_id"]) for p in patients]
    patients_by_id = {str(p["_id"]): p["name"] for p in patients}

    if not patient_ids:
        return []

    medications = await db.medications.find({
        "patient_id": {"$in": patient_ids},
        "active": True,
        "start_date": {"$lte": last_date}
    }).to_list(200)

    result_by_date: dict = {}

    for future_date_str in upcoming_dates:
        future_dt = datetime.fromisoformat(future_date_str)
        future_weekday = future_dt.weekday()
        label = f"{DAYS_ES[future_weekday]} {future_dt.day} de {MONTHS_ES[future_dt.month]}"

        for med in medications:
            if med.get("start_date", "") > future_date_str:
                continue
            end_date = med.get("end_date")
            if end_date and end_date < future_date_str:
                continue
            if not should_show_today(med, future_weekday):
                continue

            for time_slot in med["schedule_times"]:
                try:
                    parts = time_slot.split(":")
                    normalized_time = f"{parts[0].zfill(2)}:{parts[1].zfill(2)}" if len(parts) == 2 else time_slot
                except Exception:
                    normalized_time = time_slot

                if future_date_str not in result_by_date:
                    result_by_date[future_date_str] = {
                        "date": future_date_str,
                        "day_label": label,
                        "medications": []
                    }
                result_by_date[future_date_str]["medications"].append({
                    "date": future_date_str,
                    "day_label": label,
                    "medication_id": str(med["_id"]),
                    "medication_name": med["name"],
                    "dosage": med["dosage"],
                    "scheduled_time": normalized_time,
                    "patient_name": patients_by_id.get(med["patient_id"], "Unknown"),
                    "patient_id": med["patient_id"]
                })

    for day_data in result_by_date.values():
        day_data["medications"].sort(key=lambda x: x["scheduled_time"])

    return [result_by_date[d] for d in sorted(result_by_date.keys())]

# ============= INVITATION ENDPOINTS =============
@api_router.post("/caregivers/invite")
async def invite_caregiver_by_code(
    invitation: CaregiverInvitation,
    user_id: str = Depends(get_current_user)
):
    """Send invitation email with a 6-digit code"""
    # Rate limit: 3 invitaciones por hora por usuario
    if not check_user_action_rate_limit(user_id, "invite"):
        raise HTTPException(status_code=429, detail="Límite de invitaciones alcanzado. Espera 1 hora.")

    # Verify the inviter has access to the patient
    patient = await db.patients.find_one({
        "_id": ObjectId(invitation.patient_id),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente no encontrado o sin acceso")

    inviter = await db.caregivers.find_one({"_id": ObjectId(user_id)})
    if not inviter:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    invitee_email = normalize_email(invitation.invitee_email)

    # Cannot invite yourself
    if invitee_email == inviter["email"].lower():
        raise HTTPException(status_code=400, detail="No puedes invitarte a ti mismo")

    # Check if invitee is already a caregiver
    existing_caregiver = await db.caregivers.find_one({"email": invitee_email})
    if existing_caregiver:
        existing_id = str(existing_caregiver["_id"])
        if existing_id in patient.get("caregiver_ids", []):
            raise HTTPException(status_code=400, detail="Este usuario ya es cuidador de este paciente")

    now = datetime.now(timezone.utc)

    # Check for existing pending invitation (reuse code if still valid)
    existing_invitation = await db.invitations.find_one({
        "patient_id": invitation.patient_id,
        "invitee_email": invitee_email,
        "status": "pending",
        "expires_at": {"$gt": now}
    })

    if existing_invitation:
        code = existing_invitation["code"]
        await db.invitations.update_one(
            {"_id": existing_invitation["_id"]},
            {"$set": {"created_at": now, "expires_at": now + timedelta(hours=48)}}
        )
    else:
        code = generate_invitation_code()
        await db.invitations.insert_one({
            "code": code,
            "patient_id": invitation.patient_id,
            "inviter_id": user_id,
            "invitee_email": invitee_email,
            "status": "pending",
            "created_at": now,
            "expires_at": now + timedelta(hours=48)
        })

    email_sent = await send_invitation_email(
        to_email=invitee_email,
        inviter_name=inviter["name"],
        patient_name=patient["name"],
        code=code
    )

    if not email_sent:
        raise HTTPException(status_code=500, detail="No se pudo enviar el email. Verifica la dirección e inténtalo de nuevo.")

    return {"message": "Invitación enviada", "email": invitee_email}


@api_router.post("/caregivers/accept-invitation")
async def accept_invitation(
    data: AcceptInvitation,
    user_id: str = Depends(get_current_user)
):
    """Accept a caregiver invitation using a 6-digit code"""
    code = data.code.strip().upper()

    invitation = await db.invitations.find_one({
        "code": code,
        "status": "pending"
    })

    if not invitation:
        raise HTTPException(status_code=404, detail="Código inválido. Verifica el código e inténtalo de nuevo.")

    if invitation["expires_at"] < datetime.now(timezone.utc):
        await db.invitations.update_one(
            {"_id": invitation["_id"]},
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=400, detail="El código ha expirado. Pide al invitador que envíe una nueva invitación.")

    # Verify the accepting user's email matches the invited email
    current_user = await db.caregivers.find_one({"_id": ObjectId(user_id)})
    if not current_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if current_user["email"].lower() != invitation["invitee_email"].lower():
        raise HTTPException(status_code=403, detail="Este código fue enviado a otro email. Inicia sesión con el email correcto.")

    patient_id = invitation["patient_id"]
    patient = await db.patients.find_one({"_id": ObjectId(patient_id)})
    if not patient:
        raise HTTPException(status_code=404, detail="El paciente ya no existe")

    # Add user to patient's caregivers if not already there
    if user_id not in patient.get("caregiver_ids", []):
        await db.patients.update_one(
            {"_id": ObjectId(patient_id)},
            {"$addToSet": {"caregiver_ids": user_id}}
        )

    # Mark invitation as accepted
    await db.invitations.update_one(
        {"_id": invitation["_id"]},
        {"$set": {"status": "accepted"}}
    )

    return {
        "message": "Invitación aceptada",
        "patient_id": patient_id,
        "patient_name": patient["name"]
    }

# ============= AI ASSISTANT ENDPOINT =============
@api_router.post("/ai/ask")
async def ai_assistant(query: AIQuery, user_id: str = Depends(get_current_user)):
    # AI Assistant deshabilitado temporalmente
    return {
        "question": query.question,
        "answer": "🚧 El asistente IA está temporalmente deshabilitado. Esta función estará disponible próximamente.\n\n💡 Mientras tanto, te recomendamos consultar con tu médico o farmacéutico para cualquier duda sobre medicamentos."
    }

# ============= ROOT ENDPOINT =============
@api_router.get("/")
async def root():
    return {"message": "MedReminder API", "version": "1.0"}

# ============= HEALTH CHECK =============
@api_router.get("/health")
async def health_check():
    """Health check endpoint for deployment monitoring"""
    try:
        # Check MongoDB connection
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    
    return {
        "status": "healthy",
        "version": "1.0.0",
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Middleware de rate limiting global
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    ip = get_client_ip(request)
    if not check_rate_limit(ip):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=429,
            content={"detail": "Demasiadas solicitudes. Espera un momento."}
        )
    response = await call_next(request)
    return response
