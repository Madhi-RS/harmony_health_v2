"""Voice pipeline endpoints — session management and audio sync."""

import uuid
import json
import base64
import time
import hmac
import hashlib
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.database import get_db
from app.api.deps import get_current_user, CurrentUser, get_internal_api_key
from app.core.config import settings
from app.schemas.conversation import ChatResponse, VoiceSyncRequest
from app.services.voice_sync_service import VoiceSyncService

router = APIRouter(prefix="/voice", tags=["Voice"])


# ── Request / Response models ──

class VoiceSessionRequest(BaseModel):
    """Request to create a voice session."""
    conversation_id: str | None = None
    patient_id: str | None = None
    identity: str = "harmony-user"


class VoiceSessionResponse(BaseModel):
    """Response with LiveKit connection details."""
    room_name: str
    token: str
    livekit_url: str
    session_id: str
    conversation_id: str | None = None


# ── Voice session (Step 1 — refactor plan) ──

@router.post("/session", response_model=VoiceSessionResponse)
async def create_voice_session(
    request: VoiceSessionRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Create a voice session: LiveKit room + participant JWT.

    Returns roomName, token, and livekitUrl for the frontend
    to connect via LiveKit WebRTC.

    Optionally links to an existing conversation and creates
    a CallLog record for analytics.
    """
    room_name = f"voice-{uuid.uuid4().hex[:12]}"
    identity = f"{request.identity or str(current_user.id)[:8]}-browser"
    livekit_url = settings.LIVEKIT_URL

    print(f"\n{'='*60}")
    print(f"[VOICE SESSION] Request received")
    print(f"  room_name   = {room_name}")
    print(f"  identity    = {identity}")
    print(f"  user_id     = {current_user.id}")
    print(f"  conversation= {request.conversation_id}")
    print(f"  livekit_url = {livekit_url}")
    print(f"  api_key     = {settings.LIVEKIT_API_KEY}")

    # 1. Create LiveKit room (use Basic auth — same as livekit_service.py)
    try:
        import httpx
        base = livekit_url.replace("ws://", "http://").replace("wss://", "https://")
        print(f"[VOICE SESSION] Creating LiveKit room via {base}/twirp/...")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{base}/twirp/livekit.RoomService/CreateRoom",
                json={"name": room_name},
                auth=(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET),
            )
            print(f"[VOICE SESSION] LiveKit room API response: {resp.status_code}")
    except Exception as e:
        print(f"[VOICE SESSION] Room API skipped (auto-created on join): {e}")

    # 2. Generate participant JWT
    print(f"[VOICE SESSION] Generating JWT...")
    token = _generate_livekit_token(
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
        identity=identity,
        room_name=room_name,
    )
    print(f"[VOICE SESSION] JWT generated ({len(token)} chars)")
    print(f"[VOICE SESSION] JWT payload: iss={settings.LIVEKIT_API_KEY}, sub={identity}, room={room_name}")
    print(f"[VOICE SESSION] Token grants: roomJoin=True, canPublish=True, canSubscribe=True")
    print(f"{'='*60}\n")

    # Generate a SEPARATE token for the agent (different identity)
    agent_identity = "harmony-agent"
    agent_token = _generate_livekit_token(
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
        identity=agent_identity,
        room_name=room_name,
    )
    print(f"[VOICE SESSION] Agent token generated ({len(agent_token)} chars) for identity={agent_identity}")

    # 3. Initialize conversation_id and create CallLog
    conv_id = None
    if request.conversation_id:
        try:
            from uuid import UUID
            conv_id = str(UUID(request.conversation_id))
        except ValueError:
            conv_id = request.conversation_id

    call_id = str(uuid.uuid4())
    try:
        from app.models.call_log import CallLog, CallStatus, CallDirection
        call_log = CallLog(
            conversation_id=conv_id,
            patient_id=request.patient_id,
            direction=CallDirection.INBOUND,
            status=CallStatus.INITIATED,
            started_at=datetime.now(timezone.utc),
        )
        db.add(call_log)
        await db.flush()
        call_id = str(call_log.id)
        print(f"[VOICE SESSION] CallLog created: {call_id}")
    except Exception as e:
        print(f"[VOICE SESSION] CallLog skipped: {e}")

    # 4. Notify Voice Service agent to join the room (non-blocking)
    voice_service_url = "http://localhost:8001"
    print(f"[VOICE SESSION] Triggering agent join at {voice_service_url}/voice/agent/join (async)")

    async def _join_agent():
        try:
            import httpx
            agent_req = {
                "room_name": room_name,
                "livekit_url": livekit_url,
                "token": agent_token,  # agent's own JWT with unique identity
                "conversation_id": conv_id,
                "call_id": call_id,
            }
            async with httpx.AsyncClient(timeout=60) as client:
                agent_resp = await client.post(
                    f"{voice_service_url}/voice/agent/join",
                    json=agent_req,
                    headers={"Content-Type": "application/json"},
                )
                print(f"[VOICE SESSION] Agent join response: {agent_resp.status_code}")
                if agent_resp.is_success:
                    agent_data = agent_resp.json()
                    print(f"[VOICE SESSION] Welcome audio: {agent_data.get('welcome_audio_size', 0)} bytes")
        except Exception as e:
            print(f"[VOICE SESSION] Agent join: {type(e).__name__} — {e}")

    import asyncio
    asyncio.create_task(_join_agent())

    return VoiceSessionResponse(
        room_name=room_name,
        token=token,
        livekit_url=livekit_url,
        session_id=call_id,
        conversation_id=conv_id,
    )


def _generate_livekit_token(
    api_key: str,
    api_secret: str,
    identity: str,
    room_name: str,
    ttl: int = 3600,
) -> str:
    """Generate a LiveKit JWT access token."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": api_key,
        "sub": identity,
        "exp": int(time.time()) + ttl,
        "nbf": int(time.time()),
        "iat": int(time.time()),
        "jid": str(uuid.uuid4()),
        "video": {
            "room": room_name,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
        },
    }

    def _b64enc(d: dict) -> str:
        return base64.urlsafe_b64encode(
            json.dumps(d, separators=(",", ":")).encode()
        ).rstrip(b"=").decode()

    header_b64 = _b64enc(header)
    payload_b64 = _b64enc(payload)
    message = f"{header_b64}.{payload_b64}"
    sig = hmac.new(
        api_secret.encode(), message.encode(), hashlib.sha256
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{message}.{sig_b64}"


# ── Recording persistence ──

class RecordingRequest(BaseModel):
    call_id: str
    audio_data: str  # base64
    recording_type: str = "user"  # "user" or "assistant"


@router.post("/recording")
async def save_recording(
    request: RecordingRequest,
    api_key: str = Depends(get_internal_api_key),
    db=Depends(get_db),
):
    """Save an audio recording for a call. Internal API — called by voice service."""
    from app.services.voice_sync_service import VoiceSyncService
    service = VoiceSyncService(db)
    path = await service.save_recording_base64(
        call_id=request.call_id,
        audio_b64=request.audio_data,
        recording_type=request.recording_type,
    )
    return {"status": "saved", "path": path}


# ── Latency metrics ──

class LatencyRequest(BaseModel):
    call_id: str
    turn_number: int
    stt_ms: float = 0
    llm_ms: float = 0
    tts_ms: float = 0


@router.post("/latency")
async def record_latency(
    request: LatencyRequest,
    api_key: str = Depends(get_internal_api_key),
    db=Depends(get_db),
):
    """Record per-turn latency metrics. Internal API."""
    from app.services.voice_sync_service import VoiceSyncService
    service = VoiceSyncService(db)
    await service.record_latency(
        call_id=request.call_id,
        turn_number=request.turn_number,
        stt_ms=request.stt_ms,
        llm_ms=request.llm_ms,
        tts_ms=request.tts_ms,
    )
    return {"status": "recorded"}


# ── Call status update ──

class CallUpdateRequest(BaseModel):
    status: str | None = None
    duration_seconds: float | None = None


@router.patch("/call/{call_id}")
async def update_call(
    call_id: str,
    request: CallUpdateRequest,
    api_key: str = Depends(get_internal_api_key),
    db=Depends(get_db),
):
    """Update call status. Internal API — called by voice service on session end."""
    from app.services.voice_sync_service import VoiceSyncService
    service = VoiceSyncService(db)
    call_log = await service.update_call_log(
        call_id=call_id,
        status=request.status,
        duration_seconds=request.duration_seconds,
    )
    if not call_log:
        raise HTTPException(status_code=404, detail="Call not found")
    return {"status": "updated", "call_id": str(call_log.id)}


# ── Voice sync (existing) ──

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
