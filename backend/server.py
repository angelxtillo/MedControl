from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from bson import ObjectId
import time
from collections import defaultdict

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key')
ALGORITHM = "HS256"

# Rate limiting (simple in-memory)
rate_limit_store = defaultdict(list)
RATE_LIMIT_REQUESTS = 100  # requests per window
RATE_LIMIT_WINDOW = 60  # seconds

def check_rate_limit(ip: str) -> bool:
    """Simple rate limiting by IP"""
    now = time.time()
    # Clean old entries
    rate_limit_store[ip] = [t for t in rate_limit_store[ip] if now - t < RATE_LIMIT_WINDOW]
    if len(rate_limit_store[ip]) >= RATE_LIMIT_REQUESTS:
        return False
    rate_limit_store[ip].append(now)
    return True

# Create the main app
app = FastAPI(
    title="MedControl API",
    description="API para gestión de medicamentos y pacientes",
    version="1.0.0"
)
api_router = APIRouter(prefix="/api")

# ============= MODELS =============
class CaregiverCreate(BaseModel):
    name: str
    email: str
    password: str

class CaregiverLogin(BaseModel):
    email: str
    password: str

class DeleteAccountRequest(BaseModel):
    password: str

class Caregiver(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

class PatientCreate(BaseModel):
    name: str
    age: Optional[int] = None
    photo: Optional[str] = None  # base64
    notes: Optional[str] = None

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    photo: Optional[str] = None
    notes: Optional[str] = None

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

class RemoveCaregiverRequest(BaseModel):
    patient_id: str
    caregiver_id: str

class CaregiverInfo(BaseModel):
    id: str
    name: str
    email: str
    is_owner: bool = False
    created_at: datetime

class MedicationCreate(BaseModel):
    patient_id: str
    name: str
    dosage: str
    frequency: str  # daily, twice_daily, etc.
    schedule_times: List[str]  # ["08:00", "20:00"]
    start_date: str
    end_date: Optional[str] = None
    instructions: Optional[str] = None
    refill_alert_days: Optional[int] = 7
    active: bool = True
    notifications_enabled: bool = True

class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    schedule_times: Optional[List[str]] = None
    end_date: Optional[str] = None
    instructions: Optional[str] = None
    refill_alert_days: Optional[int] = None
    active: Optional[bool] = None
    notifications_enabled: Optional[bool] = None

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

# ============= HELPERS =============
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=30)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)
    return encoded_jwt

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

# ============= AUTH ENDPOINTS =============
@api_router.post("/auth/register")
async def register(caregiver: CaregiverCreate):
    # Check if user exists
    existing = await db.caregivers.find_one({"email": caregiver.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_dict = {
        "name": caregiver.name,
        "email": caregiver.email,
        "password_hash": hash_password(caregiver.password),
        "created_at": datetime.utcnow()
    }
    result = await db.caregivers.insert_one(user_dict)
    
    # Create token
    token = create_access_token({"sub": str(result.inserted_id)})
    
    return {
        "token": token,
        "user": {
            "id": str(result.inserted_id),
            "name": caregiver.name,
            "email": caregiver.email
        }
    }

@api_router.post("/auth/login")
async def login(credentials: CaregiverLogin):
    user = await db.caregivers.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
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
        "created_at": datetime.utcnow()
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

@api_router.post("/patients/{patient_id}/caregivers/invite")
async def invite_caregiver(
    patient_id: str,
    invite: InviteCaregiverRequest,
    user_id: str = Depends(get_current_user)
):
    """Invite a caregiver to a patient by email"""
    # Verify current user has access to patient
    patient = await db.patients.find_one({
        "_id": ObjectId(patient_id),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Find caregiver by email
    new_caregiver = await db.caregivers.find_one({"email": invite.email.lower()})
    if not new_caregiver:
        raise HTTPException(status_code=404, detail="No se encontró un cuidador con ese email. Debe registrarse primero.")
    
    new_caregiver_id = str(new_caregiver["_id"])
    
    # Check if already a caregiver
    if new_caregiver_id in patient.get("caregiver_ids", []):
        raise HTTPException(status_code=400, detail="Este cuidador ya tiene acceso al paciente")
    
    # Add caregiver
    await db.patients.update_one(
        {"_id": ObjectId(patient_id)},
        {"$addToSet": {"caregiver_ids": new_caregiver_id}}
    )
    
    return {
        "message": "Cuidador agregado exitosamente",
        "caregiver": {
            "id": new_caregiver_id,
            "name": new_caregiver["name"],
            "email": new_caregiver["email"],
            "is_owner": False
        }
    }

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
    med_dict["created_at"] = datetime.utcnow()
    
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
async def get_logs(patient_id: str, user_id: str = Depends(get_current_user)):
    # Verify access
    patient = await db.patients.find_one({
        "_id": ObjectId(patient_id),
        "caregiver_ids": user_id
    }, {"_id": 1})  # Only check existence
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    logs = await db.medication_logs.find({"patient_id": patient_id}).sort("scheduled_datetime", -1).to_list(200)
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

@api_router.post("/logs")
async def create_log(log: MedicationLogCreate, user_id: str = Depends(get_current_user)):
    # Verify access
    patient = await db.patients.find_one({
        "_id": ObjectId(log.patient_id),
        "caregiver_ids": user_id
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    log_dict = {
        **log.dict(),
        "created_at": datetime.utcnow()
    }
    if log.status == "taken" and not log_dict.get("taken_datetime"):
        log_dict["taken_datetime"] = datetime.utcnow().isoformat()
    result = await db.medication_logs.insert_one(log_dict)
    return {
        "id": str(result.inserted_id),
        **log.dict(),
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
        update_data["taken_datetime"] = datetime.utcnow().isoformat()
    
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
    
    now_local = datetime.utcnow() + timedelta(minutes=timezone_offset)
    today = now_local.date()
    today_str = today.isoformat()

    weekday_local = now_local.weekday()  # 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun

    WEEKDAY_MAP = {
        "lunes": 0, "martes": 1, "miércoles": 2, "miercoles": 2,
        "jueves": 3, "viernes": 4, "sábado": 5, "sabado": 5,
        "domingo": 6
    }

    def should_show_today(med: dict, weekday_local: int) -> bool:
        frequency = med.get("frequency", "").lower()
        day_names = ["lunes", "martes", "miércoles", "miercoles",
                     "jueves", "viernes", "sábado", "sabado", "domingo"]
        has_day_name = any(day in frequency for day in day_names)
        if not has_day_name:
            return True
        for day_name, day_num in WEEKDAY_MAP.items():
            if day_name in frequency and day_num == weekday_local:
                return True
        return False

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

            # Determine actual status before building the item
            if log:
                item_status = log["status"]
            else:
                try:
                    scheduled = datetime.fromisoformat(scheduled_datetime)
                    item_status = "missed" if now_local > scheduled else "pending"
                except (ValueError, TypeError):
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
        "timestamp": datetime.utcnow().isoformat()
    }

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
