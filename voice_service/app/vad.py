"""Voice Activity Detection for the voice pipeline.

Detects speech start/end in real-time audio streams using
energy-based thresholding. Returns segments for STT processing.
"""

import struct
import math


class VoiceActivityDetector:
    """Energy-based VAD for real-time audio."""

    def __init__(
        self,
        sample_rate: int = 16000,
        frame_duration_ms: int = 30,
        energy_threshold: float = 0.015,
        silence_duration_ms: int = 800,
        min_speech_duration_ms: int = 300,
    ):
        self.sample_rate = sample_rate
        self.frame_size = int(sample_rate * frame_duration_ms / 1000)
        self.energy_threshold = energy_threshold
        self.silence_frames = int(silence_duration_ms / frame_duration_ms)
        self.min_speech_frames = int(min_speech_duration_ms / frame_duration_ms)

        self._speech_buffer: list[bytes] = []
        self._silence_count = 0
        self._speech_count = 0
        self._is_speaking = False
        self._speech_segments: list[bytes] = []

    def reset(self):
        """Reset VAD state for a new utterance."""
        self._speech_buffer = []
        self._silence_count = 0
        self._speech_count = 0
        self._is_speaking = False
        self._speech_segments = []

    def process_frame(self, audio_frame: bytes) -> bool:
        """Process a single audio frame.

        Returns True if speech is detected (speaking).
        Returns False if silence.
        """
        # Calculate RMS energy
        if len(audio_frame) < 2:
            return self._is_speaking

        samples = struct.unpack(
            f"{len(audio_frame)//2}h", audio_frame[:len(audio_frame) - len(audio_frame) % 2]
        )
        rms = math.sqrt(sum(s * s for s in samples) / len(samples)) / 32768.0

        if rms > self.energy_threshold:
            self._speech_buffer.append(audio_frame)
            self._speech_count += 1
            self._silence_count = 0
            if self._speech_count >= self.min_speech_frames:
                self._is_speaking = True
        else:
            if self._is_speaking:
                self._silence_count += 1
                self._speech_buffer.append(audio_frame)
                if self._silence_count >= self.silence_frames:
                    # End of utterance — flush buffer to segments
                    self._speech_segments.append(b"".join(self._speech_buffer))
                    self._speech_buffer = []
                    self._is_speaking = False
                    self._speech_count = 0

        return self._is_speaking

    def get_utterance(self) -> bytes | None:
        """Get the most recent complete utterance, if any."""
        if self._speech_segments:
            return self._speech_segments.pop(0)
        return None

    def get_current_utterance(self) -> bytes:
        """Get the current in-progress utterance buffer."""
        return b"".join(self._speech_buffer)

    @property
    def is_speaking(self) -> bool:
        return self._is_speaking
