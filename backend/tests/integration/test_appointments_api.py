"""T3.28-T3.31 — Appointments API integration tests."""

import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient, ASGITransport

from app.database import get_db
from tests.conftest import test_session_factory


@pytest_asyncio.fixture
async def client():
    from app.main import app

    async def override_get_db():
        async with test_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_client(client):
    """Register user and return authenticated client."""
    resp = await client.post("/api/v1/auth/register", json={
        "email": "admin@hospital.com",
        "username": "admin1",
        "password": "SecurePass123!",
        "role": "ADMIN",
    })
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest_asyncio.fixture
async def test_patient(auth_client):
    """Create a test patient and return the ID."""
    resp = await auth_client.post("/api/v1/patients", json={
        "first_name": "Appointment", "last_name": "Patient",
    })
    return resp.json()["id"]


@pytest.mark.asyncio
class TestAppointmentsAPI:
    """Integration tests for appointment CRUD endpoints."""

    BASE_URL = "/api/v1/appointments"

    async def test_create_appointment(self, auth_client, test_patient):
        """T3.29 — Create appointment returns 201."""
        response = await auth_client.post(self.BASE_URL, json={
            "patient_id": str(test_patient),
            "title": "Annual Checkup",
            "appointment_date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        })
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Annual Checkup"
        assert data["status"] == "SCHEDULED"

    async def test_list_appointments(self, auth_client, test_patient):
        """T3.28 — List appointments with filters."""
        now = datetime.now(timezone.utc)
        for i in range(3):
            await auth_client.post(self.BASE_URL, json={
                "patient_id": str(test_patient),
                "title": f"Appointment {i}",
                "appointment_date": (now + timedelta(days=i)).isoformat(),
            })

        response = await auth_client.get(self.BASE_URL)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3

    async def test_filter_by_status(self, auth_client, test_patient):
        """T3.28 — Filter appointments by status."""
        now = datetime.now(timezone.utc)
        resp = await auth_client.post(self.BASE_URL, json={
            "patient_id": str(test_patient),
            "title": "To Cancel",
            "appointment_date": (now + timedelta(days=1)).isoformat(),
        })
        appt_id = resp.json()["id"]

        # Cancel it
        await auth_client.patch(
            f"{self.BASE_URL}/{appt_id}/status",
            json={"status": "CANCELLED"},
        )

        response = await auth_client.get(f"{self.BASE_URL}?status=CANCELLED")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1

    async def test_update_status(self, auth_client, test_patient):
        """T3.30 — Update appointment status."""
        now = datetime.now(timezone.utc)
        resp = await auth_client.post(self.BASE_URL, json={
            "patient_id": str(test_patient),
            "title": "Complete Me",
            "appointment_date": (now + timedelta(days=1)).isoformat(),
        })
        appt_id = resp.json()["id"]

        response = await auth_client.patch(
            f"{self.BASE_URL}/{appt_id}/status",
            json={"status": "COMPLETED"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "COMPLETED"

    async def test_invalid_status_transition(self, auth_client, test_patient):
        """T3.31 — Invalid transition returns 422."""
        now = datetime.now(timezone.utc)
        resp = await auth_client.post(self.BASE_URL, json={
            "patient_id": str(test_patient),
            "title": "Bad Transition",
            "appointment_date": (now + timedelta(days=1)).isoformat(),
        })
        appt_id = resp.json()["id"]

        # Mark as completed first
        await auth_client.patch(
            f"{self.BASE_URL}/{appt_id}/status",
            json={"status": "COMPLETED"},
        )

        # Try to go back to SCHEDULED (invalid)
        response = await auth_client.patch(
            f"{self.BASE_URL}/{appt_id}/status",
            json={"status": "SCHEDULED"},
        )
        assert response.status_code == 422

    async def test_create_appointment_invalid_patient(self, auth_client):
        """T3.32 — Appointment for non-existent patient returns 404."""
        response = await auth_client.post(self.BASE_URL, json={
            "patient_id": str(uuid.uuid4()),
            "title": "Orphan Appointment",
            "appointment_date": datetime.now(timezone.utc).isoformat(),
        })
        assert response.status_code == 404

    async def test_delete_appointment_receptionist_forbidden(self, auth_client, test_patient):
        """T3.27 — RECEPTIONIST cannot delete appointments."""
        # Register as receptionist
        from app.main import app
        app.dependency_overrides.clear()

        async def override_get_db():
            async with test_session_factory() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise
                finally:
                    await session.close()

        app.dependency_overrides[get_db] = override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as rec_client:
            resp = await rec_client.post("/api/v1/auth/register", json={
                "email": "receptionist@hospital.com",
                "username": "receptionist2",
                "password": "SecurePass123!",
                "role": "RECEPTIONIST",
            })
            rec_client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"

            now = datetime.now(timezone.utc)
            create_resp = await rec_client.post(self.BASE_URL, json={
                "patient_id": str(test_patient),
                "title": "Receptionist Appointment",
                "appointment_date": (now + timedelta(days=1)).isoformat(),
            })
            appt_id = create_resp.json()["id"]

            response = await rec_client.delete(f"{self.BASE_URL}/{appt_id}")
            assert response.status_code == 403
