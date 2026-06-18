import uuid
import httpx
from app.config import settings


class LiveKitService:
    """Manages LiveKit room connections and tokens via LiveKit Cloud API."""

    def __init__(self):
        self.base_url = settings.LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://")
        self.api_key = settings.LIVEKIT_API_KEY
        self.api_secret = settings.LIVEKIT_API_SECRET

    async def create_room(self, room_name: str | None = None) -> str:
        """Create a LiveKit room and return its name."""
        if room_name is None:
            room_name = f"voice-session-{uuid.uuid4().hex[:8]}"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/v1/rooms",
                json={"name": room_name},
                auth=(self.api_key, self.api_secret),
            )
            response.raise_for_status()

        return room_name

    async def generate_token(
        self,
        identity: str,
        room_name: str,
        can_publish: bool = True,
        can_subscribe: bool = True,
    ) -> str:
        """Generate an access token for a LiveKit room using the API."""
        import json, time, base64, hmac, hashlib

        header = {"alg": "HS256", "typ": "JWT"}
        payload = {
            "iss": self.api_key,
            "sub": identity,
            "exp": int(time.time()) + 3600,
            "nbf": int(time.time()),
            "iat": int(time.time()),
            "jid": str(uuid.uuid4()),
            "video": {
                "room": room_name,
                "roomJoin": True,
                "canPublish": can_publish,
                "canSubscribe": can_subscribe,
            },
        }

        def b64encode(data: dict) -> str:
            return base64.urlsafe_b64encode(
                json.dumps(data, separators=(",", ":")).encode()
            ).rstrip(b"=").decode()

        header_b64 = b64encode(header)
        payload_b64 = b64encode(payload)
        message = f"{header_b64}.{payload_b64}"

        signature = hmac.new(
            self.api_secret.encode(), message.encode(), hashlib.sha256
        ).digest()
        signature_b64 = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()

        return f"{message}.{signature_b64}"

    async def list_rooms(self) -> list[str]:
        """List all active rooms."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v1/rooms",
                auth=(self.api_key, self.api_secret),
            )
            response.raise_for_status()
            data = response.json()
            return [room["name"] for room in data.get("rooms", [])]

    async def delete_room(self, room_name: str) -> None:
        """Delete a room by name."""
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{self.base_url}/api/v1/rooms/{room_name}",
                auth=(self.api_key, self.api_secret),
            )
            response.raise_for_status()
