import uuid
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_db, get_current_user, CurrentUser, DBDep
from app.schemas.conversation import (
    ConversationCreate, ConversationResponse, MessageResponse,
)
from app.services.conversation_service import ConversationService

router = APIRouter(prefix="/conversations", tags=["Conversations"])


def get_conversation_service(
    db: DBDep,
    current_user: CurrentUser,
) -> ConversationService:
    return ConversationService(db, current_user)


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    service: ConversationService = Depends(get_conversation_service),
):
    """List conversations for the current user."""
    return await service.list(page=page, size=size)


@router.post("", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    data: ConversationCreate,
    service: ConversationService = Depends(get_conversation_service),
):
    """Create a new conversation."""
    return await service.create(data)


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: uuid.UUID,
    service: ConversationService = Depends(get_conversation_service),
):
    """Get a conversation by ID."""
    return await service.get(conversation_id)


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    conversation_id: uuid.UUID,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    service: ConversationService = Depends(get_conversation_service),
):
    """Get paginated messages for a conversation."""
    return await service.get_messages(conversation_id, page=page, size=size)
