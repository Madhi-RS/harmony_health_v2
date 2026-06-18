from fastapi import APIRouter, Depends

from app.api.deps import get_db, get_current_user, CurrentUser, DBDep
from app.schemas.conversation import ChatRequest, ChatResponse
from app.services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["Chat"])


def get_chat_service(
    db: DBDep,
    current_user: CurrentUser,
) -> ChatService:
    return ChatService(db, current_user)


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    service: ChatService = Depends(get_chat_service),
):
    """Send a message to the AI assistant.

    Loads conversation history, sends to external AI service,
    stores the response, and returns both messages.
    """
    return await service.process_message(request)
