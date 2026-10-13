"""Tests de backend/terms.py: re-aceptación por versión e historial de aceptaciones.

    python -m unittest discover tests
"""
import copy
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from terms import (  # noqa: E402
    TERMS_VERSION, acceptance_entry, acceptance_update, has_current_acceptance,
    legacy_acceptance_history, parse_version,
)

T_10 = datetime(2026, 7, 6, 12, 0, tzinfo=timezone.utc)
T_11 = datetime(2026, 10, 20, 9, 30, tzinfo=timezone.utc)


def apply_update(doc, update):
    """Aplica los operadores $set/$push que usa accept-terms, como lo haría Mongo."""
    doc = copy.deepcopy(doc)
    for key, value in update.get("$set", {}).items():
        doc[key] = value
    for key, value in update.get("$push", {}).items():
        doc.setdefault(key, []).append(value)
    return doc


def user_10():
    """Usuario existente que aceptó la 1.0, antes de terms_acceptances."""
    return {"accepted_terms_at": T_10, "terms_version": "1.0"}


class ParseVersionTest(unittest.TestCase):
    def test_numeric_not_lexicographic(self):
        self.assertGreater(parse_version("1.10"), parse_version("1.9"))
        self.assertLess("1.10", "1.9")  # como texto saldría al revés

    def test_trailing_zeros_ignored(self):
        self.assertEqual(parse_version("1"), parse_version("1.0"))
        self.assertEqual(parse_version("1.1"), parse_version("1.1.0"))

    def test_invalid(self):
        for bad in (None, "", "1.x", "v1.1", "1..1", 1.1, "-1.0"):
            self.assertIsNone(parse_version(bad), bad)


class CurrentAcceptanceTest(unittest.TestCase):
    def test_current_version_is_1_1(self):
        self.assertEqual(TERMS_VERSION, "1.1")

    def test_user_with_1_0_is_not_accepted(self):
        self.assertFalse(has_current_acceptance(user_10()))

    def test_accepted_without_version_is_outdated(self):
        self.assertFalse(has_current_acceptance({"accepted_terms_at": T_10}))
        self.assertFalse(has_current_acceptance({"accepted_terms_at": T_10, "terms_version": None}))

    def test_never_accepted(self):
        self.assertFalse(has_current_acceptance({}))
        self.assertFalse(has_current_acceptance({"accepted_terms_at": None, "terms_version": "1.1"}))

    def test_newer_version_counts_as_accepted(self):
        self.assertTrue(has_current_acceptance({"accepted_terms_at": T_11, "terms_version": "1.10"}, current="1.9"))
        self.assertFalse(has_current_acceptance({"accepted_terms_at": T_11, "terms_version": "1.9"}, current="1.10"))


class AcceptanceFlowTest(unittest.TestCase):
    def test_existing_1_0_user_reaccepts_1_1(self):
        user = user_10()
        # Migración al arrancar: la aceptación 1.0 pasa a ser la primera entrada.
        user["terms_acceptances"] = legacy_acceptance_history(user)
        self.assertFalse(has_current_acceptance(user))

        user = apply_update(user, acceptance_update(T_11))

        self.assertTrue(has_current_acceptance(user))
        self.assertEqual(user["accepted_terms_at"], T_11)
        self.assertEqual(user["terms_version"], "1.1")
        self.assertEqual(user["terms_acceptances"], [
            {"version": "1.0", "accepted_at": T_10},
            {"version": "1.1", "accepted_at": T_11},
        ])

    def test_new_user_accepts_1_1_directly(self):
        # Registro: mismos campos que fija /auth/register.
        user = {
            "accepted_terms_at": T_11,
            "terms_version": TERMS_VERSION,
            "terms_acceptances": [acceptance_entry(T_11)],
        }
        self.assertTrue(has_current_acceptance(user))
        self.assertEqual(user["terms_acceptances"], [{"version": "1.1", "accepted_at": T_11}])
        self.assertIsNone(legacy_acceptance_history(user))  # la migración no lo toca

    def test_user_who_never_accepted(self):
        user = {"accepted_terms_at": None}
        self.assertIsNone(legacy_acceptance_history(user))
        user = apply_update(user, acceptance_update(T_11))
        self.assertTrue(has_current_acceptance(user))
        self.assertEqual(user["terms_acceptances"], [{"version": "1.1", "accepted_at": T_11}])


class LegacyMigrationTest(unittest.TestCase):
    def test_keeps_previous_acceptance(self):
        self.assertEqual(legacy_acceptance_history(user_10()), [{"version": "1.0", "accepted_at": T_10}])

    def test_without_version_keeps_none(self):
        self.assertEqual(
            legacy_acceptance_history({"accepted_terms_at": T_10}),
            [{"version": None, "accepted_at": T_10}],
        )

    def test_idempotent(self):
        user = user_10()
        user["terms_acceptances"] = legacy_acceptance_history(user)
        self.assertIsNone(legacy_acceptance_history(user))


if __name__ == "__main__":
    unittest.main()
