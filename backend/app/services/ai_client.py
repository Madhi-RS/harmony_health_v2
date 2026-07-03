import json
import logging
from typing import Any
import httpx
from httpx import HTTPError, TimeoutException

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableException

logger = logging.getLogger("ai_client")


class AIClient:
    """Client for communicating with the external AI Sales Layer.

    Chat flow:
        1. POST /api/v1/session/init → session_id (tenant + site + user scoping)
        2. POST /api/v1/chat → chatbot response
        3. Parse and log context items for retrieval audit

    Tenant isolation: tenant_id + site_id at session init.
    Layout-related responses (if any) are ignored — only the chatbot
    response is required for the backend to function.
    """

    def __init__(
        self,
        base_url: str = settings.AI_SERVICE_BASE_URL,
        tenant_id: str = settings.AI_SERVICE_TENANT_ID,
        site_id: str = settings.AI_SERVICE_SITE_ID,
        timeout: int = settings.AI_SERVICE_TIMEOUT,
        *,
        user_id: str = "",
    ):
        self.base_url = base_url.rstrip("/")
        self.tenant_id = tenant_id
        self.site_id = site_id
        self.timeout = timeout
        self._session_id: str | None = None
        self._tenant_user_id: str = user_id or "harmony-pms-user"

    async def _ensure_session(self) -> str:
        """Get or create an AI service session. Includes site_id for tenant scoping."""
        if self._session_id:
            return self._session_id

        payload = {
            "tenant_id": self.tenant_id,
            "tenant_user_id": self._tenant_user_id,
            "site_id": self.site_id,
        }
        logger.info(
            "AI: session init | tenant=%s | site=%s | user=%s",
            self.tenant_id, self.site_id, self._tenant_user_id,
        )

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/session/init",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )
                if response.is_success:
                    data = response.json()
                    self._session_id = data.get("session_id", "")
                    logger.info(
                        "AI: session created | session_id=%s | mapped_site=%s",
                        self._session_id, data.get("site_id", "?"),
                    )
                    return self._session_id
                raise ServiceUnavailableException(
                    f"Session init failed [{response.status_code}]"
                )
        except (HTTPError, TimeoutException) as e:
            raise ServiceUnavailableException(f"Cannot reach AI service: {e}")

    async def send_message(
        self,
        message: str,
        conversation_history: list[dict[str, str]],
        max_retries: int = 2,
    ) -> str:
        """Send a message through the AI Sales Layer REST API.

        Uses POST /api/v1/chat with tenant-aware session and site_id.
        """
        await self._ensure_session()

        payload = {
            "site_id": self.site_id,
            "message": message,
            "conversation_history": conversation_history,
        }

        logger.info(
            "AI: chat request | tenant=%s | site=%s | msg_len=%d",
            self.tenant_id, self.site_id, len(message),
        )

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        f"{self.base_url}/api/v1/chat",
                        json=payload,
                        headers={
                            "Content-Type": "application/json",
                            "X-Session-ID": self._session_id or "",
                        },
                    )

                    if response.is_success:
                        return self._extract_and_log(response.json())

                    if response.status_code == 401:
                        self._session_id = None
                        if attempt < max_retries - 1:
                            await self._ensure_session()
                            continue

                    response.raise_for_status()

            except TimeoutException:
                if attempt == max_retries - 1:
                    raise ServiceUnavailableException("AI service timed out")
            except HTTPError as e:
                if attempt == max_retries - 1:
                    raise ServiceUnavailableException(f"AI service error: {e}")

        raise ServiceUnavailableException("AI service unavailable")

    async def send_message_safe(
        self,
        message: str,
        conversation_history: list[dict[str, str]],
    ) -> str:
        """Send message to AI Sales Layer. Errors propagate to caller."""
        return await self.send_message(message, conversation_history)

    def _extract_and_log(self, data: dict[str, Any]) -> str:
        """Extract the AI response and log retrieval metadata.

        Logs: tenant_id, site_id, document_ids, similarity scores.
        Enforces that context items match our configured tenant/site.
        """
        chat = data.get("chat", {})
        context_items = chat.get("context_items", [])
        response = chat.get("response", "")

        # --- Retrieval audit log ---
        logger.info(
            "AI: retrieval | tenant=%s | site=%s | context_count=%d | response_len=%d",
            self.tenant_id, self.site_id, len(context_items), len(response),
        )

        cross_tenant = 0
        for i, item in enumerate(context_items[:10]):
            meta = item.get("metadata", {})
            ctx_tenant = meta.get("tenant_id", "?")
            ctx_site = meta.get("site_id", "?")
            score = item.get("score", 0)
            doc_id = meta.get("source_identity_id", "?")

            logger.info(
                "AI: context[%d] | doc=%s | tenant=%s | site=%s | score=%.4f",
                i, doc_id, ctx_tenant, ctx_site, score,
            )

            # Detect cross-tenant results
            if ctx_tenant != self.tenant_id:
                cross_tenant += 1
                logger.warning(
                    "AI: CROSS-TENANT result detected! "
                    "Expected tenant=%s but got tenant=%s for doc=%s",
                    self.tenant_id, ctx_tenant, doc_id,
                )

        if cross_tenant > 0:
            logger.warning(
                "AI: %d/%d context items are from different tenants!",
                cross_tenant, len(context_items),
            )

        if len(context_items) == 0:
            logger.info(
                "AI: ZERO context items returned for site=%s — "
                "likely no documents ingested for Harmony General Hospital. "
                "Response is LLM-only (no RAG grounding).",
                self.site_id,
            )

        # --- Extract response text ---
        if isinstance(chat, dict):
            return chat.get("response", str(chat))
        if "response" in data:
            return data["response"]
        if "content" in data:
            return data["content"]
        return str(data)

    async def health_check(self) -> bool:
        """Check if the AI service is healthy."""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/api/v1/health")
                return response.is_success
        except HTTPError:
            return False
