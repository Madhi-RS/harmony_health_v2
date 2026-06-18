"""T2.25-T2.34 — Auth edge case tests using AsyncClient."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.database import get_db
from tests.conftest import test_session_factory


@pytest_asyncio.fixture
async def client():
    """Create AsyncClient with DB dependency override."""
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


@pytest.mark.asyncio
class TestAuthEdgeCases:
    """Edge case tests for authentication."""

    REGISTER_URL = "/api/v1/auth/register"
    ME_URL = "/api/v1/auth/me"

    async def test_email_case_insensitivity(self, client):
        """T2.25 — Emails treated case-insensitively."""
        payload = {
            "email": "UpperCase@Example.com",
            "username": "caseuser",
            "password": "SecurePass123!",
        }
        await client.post(self.REGISTER_URL, json=payload)

        payload2 = payload.copy()
        payload2["username"] = "caseuser2"
        payload2["email"] = "uppercase@example.com"
        resp2 = await client.post(self.REGISTER_URL, json=payload2)
        assert resp2.status_code == 409

    async def test_token_tampering(self, client):
        """T2.26 — Modified JWT is rejected."""
        tampered = "eyJhbGciOiJIUzI1NiJ9.tampered.signature"
        response = await client.get(
            self.ME_URL,
            headers={"Authorization": f"Bearer {tampered}"},
        )
        assert response.status_code == 401

    async def test_sql_injection_in_email(self, client):
        """T2.27 — SQL injection attempt returns 422, not 500."""
        response = await client.post(self.REGISTER_URL, json={
            "email": "' OR 1=1; --",
            "username": "sqli_user",
            "password": "SecurePass123!",
        })
        assert response.status_code == 422

    async def test_jwt_algorithm_confusion(self, client):
        """S.1 — JWT with 'none' algorithm rejected."""
        import jwt as pyjwt
        bad_token = pyjwt.encode(
            {"sub": "admin", "type": "access"},
            "",
            algorithm="none",
        )
        response = await client.get(
            self.ME_URL,
            headers={"Authorization": f"Bearer {bad_token}"},
        )
        assert response.status_code == 401

    async def test_weak_password_rejected(self, client):
        """T2.17 — Password validation on registration."""
        response = await client.post(self.REGISTER_URL, json={
            "email": "weak@example.com",
            "username": "weakuser",
            "password": "123",
        })
        assert response.status_code == 422

    async def test_empty_payload_returns_422(self, client):
        """T2.17 — Empty registration payload returns 422."""
        response = await client.post(self.REGISTER_URL, json={})
        assert response.status_code == 422

    async def test_role_enforcement_admin_register(self, client):
        """T2.29 — ADMIN role accepted during registration."""
        resp = await client.post(self.REGISTER_URL, json={
            "email": "admin@hospital.com",
            "username": "head_admin",
            "password": "SecurePass123!",
            "role": "ADMIN",
        })
        assert resp.status_code == 201
        token = resp.json()["access_token"]

        from jose import jwt
        from app.core.config import settings
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        assert payload["type"] == "access"
