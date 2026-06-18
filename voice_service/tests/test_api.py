"""T8.13-T8.15 — Voice API integration tests."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


class TestVoiceAPI:

    def test_health_endpoint(self, client):
        """Health endpoint returns status."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "voice-service"

    def test_transcribe_no_audio(self, client):
        """Transcribe without file returns 422."""
        response = client.post("/voice/transcribe")
        assert response.status_code == 422

    def test_synthesize_no_text(self, client):
        """Synthesize without text returns 422."""
        response = client.post("/voice/synthesize")
        assert response.status_code == 422
