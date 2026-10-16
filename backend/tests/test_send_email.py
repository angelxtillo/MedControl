"""Tests de send_email (Resend) con httpx simulado: no sale nada a la red.

Ejecutar desde backend/:  python -m unittest discover -s tests
"""
import asyncio
import json
import os
import sys
import unittest
from pathlib import Path

import httpx

# server.py exige estas variables al importarse; Motor no conecta hasta la
# primera operación, así que no hace falta una base de datos real.
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "dosaria_test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server  # noqa: E402

FAKE_KEY = "re_test_clave_que_no_debe_aparecer_en_logs"
FROM = "Dosaria <soporte@dosaria.org>"


class SendEmailTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self._orig = (server.RESEND_API_KEY, server.EMAIL_FROM, server.httpx.AsyncClient)
        server.RESEND_API_KEY = FAKE_KEY
        server.EMAIL_FROM = FROM

    def tearDown(self):
        server.RESEND_API_KEY, server.EMAIL_FROM, server.httpx.AsyncClient = self._orig

    def _mock_resend(self, status_code, body):
        def handler(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            return httpx.Response(status_code, json=body)

        real_client = self._orig[2]
        server.httpx.AsyncClient = lambda **kw: real_client(
            transport=httpx.MockTransport(handler), **kw
        )

    def _send(self):
        with self.assertLogs(level="INFO") as logs:
            ok = asyncio.run(
                server.send_email("ana@example.com", "Asunto", "<p>Hola</p>", tag="test")
            )
        output = "\n".join(logs.output)
        self.assertNotIn(FAKE_KEY, output)
        return ok, output

    def test_exito(self):
        self._mock_resend(200, {"id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c"})
        ok, output = self._send()

        self.assertTrue(ok)
        self.assertEqual(len(self.requests), 1)
        req = self.requests[0]
        self.assertEqual(str(req.url), "https://api.resend.com/emails")
        self.assertEqual(req.method, "POST")
        self.assertEqual(req.headers["Authorization"], f"Bearer {FAKE_KEY}")
        self.assertEqual(
            json.loads(req.content),
            {"from": FROM, "to": ["ana@example.com"], "subject": "Asunto", "html": "<p>Hola</p>"},
        )
        self.assertIn("Resend OK status=200", output)
        self.assertIn("4ef9a417", output)

    def test_error_4xx(self):
        self._mock_resend(
            422,
            {"statusCode": 422, "name": "validation_error", "message": "Invalid `to` field."},
        )
        ok, output = self._send()

        self.assertFalse(ok)
        self.assertIn("status=422", output)
        self.assertIn("validation_error", output)
        self.assertIn("Invalid `to` field.", output)
        self.assertNotIn("LÍMITE", output)

    def test_429_limite_diario(self):
        self._mock_resend(
            429,
            {
                "statusCode": 429,
                "name": "daily_quota_exceeded",
                "message": "You have reached your daily email sending quota.",
            },
        )
        ok, output = self._send()

        self.assertFalse(ok)
        self.assertIn("Resend 429", output)
        self.assertIn("LÍMITE DE ENVÍO ALCANZADO", output)
        self.assertIn("100 correos/día", output)
        self.assertIn("daily_quota_exceeded", output)

    def test_sin_configuracion_no_llama_a_resend(self):
        self._mock_resend(200, {"id": "x"})
        server.RESEND_API_KEY = ""
        with self.assertLogs(level="ERROR"):
            ok = asyncio.run(server.send_email("ana@example.com", "A", "<p/>", tag="test"))
        self.assertFalse(ok)
        self.assertEqual(self.requests, [])


if __name__ == "__main__":
    unittest.main()
