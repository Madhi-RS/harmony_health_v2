"""Voice sync service — bridges voice transcripts and recordings into PMS."""

import uuid
import os
import base64
from pathlib import Path
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.models.user import User, UserRole
from app.models.call_log import CallLog, CallStatus, LatencyMetric, CostBreakdown
from app.repositories.user_repository import UserRepository
from app.repositories.conversation_repository import ConversationRepository
from app.services.chat_service import ChatService
from app.services.conversation_service import ConversationService
from app.schemas.conversation import ChatResponse, VoiceSyncRequest


RECORDINGS_DIR = Path("recordings")


class VoiceSyncService:
    """Bridges voice service transcripts and recordings into the PMS.

    Called via internal API with X-Internal-Api-Key authentication.
    Handles transcript storage, audio recording persistence,
    CallLog updates, and AI chat pipeline integration.
    """

    SYSTEM_BOT_EMAIL = "voice-sync-bot@harmony-health.internal"
    SYSTEM_BOT_USERNAME = "voice_sync_bot"

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_bot_user(self) -> User:
        repo = UserRepository(self.db)
        user = await repo.find_by_email(self.SYSTEM_BOT_EMAIL)
        if not user:
            from app.core.security import hash_password
            user = await repo.create(
                email=self.SYSTEM_BOT_EMAIL,
                username=self.SYSTEM_BOT_USERNAME,
                password_hash=hash_password("voice-sync-internal-bot"),
                role=UserRole.ADMIN,
            )
        return user

    async def process_voice_message(self, data: VoiceSyncRequest) -> ChatResponse:
        """Process a voice transcript through the AI pipeline."""
        user = await self._get_bot_user()
        service = ChatService(self.db, user)
        return await service.sync_voice_message(
            conversation_id=data.conversation_id,
            transcript=data.transcript,
            audio_url=data.audio_url,
        )

    async def save_recording(
        self,
        call_id: str,
        audio_bytes: bytes,
        recording_type: str = "user",
        mime_type: str = "audio/webm",
    ) -> str:
        """Save an audio recording to disk and return the file path.

        Args:
            call_id: The CallLog UUID.
            audio_bytes: Raw audio data (WAV/webm).
            recording_type: "user" or "assistant".
            mime_type: MIME type for file extension.

        Returns:
            Relative file path to the recording.
        """
        RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)

        ext = "webm" if "webm" in mime_type else "wav"
        filename = f"{call_id}_{recording_type}_{uuid.uuid4().hex[:8]}.{ext}"
        filepath = RECORDINGS_DIR / filename
        filepath.write_bytes(audio_bytes)

        return str(filepath)

    async def save_recording_base64(
        self,
        call_id: str,
        audio_b64: str,
        recording_type: str = "user",
    ) -> str:
        """Save a base64-encoded audio recording."""
        audio_bytes = base64.b64decode(audio_b64)
        return await self.save_recording(call_id, audio_bytes, recording_type)

    async def update_call_log(
        self,
        call_id: str,
        status: str | None = None,
        duration_seconds: float | None = None,
        transcript: str | None = None,
        summary: str | None = None,
    ) -> CallLog | None:
        """Update a CallLog record with session data."""
        from uuid import UUID
        try:
            call_uuid = UUID(call_id)
        except ValueError:
            return None

        call_log = await self.db.get(CallLog, call_uuid)
        if not call_log:
            return None

        if status:
            try:
                call_log.status = CallStatus(status)
            except ValueError:
                pass
        if duration_seconds is not None:
            call_log.duration_seconds = duration_seconds
        if transcript is not None:
            call_log.transcript = transcript
        if summary is not None:
            call_log.summary = summary
        if status == "COMPLETED":
            call_log.ended_at = datetime.now(timezone.utc)

        await self.db.flush()
        return call_log

    async def record_latency(
        self,
        call_id: str,
        turn_number: int,
        stt_ms: float = 0,
        llm_ms: float = 0,
        tts_ms: float = 0,
    ) -> None:
        """Record per-turn latency metrics for analytics."""
        from uuid import UUID
        try:
            call_uuid = UUID(call_id)
        except ValueError:
            return

        total = stt_ms + llm_ms + tts_ms
        metric = LatencyMetric(
            call_id=call_uuid,
            turn_number=turn_number,
            stt_latency_ms=stt_ms,
            llm_latency_ms=llm_ms,
            tts_latency_ms=tts_ms,
            total_latency_ms=total,
        )
        self.db.add(metric)
        await self.db.flush()

    async def record_cost(
        self,
        call_id: str,
        stt_cost: float = 0.0,
        llm_cost: float = 0.0,
        tts_cost: float = 0.0,
    ) -> None:
        """Record per-call cost breakdown."""
        from uuid import UUID
        try:
            call_uuid = UUID(call_id)
        except ValueError:
            return

        cost = CostBreakdown(
            call_id=call_uuid,
            stt_cost=stt_cost,
            llm_cost=llm_cost,
            tts_cost=tts_cost,
            total_cost=stt_cost + llm_cost + tts_cost,
        )
        self.db.add(cost)
        await self.db.flush()
