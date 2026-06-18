from pydantic import BaseModel
from typing import Optional


class TranscribeRequest(BaseModel):
    audio_data: str  # base64-encoded audio


class TranscribeResponse(BaseModel):
    text: str
    language: str
    duration_seconds: float
    segments: list[dict]


class SynthesizeRequest(BaseModel):
    text: str


class SynthesizeResponse(BaseModel):
    audio_data: str  # base64-encoded WAV
    duration_seconds: float


class ProcessRequest(BaseModel):
    audio_data: str  # base64-encoded audio
    conversation_id: Optional[str] = None
    language: Optional[str] = None


class ProcessResponse(BaseModel):
    transcript: str
    ai_response_text: str
    audio_data: Optional[str] = None  # base64-encoded TTS audio
    conversation_id: Optional[str] = None
