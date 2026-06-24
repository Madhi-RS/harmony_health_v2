"""POST /chat/stream — SSE streaming chat endpoint."""

import json
import uuid
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.api.deps import get_current_user, CurrentUser, DBDep
from app.schemas.conversation import ChatRequest
from app.services.ai_client import AIClient
from app.repositories.conversation_repository import ConversationRepository, MessageRepository
from app.models.conversation import MessageRole, MessageType
from app.core.exceptions import NotFoundException, ForbiddenException
from app.models.user import UserRole

router = APIRouter(prefix="/chat", tags=["Chat Stream"])


async def _stream_response(
    db: AsyncSession,
    current_user,
    request: ChatRequest,
):
    """Generate SSE stream for chat response."""
    conv_repo = ConversationRepository(db)
    msg_repo = MessageRepository(db)

    # Validate conversation
    conv = await conv_repo.get(request.conversation_id)
    if not conv:
        yield f"data: {json.dumps({'error': 'Conversation not found'})}\n\n"
        return

    if current_user.role == UserRole.RECEPTIONIST:
        if str(conv.user_id) != str(current_user.id):
            yield f"data: {json.dumps({'error': 'Forbidden'})}\n\n"
            return

    # Append user message
    user_msg = await msg_repo.create(
        conversation_id=request.conversation_id,
        role=MessageRole.USER,
        content=request.message,
        message_type=MessageType.TEXT,
    )
    yield f"data: {json.dumps({'type': 'user_message', 'id': str(user_msg.id)})}\n\n"

    # Get context
    recent = await msg_repo.get_recent(request.conversation_id, limit=20)
    history = [
        {"role": "user" if m.role == MessageRole.USER else "assistant", "content": m.content}
        for m in recent if m.role in (MessageRole.USER, MessageRole.ASSISTANT)
    ]

    # Call AI
    ai_client = AIClient()
    try:
        response = await ai_client.send_message(request.message, history)
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        return

    # Store assistant message
    assistant_msg = await msg_repo.create(
        conversation_id=request.conversation_id,
        role=MessageRole.ASSISTANT,
        content=response,
        message_type=MessageType.TEXT,
    )

    yield f"data: {json.dumps({'type': 'assistant_message', 'id': str(assistant_msg.id), 'content': response})}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    db: DBDep = None,
    current_user=Depends(get_current_user),
):
    """Stream AI response via Server-Sent Events."""
    return StreamingResponse(
        _stream_response(db, current_user, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
