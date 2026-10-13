"""Tests de backend/history.py: dosis perdidas sintéticas y adherencia del PDF.

    python -m unittest discover tests
"""
import sys
import unittest
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from history import adherence_summary, synthetic_missed  # noqa: E402

GRACE = 30
START = date(2026, 9, 1)
END = date(2026, 9, 30)
NOW = datetime(2026, 9, 30, 12, 0)


def med(med_id="m1", **kw):
    base = {
        "_id": med_id,
        "name": kw.pop("name", "Losartán"),
        "dosage": "50 mg",
        "frequency": "daily",
        "schedule_times": ["08:00", "20:00"],
        "start_date": "2026-08-01",
        "active": True,
        "created_at": datetime(2026, 8, 1, 0, 0),
    }
    base.update(kw)
    return base


def log(scheduled, status, med_id="m1"):
    return {"medication_id": med_id, "scheduled_datetime": scheduled, "status": status}


def missed(meds, existing=(), start=START, end=END, now=NOW, offset=0):
    return synthetic_missed(
        meds, set(existing), start=start, end=end, now_local=now,
        timezone_offset=offset, grace_minutes=GRACE, patient_id="p1",
    )


class SyntheticMissedTests(unittest.TestCase):
    def test_full_range_excludes_future_and_grace(self):
        out = missed([med()])
        # 29 días completos × 2 tomas + 08:00 del día 30 (20:00 es futura).
        self.assertEqual(len(out), 29 * 2 + 1)
        self.assertEqual(out[0]["scheduled_datetime"], "2026-09-01T08:00:00")
        self.assertNotIn("2026-09-30T20:00:00", [m["scheduled_datetime"] for m in out])

    def test_within_grace_not_missed(self):
        out = missed([med()], now=datetime(2026, 9, 30, 8, 20))
        self.assertNotIn("2026-09-30T08:00:00", [m["scheduled_datetime"] for m in out])

    def test_existing_logs_are_skipped(self):
        out = missed([med()], existing={("m1", "2026-09-01T08:00:00")})
        self.assertNotIn("2026-09-01T08:00:00", [m["scheduled_datetime"] for m in out])

    def test_baseline_cuts_earlier_doses(self):
        out = missed([med(updated_at=datetime(2026, 9, 20, 9, 0))])
        self.assertEqual(out[0]["scheduled_datetime"], "2026-09-20T20:00:00")

    def test_baseline_uses_timezone_offset(self):
        # 2026-09-20 13:00 UTC con offset -300 → 08:00 local: la de las 08:00 cuenta.
        out = missed([med(updated_at=datetime(2026, 9, 20, 13, 0))], offset=-300)
        self.assertEqual(out[0]["scheduled_datetime"], "2026-09-20T08:00:00")

    def test_start_end_dates_and_weekdays(self):
        m = med(start_date="2026-09-10", end_date="2026-09-16",
                frequency="lunes y jueves", schedule_times=["9:5"])
        out = missed([m])
        # 10 sep 2026 es jueves; 14 lunes; 16 miércoles (fin).
        self.assertEqual(
            [x["scheduled_datetime"] for x in out],
            ["2026-09-10T09:05:00", "2026-09-14T09:05:00"],
        )

    def test_inactive_medications_ignored(self):
        self.assertEqual(missed([med(active=False)]), [])


