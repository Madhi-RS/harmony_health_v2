import json
import os
import subprocess
import tempfile
from pathlib import Path

from app.config import settings


class TextToSpeechService:
    """Local text-to-speech using Piper TTS."""

    def __init__(self):
        self._initialized = False
        self._check_models()

    def _check_models(self):
        """Verify model files exist."""
        if not os.path.exists(settings.PIPER_MODEL_PATH):
            raise FileNotFoundError(
                f"Piper model not found at: {settings.PIPER_MODEL_PATH}"
            )
        if not os.path.exists(settings.PIPER_CONFIG_PATH):
            raise FileNotFoundError(
                f"Piper config not found at: {settings.PIPER_CONFIG_PATH}"
            )

    async def synthesize(self, text: str) -> bytes:
        """Convert text to speech audio bytes.

        Args:
            text: Text to synthesize.

        Returns:
            WAV audio bytes.
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        return await self._run_piper(text)

    async def synthesize_to_file(self, text: str, output_path: str) -> str:
        """Synthesize text and save to file.

        Returns:
            Path to the output audio file.
        """
        audio_bytes = await self.synthesize(text)
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(audio_bytes)
        return str(output_path)

    async def _run_piper(self, text: str) -> bytes:
        """Run piper TTS command."""
        import asyncio
        loop = asyncio.get_event_loop()

        def _synthesize():
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                output_path = tmp.name

            try:
                cmd = [
                    "piper",
                    "--model", settings.PIPER_MODEL_PATH,
                    "--config", settings.PIPER_CONFIG_PATH,
                    "--output_file", output_path,
                ]

                process = subprocess.run(
                    cmd,
                    input=text.encode("utf-8"),
                    capture_output=True,
                    timeout=30,
                )

                if process.returncode != 0:
                    raise RuntimeError(
                        f"Piper TTS failed: {process.stderr.decode()}"
                    )

                with open(output_path, "rb") as f:
                    audio_bytes = f.read()

                return audio_bytes

            finally:
                if os.path.exists(output_path):
                    os.unlink(output_path)

        return await loop.run_in_executor(None, _synthesize)
