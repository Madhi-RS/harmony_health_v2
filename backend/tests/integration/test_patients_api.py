"""T3.19-T3.27 — Patients API integration tests."""

import pytest
import pytest_asyncio
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
    """Register a user and return authenticated client context."""
    resp = await client.post("/api/v1/auth/register", json={
        "email": "receptionist@hospital.com",
        "username": "receptionist1",
        "password": "SecurePass123!",
        "role": "RECEPTIONIST",
    })
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest.mark.asyncio
class TestPatientsAPI:
    """Integration tests for patient CRUD endpoints."""

    BASE_URL = "/api/v1/patients"

    async def test_list_patients_empty(self, auth_client):
        """T3.19 — Empty patient list returns 200 with empty array."""
        response = await auth_client.get(self.BASE_URL)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []
        assert data["page"] == 1

    async def test_create_patient(self, auth_client):
        """T3.23 — Create patient returns 201."""
        response = await auth_client.post(self.BASE_URL, json={
            "first_name": "John",
            "last_name": "Doe",
            "phone": "+1234567890",
            "email": "john.doe@example.com",
        })
        assert response.status_code == 201
        data = response.json()
        assert data["first_name"] == "John"
        assert data["last_name"] == "Doe"
        assert "id" in data

    async def test_get_patient(self, auth_client):
        """T3.21 — Get patient by ID."""
        create_resp = await auth_client.post(self.BASE_URL, json={
            "first_name": "Jane", "last_name": "Smith",
        })
        patient_id = create_resp.json()["id"]

        response = await auth_client.get(f"{self.BASE_URL}/{patient_id}")
        assert response.status_code == 200
        assert response.json()["first_name"] == "Jane"

    async def test_get_patient_not_found(self, auth_client):
        """T3.22 — Non-existent patient returns 404."""
        import uuid
        response = await auth_client.get(f"{self.BASE_URL}/{uuid.uuid4()}")
        assert response.status_code == 404

    async def test_update_patient(self, auth_client):
        """T3.25 — Update patient returns 200."""
        create_resp = await auth_client.post(self.BASE_URL, json={
            "first_name": "Old", "last_name": "Name",
        })
        patient_id = create_resp.json()["id"]

        response = await auth_client.put(
            f"{self.BASE_URL}/{patient_id}",
            json={"first_name": "New", "last_name": "Name"},
        )
        assert response.status_code == 200
        assert response.json()["first_name"] == "New"

    async def test_delete_patient(self, auth_client):
        """T3.26 — Delete patient returns 204."""
        create_resp = await auth_client.post(self.BASE_URL, json={
            "first_name": "Delete", "last_name": "Me",
        })
        patient_id = create_resp.json()["id"]

        response = await auth_client.delete(f"{self.BASE_URL}/{patient_id}")
        assert response.status_code == 204

        # Verify soft-deleted
        get_resp = await auth_client.get(f"{self.BASE_URL}/{patient_id}")
        assert get_resp.status_code == 404

    async def test_search_patients(self, auth_client):
        """T3.20 — Search by name returns filtered results."""
        await auth_client.post(self.BASE_URL, json={
            "first_name": "Alice", "last_name": "Johnson",
        })
        await auth_client.post(self.BASE_URL, json={
            "first_name": "Bob", "last_name": "Williams",
        })

        response = await auth_client.get(f"{self.BASE_URL}?query=Alice")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["first_name"] == "Alice"

    async def test_create_patient_validation(self, auth_client):
        """T3.24 — Invalid fields return 422."""
        response = await auth_client.post(self.BASE_URL, json={
            "first_name": "",  # Empty name
            "last_name": "Test",
        })
        assert response.status_code == 422

    async def test_pagination(self, auth_client):
        """T3.19 — Pagination controls work."""
        for i in range(5):
            await auth_client.post(self.BASE_URL, json={
                "first_name": f"User{i}", "last_name": "Test",
            })

        response = await auth_client.get(f"{self.BASE_URL}?page=1&size=2")
        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["pages"] == 3
