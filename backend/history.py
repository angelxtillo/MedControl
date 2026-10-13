"""Historial de dosis: reconstrucción de dosis perdidas y adherencia.

Funciones puras (sin acceso a la base de datos) para poder testearlas sin Mongo.
Todas las fechas/horas "locales" son naive en la hora local del cliente
(timezone_offset en minutos), igual que scheduled_datetime en los logs.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Optional

# ============= SCHEDULING HELPERS =============
WEEKDAY_MAP = {
    "lunes": 0, "martes": 1, "miércoles": 2, "miercoles": 2,
    "jueves": 3, "viernes": 4, "sábado": 5, "sabado": 5,
    "domingo": 6
}


def ensure_naive(dt: datetime) -> datetime:
    """Convierte datetime a naive UTC si es aware (motor puede devolver ambos)."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


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


def _normalize_slot(time_slot: str) -> str:
    try:
        parts = time_slot.split(":")
        if len(parts) == 2:
            return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
    except Exception:
        pass
    return time_slot


def _parse_local(value: str) -> Optional[datetime]:
    try:
        return ensure_naive(datetime.fromisoformat(value))
    except (ValueError, TypeError):
        return None


# ============= DOSIS PERDIDAS =============
def synthetic_missed(
    medications: list,
    existing_keys: set,
    start: date,
    end: date,
    now_local: datetime,
    timezone_offset: int,
    grace_minutes: int,
    patient_id: str,
) -> list:
    """Dosis programadas entre start y end (inclusive) de los medicamentos
    activos que no tienen log y ya pasaron el margen de gracia.

    Solo desde el baseline del medicamento: sin historial de horarios, antes de
    la última edición no se sabe qué dosis tocaban."""
    out = []
    for med in medications:
        if not med.get("active", True):
            continue
        med_id = str(med["_id"])
        try:
            med_start = date.fromisoformat(med["start_date"][:10])
        except (KeyError, TypeError, ValueError):
            med_start = start
        end_date_str = med.get("end_date")
        baseline = med_baseline_local(med, timezone_offset)

        day = max(start, med_start)
        while day <= end:
            day_str = day.isoformat()
            if end_date_str and day_str > end_date_str:
                break
            if should_show_today(med, day.weekday()):
                for time_slot in med.get("schedule_times", []):
                    scheduled_dt = f"{day_str}T{_normalize_slot(time_slot)}:00"
                    scheduled = _parse_local(scheduled_dt)
                    if scheduled is None:
                        continue
                    if scheduled + timedelta(minutes=grace_minutes) >= now_local:
                        continue
                    if baseline is not None and scheduled < baseline:
                        continue
                    if (med_id, scheduled_dt) in existing_keys:
                        continue
                    out.append({
                        "id": f"synthetic_{med_id}_{scheduled_dt}",
                        "medication_id": med_id,
                        "medication_name": med["name"],
                        "patient_id": patient_id,
                        "scheduled_datetime": scheduled_dt,
                        "taken_datetime": None,
                        "status": "missed",
                        "notes": None,
                        "logged_by": None,
                        "logged_by_name": None,
                        "is_synthetic": True,
                        "created_at": scheduled_dt,
                    })
            day += timedelta(days=1)
    return out


# ============= ADHERENCIA =============
COUNTED_STATUSES = ("taken", "skipped", "missed")


def _percent(taken: int, scheduled: int) -> Optional[int]:
    return round(100 * taken / scheduled) if scheduled else None


def adherence_summary(
    medications: list,
    logs: list,
    start: date,
    end: date,
    timezone_offset: int,
) -> dict:
    """Adherencia por medicamento y global en [start, end].

    adherencia = tomadas / (tomadas + omitidas + perdidas). Las dosis futuras no
    cuentan porque synthetic_missed no las genera.

    Las perdidas solo se reconstruyen desde el baseline (creación o última
    edición), así que contar logs anteriores inflaría la adherencia. Cada
    medicamento cuenta solo desde max(start, baseline) — counting_from y
    counting_reason lo indican — y la global suma solo esas ventanas:
      - "full": todo el periodo es calculable.
      - "partial": el baseline cae dentro del periodo.
      - "not_calculable": inactivo (no se sabe cuándo estuvo activo) o
        modificado después del periodo; no suma a la global.
    """
    range_start = datetime.combine(start, time.min)
    range_end = datetime.combine(end + timedelta(days=1), time.min)  # exclusivo

    logs_by_med = defaultdict(list)
    for log in logs:
        logs_by_med[log["medication_id"]].append(log)

    rows = []
    totals = {"taken": 0, "skipped": 0, "missed": 0}
    for med in medications:
        med_id = str(med["_id"])
        med_logs = logs_by_med.get(med_id, [])
        active = med.get("active", True)

        if not med_logs:
            # Sin dosis en el periodo: solo interesa si estuvo vigente en él.
            if not active:
                continue
            if med.get("start_date", "")[:10] > end.isoformat():
                continue
            if med.get("end_date") and med["end_date"] < start.isoformat():
                continue

        counting_from = None
        counting_reason = None
        window_start = range_start
        baseline = med_baseline_local(med, timezone_offset)
        if baseline is not None and baseline > range_start:
            window_start = baseline
            counting_from = baseline.isoformat(timespec="seconds")
            counting_reason = "modified" if med.get("updated_at") else "created"

        if not active:
            status = "not_calculable"
            counting_reason = "inactive"
        elif window_start >= range_end:
            if counting_reason == "created" and not med_logs:
                continue  # creado después del periodo
            status = "not_calculable"
        else:
            status = "partial" if counting_from else "full"

        counts = {"taken": 0, "skipped": 0, "missed": 0}
        if status != "not_calculable":
            for log in med_logs:
                if log.get("status") not in COUNTED_STATUSES:
                    continue
                scheduled = _parse_local(log.get("scheduled_datetime"))
                if scheduled is None or not (window_start <= scheduled < range_end):
                    continue
                counts[log["status"]] += 1
            for k in totals:
                totals[k] += counts[k]

        scheduled_total = sum(counts.values())
        rows.append({
            "id": med_id,
            "name": med["name"],
            "dosage": med.get("dosage"),
            "frequency": med.get("frequency"),
            "schedule_times": med.get("schedule_times", []),
            "start_date": med.get("start_date"),
            "end_date": med.get("end_date"),
            "active": active,
            "adherence_status": status,
            "counting_from": counting_from,
            "counting_reason": counting_reason,
            **counts,
            "scheduled": scheduled_total,
            "percent": _percent(counts["taken"], scheduled_total) if status != "not_calculable" else None,
        })

    rows.sort(key=lambda r: (not r["active"], r["name"].lower()))
    scheduled_total = sum(totals.values())
    return {
        "medications": rows,
        "adherence": {
            **totals,
            "scheduled": scheduled_total,
            "percent": _percent(totals["taken"], scheduled_total),
        },
        "has_modified_medications": any(
            r["counting_reason"] == "modified" and r["adherence_status"] != "full"
            for r in rows
        ),
    }
