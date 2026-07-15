/**
 * LiveKit voice client — manages LiveKit Room lifecycle.
 *
 * Responsibilities:
 * 1. Create LiveKit Room object
 * 2. Connect using livekit_url + livekit_token from backend
 * 3. Request microphone permission and publish audio
 * 4. Subscribe to assistant audio tracks and play them
 * 5. Track connection state
 * 6. Cleanly disconnect with resource cleanup
 *
 * Important: LiveKit connect uses livekit_token, NOT the AI Sales Layer auth token.
 */

import type { VoiceUiState, VoiceDataEvent } from "@/types/voice";

// ── Reconnect config ──
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 8000;

export interface LiveKitClientCallbacks {
  onStateChange: (state: VoiceUiState) => void;
  onError: (message: string) => void;
  onLog: (tag: string, msg: string, extra?: Record<string, unknown>) => void;
  /**
   * Called when a transcript/status event is received from the backend over
   * the LiveKit data channel or the native transcription stream.
   */
  onTranscript?: (event: VoiceDataEvent) => void;
}

export interface LiveKitClientInstance {
  /** Connect to a LiveKit room and publish the microphone. */
  connect: (livekitUrl: string, livekitToken: string, roomName: string) => Promise<void>;
  /** Disconnect cleanly: mute mic, detach audio, leave room. */
  disconnect: () => Promise<void>;
  /** Mute or unmute the local microphone. */
  setMuted: (muted: boolean) => void;
  /** Whether the microphone is currently muted. */
  isMuted: () => boolean;
  /** Current LiveKit connection state string. */
  getConnectionState: () => string;
}

