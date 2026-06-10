#!/usr/bin/env python3
"""
Migración one-shot: normalizar emails a lowercase y marcar usuarios existentes como verificados.
Ejecutar ANTES de desplegar la nueva versión del backend.

Uso:
    python migrate_emails.py --dry-run    # Ver cambios sin aplicarlos
    python migrate_emails.py              # Aplicar cambios
"""

import asyncio
import os
import sys
from pathlib import Path
from collections import defaultdict

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


async def migrate(dry_run: bool = True):
    print(f"{'[DRY RUN] ' if dry_run else ''}Iniciando migración de emails...")

    # 1. Detectar colisiones en caregivers
    caregivers = await db.caregivers.find({}).to_list(None)
    email_map = defaultdict(list)
    for c in caregivers:
        email_lower = c["email"].strip().lower()
        email_map[email_lower].append({
            "_id": c["_id"],
            "original_email": c["email"],
            "name": c["name"],
            "created_at": c.get("created_at")
        })

    collisions = {k: v for k, v in email_map.items() if len(v) > 1}
    if collisions:
        print("\n⚠️  COLISIONES DETECTADAS - Requieren resolución manual:")
        for email, users in collisions.items():
            print(f"\n  Email normalizado: {email}")
            for u in users:
                print(f"    - {u['name']} (original: {u['original_email']}, id: {u['_id']}, created: {u.get('created_at')})")
        print("\nResuelve las colisiones manualmente antes de ejecutar la migración.")
        print("Opción: fusionar cuentas o eliminar duplicados.")
        return False

    # 2. Migrar emails en caregivers y marcar como verificados
    updated_caregivers = 0
    for c in caregivers:
        original = c["email"]
        normalized = original.strip().lower()
        needs_update = original != normalized or not c.get("email_verified", False)

        if needs_update:
            if not dry_run:
                await db.caregivers.update_one(
                    {"_id": c["_id"]},
                    {"$set": {"email": normalized, "email_verified": True}}
                )
            print(f"  Caregiver: {original} -> {normalized} (email_verified: True)")
            updated_caregivers += 1

    # 3. Migrar emails en invitations
    invitations = await db.invitations.find({}).to_list(None)
    updated_invitations = 0
    for inv in invitations:
        original = inv.get("invitee_email", "")
        normalized = original.strip().lower()
        if original != normalized:
            if not dry_run:
                await db.invitations.update_one(
                    {"_id": inv["_id"]},
                    {"$set": {"invitee_email": normalized}}
                )
            print(f"  Invitation: {original} -> {normalized}")
            updated_invitations += 1

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Resumen:")
    print(f"  - Caregivers actualizados: {updated_caregivers}")
    print(f"  - Invitations actualizadas: {updated_invitations}")

    if dry_run:
        print("\nEjecuta sin --dry-run para aplicar los cambios.")
    else:
        print("\n✅ Migración completada exitosamente.")

    return True


async def main():
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv
    success = await migrate(dry_run)
    client.close()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
