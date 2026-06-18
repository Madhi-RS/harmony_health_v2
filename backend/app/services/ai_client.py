import json
from typing import Any
import httpx
from httpx import HTTPError, TimeoutException

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableException


class AIClient:
    """Client for communicating with the external AI service.

    The AI service handles Gemini, RAG, Qdrant, etc. internally.
    This PMS only sends conversation context and receives responses.
    """

    def __init__(
        self,
        base_url: str = settings.AI_SERVICE_BASE_URL,
        tenant_id: str = settings.AI_SERVICE_TENANT_ID,
        site_id: str = settings.AI_SERVICE_SITE_ID,
        timeout: int = settings.AI_SERVICE_TIMEOUT,
    ):
        self.base_url = base_url.rstrip("/")
        self.tenant_id = tenant_id
        self.site_id = site_id
        self.timeout = timeout

    async def send_message(
        self,
        message: str,
        conversation_history: list[dict[str, str]],
        max_retries: int = 3,
    ) -> str:
        """Send a message with conversation context to the AI service.

        Args:
            message: The current user message.
            conversation_history: List of {"role": "...", "content": "..."} dicts.
            max_retries: Number of retries on 5xx errors.

        Returns:
            The AI response text.

        Raises:
            ServiceUnavailableException: If the AI service is unreachable or returns an error.
        """
        payload = {
            "tenant_id": self.tenant_id,
            "site_id": self.site_id,
            "conversation_history": conversation_history,
            "message": message,
        }

        last_error: Exception | None = None

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        f"{self.base_url}/chat",
                        json=payload,
                        headers={"Content-Type": "application/json"},
                    )

                    if response.is_success:
                        data = response.json()
                        return self._extract_response(data)

                    # 4xx errors should not be retried
                    if 400 <= response.status_code < 500:
                        raise ServiceUnavailableException(
                            f"AI service returned {response.status_code}: {response.text}"
                        )

                    # 5xx errors: retry
                    response.raise_for_status()

            except TimeoutException:
                last_error = ServiceUnavailableException(
                    "AI service timed out"
                )
                if attempt < max_retries - 1:
                    continue
                raise last_error

            except HTTPError as e:
                last_error = ServiceUnavailableException(
                    f"AI service error: {str(e)}"
                )
                if attempt < max_retries - 1:
                    continue
                raise last_error

        raise last_error or ServiceUnavailableException("AI service unavailable")

    def _extract_response(self, data: dict[str, Any]) -> str:
        """Extract response text from AI service response."""
        if "response" in data:
            return data["response"]
        if "content" in data:
            return data["content"]
        if "message" in data and isinstance(data["message"], dict):
            return data["message"].get("content", str(data["message"]))
        return str(data)

    async def health_check(self) -> bool:
        """Check if the AI service is healthy."""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/health")
                return response.is_success
        except HTTPError:
            return False