export function createLiveKitVoiceClient(
  callbacks: LiveKitClientCallbacks
): LiveKitClientInstance {
  const { onStateChange, onError, onLog, onTranscript } = callbacks;

  let room: any = null;
  let localAudioTrack: any = null;
  const agentAudioElements = new Set<HTMLAudioElement>();
  let reconnectCount = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let isDisconnecting = false;
  let isMuted = false;

  // ── Assistant turn tracking ──
  //
  // The assistant's audio track is a single long-lived media stream. It does
  // NOT fire an HTML `ended` event between TTS utterances, so we must NOT use
  // `ended` as the signal to return to "listening" — that leaves the UI stuck
  // in "assistant_speaking" forever after the greeting.
  //
  // Source of truth (in priority order):
  //   1. LiveKit ActiveSpeakersChanged — authoritative when the SFU emits it.
  //   2. Silence fallback — remote audio `currentTime` stops advancing.
  //
  // Identity of the agent participant, tracked so ActiveSpeakersChanged can
  // decide whether the *agent* (not the local user) is speaking.
  let agentIdentity: string | null = null;
  /** Coarse turn state, kept locally so onStateChange isn't spammed. */
  let turnState: "unknown" | "assistant_speaking" | "listening" = "unknown";
  /**
   * PHASE 4 — Suppress the "you can speak" (listening) prompt until the welcome
   * greeting has finished, so the user doesn't talk over the multi-part greeting
   * (which produces poor/echoed STT on the backend).
   *   agentHasSpoken  — has the agent been an active speaker at least once?
   *   welcomeComplete — has the agent gone silent once AFTER speaking?
   */
  let agentHasSpoken = false;
  let welcomeComplete = false;
  /**
   * PHASE 2 — Debounce before switching back to "listening". Active-speaker
   * sets briefly go empty between words/packets; without a debounce the UI
   * flaps assistant_speaking ↔ listening many times per second. We wait this
   * long with no agent activity before declaring the turn over.
   */
  const LISTENING_DEBOUNCE_MS = 1000;
  let listeningTimer: ReturnType<typeof setTimeout> | null = null;

  function clearListeningTimer() {
    if (listeningTimer) {
      clearTimeout(listeningTimer);
      listeningTimer = null;
    }
  }

  function markAssistantSpeaking() {
    // Any agent activity cancels a pending "return to listening".
    clearListeningTimer();
    agentHasSpoken = true; // PHASE 4 — the greeting/agent turn is under way.
    if (turnState !== "assistant_speaking") {
      turnState = "assistant_speaking";
      onLog("VOICE", "Agent state → assistant_speaking");
      onStateChange("assistant_speaking");
    }
  }

  /**
   * Immediately transition to "listening" (no debounce). Used by teardown
   * paths (disconnect, autoplay failure) where we must not linger.
   */
  function markListening() {
    clearListeningTimer();
    if (turnState !== "listening") {
      turnState = "listening";
      onLog("VOICE", "Agent state → listening (user can speak)");
      onStateChange("listening");
    }
  }

  /**
   * PHASE 2 — Debounced transition to "listening". Repeated calls while a timer
   * is already pending are no-ops (they do NOT reset it), so the silence
   * monitor firing every tick still lets the timer elapse.
   *
   * PHASE 4 — Do not prompt "you can speak" until the greeting is complete. The
   * greeting is considered complete the first time the agent goes silent AFTER
   * having spoken. Before the agent has ever spoken, an empty active-speaker set
   * is just the pre-greeting connecting gap, so we hold state (no listening).
   */
  function scheduleListening() {
    if (turnState === "listening") return;
    if (listeningTimer) return;

    // Pre-greeting: agent hasn't spoken yet → this silence is the connecting
    // gap, not a real turn end. Stay in the current (connecting/assistant)
    // phase and don't prompt the user.
    if (!agentHasSpoken) {
      onLog("VOICE", "Suppressing listening — greeting not started yet");
      return;
    }

    listeningTimer = setTimeout(() => {
      listeningTimer = null;
      if (!welcomeComplete) {
        welcomeComplete = true;
        onLog("VOICE", "Welcome greeting complete — user may speak");
      }
      markListening();
    }, LISTENING_DEBOUNCE_MS);
  }

  // ── Audio playback watchdog ──
  let audioWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * How long to wait for real audio progress (element.currentTime advancing)
   * before warning and reverting to "listening". play() resolving only means
   * the media element started — not that audible frames are flowing.
   */
  const AUDIO_WATCHDOG_MS = 3000;

  function clearAudioWatchdog() {
    if (audioWatchdogTimer) {
      clearTimeout(audioWatchdogTimer);
      audioWatchdogTimer = null;
    }
  }

  // ── Data / transcript event decoding ──

  const textDecoder =
    typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

  function handleDataPayload(payload: Uint8Array) {
    if (!textDecoder) return;
    let raw: string;
    try {
      raw = textDecoder.decode(payload);
    } catch {
      return;
    }
    if (!raw) return;

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      onLog("TRANSCRIPT", "Ignoring non-JSON data payload", { raw });
      return;
    }

    if (!parsed || typeof parsed.type !== "string") return;

    switch (parsed.type) {
      case "user_interim_transcript":
      case "user_final_transcript":
      case "assistant_interim_transcript":
      case "assistant_text":
      case "stt_error": {
        onLog("TRANSCRIPT", parsed.type, {
          text: parsed.text,
          message: parsed.message,
        });
        onTranscript?.(parsed as VoiceDataEvent);
        break;
      }
      default:
        onLog("TRANSCRIPT", `Unknown data event: ${parsed.type}`);
    }
  }

  // ── Helpers ──

  function resetReconnect() {
    reconnectCount = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function detachAllAgentAudio() {
    clearAudioWatchdog();
    clearListeningTimer();
    agentAudioElements.forEach((el) => {
      try {
        el.pause();
        el.removeAttribute("src");
        el.load(); // force release of audio resources
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      } catch (e) {
        /* ignore */
      }
    });
    agentAudioElements.clear();
  }

  function stopLocalMic() {
    if (localAudioTrack) {
      try {
        localAudioTrack.stop();
      } catch (e) {
        /* ignore */
      }
      localAudioTrack = null;
    }
    isMuted = false;
  }

  // ── Reconnect ──

  async function attemptReconnect(
    livekitUrl: string,
    livekitToken: string
  ): Promise<void> {
    if (isDisconnecting) return;

    const count = reconnectCount + 1;
    reconnectCount = count;

    if (count > MAX_RECONNECT_ATTEMPTS) {
      onLog("LIVEKIT", `Reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
      onStateChange("ended");
      onError("Connection lost. Please try again.");
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, count - 1) + Math.random() * 500,
      RECONNECT_MAX_MS
    );
    onLog("LIVEKIT", `Reconnecting in ${Math.round(delay)}ms (attempt ${count}/${MAX_RECONNECT_ATTEMPTS})`);

    reconnectTimer = setTimeout(async () => {
      try {
        onStateChange("reconnecting");
        await connect(livekitUrl, livekitToken, "" /* roomName from token */);
      } catch (e: any) {
        onLog("LIVEKIT", `Reconnect attempt ${count} failed: ${e.message}`);
        attemptReconnect(livekitUrl, livekitToken);
      }
    }, delay);
  }

  // ── Connect ──

  async function connect(
    livekitUrl: string,
    livekitToken: string,
    _roomName: string
  ): Promise<void> {
    if (room && room.state === "connected") {
      onLog("LIVEKIT", "Already connected — disconnect first");
      await disconnect();
    }

    isDisconnecting = false;

    // Dynamic import so livekit-client is only loaded when voice is used
    const { Room, RoomEvent } = await import("livekit-client");

    const newRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
    } as any);

    // ── Event handlers ──

    newRoom.on(RoomEvent.Connected, () => {
      onLog("LIVEKIT", "Connected");
      resetReconnect();
      onStateChange("connected");
    });

    newRoom.on(RoomEvent.Disconnected, () => {
      onLog("LIVEKIT", "Disconnected");
      detachAllAgentAudio();
      stopLocalMic();

      if (!isDisconnecting) {
        onLog("LIVEKIT", "Unexpected disconnect — will attempt reconnect");
        attemptReconnect(livekitUrl, livekitToken);
      }
    });

    newRoom.on(RoomEvent.Reconnecting, () => {
      onLog("LIVEKIT", "Reconnecting (LiveKit built-in)");
      onStateChange("reconnecting");
    });

    newRoom.on(RoomEvent.Reconnected, () => {
      onLog("LIVEKIT", "Reconnected (LiveKit built-in)");
      onStateChange("connected");
    });

    newRoom.on(RoomEvent.TrackSubscribed, (track: any, _pub: any, participant: any) => {
      if (track.kind === "audio" && participant?.identity !== newRoom.localParticipant?.identity) {
        agentIdentity = participant?.identity ?? agentIdentity;
        onLog("PLAYBACK", "Assistant audio track received", {
          participant: participant?.identity,
        });

        // Dedup — detach previous tracks first
        detachAllAgentAudio();

        const element = track.attach();
        if (!element) {
          onLog("PLAYBACK", "track.attach() returned null — cannot play audio");
          return;
        }

        // Append to DOM so the browser treats it as user-visible audio.
        // Hidden audio elements are more likely to be blocked by autoplay policies.
        element.style.display = "none";
        document.body.appendChild(element);
        agentAudioElements.add(element);

        let audioStarted = false;

        // Autoplay watchdog — purely a PLAYBACK check, NOT a turn-state driver
        // (Phase 3). If currentTime never advances, the browser blocked autoplay
        // or the track is silent, so we surface the "tap to enable" hint. Turn
        // state (assistant_speaking / listening) is owned solely by the
        // active-speaker identity logic below.
        clearAudioWatchdog();
        audioWatchdogTimer = setTimeout(() => {
          if (!audioStarted) {
            onLog(
              "PLAYBACK",
              "No audio progress within watchdog window — autoplay may be blocked"
            );
            onError("Tap to enable audio playback.");
          }
        }, AUDIO_WATCHDOG_MS);

        // timeupdate is used ONLY to confirm playback started (log + clear the
        // watchdog). It deliberately does NOT change turn state anymore — remote
        // audio progress is not a reliable "agent is speaking now" signal, so it
        // was a source of flapping (Phase 3 removes it as a state driver).
        const onFirstProgress = () => {
          if (!audioStarted && element.currentTime > 0) {
            audioStarted = true;
            clearAudioWatchdog();
            onLog("PLAYBACK", "Audio playback confirmed", {
              currentTime: Number(element.currentTime.toFixed(2)),
            });
          }
        };
        element.addEventListener("timeupdate", onFirstProgress);

        // play() only starts the media element; it does not affect turn state.
        // A rejection means autoplay was blocked.
        element
          .play()
          .then(() => {
            onLog("PLAYBACK", "Audio playback started");
          })
          .catch((err: any) => {
            clearAudioWatchdog();
            onLog("PLAYBACK", `Audio play() rejected: ${err.name || err.message}`);
            // The browser blocked autoplay — tell the user. Turn state is
            // unaffected; the active-speaker logic will manage it.
            onError("Tap to enable audio playback.");
          });

        const cleanupElement = () => {
          clearAudioWatchdog();
          element.removeEventListener("timeupdate", onFirstProgress);
          agentAudioElements.delete(element);
          try {
            if (element.parentNode) element.parentNode.removeChild(element);
          } catch (e) { /* ignore */ }
        };

        element.addEventListener("ended", cleanupElement);
        track.on("ended", () => {
          onLog("PLAYBACK", "Track ended");
          cleanupElement();
        });
      }
    });

    // PHASE 1 — Authoritative turn signal derived from participant IDENTITY,
    // not generic activity. The agent participant identity starts with
    // "agent-"; the local user starts with "user-". We only enter
    // "assistant_speaking" when an AGENT participant is actually speaking, and
    // never when only the user is in the active-speaker set.
    newRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers: any[]) => {
      const identities = (speakers || [])
        .map((p) => p?.identity)
        .filter(Boolean) as string[];
      onLog("LIVEKIT", "active speakers", { identities });

      const localIdentity = newRoom.localParticipant?.identity;
      const agentIsSpeaking = identities.some(
        (id) => id.startsWith("agent-") || (agentIdentity && id === agentIdentity)
      );
      const userIsSpeaking = identities.some(
        (id) => id.startsWith("user-") || id === localIdentity
      );

      if (agentIsSpeaking) {
        markAssistantSpeaking();
      } else if (userIsSpeaking) {
        // The user is the active speaker — this is NOT the assistant speaking.
        // We have no dedicated "user_speaking" UI state, so remain in
        // "listening" (Phase 1 permits this). Debounced (Phase 2) to avoid
        // flapping on brief speaker-set gaps.
        scheduleListening();
      } else {
        // No active speaker — wait out the debounce before declaring the turn
        // over (Phase 2). Brief empty sets between agent words won't flap.
        scheduleListening();
      }
    });

    newRoom.on(
      RoomEvent.TrackUnsubscribed,
      (_track: any, _pub: any, _participant: any) => {
        // Cleanup is handled in track.ended above
      }
    );

    newRoom.on(RoomEvent.ConnectionStateChanged, (state: string) => {
      onLog("LIVEKIT", `ConnectionState → ${state}`);
    });

    // F-P1-1: Transcript / status events over the data channel.
    // Backend publishes JSON payloads (user_interim_transcript,
    // user_final_transcript, assistant_text, stt_error).
    newRoom.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      handleDataPayload(payload);
    });

    // Native LiveKit transcription stream (if the backend uses it instead of,
    // or in addition to, the raw data channel).
    if ((RoomEvent as any).TranscriptionReceived) {
      newRoom.on(
        (RoomEvent as any).TranscriptionReceived,
        (segments: any[], participant: any) => {
          const isLocal =
            participant?.identity &&
            participant.identity === newRoom.localParticipant?.identity;
          const role: "user" | "assistant" = isLocal ? "user" : "assistant";
          for (const seg of segments || []) {
            if (!seg?.text) continue;
            const text: string = (seg.text as string).trim();
            if (!text) continue;
            const segmentId = (seg.id as string) || undefined;
            if (role === "user") {
              onTranscript?.({
                type: seg.final
                  ? "user_final_transcript"
                  : "user_interim_transcript",
                text,
                segmentId,
              });
            } else {
              // Frontend Fix A — Only FINAL assistant segments are appended
              // to history. Interim/TTS-partial chunks are ephemeral captions.
              onTranscript?.({
                type: seg.final
                  ? "assistant_text"
                  : "assistant_interim_transcript",
                text,
                segmentId,
              });
            }
          }
        }
      );
    }

    // ── Connect and publish ──

    await newRoom.connect(livekitUrl, livekitToken);
    room = newRoom;
    turnState = "unknown";
    // PHASE 4 — reset greeting gating for this connection.
    agentHasSpoken = false;
    welcomeComplete = false;

    // Publish microphone. It stays published for the whole call so LiveKit VAD
    // can detect user speech and interruptions (allow_interruptions=True on the
    // agent). We never auto-mute while the assistant is speaking — mute is only
    // ever driven by the user's mute button (setMuted).
    onLog("MIC", "Requesting microphone...");
    const { createLocalAudioTrack } = await import("livekit-client");
    const audioTrack = await createLocalAudioTrack();
    await newRoom.localParticipant.publishTrack(audioTrack);
    localAudioTrack = audioTrack;
    onLog("MIC", "Published", { muted: audioTrack?.isMuted ?? false });
    // PHASE 4 — Do NOT prompt "Listening..." immediately. Stay in the
    // connected/assistant phase until the welcome greeting has played and the
    // agent goes silent (scheduleListening flips welcomeComplete → listening).
    onStateChange("connected");
  }

  // ── Disconnect ──

  async function disconnect(): Promise<void> {
    isDisconnecting = true;
    resetReconnect();

    stopLocalMic();
    detachAllAgentAudio();

    if (room && room.state !== "disconnected") {
      try {
        room.disconnect();
      } catch (e) {
        /* ignore */
      }
      room = null;
    }

    onStateChange("ended");
  }

  // ── Mute control ──

  function setMuted(muted: boolean) {
    if (room?.localParticipant) {
      room.localParticipant.setMicrophoneEnabled(!muted);
      isMuted = muted;
    }
  }

  function getIsMuted(): boolean {
    return isMuted;
  }

  function getConnectionState(): string {
    return room?.state ?? "disconnected";
  }

  return {
    connect,
    disconnect,
    setMuted,
    isMuted: getIsMuted,
    getConnectionState,
  };
}
