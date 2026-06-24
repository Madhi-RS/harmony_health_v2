"""POST /livekit/* — LiveKit room and token management."""

import uuid
import json
import base64
import time
import hmac
import hashlib
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.api.deps import get_current_user, CurrentUser
from app.core.config import settings

router = APIRouter(prefix="/livekit", tags=["LiveKit"])


class TokenRequest(BaseModel):
    identity: str
    room_name: str
    can_publish: bool = True
    can_subscribe: bool = True


class TokenResponse(BaseModel):
    token: str
    identity: str
    room_name: str


class RoomRequest(BaseModel):
    room_name: str


@router.post("/token", response_model=TokenResponse)
async def generate_token(
    request: TokenRequest,
    current_user=Depends(get_current_user),
):
    """Generate a LiveKit JWT access token for a room."""
    api_key = settings.LIVEKIT_API_KEY
    api_secret = settings.LIVEKIT_API_SECRET

    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": api_key,
        "sub": request.identity,
        "exp": int(time.time()) + 3600,
        "nbf": int(time.time()),
        "iat": int(time.time()),
        "jid": str(uuid.uuid4()),
        "video": {
            "room": request.room_name,
            "roomJoin": True,
            "canPublish": request.can_publish,
            "canSubscribe": request.can_subscribe,
        },
    }

    def b64enc(d: dict) -> str:
        return base64.urlsafe_b64encode(
            json.dumps(d, separators=(",", ":")).encode()
        ).rstrip(b"=").decode()

    header_b64 = b64enc(header)
    payload_b64 = b64enc(payload)
    message = f"{header_b64}.{payload_b64}"

    signature = hmac.new(
        api_secret.encode(), message.encode(), hashlib.sha256
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()

    return TokenResponse(
        token=f"{message}.{sig_b64}",
        identity=request.identity,
        room_name=request.room_name,
    )


@router.post("/rooms")
async def create_room(
    request: RoomRequest,
    current_user=Depends(get_current_user),
):
    """Signal intent to create a LiveKit room.

    Note: LiveKit rooms are created on first participant join.
    This endpoint provides the room configuration for the frontend.
    """
    try:
        import httpx
        base = settings.LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{base}/api/v1/rooms",
                json={"name": request.room_name},
                auth=(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET),
            )
            resp.raise_for_status()
        return {"status": "created", "room_name": request.room_name}
    except Exception as e:
        return {"status": "noted", "room_name": request.room_name, "detail": str(e)}


@router.post("/end-session")
async def end_session(
    request: RoomRequest,
    current_user=Depends(get_current_user),
):
    """End a LiveKit voice session."""
    try:
        import httpx
        base = settings.LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://")
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{base}/api/v1/rooms/{request.room_name}",
                auth=(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET),
            )
            resp.raise_for_status()
        return {"status": "ended", "room_name": request.room_name}
    except Exception as e:
        return {"status": "error", "room_name": request.room_name, "detail": str(e)}
