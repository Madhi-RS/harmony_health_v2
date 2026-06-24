"""T4.5-T4.9 — AIClient unit tests with mocked HTTP."""

import pytest
import httpx
import respx

from app.services.ai_client import AIClient
from app.core.exceptions import ServiceUnavailableException


@pytest.mark.asyncio
class TestAIClient:
    """Tests for AIClient HTTP communication with AI Sales Layer API."""

    @pytest.fixture
    def client(self):
        return AIClient(
            base_url="http://mock-ai:8080",
            tenant_id="hospital_001",
            site_id="main_branch",
            timeout=30,
        )

    @pytest.fixture
    def sample_history(self):
        return [
            {"role": "user", "content": "What are your hours?"},
            {"role": "assistant", "content": "We are open 8 AM to 8 PM."},
        ]

    async def test_constructor(self):
        """T4.5 — AIClient stores config correctly."""
        client = AIClient(
            base_url="http://test:8080",
            tenant_id="ten_1",
            site_id="site_1",
            timeout=15,
        )
        assert client.base_url == "http://test:8080"
        assert client.tenant_id == "ten_1"
        assert client.site_id == "site_1"
        assert client.timeout == 15

    @respx.mock
    async def test_send_message_success(self, client, sample_history):
        """T4.6 — AI service returns valid response via session init + chat."""
        # Mock session init
        respx.post("http://mock-ai:8080/api/v1/session/init").mock(
            return_value=httpx.Response(200, json={
                "session_id": "sess-123",
                "tenant_id": "hospital_001",
                "site_id": "main_branch",
            }),
        )
        # Mock chat
        route = respx.post("http://mock-ai:8080/api/v1/chat").mock(
            return_value=httpx.Response(200, json={
                "chat": {"response": "Test reply"}
            }),
        )

        result = await client.send_message(
            message="Hello",
            conversation_history=sample_history,
        )
        assert result == "Test reply"
        assert route.called

    @respx.mock
    async def test_send_message_timeout(self, client, sample_history):
        """T4.7 — Timeout raises ServiceUnavailableException."""
        respx.post("http://mock-ai:8080/api/v1/session/init").mock(
            return_value=httpx.Response(200, json={"session_id": "sess-123"}),
        )
        respx.post("http://mock-ai:8080/api/v1/chat").mock(
            side_effect=httpx.TimeoutException("Timeout"),
        )

        with pytest.raises(ServiceUnavailableException):
            await client.send_message(
                message="Hello",
                conversation_history=sample_history,
            )

    @respx.mock
    async def test_session_init_failure(self, client, sample_history):
        """T4.8 — Session init failure raises ServiceUnavailableException."""
        respx.post("http://mock-ai:8080/api/v1/session/init").mock(
            side_effect=httpx.TimeoutException("Timeout"),
        )

        with pytest.raises(ServiceUnavailableException):
            await client.send_message(
                message="Hello",
                conversation_history=sample_history,
            )

    @respx.mock
    async def test_extract_response_variants(self, client, sample_history):
        """AIClient handles the chat.response format."""
        respx.post("http://mock-ai:8080/api/v1/session/init").mock(
            return_value=httpx.Response(200, json={"session_id": "sess-456"}),
        )
        respx.post("http://mock-ai:8080/api/v1/chat").mock(
            return_value=httpx.Response(200, json={
                "chat": {"response": "Content from AI Sales Layer"}
            }),
        )
        result = await client.send_message("Hi", sample_history)
        assert result == "Content from AI Sales Layer"

    @respx.mock
    async def test_send_message_safe_fallback(self, client, sample_history):
        """send_message_safe returns fallback on failure."""
        respx.post("http://mock-ai:8080/api/v1/session/init").mock(
            side_effect=httpx.TimeoutException("Timeout"),
        )

        result = await client.send_message_safe("Hello", sample_history)
        assert "unavailable" in result.lower()
        assert "Patients" in result  # mentions workaround
