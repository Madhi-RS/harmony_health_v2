import uuid
import httpx
from pathlib import Path

from app.config import settings
from app.stt import SpeechToTextService
from app.tts import TextToSpeechService
from app.livekit_service import LiveKitService


class VoiceOrchestrator:
    """Coordinates the voice pipeline: STT -> Backend Chat API -> TTS.

    Flow:
        1. Receive audio bytes
        2. Transcribe via FasterWhisper (STT)
        3. Send transcript + conversation_id to backend Chat API
        4. Receive AI response text
        5. Synthesize response via Piper (TTS)
        6. Return transcript, AI text, and audio bytes
    """

    def __init__(self):
        self.stt = SpeechToTextService()
        self.tts = TextToSpeechService()
        self.livekit = LiveKitService()
        self._stt_initialized = False
        self._tts_initialized = False

    def ensure_models(self):
        """Initialize STT and TTS models."""
        if not self._stt_initialized:
            self.stt.initialize()
            self._stt_initialized = True
        if not self._tts_initialized:
            self.tts._check_models()
            self._tts_initialized = True

    async def process_audio(
        self,
        audio_bytes: bytes,
        conversation_id: str | None = None,
        language: str | None = None,
    ) -> dict:
        """Process audio through the full voice pipeline.

        Args:
            audio_bytes: Raw audio data.
            conversation_id: Optional existing conversation ID.
            language: Optional language hint for STT.

        Returns:
            dict with keys: transcript, ai_response_text, response_audio,
                          conversation_id, segments
        """
        self.ensure_models()

        # 1. Transcribe
        stt_result = await self.stt.transcribe(audio_bytes, language=language)
        transcript = stt_result.get("text", "").strip()

        if not transcript:
            return {
                "transcript": "",
                "ai_response_text": "I couldn't hear anything. Could you please repeat that?",
                "response_audio": None,
                "conversation_id": conversation_id,
                "segments": [],
                "error": "empty_transcript",
            }

        # 2. Send to backend chat API
        ai_text = await self._call_backend_chat(transcript, conversation_id)

        # 3. Synthesize response
        audio_bytes_result = None
        try:
            audio_bytes_result = await self.tts.synthesize(ai_text)
        except Exception as e:
            # Graceful degradation — return text even if TTS fails
            pass

        return {
            "transcript": transcript,
            "ai_response_text": ai_text,
            "response_audio": audio_bytes_result,
            "conversation_id": conversation_id,
            "segments": stt_result.get("segments", []),
        }

    async def _call_backend_chat(
        self, transcript: str, conversation_id: str | None = None
    ) -> str:
        """Send transcript to backend API and return AI response."""
        # If no conversation_id, create one via the backend
        if not conversation_id:
            conversation_id = await self._create_conversation()

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{settings.BACKEND_API_URL}/chat",
                json={
                    "conversation_id": conversation_id,
                    "message": transcript,
                },
                headers={
                    "Content-Type": "application/json",
                    "X-Internal-Api-Key": settings.BACKEND_INTERNAL_API_KEY,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("message", {}).get("content", "")

    async def _create_conversation(self) -> str:
        """Create a new conversation via the backend API."""
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{settings.BACKEND_API_URL}/conversations",
                json={"title": "Voice Conversation"},
                headers={
                    "Content-Type": "application/json",
                    "X-Internal-Api-Key": settings.BACKEND_INTERNAL_API_KEY,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("id", str(uuid.uuid4()))

    async def health_check(self) -> dict:
        """Check health of all dependencies."""
        status = {
            "stt": False,
            "tts_models": False,
            "backend_api": False,
            "livekit": False,
        }

        # STT
        try:
            self.ensure_models()
            status["stt"] = True
            status["tts_models"] = True
        except Exception:
            pass

        # Backend API
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(
                    settings.BACKEND_API_URL.replace("/api/v1", "/health")
                )
                status["backend_api"] = r.is_success
        except Exception:
            pass

        # LiveKit
        try:
            await self.livekit.list_rooms()
            status["livekit"] = True
        except Exception:
            pass

        return status
