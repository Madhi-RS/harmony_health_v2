from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.api.deps import get_internal_api_key
from app.schemas.conversation import ChatResponse, VoiceSyncRequest
from app.services.voice_sync_service import VoiceSyncService

router = APIRouter(prefix="/voice", tags=["Voice Sync"])


@router.post("/sync", response_model=ChatResponse)
async def sync_voice_message(
    data: VoiceSyncRequest,
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_internal_api_key),
):
    """Receive voice transcript from Voice Service, process through AI pipeline.

    Protected by X-Internal-Api-Key header.
    The voice service calls this after transcribing audio to text.
    """
    service = VoiceSyncService(db)
    return await service.process_voice_message(data)
