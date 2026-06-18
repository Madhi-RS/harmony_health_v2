"""T8.4-T8.6 — TTS service tests."""

import pytest
from unittest.mock import patch


class TestTextToSpeechService:

    def test_model_paths_configured(self):
        """T8.4 — TTS model paths configured."""
        from app.config import settings
        assert settings.PIPER_MODEL_PATH is not None
        assert settings.PIPER_CONFIG_PATH is not None

    @patch("app.tts.subprocess.run")
    @patch("app.tts.os.path.exists")
    def test_synthesize_empty_text(self, mock_exists, mock_run):
        """T8.7 — Empty text raises error."""
        mock_exists.return_value = True
        from app.tts import TextToSpeechService
        service = TextToSpeechService()
        import pytest
        with pytest.raises(ValueError, match="cannot be empty"):
            import asyncio
            asyncio.run(service.synthesize(""))
