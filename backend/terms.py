"""Aceptación de Términos y Condiciones / Política de Privacidad.

Funciones puras (sin acceso a la base de datos) para poder testearlas sin Mongo.
"""
from datetime import datetime
from typing import Optional

# Versión vigente de los Términos y Condiciones / Política de Privacidad
# publicados en GitHub Pages. Se guarda por usuario al aceptar. Subirla obliga a
# los usuarios con una versión anterior a volver a aceptar: public_user les
# devuelve accepted_terms_at=None y la app muestra el gate bloqueante (lo que
# permite exigir re-aceptación sin publicar un build nuevo).
# 1.1: FLUX ARQUIESTRUCTURAS S.A.S. como responsable del tratamiento y titular.
TERMS_VERSION = "1.1"


def parse_version(version) -> Optional[tuple]:
    """"1.10" -> (1, 10). Compara numéricamente, no como texto ("1.10" > "1.9").
    Los ceros finales no cuentan ("1" == "1.0"). None o formato inválido -> None."""
    if not isinstance(version, str):
        return None
    try:
        parts = [int(p) for p in version.strip().split(".")]
    except ValueError:
        return None
    if any(p < 0 for p in parts):
        return None
    while len(parts) > 1 and parts[-1] == 0:
        parts.pop()
    return tuple(parts)


def has_current_acceptance(user: dict, current: str = TERMS_VERSION) -> bool:
    """True si el usuario aceptó la versión vigente (o una posterior). Un usuario
    con accepted_terms_at pero sin terms_version (o con una versión ilegible)
    cuenta como desactualizado."""
    if not user.get("accepted_terms_at"):
        return False
    accepted = parse_version(user.get("terms_version"))
    return accepted is not None and accepted >= parse_version(current)


def acceptance_entry(accepted_at: datetime, version: Optional[str] = TERMS_VERSION) -> dict:
    """Entrada del historial terms_acceptances."""
    return {"version": version, "accepted_at": accepted_at}


def acceptance_update(accepted_at: datetime, version: str = TERMS_VERSION) -> dict:
    """Update de Mongo para registrar una aceptación: fija la vigente y agrega
    la entrada al historial sin tocar las anteriores."""
    return {
        "$set": {"accepted_terms_at": accepted_at, "terms_version": version},
        "$push": {"terms_acceptances": acceptance_entry(accepted_at, version)},
    }


def legacy_acceptance_history(user: dict) -> Optional[list]:
    """Historial inicial para un usuario anterior a terms_acceptances: conserva
    su aceptación actual (normalmente la 1.0) como primera entrada. None si no
    hay nada que migrar (ya tiene historial o nunca aceptó)."""
    if "terms_acceptances" in user or not user.get("accepted_terms_at"):
        return None
    return [acceptance_entry(user["accepted_terms_at"], user.get("terms_version"))]
