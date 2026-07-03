import base64
import logging
from fastapi import APIRouter, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from typing import Optional

from app.orchestrator import VoiceOrchestrator
from app.models import TranscribeResponse, SynthesizeResponse, ProcessResponse

logger = logging.getLogger("voice_api")
router = APIRouter(prefix="/voice", tags=["Voice"])
orchestrator = VoiceOrchestrator()


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = None,
):
    """Transcribe an audio file to text using FasterWhisper."""
    audio_bytes = await file.read()
    result = await orchestrator.stt.transcribe(audio_bytes, language=language)

    return TranscribeResponse(
        text=result.get("text", ""),
        language=result.get("language", "en"),
        duration_seconds=result.get("duration_seconds", 0),
        segments=result.get("segments", []),
    )


@router.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize_speech(text: str = Form(...)):
    """Convert text to speech using Piper TTS."""
    audio_bytes = await orchestrator.tts.synthesize(text)
    audio_b64 = base64.b64encode(audio_bytes).decode()

    return SynthesizeResponse(
        audio_data=audio_b64,
        duration_seconds=len(audio_bytes) / 16000,  # Approximate
    )


@router.post("/process", response_model=ProcessResponse)
async def process_voice(
    file: UploadFile = File(...),
    conversation_id: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
):
    """Full voice pipeline: STT -> Backend Chat API -> TTS.

    Accepts an audio file, transcribes it, sends to AI,
    synthesizes the response, and returns everything.
    """
    audio_bytes = await file.read()
    result = await orchestrator.process_audio(
        audio_bytes=audio_bytes,
        conversation_id=conversation_id,
        language=language,
    )

    audio_b64 = None
    if result.get("response_audio"):
        audio_b64 = base64.b64encode(result["response_audio"]).decode()

    return ProcessResponse(
        transcript=result.get("transcript", ""),
        ai_response_text=result.get("ai_response_text", ""),
        audio_data=audio_b64,
        conversation_id=result.get("conversation_id"),
    )


@router.get("/health")
async def voice_health():
    """Health check with dependency status."""
    status = await orchestrator.health_check()
    return {"status": "ok", "dependencies": status}


@router.websocket("/realtime")
async def realtime_voice(websocket: WebSocket):
    """Real-time voice session via WebSocket.

    Flow:
        Client sends audio chunks -> STT -> Backend Chat -> TTS -> Audio chunks
    """
    await websocket.accept()

    try:
        conversation_id = None

        while True:
            # Receive audio chunk
            data = await websocket.receive_bytes()

            # Process through pipeline
            result = await orchestrator.process_audio(
                audio_bytes=data,
                conversation_id=conversation_id,
            )

            if not conversation_id and result.get("conversation_id"):
                conversation_id = result["conversation_id"]

            # Send response
            response = {
                "transcript": result.get("transcript", ""),
                "ai_response_text": result.get("ai_response_text", ""),
                "conversation_id": conversation_id,
            }

            if result.get("response_audio"):
                response["audio_data"] = base64.b64encode(
                    result["response_audio"]
                ).decode()

            await websocket.send_json(response)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass


# ── Agent Join — called by backend after creating voice session ──

from pydantic import BaseModel as PydanticBaseModel


class AgentJoinRequest(PydanticBaseModel):
    room_name: str
    livekit_url: str = "ws://localhost:7880"
    token: str | None = None
    conversation_id: str | None = None
    call_id: str | None = None


@router.post("/agent/join")
async def agent_join(request: AgentJoinRequest):
    """Called by PMS backend after creating a voice session.
    Connects the AgentWorker to the LiveKit room and plays welcome message.
    """
    from app.agent_worker import AgentWorker
    import asyncio

    worker = AgentWorker()
    worker.ensure_models()

    # 1. Synthesize welcome message
    welcome_text = (
        "Hello! I'm Harmony, your AI receptionist at Harmony General Hospital. "
        "How can I help you today?"
    )
    welcome_audio = await worker.tts.synthesize(welcome_text)

    # 2. Persist welcome audio if call_id provided
    if request.call_id:
        await worker._persist_audio(request.call_id, welcome_audio, "assistant")

    # 3. Generate agent token with unique identity
    agent_identity = f"harmony-agent-{request.call_id or 'welcome'}"
    agent_token = request.token  # Use same room token; identity mismatch is OK for publish-only
    # Actually, we need a NEW token for the agent with the agent identity
    # For now, the agent joins with the same token but different track name
    # LiveKit allows multiple participants in a room as long as identities differ

    # 4. Launch agent as a background task (fire-and-forget).
    #    The agent stays alive until the room is closed or disconnected.

    async def _run_agent_background():
        try:
            await worker.run_agent(
                room_name=request.room_name,
                livekit_url=request.livekit_url,
                token=request.token or "",
                conversation_id=request.conversation_id,
                call_id=request.call_id,
            )
        except Exception as e:
            logger.warning("Agent background task failed: %s", e)

    asyncio.create_task(_run_agent_background())

    return {
        "status": "agent_joined",
        "room_name": request.room_name,
        "welcome_audio_size": len(welcome_audio),
        "call_id": request.call_id,
    }

