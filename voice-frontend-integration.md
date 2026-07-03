# Voice Frontend Integration Guide

## Architecture Overview

```
+---------------------------------------------------------------------+
|                        FRONTEND (Browser / Mobile)                  |
|                                                                     |
|  1. REST: Create voice session (POST /api/v1/voice/sessions)       |
|     Returns livekit_token + livekit_url + room_name                 |
|                                                                     |
|  2. WS:   Open signalling channel (/ws/voice)                       |
|     Control messages (join_room, turn_complete, interrupted...)     |
|                                                                     |
|  3. RTC:  Connect to LiveKit room via WebRTC using token            |
|     Audio flows here — mic in, agent voice out                      |
|                                                                     |
+---------------┬──────────────────┬───────────────────┬──────────────+
                | REST             | WS                | WebRTC (media)
                v                  v                    v
+---------------------------------------------------------------------+
|                     AI SALES LAYER (FastAPI :8000)                  |
|                                                                     |
|  POST /api/v1/voice/sessions      Create session + LiveKit token    |
|  GET  /api/v1/voice/sessions/{id}  Session status                   |
|  DELETE /api/v1/voice/sessions/{id} End session                     |
|  GET  /api/v1/voice/health        Component health check            |
|  WS   /ws/voice                   Signalling channel                |
|                                                                     |
|  Internal pipeline (no frontend involvement):                       |
|    User Audio -> Groq STT -> RAG -> Gemini -> ElevenLabs TTS       |
|                                                                     |
+---------------------------------------------------------------------+
                |
                | LiveKit SDK (join as AI participant)
                v
+---------------------------------------------------------------------+
|                     LIVEKIT SERVER (:7880)                          |
|                                                                     |
|  Media transport only — WebRTC audio tracks                         |
|  Frontend publishes user mic track                                  |
|  AI Sales Layer publishes agent voice track                         |
|                                                                     |
+---------------------------------------------------------------------+
```

**Key principle:** The frontend NEVER connects to Groq, ElevenLabs, or Gemini directly. All AI processing (STT, RAG, LLM, TTS) runs inside the AI Sales Layer. LiveKit is ONLY for audio transport.

---

## Step 1: Create a Voice Session (REST)

Call this FIRST when the user clicks the mic button.

```http
POST https://your-server:8000/api/v1/voice/sessions
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json

{
  "site_id": "c2b1f7d9-6a11-4e8b-9d2c-4a7e5f1c8b21",
  "business_type": "default",
  "agent_name": "Alex"
}
```

### Success Response (200)

```json
{
  "session_id": "a1b2c3d4e5f6",
  "conversation_id": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
  "room_name": "voice-a7e2f8b1-1a2b3c4d5e6f",
  "livekit_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "livekit_url": "ws://localhost:7880",
  "status": "created"
}
```

### Error Responses

| Status | Body | Meaning |
|--------|------|---------|
| 401 | `{"detail": "Not authenticated"}` | Missing or invalid JWT |
| 404 | `{"detail": "Voice capabilities are disabled"}` | `VOICE_ENABLED=false` in backend `.env` |
| 403 | `{"detail": "Insufficient permissions"}` | JWT valid but lacks required role |

### JavaScript Example

