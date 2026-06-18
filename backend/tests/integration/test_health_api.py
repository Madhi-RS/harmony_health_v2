"""T1.6 - Health endpoint integration test using FastAPI TestClient."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


class TestHealthEndpoint:
    """Phase 1 smoke tests for the backend health endpoint."""

    def test_health_returns_200(self, client):
        """T1.6 — Health endpoint returns 200 with correct payload."""
        response = client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "backend"
        assert data["version"] == "0.1.0"

    def test_health_method_not_allowed(self, client):
        """POST to health endpoint should return 405."""
        response = client.post("/health")
        assert response.status_code == 405

    def test_openapi_docs_available(self, client):
        """OpenAPI schema should be generated."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        data = response.json()
        assert data["info"]["title"] == "Harmony Health PMS"
