import os
from pathlib import Path
from faster_whisper import WhisperModel

from app.config import settings


class SpeechToTextService:
    """Local speech-to-text using FasterWhisper."""

    def __init__(self):
        self.model = None
        self._initialized = False

    def initialize(self):
        """Load the Whisper model (called at startup)."""
        if self._initialized:
            return

        model_path = settings.WHISPER_MODEL_PATH
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Whisper model not found at: {model_path}. "
                "Download the model and set WHISPER_MODEL_PATH correctly."
            )

        self.model = WhisperModel(
            model_path,
            device=settings.WHISPER_DEVICE,
            compute_type=settings.WHISPER_COMPUTE_TYPE,
        )
        self._initialized = True

    async def transcribe(self, audio_bytes: bytes, language: str | None = None) -> dict:
        """Transcribe audio bytes to text.

        Args:
            audio_bytes: Raw audio data (WAV/MP3/webm).
            language: Optional language code (e.g., "en").

        Returns:
            dict with keys: text, segments, language, duration_seconds
        """
        if not self._initialized:
            self.initialize()

        # Save to temp file (faster-whisper reads from disk)
        temp_path = Path(settings.RECORDINGS_DIR) / "_temp_audio.wav"
        temp_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path.write_bytes(audio_bytes)

        try:
            segments_info, info = await self._run_transcription(str(temp_path), language)

            text = " ".join(seg.text for seg in segments_info).strip()
            segments = [
                {
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text,
                }
                for seg in segments_info
            ]

            return {
                "text": text or "",
                "segments": segments,
                "language": info.language if info else language or "en",
                "duration_seconds": info.duration if info else 0,
            }
        finally:
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)

    async def _run_transcription(self, audio_path: str, language: str | None = None):
        """Run transcription in executor to avoid blocking."""
        import asyncio
        loop = asyncio.get_event_loop()

        def _transcribe():
            segments, info = self.model.transcribe(
                audio_path,
                language=language,
                beam_size=5,
                vad_filter=True,
            )
            return list(segments), info

        return await loop.run_in_executor(None, _transcribe)