class AdherenceTests(unittest.TestCase):
    def summary(self, meds, logs):
        return adherence_summary(meds, logs, START, END, timezone_offset=0)

    def test_full_counts_skipped_in_denominator(self):
        logs = [
            log("2026-09-01T08:00:00", "taken"),
            log("2026-09-01T20:00:00", "taken"),
            log("2026-09-02T08:00:00", "skipped"),
            log("2026-09-02T20:00:00", "missed"),
        ]
        s = self.summary([med()], logs)
        row = s["medications"][0]
        self.assertEqual(row["adherence_status"], "full")
        self.assertIsNone(row["counting_from"])
        self.assertEqual((row["taken"], row["skipped"], row["missed"], row["scheduled"]), (2, 1, 1, 4))
        self.assertEqual(row["percent"], 50)
        self.assertEqual(s["adherence"]["percent"], 50)
        self.assertFalse(s["has_modified_medications"])

    def test_modified_in_range_counts_from_baseline(self):
        m = med(updated_at=datetime(2026, 9, 20, 9, 0))
        logs = [
            log("2026-09-05T08:00:00", "taken"),   # antes del cambio: no cuenta
            log("2026-09-20T08:00:00", "taken"),   # antes de las 09:00: no cuenta
            log("2026-09-20T20:00:00", "taken"),
            log("2026-09-21T08:00:00", "missed"),
        ]
        s = self.summary([m], logs)
        row = s["medications"][0]
        self.assertEqual(row["adherence_status"], "partial")
        self.assertEqual(row["counting_reason"], "modified")
        self.assertEqual(row["counting_from"], "2026-09-20T09:00:00")
        self.assertEqual((row["taken"], row["scheduled"], row["percent"]), (1, 2, 50))
        self.assertTrue(s["has_modified_medications"])

    def test_created_in_range_is_partial_but_not_modified(self):
        m = med(created_at=datetime(2026, 9, 15, 10, 0), start_date="2026-09-15")
        s = self.summary([m], [log("2026-09-15T20:00:00", "taken")])
        row = s["medications"][0]
        self.assertEqual(row["adherence_status"], "partial")
        self.assertEqual(row["counting_reason"], "created")
        self.assertFalse(s["has_modified_medications"])

    def test_modified_after_range_not_calculable(self):
        m = med(updated_at=datetime(2026, 10, 5, 9, 0))
        s = self.summary([m], [log("2026-09-01T08:00:00", "taken")])
        row = s["medications"][0]
        self.assertEqual(row["adherence_status"], "not_calculable")
        self.assertIsNone(row["percent"])
        self.assertEqual(s["adherence"]["scheduled"], 0)
        self.assertIsNone(s["adherence"]["percent"])
        self.assertTrue(s["has_modified_medications"])

    def test_inactive_with_logs_listed_but_not_counted(self):
        s = self.summary(
            [med(), med("m2", name="Metformina", active=False)],
            [log("2026-09-01T08:00:00", "taken"), log("2026-09-01T08:00:00", "taken", "m2")],
        )
        rows = {r["id"]: r for r in s["medications"]}
        self.assertEqual(rows["m2"]["adherence_status"], "not_calculable")
        self.assertEqual(rows["m2"]["counting_reason"], "inactive")
        self.assertEqual(s["adherence"]["scheduled"], 1)
        # Activos primero.
        self.assertEqual([r["id"] for r in s["medications"]], ["m1", "m2"])

    def test_irrelevant_medications_omitted(self):
        s = self.summary(
            [
                med("old", active=False),                              # inactivo sin logs
                med("ended", end_date="2026-08-15"),                   # terminó antes
                med("future", start_date="2026-10-03"),                # empieza después
                med("new", created_at=datetime(2026, 10, 2, 9, 0)),    # creado después
            ],
            [],
        )
        self.assertEqual(s["medications"], [])

    def test_overall_sums_only_calculable_windows(self):
        meds = [med(), med("m2", name="Metformina", updated_at=datetime(2026, 9, 29, 0, 0))]
        logs = [
            log("2026-09-10T08:00:00", "taken"),
            log("2026-09-10T08:00:00", "missed", "m2"),   # antes del cambio de m2
            log("2026-09-29T08:00:00", "missed", "m2"),
        ]
        s = self.summary(meds, logs)
        self.assertEqual((s["adherence"]["taken"], s["adherence"]["scheduled"]), (1, 2))
        self.assertEqual(s["adherence"]["percent"], 50)

    def test_end_to_end_with_synthetic(self):
        m = med(updated_at=datetime(2026, 9, 28, 0, 0))
        real = [log("2026-09-28T08:00:00", "taken")]
        all_logs = real + missed([m], existing={("m1", "2026-09-28T08:00:00")})
        row = self.summary([m], all_logs)["medications"][0]
        # 28: 08 tomada, 20 perdida; 29: dos perdidas; 30: 08 perdida.
        self.assertEqual((row["taken"], row["missed"], row["scheduled"]), (1, 4, 5))
        self.assertEqual(row["percent"], 20)


if __name__ == "__main__":
    unittest.main()
