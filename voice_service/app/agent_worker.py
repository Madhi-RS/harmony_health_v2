"""LiveKit Agent Worker — real-time voice pipeline.

Connects to LiveKit as an agent participant and runs:
    Audio frames → VAD → FasterWhisper STT → Backend Chat API → Piper TTS
    → Persist recording + latency + cost → Publish synthesized audio.

Persistence is handled by the PMS backend VoiceSync API.
"""

import asyncio
import base64
import logging
import time
import uuid
from pathlib import Path
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.stt import SpeechToTextService
from app.tts import TextToSpeechService
from app.vad import VoiceActivityDetector

logger = logging.getLogger("agent_worker")

WELCOME_MESSAGE = (
    "Hello! I'm Harmony, your AI receptionist at Harmony General Hospital. "
    "How can I help you today?"
)


class AgentWorker:
    """LiveKit agent that handles real-time voice conversations."""

    def __init__(self):
        self.stt = SpeechToTextService()
        self.tts = TextToSpeechService()
        self.vad = VoiceActivityDetector()
        self._stt_initialized = False
        self._tts_initialized = False
        self._turn_number = 0
        self._conversation_id: str | None = None
        self._call_id: str | None = None
        self._recordings: list[dict] = []

    def ensure_models(self):
        if not self._stt_initialized:
            self.stt.initialize()
            self._stt_initialized = True
        if not self._tts_initialized:
            self.tts._check_models()
            self._tts_initialized = True

    # ── Main agent entry point ──

    async def run_agent(
        self,
        room_name: str,
        livekit_url: str,
        token: str,
        conversation_id: str | None = None,
        call_id: str | None = None,
    ):
        """Connect to LiveKit room as agent, play welcome, handle audio."""
        self.ensure_models()
        self._conversation_id = conversation_id
        self._call_id = call_id
        self._turn_number = 0

        msg = f"Agent starting | room={room_name} | conv={conversation_id} | call={call_id}"
        print(f"\n[AGENT] {msg}")
        logger.info(msg)

        # Synthesize welcome message
        welcome_audio = await self.tts.synthesize(WELCOME_MESSAGE)

        # Save welcome audio if call_id is available
        if self._call_id:
            await self._persist_audio(
                self._call_id, welcome_audio, "assistant"
            )

        # Connect to LiveKit room as agent participant
        try:
            from livekit import rtc

            room = rtc.Room()
            print(f"[AGENT] Connecting to LiveKit room={room_name} url={livekit_url}")
            logger.info("Agent connecting to LiveKit room=%s url=%s", room_name, livekit_url)
            await room.connect(livekit_url, token)
            print(f"[AGENT] Connected to LiveKit room: {room.name}  (participant: {room.local_participant.identity})")
            logger.info("Agent connected to LiveKit room: %s", room.name)

            # Publish welcome audio as a track (uses shared WAV helper)
            await self._publish_wav_audio(room, welcome_audio, track_name="agent-welcome")
            logger.info("Agent welcome message played. Listening for user audio...")

            # Listen for user audio tracks (skip our own published tracks)
            @room.on("track_subscribed")
            def on_track(track: rtc.Track, *args):
                logger.info(
                    "Track subscribed: name=%s kind=%s source=%s",
                    getattr(track, "name", "?"),
                    track.kind,
                    getattr(track, "source", "unknown"),
                )
                # Ignore our own tracks to avoid processing agent responses as input
                if hasattr(track, "participant") and hasattr(room, "local_participant"):
                    if track.participant and track.participant.identity == room.local_participant.identity:
                        logger.info("Skipping own track: %s", track.name)
                        return
                if track.kind == rtc.TrackKind.KIND_AUDIO:
                    print(f"[AGENT] Received user audio track: {track.name} (starting VAD listener)")
                    logger.info("Agent received user audio track: %s (starting VAD listener)", track.name)
                    asyncio.ensure_future(self._handle_audio_track(track, room))

            # Also log remote participant events
            @room.on("participant_connected")
            def on_participant_connected(participant):
                logger.info("Remote participant connected: %s", participant.identity)

            @room.on("participant_disconnected")
            def on_participant_disconnected(participant):
                logger.info("Remote participant disconnected: %s", participant.identity)

            # ── Keep the agent alive until disconnected ──
            # The room must stay in scope so the agent keeps listening.
            # We await a disconnect future instead of returning immediately.
            disconnect_future: asyncio.Future[None] = asyncio.Future()

            @room.on("disconnected")
            def on_disconnected(*args):
                logger.info("Agent disconnected from room")
                if not disconnect_future.done():
                    disconnect_future.set_result(None)

            logger.info("Agent ready — listening for audio frames")
            await disconnect_future  # block until server/client disconnects us

        except ImportError as e:
            logger.warning("LiveKit SDK not available, running in REST mode: %s", e)
        except Exception as e:
            logger.error("Agent LiveKit connection failed: %s", e)

    async def _handle_audio_track(self, track, room):
        """Receive user audio, segment with VAD, process each utterance."""
        import io, struct
        from livekit import rtc

        # Determine sample rate from track if available (LiveKit default: 48 kHz)
        track_sample_rate = getattr(track, "sample_rate", None) or 48000

        vad = VoiceActivityDetector(
            sample_rate=track_sample_rate,
            frame_duration_ms=30,
            energy_threshold=0.005,  # lower = more sensitive (was 0.015)
            silence_duration_ms=800,
            min_speech_duration_ms=300,
        )
        logger.info(
            "Agent listening to track sample_rate=%d (using VAD, threshold=0.005)",
            track_sample_rate,
        )

        frame_count = 0
        speech_frames = 0
        utterance_count = 0
        try:
            async for event in track:
                frame_data = event.frame.data
                if not frame_data:
                    continue

                frame_count += 1

                # Feed each audio frame to VAD
                is_speaking = vad.process_frame(frame_data)
                if is_speaking:
                    speech_frames += 1

                # Log first frame and then every 100th frame
                if frame_count == 1:
                    print(f"[AGENT] Received first audio frame: {len(frame_data)} bytes (is_speaking={is_speaking})")
                    logger.info(
                        "Agent received first audio frame: %d bytes (is_speaking=%s)",
                        len(frame_data), is_speaking,
                    )
                elif frame_count % 100 == 0:
                    logger.info(
                        "Agent audio frames: %d total, %d speech (%.0f%%)",
                        frame_count, speech_frames,
                        (speech_frames / frame_count * 100) if frame_count else 0,
                    )

                # Check for a complete utterance
                utterance = vad.get_utterance()
                if utterance:
                    utterance_count += 1
                    print(f"[AGENT] Detected utterance #{utterance_count}: {len(utterance)} bytes PCM — processing")
                    logger.info(
                        "Agent detected utterance: %d bytes PCM — processing",
                        len(utterance),
                    )
                    # Wrap raw PCM in a WAV header so STT can understand it
                    wav_utterance = self._pcm_to_wav(
                        utterance,
                        sample_rate=track_sample_rate,
                    )
                    # Process the utterance through STT → AI → TTS
                    result = await self.process_turn(
                        audio_bytes=wav_utterance,
                        conversation_id=self._conversation_id,
                        save_recording=True,
                    )
                    # Publish response audio if synthesized
                    if result.get("response_audio"):
                        await self._publish_wav_audio(
                            room,
                            result["response_audio"],
                            track_name="agent-response",
                        )
                        logger.info("Agent response published for turn %d", self._turn_number)
                    else:
                        logger.info(
                            "Agent turn %d: no response audio (transcript='%s')",
                            self._turn_number,
                            result.get("transcript", ""),
                        )
        except Exception as e:
            logger.error("Audio track handler error: %s", e, exc_info=True)
        finally:
            logger.info(
                "Agent audio track handler finished: %d frames, %d utterances",
                frame_count, utterance_count,
            )

    # ── Helpers ──

    def _pcm_to_wav(
        self, pcm_bytes: bytes, sample_rate: int = 48000, channels: int = 1
    ) -> bytes:
        """Wrap raw 16-bit PCM data in a WAV header (needed for STT)."""
        import io, struct

        data_size = len(pcm_bytes)
        wav_buffer = io.BytesIO()

        # RIFF header
        wav_buffer.write(b"RIFF")
        wav_buffer.write(struct.pack("<I", 36 + data_size))
        wav_buffer.write(b"WAVE")

        # fmt sub-chunk (16-bit PCM)
        wav_buffer.write(b"fmt ")
        wav_buffer.write(struct.pack("<I", 16))  # sub-chunk size
        wav_buffer.write(
            struct.pack(
                "<HHIIHH",
                1,  # PCM = 1
                channels,
                sample_rate,
                sample_rate * channels * 2,  # byte rate
                channels * 2,  # block align
                16,  # bits per sample
            )
        )

        # data sub-chunk
        wav_buffer.write(b"data")
        wav_buffer.write(struct.pack("<I", data_size))
        wav_buffer.write(pcm_bytes)

        return wav_buffer.getvalue()

    async def _publish_wav_audio(
        self,
        room,
        wav_bytes: bytes,
        track_name: str = "agent-audio",
    ):
        """Parse WAV header and publish PCM audio frames to a LiveKit room."""
        import io, struct
        from livekit import rtc

        audio_buffer = io.BytesIO(wav_bytes)
        # Parse WAV header for correct sample rate / channels
        riff, size, wave = struct.unpack("<4sI4s", audio_buffer.read(12))
        if riff != b"RIFF" or wave != b"WAVE":
            logger.warning("Invalid WAV data — skipping publish")
            return

        fmt_chunk = audio_buffer.read(8)
        fmt_id, fmt_size = struct.unpack("<4sI", fmt_chunk)
        fmt_data = audio_buffer.read(fmt_size)
        audio_fmt, channels, sample_rate = struct.unpack("<HHI", fmt_data[:8])

        logger.info(
            "Publishing %s: %d Hz, %d channels, %d bytes total",
            track_name, sample_rate, channels, len(wav_bytes),
        )

        audio_source = rtc.AudioSource(sample_rate=sample_rate, num_channels=channels)
        track = rtc.LocalAudioTrack.create_audio_track(track_name, audio_source)
        await room.local_participant.publish_track(track)

        # Write PCM frames (20 ms each)
        audio_buffer.seek(0)
        audio_buffer.read(44)  # skip WAV header
        frame_size = sample_rate // 50  # samples per channel for 20 ms
        bytes_per_frame = frame_size * channels * 2  # 16-bit PCM

        while True:
            frame_data = audio_buffer.read(bytes_per_frame)
            if len(frame_data) < bytes_per_frame:
                break
            audio_frame = rtc.AudioFrame(
                data=frame_data,
                sample_rate=sample_rate,
                num_channels=channels,
                samples_per_channel=frame_size,
            )
            await audio_source.capture_frame(audio_frame)
            await asyncio.sleep(0.02)

        logger.info("Finished publishing %s", track_name)

    # ── Turn processing ──

    async def process_turn(
        self,
        audio_bytes: bytes,
        conversation_id: str | None = None,
        save_recording: bool = True,
    ) -> dict:
        """Process one voice turn: STT → AI → TTS → persist.

        Returns dict with transcript, response text, audio bytes, latency.
        """
        self.ensure_models()
        self._turn_number += 1
        conv_id = conversation_id or self._conversation_id

        # 1. STT
        stt_start = time.time()
        stt_result = await self.stt.transcribe(audio_bytes)
        transcript = stt_result.get("text", "").strip()
        stt_latency = (time.time() - stt_start) * 1000

        if not transcript:
            return {
                "transcript": "",
                "ai_response_text": "",
                "response_audio": None,
                "conversation_id": conv_id,
                "turn": self._turn_number,
            }

        # 2. AI response
        llm_start = time.time()
        ai_text = await self._call_backend_chat(transcript, conv_id)
        llm_latency = (time.time() - llm_start) * 1000

        # 3. TTS
        tts_start = time.time()
        response_audio = None
        try:
            response_audio = await self.tts.synthesize(ai_text)
        except Exception as e:
            logger.warning("TTS failed: %s", e)
        tts_latency = (time.time() - tts_start) * 1000

        total = stt_latency + llm_latency + tts_latency

        # 4. Persist
        if save_recording and self._call_id:
            # Save user audio
            await self._persist_audio(self._call_id, audio_bytes, "user")
            # Save assistant audio
            if response_audio:
                await self._persist_audio(
                    self._call_id, response_audio, "assistant"
                )
            # Record latency metrics
            await self._record_latency(
                self._call_id, self._turn_number,
                stt_latency, llm_latency, tts_latency,
            )

        return {
            "transcript": transcript,
            "ai_response_text": ai_text,
            "response_audio": response_audio,
            "conversation_id": conv_id,
            "turn": self._turn_number,
            "latency": {
                "stt_ms": round(stt_latency, 1),
                "llm_ms": round(llm_latency, 1),
                "tts_ms": round(tts_latency, 1),
                "total_ms": round(total, 1),
            },
        }

    # ── Backend API calls ──

    async def _call_backend_chat(self, transcript: str, conversation_id: str | None) -> str:
        if not conversation_id:
            conversation_id = await self._create_conversation()
            self._conversation_id = conversation_id

        async with httpx.AsyncClient(timeout=60) as client:
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
            return response.json().get("message", {}).get("content", "")

    async def _create_conversation(self) -> str:
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
            return response.json().get("id", str(uuid.uuid4()))

    async def _persist_audio(
        self, call_id: str, audio_bytes: bytes, kind: str
    ) -> str:
        """Save audio recording via backend VoiceSync API."""
        try:
            audio_b64 = base64.b64encode(audio_bytes).decode()
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{settings.BACKEND_API_URL}/voice/recording",
                    json={
                        "call_id": call_id,
                        "audio_data": audio_b64,
                        "recording_type": kind,
                    },
                    headers={
                        "Content-Type": "application/json",
                        "X-Internal-Api-Key": settings.BACKEND_INTERNAL_API_KEY,
                    },
                )
                if response.is_success:
                    path = response.json().get("path", "")
                    self._recordings.append({
                        "call_id": call_id,
                        "type": kind,
                        "path": path,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    return path
        except Exception as e:
            logger.warning("Recording persistence failed: %s", e)
        return ""

    async def _record_latency(
        self, call_id: str, turn: int,
        stt_ms: float, llm_ms: float, tts_ms: float,
    ) -> None:
        """Send latency metrics to backend."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"{settings.BACKEND_API_URL}/voice/latency",
                    json={
                        "call_id": call_id,
                        "turn_number": turn,
                        "stt_ms": stt_ms,
                        "llm_ms": llm_ms,
                        "tts_ms": tts_ms,
                    },
                    headers={
                        "Content-Type": "application/json",
                        "X-Internal-Api-Key": settings.BACKEND_INTERNAL_API_KEY,
                    },
                )
        except Exception as e:
            logger.warning("Latency recording failed: %s", e)

    async def finalize_call(self, call_id: str, status: str = "COMPLETED"):
        """Mark call as completed in backend."""
        try:
            total_duration = sum(
                (r.get("duration_s", 0) for r in self._recordings), 0.0
            )
            async with httpx.AsyncClient(timeout=10) as client:
                await client.patch(
                    f"{settings.BACKEND_API_URL}/voice/call/{call_id}",
                    json={
                        "status": status,
                        "duration_seconds": total_duration,
                    },
                    headers={
                        "Content-Type": "application/json",
                        "X-Internal-Api-Key": settings.BACKEND_INTERNAL_API_KEY,
                    },
                )
            logger.info("Call %s finalized — %d recordings", call_id, len(self._recordings))
        except Exception as e:
            logger.warning("Call finalization failed: %s", e)
