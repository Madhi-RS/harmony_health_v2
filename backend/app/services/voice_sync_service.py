import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.repositories.conversation_repository import ConversationRepository
from app.services.chat_service import ChatService
from app.services.conversation_service import ConversationService
from app.schemas.conversation import ChatResponse, VoiceSyncRequest


class VoiceSyncService:
    """Bridges voice service transcripts into the PMS conversation pipeline.

    Called via internal API with X-Internal-Api-Key authentication.
    The voice service is external and does not have a user context,
    so we use a dedicated system bot account.
    """

    SYSTEM_BOT_EMAIL = "voice-sync-bot@harmony-health.internal"
    SYSTEM_BOT_USERNAME = "voice_sync_bot"

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_bot_user(self) -> User:
        """Get or create the voice sync bot user."""
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
        """Receive a voice transcript, create voice message, run through AI.

        Flow:
            1. Get/create bot user
            2. Load or create conversation
            3. Append user voice message with audio_url
            4. Build conversation context
            5. Send to AI service
            6. Store assistant response
            7. Return full chat response
        """
        user = await self._get_bot_user()
        service = ChatService(self.db, user)

        return await service.sync_voice_message(
            conversation_id=data.conversation_id,
            transcript=data.transcript,
            audio_url=data.audio_url,
        )