```javascript
async function createVoiceSession(jwtToken, siteId) {
  const response = await fetch('https://your-server:8000/api/v1/voice/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      site_id: siteId,
      business_type: 'default',
      agent_name: 'Alex',
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Failed to create voice session: ${response.status} - ${err.detail}`);
  }

  const data = await response.json();
  return {
    sessionId: data.session_id,
    conversationId: data.conversation_id,
    roomName: data.room_name,
    livekitToken: data.livekit_token,
    livekitUrl: data.livekit_url,
  };
}
```

---

## Step 2: Open Signalling Channel (WebSocket)

Connect to `/ws/voice` for control messages. This WebSocket carries NO audio — audio goes through LiveKit.

```
ws://your-server:8000/ws/voice?token=<JWT_TOKEN>
```

In dev mode (Keycloak disabled), you can also pass tenant_id and user_id:

```
ws://your-server:8000/ws/voice?token=<JWT_TOKEN>&tenant_id=<TENANT_ID>&user_id=<USER_ID>
```

### Messages Frontend SENDS to Backend

| Type | Payload | When |
|------|---------|------|
| `join_room` | `{ "type": "join_room", "room_name": "voice-..." }` | After connecting the WebSocket |
| `end_session` | `{ "type": "end_session" }` | User clicks "End Call" |
| `ping` | `{ "type": "ping" }` | Keepalive (server also auto-pings every 30s) |

### Messages Backend SENDS to Frontend

Events use a common envelope format. Every message has this structure:

```json
{
  "type": "<event_type>",
  "data": { ... },
  "conversation_id": "...",
  "turn_id": "..."
}
```

#### Connection Lifecycle Events

| type | data | When |
|------|------|------|
| `session_started` | `{ "tenant_id": "...", "user_id": "...", "site_id": "...", "voice_enabled": true }` | WebSocket connected + authenticated |
| `session_started` | `{ "room_name": "...", "status": "room_joined" }` | Backend confirmed it joined the LiveKit room |
| `session_ended` | `{ "reason": "user_requested" }` | Session ended (user request / timeout / error) |

#### Conversation Turn Events (during active call)

| type | data | When |
|------|------|------|
| `transcript_interim` | `{ "text": "Hel", "confidence": 0.5, "timestamp_ms": 1234 }` | Partial STT result — display in UI as grey/subdued text |
| `transcript_final` | `{ "text": "Hello, what are your prices?", "confidence": 0.98, "timestamp_ms": 2000 }` | Final STT result — this is what the user said |
| `turn_started` | `{ "turn_id": "t1", "speaker": "user", "transcript": "..." }` | New turn began |
| `turn_complete` | `{ "turn_id": "t1", "speaker": "assistant", "transcript": "Our plans start at..." }` | AI response text — for captions |
| `interrupted` | `{ "timestamp_ms": 5000, "reason": "user_spoke" }` | User spoke over AI — AI stopped speaking |

#### Error Events

| type | data | When |
|------|------|------|
| `error` | `{ "code": "stt_connection_failed", "message": "...", "recoverable": true, "stage": "stt" }` | Pipeline error — check `recoverable` flag |

#### Ping/Pong (keepalive)

The server sends a ping every 30s of inactivity. Respond with `{ "type": "ping" }` or ignore — the server handles timeouts gracefully.

Server ping format:
```json
{ "type": "transcript_interim", "data": { "text": "", "ping": true } }
```

Frontend response:
```json
{ "type": "ping" }
```
Server responds with:
```json
{ "type": "transcript_interim", "data": { "text": "", "pong": true } }
```

### JavaScript Example

```javascript
function openVoiceSignalling(jwtToken, tenantId, userId) {
  const params = new URLSearchParams({ token: jwtToken });
  if (tenantId) params.set('tenant_id', tenantId);
  if (userId) params.set('user_id', userId);

  const wsUrl = `ws://your-server:8000/ws/voice?${params.toString()}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[VOICE_WS] Signalling channel open');
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case 'session_started':
        if (msg.data?.status === 'room_joined') {
          console.log('[VOICE_WS] Backend joined LiveKit room:', msg.data.room_name);
        } else {
          console.log('[VOICE_WS] Session started', msg.data);
        }
        break;

      case 'transcript_interim':
        if (msg.data?.ping) return; // ignore server pings
        updateInterimText(msg.data.text);  // show partial STT in UI
        break;

      case 'transcript_final':
        appendMessage('user', msg.data.text);  // final user utterance
        break;

      case 'turn_started':
        console.log('[VOICE_WS] Turn started:', msg.data.turn_id);
        break;

      case 'turn_complete':
        appendMessage('assistant', msg.data.transcript);  // AI response caption
        break;

      case 'interrupted':
        showInterruptedIndicator();
        break;

      case 'session_ended':
        cleanupCall(msg.data.reason);
        break;

      case 'error':
        console.error('[VOICE_WS] Error:', msg.data);
        if (msg.data.recoverable) {
          showWarning(msg.data.message);
        } else {
          showError(msg.data.message);
        }
        break;
    }
  };

  ws.onerror = (err) => console.error('[VOICE_WS] WebSocket error:', err);
  ws.onclose = (ev) => console.log('[VOICE_WS] Closed:', ev.code, ev.reason);

  return ws;
}
```

---

## Step 3: Connect to LiveKit Room (WebRTC)

Your frontend uses the **LiveKit JavaScript SDK** to join the room.

### Install LiveKit SDK

```bash
npm install @livekit/components-react
# or
yarn add @livekit/components-react
```

### JavaScript/React Example

```javascript
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';

function VoiceCallRoom({ livekitToken, livekitUrl, roomName }) {
  // The token and URL come from the POST /api/v1/voice/sessions response.
  // No separate API call needed.

  return (
    <LiveKitRoom
      token={livekitToken}
      serverUrl={livekitUrl}        // e.g. "ws://localhost:7880"
      connect={true}
      audio={true}
      video={false}
      onDisconnected={(reason) => {
        console.log('LiveKit disconnected:', reason);
        // Trigger reconnect if transient network issue
      }}
    >
      {/* Renders all participant audio tracks (user + AI agent) */}
      <RoomAudioRenderer />

      {/* Your mic control UI — toggle publish */}
      <MicButton />
    </LiveKitRoom>
  );
}
```

### LiveKit Room Participants

Once connected, you will see TWO participants in the room:

| Participant | Identity Pattern | Tracks |
|-------------|-----------------|--------|
| User | `user-<user_id[:12]>` | Audio mic track — published by frontend |
| AI Agent | `ai-agent-<conversation_id[:8]>` | Audio voice track — published by AI Sales Layer |

---

## Step 4: Full Integration Flow

### User clicks "Start Voice" button

```
FRONTEND                              AI SALES LAYER                   LIVEKIT
   │                                        │                             │
   │── POST /api/v1/voice/sessions ────────▶│                             │
   │◀── { session_id, room_name,            │                             │
   │      livekit_token, livekit_url } ─────│                             │
   │                                        │                             │
   │── WS /ws/voice?token=... ─────────────▶│                             │
   │◀── { type: "session_started" } ────────│                             │
   │                                        │                             │
   │── WS { type: "join_room",              │                             │
   │        room_name: "voice-..." } ──────▶│                             │
   │                                        │── Join room as AI agent ───▶│
   │                                        │◀── Room joined ─────────────│
   │◀── WS { type: "session_started",       │                             │
   │          data: { status: "room_joined" }}                            │
   │                                        │                             │
   │── LiveKit connect(token, url) ──────────────────────────────────────▶│
   │◀── WebRTC connected ────────────────────────────────────────────────│
   │                                        │                             │
   │═══ USER SPEAKS ═══════════════════════╪═════════════════════════════│
   │── Mic audio frames ─────────────────────────────────────────────────▶│
   │                                        │◀── Audio frames ────────────│
   │                                        │── Groq STT ────────────────▶│ (API)
   │                                        │◀── "What are your prices?" ─│
   │                                        │── RAG retrieval ───────────▶│ (Knowledge)
   │                                        │── Gemini LLM ──────────────▶│ (API)
   │                                        │◀── "Our plans start at..." ─│
   │                                        │── ElevenLabs TTS ──────────▶│ (API)
   │                                        │── AI audio frames ─────────▶│
   │◀── AI voice audio ──────────────────────────────────────────────────│
   │                                        │                             │
   │◀── WS { type: "turn_complete",        │                             │
   │          data: { transcript: "..." }} ─│                             │
   │                                        │                             │
```

### User clicks "End Call" button

```
FRONTEND                              AI SALES LAYER
   │                                        │
   │── WS { type: "end_session" } ─────────▶│
   │◀── WS { type: "session_ended" } ───────│
   │                                        │
   │── LiveKit disconnect ──────────────────│── Leave LiveKit room
   │                                        │── Save conversation as JSON
   │                                        │── Clean up resources
   │── WS close ───────────────────────────▶│
```

---

## Step 5: Interrupt Handling

When the AI agent is speaking and the user starts talking:

1. **Frontend**: Keep publishing user audio to LiveKit (mic stays open — do NOT mute)
2. **AI Sales Layer**: Detects user speech above amplitude threshold → cancels ElevenLabs TTS → stops publishing AI audio
3. **Frontend**: Receives `{ type: "interrupted" }` via WebSocket → show "User interrupted" indicator briefly
4. **AI Sales Layer**: Immediately starts a NEW listen phase for the user's utterance
5. **Important**: The partial AI response is DISCARDED (not saved to conversation history). A fresh LLM call runs with full context including the user's new utterance.

---

## Step 6: Conversation Storage

After the call ends, the AI Sales Layer automatically saves the conversation:

- **Path**: `logs/voice/{tenant_id}/{YYYY-MM-DD}/{conversation_id}.json`
- **Cleaning**: `[silence]`, `<silence>`, `SILENCE` markers removed; empty/partial transcripts excluded
- **Content**: Only finalized user + assistant messages

Example stored file:

```json
{
  "conversation_id": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
  "tenant_id": "a7e2f8b1-9c44-4d3a-b6a7-5f2e8c1d9a33",
  "user_id": "user-123",
  "started_at": "2026-07-02T10:00:00Z",
  "ended_at": "2026-07-02T10:05:30Z",
  "turn_count": 5,
  "interrupt_count": 2,
  "messages": [
    { "speaker": "user", "text": "What are your prices?", "turn_id": "t1" },
    { "speaker": "assistant", "text": "Our plans start at ten dollars a month.", "turn_id": "t1" },
    { "speaker": "user", "text": "Tell me more about premium.", "turn_id": "t2" },
    { "speaker": "assistant", "text": "Premium includes 24/7 support and advanced analytics.", "turn_id": "t2" }
  ]
}
```

---

## Step 7: Environment Variables (Backend only)

The AI Sales Layer backend needs these in its `.env`. The frontend does NOT need any of these.

```bash
# Enable voice
VOICE_ENABLED=true

# LiveKit server
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret

# Groq STT
GROQ_API_KEY=gsk_...

# ElevenLabs TTS
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=C3aqZfd4M0h7Ys5tWGIS
ELEVENLABS_MODEL=eleven_turbo_v2_5

# RAG context (tenant + site for knowledge retrieval)
AI_SERVICE_TENANT_ID=a7e2f8b1-9c44-4d3a-b6a7-5f2e8c1d9a33
AI_SERVICE_SITE_ID=c2b1f7d9-6a11-4e8b-9d2c-4a7e5f1c8b21
```

---

## Step 8: LiveKit Server (Docker)

Start the LiveKit server. The AI Sales Layer connects to it automatically.

```bash
# From the ai-sales-layer repo:
docker compose up -d livekit livekit-redis
```

Or standalone:

```bash
docker run -d \
  --name livekit \
  -p 7880:7880 \
  -p 7881:7881 \
  -e LIVEKIT_KEYS="devkey: secret" \
  -e LIVEKIT_PORT=7880 \
  livekit/livekit-server:v1.7.3
```

---

## Complete Frontend Integration Checklist

- [ ] Install `@livekit/components-react` package
- [ ] On mic click: call `POST /api/v1/voice/sessions` with JWT
- [ ] Extract `livekit_token`, `livekit_url`, `room_name`, `session_id` from response
- [ ] Open WebSocket to `/ws/voice?token=<JWT>`
- [ ] Wait for `{ type: "session_started" }` confirmation
- [ ] Send `{ "type": "join_room", "room_name": "..." }` via WebSocket
- [ ] Wait for `{ type: "session_started", data: { status: "room_joined" } }`
- [ ] Connect to LiveKit using `<LiveKitRoom token={livekitToken} serverUrl={livekitUrl}>`
- [ ] Enable mic (publish audio track to LiveKit)
- [ ] Listen for `transcript_interim` → show partial text in UI (grey/subdued)
- [ ] Listen for `transcript_final` → show final user utterance
- [ ] Listen for `turn_complete` → show AI response caption
- [ ] Listen for `interrupted` → show "User interrupted" indicator
- [ ] Listen for `error` → check `recoverable` flag; show warning or error
- [ ] On "End Call": send `{ "type": "end_session" }` via WebSocket
- [ ] Wait for `{ type: "session_ended" }`
- [ ] Disconnect from LiveKit room
- [ ] Close WebSocket

---

## Complete Frontend Integration Code (Putting It All Together)

```javascript
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';

// ── State ──────────────────────────────────────────────────────────
const [callState, setCallState] = useState('idle'); // idle | connecting | active | ending
const [livekitToken, setLivekitToken] = useState(null);
const [livekitUrl, setLivekitUrl] = useState(null);
const [roomName, setRoomName] = useState(null);
const [messages, setMessages] = useState([]);      // transcript history
const [interimText, setInterimText] = useState(''); // partial STT
const wsRef = useRef(null);

// ── Start Call ─────────────────────────────────────────────────────
async function startVoiceCall(jwtToken, siteId) {
  setCallState('connecting');

  // 1. Create session
  const session = await createVoiceSession(jwtToken, siteId);
  setLivekitToken(session.livekitToken);
  setLivekitUrl(session.livekitUrl);
  setRoomName(session.roomName);

  // 2. Open signalling WebSocket
  const ws = openVoiceSignalling(jwtToken, /* tenantId */ null, /* userId */ null);
  wsRef.current = ws;

  // 3. Wait for WS open, then join room
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join_room', room_name: session.roomName }));
  };

  // Wait for room_joined before connecting LiveKit
  // (handled inside openVoiceSignalling via a callback or promise)
}

// ── End Call ───────────────────────────────────────────────────────
function endVoiceCall() {
  setCallState('ending');
  if (wsRef.current) {
    wsRef.current.send(JSON.stringify({ type: 'end_session' }));
  }
  // cleanup happens when session_ended event is received
}

// ── Render ─────────────────────────────────────────────────────────
return (
  <div>
    {callState === 'idle' && (
      <button onClick={() => startVoiceCall(jwtToken, siteId)}>
        Start Voice Chat
      </button>
    )}

    {callState === 'connecting' && <div>Connecting...</div>}

    {(callState === 'active' || callState === 'ending') && livekitToken && (
      <LiveKitRoom
        token={livekitToken}
        serverUrl={livekitUrl}
        connect={true}
        audio={true}
        video={false}
      >
        <RoomAudioRenderer />
        <button onClick={endVoiceCall}>End Call</button>
      </LiveKitRoom>
    )}

    {/* Transcript display */}
    <div className="transcripts">
      {interimText && <p className="interim">{interimText}</p>}
      {messages.map((msg, i) => (
        <p key={i} className={msg.speaker}>{msg.text}</p>
      ))}
    </div>
  </div>
);
```

---

## What the Frontend DOES NOT Need

The frontend does NOT need:
- ❌ Groq API keys or SDK
- ❌ ElevenLabs API keys or SDK
- ❌ Gemini API keys or SDK
- ❌ Any STT/TTS/LLM logic
- ❌ RAG / knowledge retrieval logic
- ❌ Conversation state management
- ❌ JSON file storage logic
- ❌ A separate endpoint for LiveKit tokens (they come in the session response)

**All AI processing runs inside the AI Sales Layer.**
