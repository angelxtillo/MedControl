#!/usr/bin/env python3
"""
Limpieza de logs duplicados en medication_logs.
Ejecutar ANTES de crear el índice único (medication_id, scheduled_datetime).

Uso:
    python cleanup_duplicate_logs.py --dry-run    # Ver duplicados sin eliminar
    python cleanup_duplicate_logs.py              # Eliminar duplicados
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


async def cleanup(dry_run: bool = True):
    print(f"{'[DRY RUN] ' if dry_run else ''}Buscando logs duplicados...")

    logs = await db.medication_logs.find({}).to_list(None)
    print(f"Total logs: {len(logs)}")

    # Agrupar por (medication_id, scheduled_datetime)
    groups = defaultdict(list)
    for log in logs:
        key = (log["medication_id"], log["scheduled_datetime"])
        groups[key].append(log)

    duplicates = {k: v for k, v in groups.items() if len(v) > 1}

    if not duplicates:
        print("No se encontraron duplicados.")
        return True

    print(f"\nDuplicados encontrados: {len(duplicates)} grupos")
    total_to_delete = 0

    for (med_id, sched_dt), logs_group in duplicates.items():
        # Ordenar por created_at descendente, conservar el más reciente
        logs_group.sort(key=lambda x: x.get("created_at") or x["_id"].generation_time, reverse=True)
        keep = logs_group[0]
        to_delete = logs_group[1:]
        total_to_delete += len(to_delete)

        print(f"\n  Clave: medication_id={med_id}, scheduled_datetime={sched_dt}")
        print(f"    Conservar: {keep['_id']} (status={keep['status']}, created_at={keep.get('created_at')})")
        for d in to_delete:
            print(f"    Eliminar:  {d['_id']} (status={d['status']}, created_at={d.get('created_at')})")

            if not dry_run:
                await db.medication_logs.delete_one({"_id": d["_id"]})

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Logs a eliminar: {total_to_delete}")

    if dry_run:
        print("\nEjecuta sin --dry-run para eliminar los duplicados.")
    else:
        print(f"\n✅ Eliminados {total_to_delete} logs duplicados.")

    return True


async def main():
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv
    success = await cleanup(dry_run)
    client.close()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
