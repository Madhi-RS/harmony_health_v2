"""T4.5-T4.9 — AIClient unit tests with mocked HTTP."""

import pytest
import pytest_asyncio
import httpx
import respx

from app.services.ai_client import AIClient
from app.core.exceptions import ServiceUnavailableException


@pytest.mark.asyncio
class TestAIClient:
    """Tests for AIClient HTTP communication."""

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
        """T4.6 — AI service returns valid response."""
        route = respx.post("http://mock-ai:8080/chat").mock(
            return_value=httpx.Response(200, json={"response": "Test reply"}),
        )

        result = await client.send_message(
            message="Hello",
            conversation_history=sample_history,
        )
        assert result == "Test reply"
        assert route.called

        # Verify payload
        request_body = route.calls[0].request.content
        import json
        payload = json.loads(request_body)
        assert payload["tenant_id"] == "hospital_001"
        assert payload["message"] == "Hello"
        assert len(payload["conversation_history"]) == 2

    @respx.mock
    async def test_send_message_timeout(self, client, sample_history):
        """T4.7 — Timeout raises ServiceUnavailableException."""
        respx.post("http://mock-ai:8080/chat").mock(
            side_effect=httpx.TimeoutException("Timeout"),
        )

        with pytest.raises(ServiceUnavailableException, match="timed out"):
            await client.send_message(
                message="Hello",
                conversation_history=sample_history,
            )

    @respx.mock
    async def test_send_message_5xx_retry_then_fail(self, client, sample_history):
        """T4.8 — 5xx retried 3 times, then raises."""
        route = respx.post("http://mock-ai:8080/chat").mock(
            return_value=httpx.Response(503, text="Service Unavailable"),
        )

        with pytest.raises(ServiceUnavailableException):
            await client.send_message(
                message="Hello",
                conversation_history=sample_history,
            )

        assert len(route.calls) == 3  # 3 retries

    @respx.mock
    async def test_send_message_4xx_no_retry(self, client, sample_history):
        """T4.9 — 4xx errors are NOT retried."""
        route = respx.post("http://mock-ai:8080/chat").mock(
            return_value=httpx.Response(400, text="Bad Request"),
        )

        with pytest.raises(ServiceUnavailableException):
            await client.send_message(
                message="Hello",
                conversation_history=sample_history,
            )

        assert len(route.calls) == 1  # No retry

    @respx.mock
    async def test_retry_succeeds_on_second_attempt(self, client, sample_history):
        """T4.26 — First attempt 5xx, second succeeds."""
        call_count = 0

        def side_effect(request):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return httpx.Response(503, text="Service Unavailable")
            return httpx.Response(200, json={"response": "Success on retry"})

        respx.post("http://mock-ai:8080/chat").mock(side_effect=side_effect)

        result = await client.send_message(
            message="Hello",
            conversation_history=sample_history,
        )
        assert result == "Success on retry"
        assert call_count == 2

    @respx.mock
    async def test_extract_response_variants(self, client, sample_history):
        """AIClient handles different response formats."""
        # Format: {"response": "..."}
        respx.post("http://mock-ai:8080/chat").mock(
            return_value=httpx.Response(200, json={"content": "Content format"}),
        )
        result = await client.send_message("Hi", sample_history)
        assert result == "Content format"

    @respx.mock
    async def test_health_check(self, client):
        """T4.6 — Health check returns correct status."""
        respx.get("http://mock-ai:8080/health").mock(
            return_value=httpx.Response(200),
        )
        assert await client.health_check() is True

        respx.get("http://mock-ai:8080/health").mock(
            return_value=httpx.Response(503),
        )
        # Need to clear and re-mock
        respx.clear()
        respx.get("http://mock-ai:8080/health").mock(
            return_value=httpx.Response(503),
        )
        assert await client.health_check() is False
