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

import type { VoiceUiState, VoiceDataEvent, VoiceAudioChunk } from "@/types/voice";
import { VOICE_TIMING } from "@/config/voiceConfig";

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
  /**
   * Elements muted by barge-in that must be unmuted when the agent speaks
   * again. Separate from agentAudioElements because a ducked element is
   * still alive and still attached to the track — we just set volume=0.
   */
  const bargeInDuckedElements = new Set<HTMLAudioElement>();
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
  let turnState: "unknown" | "assistant_speaking" | "assistant_generating" | "listening" = "unknown";
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
  const LISTENING_DEBOUNCE_MS = VOICE_TIMING.listeningDebounceMs;
  let listeningTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Sentence-level audio chunk queue ──
  //
  // When the backend sends sentence-chunked TTS audio, each chunk arrives as a
  // separate LiveKit track. Instead of detaching the currently-playing track
  // when a new one arrives (which would cause audio gaps/overlaps), we enqueue
  // each chunk and play them sequentially.
  //
  // Legacy single-track responses still work: if only one track arrives, it
  // plays immediately with no queuing overhead.
  const audioChunkQueue: VoiceAudioChunk[] = [];
  /** Monotonic counter for chunk IDs. */
  let chunkSeq = 0;
  /** The chunk currently being played (null if nothing is playing). */
  let activeChunk: VoiceAudioChunk | null = null;
  /** Whether the agent is currently generating more response text/chunks. */
  let agentGenerating = false;
  /**
   * Timer that fires when the queue stays empty for too long while
   * agentGenerating is true — signals that the agent has finished its turn.
   */
  let generationCompleteTimer: ReturnType<typeof setTimeout> | null = null;
  /** How long to wait after the last chunk before declaring generation complete. */
  const GENERATION_COMPLETE_MS = VOICE_TIMING.generationCompleteMs;

  // ── Fix A+B — Barge-in gating & greeting completion ──
  //
  // The greeting must NOT be interruptible. We gate barge-in behind two flags:
  //   welcomeComplete  — agent has finished its logical turn (lk.agent.state → listening)
  //   greetingAudioDone — the browser has actually finished playing all greeting audio
  //
  // Barge-in also requires SUSTAINED user speech (not a single active-speaker flicker).
  let greetingAudioDone = false;
  let greetingCompletedAt: number | null = null;
  let bargeInCandidateTimer: ReturnType<typeof setTimeout> | null = null;
  /** Guards against double-starting the same chunk during gapless hand-off. */
  let nextChunkStarted = 0;

  // ── Req 8 — Realtime timing instrumentation ──
  let lastTimeupdateTime = 0;
  let droppedFrameCount = 0;
  let bufferUnderrunCount = 0;
  let firstPacketReceivedAt: number | null = null;
  let playbackStartedAt: number | null = null;
  let playbackCompletedAt: number | null = null;
  let lastInterruptionAt: number | null = null;

  function resetTiming() {
    lastTimeupdateTime = 0;
    droppedFrameCount = 0;
    bufferUnderrunCount = 0;
    firstPacketReceivedAt = null;
    playbackStartedAt = null;
    playbackCompletedAt = null;
    lastInterruptionAt = null;
  }

  function logTiming() {
    const now = performance.now();
    onLog("TIMING", "playback summary", {
      firstPacketMs: firstPacketReceivedAt ? (playbackStartedAt ?? now) - firstPacketReceivedAt : null,
      playbackStartMs: playbackStartedAt ? (playbackCompletedAt ?? now) - playbackStartedAt : null,
      totalLatencyMs: firstPacketReceivedAt ? (playbackCompletedAt ?? now) - firstPacketReceivedAt : null,
      droppedFrames: droppedFrameCount,
      bufferUnderruns: bufferUnderrunCount,
      interruptions: lastInterruptionAt ? 1 : 0,
    });
  }

  function clearListeningTimer() {
    if (listeningTimer) {
      clearTimeout(listeningTimer);
      listeningTimer = null;
    }
    if (generationCompleteTimer) {
      clearTimeout(generationCompleteTimer);
      generationCompleteTimer = null;
    }
  }

  // ── Audio chunk queue management ──

  function clearChunkQueue() {
    cancelBargeInCandidate("queue-cleared");
    if (generationCompleteTimer) {
      clearTimeout(generationCompleteTimer);
      generationCompleteTimer = null;
    }
    // Detach all queued (not-yet-playing) audio elements.
    while (audioChunkQueue.length > 0) {
      const chunk = audioChunkQueue.shift()!;
      cleanupChunkElement(chunk.audioElement);
    }
    agentGenerating = false;
  }

  /** Detach current audio and stop tracking it. */
  function stopActiveChunk() {
    if (activeChunk) {
      cleanupChunkElement(activeChunk.audioElement);
      activeChunk = null;
    }
  }

  /** Clean up a single audio element (pause, remove src, detach from DOM). */
  function cleanupChunkElement(el: HTMLAudioElement) {
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
  }

  /**
   * Play the next chunk from the queue. If the queue is empty and the last
   * played chunk was marked `isLast`, transition to listening. Otherwise
   * (queue empty but agent still generating), enter assistant_generating.
   */
  function playNextChunk() {
    if (audioChunkQueue.length === 0) {
      activeChunk = null;
      if (!agentGenerating) {
        // All chunks done, agent has stopped generating.
        maybeCompleteAgentTurn("queue-drained");
      } else {
        // Still waiting for more chunks from the agent.
        onLog("CHUNK", "Queue empty but agent still generating — starting completion timer");
        if (turnState !== "assistant_generating" && turnState !== "assistant_speaking") {
          turnState = "assistant_generating";
          onStateChange("assistant_generating");
        }
        if (!generationCompleteTimer) {
          generationCompleteTimer = setTimeout(() => {
            generationCompleteTimer = null;
            if (agentGenerating && audioChunkQueue.length === 0 && !activeChunk) {
              onLog("CHUNK", "Generation complete — no chunks arrived");
              agentGenerating = false;
              maybeCompleteAgentTurn("generation-timer");
            }
          }, GENERATION_COMPLETE_MS);
        }
      }
      return;
    }

    const chunk = audioChunkQueue.shift()!;
    activeChunk = chunk;
    const gen = ++nextChunkStarted; // hand-off guard token
    onLog("CHUNK", `Playing chunk #${chunk.sentenceIndex}${chunk.isLast ? " (last)" : ""}`);

    // ── Req 8 — Record first-packet timing ──
    if (!firstPacketReceivedAt) {
      firstPacketReceivedAt = performance.now();
      onLog("TIMING", "first audio packet received", { ms: firstPacketReceivedAt });
    }

    // F1 — Drive greeting-gating from the real audio playback path.
    markAssistantSpeaking();

    // ── Fix C — Prime queued element for faster hand-off ──
    chunk.audioElement.preload = "auto";
    try { chunk.audioElement.load(); } catch (_) { /* best-effort */ }

    let audioStarted = false;
    let lastCurrentTime = 0;

    const onProgress = () => {
      const ct = chunk.audioElement.currentTime;
      if (!audioStarted && ct > 0) {
        audioStarted = true;
        playbackStartedAt = performance.now();
        onLog("CHUNK", `Chunk #${chunk.sentenceIndex} playback confirmed`);
        onLog("TIMING", "playback started", { ms: playbackStartedAt });
        // ── Fix C gapless: pre-buffer next chunk while current plays ──
        if (audioChunkQueue.length > 0) {
          const next = audioChunkQueue[0];
          next.audioElement.preload = "auto";
          try { next.audioElement.load(); } catch (_) { /* best-effort */ }
        }
      }

      // ── Req 8 — Dropped frame detection ──
      // LiveKit audio frames arrive every ~20ms (50fps). A gap >60ms
      // between timeupdate ticks suggests a dropped frame or buffer stall.
      if (lastCurrentTime > 0 && ct > 0) {
        const gap = ct - lastCurrentTime;
        if (gap > 0.06) {
          droppedFrameCount++;
          onLog("TIMING", "possible dropped frame", {
            gapMs: Math.round(gap * 1000),
            currentTime: ct,
            droppedTotal: droppedFrameCount,
          });
        }
      }
      lastCurrentTime = ct;

      // ── Fix C optional gapless: start next chunk slightly before current ends ──
      if (
        audioChunkQueue.length > 0 &&
        chunk.audioElement.duration > 0 &&
        ct >= chunk.audioElement.duration - (VOICE_TIMING.chunkLookaheadMs / 1000)
      ) {
        const nextChunk = audioChunkQueue[0];
        if (nextChunkStarted < gen + 1) {
          onLog("CHUNK", `Look-ahead starting chunk #${nextChunk.sentenceIndex}`, {
            earlyMs: Math.round((chunk.audioElement.duration - ct) * 1000),
          });
          playNextChunk();
        }
      }
    };
    chunk.audioElement.addEventListener("timeupdate", onProgress);

    // ── Req 8 — Buffer underrun detection via stalled/waiting events ──
    const onStalled = () => {
      bufferUnderrunCount++;
      onLog("TIMING", "buffer underrun: stalled", {
        currentTime: chunk.audioElement.currentTime,
        total: bufferUnderrunCount,
      });
    };
    const onWaiting = () => {
      onLog("TIMING", "buffer waiting", {
        currentTime: chunk.audioElement.currentTime,
      });
    };
    chunk.audioElement.addEventListener("stalled", onStalled);
    chunk.audioElement.addEventListener("waiting", onWaiting);

    const onEnded = () => {
      chunk.audioElement.removeEventListener("timeupdate", onProgress);
      chunk.audioElement.removeEventListener("ended", onEnded);
      chunk.audioElement.removeEventListener("stalled", onStalled);
      chunk.audioElement.removeEventListener("waiting", onWaiting);
      cleanupChunkElement(chunk.audioElement);

      // ── Fix: don't clear activeChunk if look-ahead already advanced it ──
      if (activeChunk === chunk) {
        activeChunk = null;
        playbackCompletedAt = performance.now();
        onLog("CHUNK", `Chunk #${chunk.sentenceIndex} finished`);
        onLog("TIMING", "playback completed", { ms: playbackCompletedAt });
        // Play next chunk (or transition to listening if queue is done).
        playNextChunk();
      } else {
        onLog("CHUNK", `Chunk #${chunk.sentenceIndex} ended after hand-off (next already playing)`);
      }
    };
    chunk.audioElement.addEventListener("ended", onEnded);

    // ── Fix D — Autoplay with recovery ──
    let playRetries = 0;
    const MAX_PLAY_RETRIES = 2;
    const tryPlay = () => {
      chunk.audioElement
        .play()
        .then(() => {
          onLog("CHUNK", `Chunk #${chunk.sentenceIndex} play() resolved`);
        })
        .catch((err: any) => {
          onLog("CHUNK", `Chunk #${chunk.sentenceIndex} play() rejected: ${err.name || err.message}`);
          if (playRetries < MAX_PLAY_RETRIES) {
            playRetries++;
            onLog("CHUNK", `Retrying play() — attempt ${playRetries}`);
            setTimeout(tryPlay, 200 * playRetries);
          } else {
            onError("Tap to enable audio playback.");
          }
        });
    };
    tryPlay();
  }

  /**
   * Enqueue an audio element as a sentence chunk. If nothing is currently
   * playing, start playback immediately.
   */
  function enqueueChunk(element: HTMLAudioElement, isLast: boolean) {
    const chunk: VoiceAudioChunk = {
      id: `chunk-${++chunkSeq}`,
      audioElement: element,
      sentenceIndex: chunkSeq,
      isLast,
    };
    audioChunkQueue.push(chunk);
    onLog("CHUNK", `Enqueued chunk #${chunk.sentenceIndex}${isLast ? " (last)" : ""} — queue depth=${audioChunkQueue.length}`);

    // A new chunk arrived — cancel any pending generation-complete timer
    // since the agent is clearly still generating.
    if (generationCompleteTimer) {
      clearTimeout(generationCompleteTimer);
      generationCompleteTimer = null;
    }

    if (!activeChunk) {
      // Nothing currently playing → start immediately.
      playNextChunk();
    }
    // else: a chunk is already playing; the new one will be picked up by playNextChunk's onEnded.
  }

  // ── Fix A+B — Barge-in candidate management ──

  function cancelBargeInCandidate(reason: string) {
    if (bargeInCandidateTimer) {
      clearTimeout(bargeInCandidateTimer);
      bargeInCandidateTimer = null;
      onLog("BARGE_IN", `candidate cancelled: ${reason}`);
    }
  }

  function startBargeInCandidate() {
    // Don't start if barge-in isn't allowed yet.
    if (!greetingAudioDone || !welcomeComplete) {
      onLog("BARGE_IN", "suppressed: greeting-not-complete", {
        greetingAudioDone,
        welcomeComplete,
        activeChunk: activeChunk?.sentenceIndex ?? null,
        queueDepth: audioChunkQueue.length,
      });
      return;
    }
    // Post-greeting cooldown — absorb speaker/echo tail.
    if (
      greetingCompletedAt !== null &&
      Date.now() - greetingCompletedAt < VOICE_TIMING.bargeInCooldownMs
    ) {
      onLog("BARGE_IN", "suppressed: post-greeting-cooldown");
      return;
    }
    // Already timing a candidate.
    if (bargeInCandidateTimer) return;

    onLog("BARGE_IN", "candidate started", {
      activeChunk: activeChunk?.sentenceIndex ?? null,
      queueDepth: audioChunkQueue.length,
    });
    bargeInCandidateTimer = setTimeout(() => {
      bargeInCandidateTimer = null;
      confirmBargeIn();
    }, VOICE_TIMING.bargeInMinSpeechMs);
  }

  function confirmBargeIn() {
    if (!greetingAudioDone || !welcomeComplete) return;

    // ── Require at least ONE agent audio element to duck. ──
    // After the first barge-in + unmute cycle the chunk queue may be empty
    // but the agent's audio element is still alive in agentAudioElements.
    const hasActiveAudio =
      activeChunk !== null ||
      audioChunkQueue.length > 0 ||
      agentAudioElements.size > 0;
    if (!hasActiveAudio) return;

    // ── Req 8 — Record interruption timestamp ──
    lastInterruptionAt = performance.now();
    onLog("BARGE_IN", "confirmed: sustained-user-speech", {
      activeChunk: activeChunk?.sentenceIndex ?? null,
      queueDepth: audioChunkQueue.length,
      duckedCount: bargeInDuckedElements.size,
      agentElementsAlive: agentAudioElements.size,
      interruptionMs: lastInterruptionAt,
    });
    onTranscript?.({ type: "barge_in", message: "User interrupted assistant" });

    // ── FIX: Mute all agent audio elements instead of destroying them. ──
    // The agent publishes ONE continuous remote audio track for the whole
    // session. Destroying the <audio> element would permanently lose the
    // track attachment and silence all subsequent agent utterances.
    // Instead, we duck (volume=0) and restore when the agent speaks again.

    // 1. Duck the active chunk (if any).
    if (activeChunk) {
      const el = activeChunk.audioElement;
      el.volume = 0;
      bargeInDuckedElements.add(el);
      activeChunk = null;
      onLog("BARGE_IN", "Ducked active chunk");
    }

    // 2. Duck every queued element.
    while (audioChunkQueue.length > 0) {
      const chunk = audioChunkQueue.shift()!;
      chunk.audioElement.volume = 0;
      bargeInDuckedElements.add(chunk.audioElement);
    }

    // 3. Duck ANY agent audio element still alive — covers elements that
    //    were unmuted after a previous barge-in and are no longer tracked
    //    by the chunk queue.
    for (const el of agentAudioElements) {
      if (!bargeInDuckedElements.has(el)) {
        el.volume = 0;
        bargeInDuckedElements.add(el);
      }
    }

    onLog("BARGE_IN", `Barge-in complete — ${bargeInDuckedElements.size} element(s) ducked`);

    // Cancel any pending generation-complete timer since we explicitly
    // stopped the turn.
    if (generationCompleteTimer) {
      clearTimeout(generationCompleteTimer);
      generationCompleteTimer = null;
    }
    agentGenerating = false;
  }

  // ── Fix B — Greeting / turn completion tied to browser playout ──

  function maybeCompleteAgentTurn(reason: string) {
    const playoutFinished =
      !activeChunk && audioChunkQueue.length === 0 && !agentGenerating;
    if (!playoutFinished) return;

    // Latch welcomeComplete only once, when playout is truly finished.
    if (!welcomeComplete) {
      welcomeComplete = true;
      onLog("VOICE", "Welcome greeting complete — user may speak");
    }
    // Latch greetingAudioDone.
    if (!greetingAudioDone) {
      greetingAudioDone = true;
      greetingCompletedAt = Date.now();
      onLog("VOICE", "Greeting audio done — barge-in now allowed", { reason });
    }
    // ── Req 8 — Log timing summary on turn completion ──
    logTiming();
    // Transition to listening if not already there.
    scheduleListening();
  }

  // ── C1 — Authoritative turn-state driver: lk.agent.state ──
  //
  // The ai-sales-layer backend runs livekit-agents AgentSession, which
  // publishes the agent's turn state as the participant attribute
  // `lk.agent.state` (initializing → listening → thinking → speaking).
  //
  // This replaces the fragile ActiveSpeakersChanged-based heuristic with
  // a "call mode" that keeps the floor with the speaker through natural
  // inter-clause pauses and hands control back only at a true end-of-turn.
  function handleAgentStateChange(agentState: string | undefined) {
    if (!agentState) return;
    onLog("AGENT_STATE", `lk.agent.state → ${agentState}`);

    switch (agentState) {
      case "speaking":
        // Agent is actively producing audio — drive turn state NOW.
        agentGenerating = false;
        markAssistantSpeaking();
        break;

      case "thinking":
        // Agent is preparing a response — hold the floor so the user
        // doesn't think it's their turn during a processing pause.
        if (
          turnState !== "assistant_generating" &&
          turnState !== "assistant_speaking"
        ) {
          turnState = "assistant_generating";
          onLog("VOICE", "Agent state → assistant_generating (thinking)");
          onStateChange("assistant_generating");
        }
        break;

      case "listening":
        // Fix B — lk.agent.state is a HINT, not authoritative for completion.
        // The agent may flip to "listening" while TTS audio is still streaming.
        // Only mark the turn complete when the browser has emptied the audio queue.
        if (!welcomeComplete) {
          // Agent says it's done, but audio may still be playing.
          // Stop expecting more chunks so the completion path can fire.
          agentGenerating = false;
        }
        maybeCompleteAgentTurn("lk.agent.state → listening");
        break;

      default:
        // initializing or unknown — hold current state.
        break;
    }
  }

  function markAssistantSpeaking() {
    // Any agent activity cancels a pending "return to listening".
    clearListeningTimer();
    agentHasSpoken = true; // PHASE 4 — the greeting/agent turn is under way.

    // ── FIX: Unmute any elements ducked by barge-in. ──
    // When a barge-in occurs, we mute the agent's audio elements rather than
    // destroying them (the agent publishes ONE continuous track). Now that the
    // agent is speaking again, restore full volume so the user can hear the
    // response.
    if (bargeInDuckedElements.size > 0) {
      onLog("BARGE_IN", `Unmuting ${bargeInDuckedElements.size} ducked element(s)`);
      for (const el of bargeInDuckedElements) {
        el.volume = 1.0;
      }
      bargeInDuckedElements.clear();
    }

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
    stopActiveChunk();
    clearChunkQueue();
    // Also clean up any elements ducked by barge-in.
    for (const el of bargeInDuckedElements) {
      cleanupChunkElement(el);
    }
    bargeInDuckedElements.clear();
    agentAudioElements.forEach((el) => {
      cleanupChunkElement(el);
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
        const trackName: string = track.name || track.sid || "agent-audio";
        onLog("PLAYBACK", "Assistant audio track received", {
          participant: participant?.identity,
          track: trackName,
        });

        // ── Req 8 — Record first-packet reception timestamp ──
        if (!firstPacketReceivedAt) {
          firstPacketReceivedAt = performance.now();
        }

        // ── FIX: Clean up any old ducked elements from a previous barge-in. ──
        // When the agent publishes a NEW track (e.g. after reconnect), the
        // old ducked elements are still attached to the stale track and
        // should be disposed. New-track arrival = old elements are irrelevant.
        if (bargeInDuckedElements.size > 0) {
          onLog("BARGE_IN", `Cleaning up ${bargeInDuckedElements.size} stale ducked element(s)`);
          for (const el of bargeInDuckedElements) {
            cleanupChunkElement(el);
            agentAudioElements.delete(el);
          }
          bargeInDuckedElements.clear();
        }

        const element = track.attach();
        if (!element) {
          onLog("PLAYBACK", "track.attach() returned null — cannot play audio");
          return;
        }

        // Append to DOM so the browser treats it as user-visible audio.
        // Position off-screen instead of display:none — Chromium blocks
        // autoplay on hidden elements. Off-screen is "visible" to the
        // autoplay policy but invisible to the user.
        element.style.position = "fixed";
        element.style.left = "-9999px";
        element.style.width = "1px";
        element.style.height = "1px";
        element.muted = false;
        element.volume = 1.0;
        document.body.appendChild(element);
        agentAudioElements.add(element);

        // ── Sentence-level chunk queuing ──
        // Instead of detaching any currently-playing audio, enqueue this
        // track as a sentence chunk. This handles both:
        // - Legacy single-track responses (queue has 1 item → plays immediately)
        // - Chunked responses (multiple tracks → sequential playback)
        agentGenerating = true;

        // Determine if this is the last chunk. Backends that support
        // chunking may set a metadata flag; otherwise fall back to
        // detection via the generation-complete timer.
        const isLast =
          (track as any).metadata === "last_chunk" ||
          trackName.includes("last") ||
          false;

        enqueueChunk(element, isLast);
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

      // ── Fix A+E — ActiveSpeakersChanged is a barge-in input only ──
      // Turn state is driven by lk.agent.state + audio queue (chunk lifecycle).
      // Active speakers drive only the debounced barge-in detector.
      if (agentIsSpeaking) {
        // Agent is speaking — any pending barge-in is cancelled.
        cancelBargeInCandidate("agent-became-active");
        agentGenerating = false;
        markAssistantSpeaking();
      } else if (userIsSpeaking) {
        // User is active. If agent audio is playing, start/continue the
        // barge-in candidate timer. If no agent audio, this is just the
        // user speaking during their own turn (no barge-in needed).
        if (activeChunk || audioChunkQueue.length > 0) {
          startBargeInCandidate();
        }
      } else {
        // No active speaker — cancel any pending barge-in candidate.
        cancelBargeInCandidate("user-went-silent");
      }
    });

    // ── C1 — Authoritative turn state from agent's lk.agent.state ──
    // AgentSession publishes its turn state as a participant attribute.
    // This is the non-flapping, call-mode signal that replaces
    // ActiveSpeakersChanged-based turn inference.
    //
    // Use string event names for compatibility across livekit-client versions.

    // Subscribe to attribute changes (fires every state transition).
    newRoom.on(
      "participantAttributesChanged" as any,
      (changed: Record<string, string>, participant: any) => {
        const identity = participant?.identity;
        if (identity?.startsWith("agent-")) {
          agentIdentity = identity;
          const state = changed?.["lk.agent.state"];
          if (state) handleAgentStateChange(state);
        }
      }
    );

    // Initial read of agent attributes on connect.
    newRoom.on(
      "participantConnected" as any,
      (participant: any) => {
        const identity = participant?.identity;
        if (identity?.startsWith("agent-")) {
          agentIdentity = identity;
          const attrs = participant?.attributes || {};
          const state = attrs?.["lk.agent.state"];
          onLog(
            "AGENT_STATE",
            `Agent connected — initial lk.agent.state=${state || "missing"}`,
            { identity }
          );
          if (state) handleAgentStateChange(state);
        }
      }
    );

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
    // Reset chunk queue state for new connection.
    agentGenerating = false;
    greetingAudioDone = false;
    greetingCompletedAt = null;
    nextChunkStarted = 0;
    chunkSeq = 0;
    resetTiming();
    cancelBargeInCandidate("new-connection");
    // Clear any stale ducked elements from a previous session.
    bargeInDuckedElements.clear();
    clearChunkQueue();
    stopActiveChunk();

    // Publish microphone. It stays published for the whole call so LiveKit VAD
    // can detect user speech and interruptions (allow_interruptions=True on the
    // agent). We never auto-mute while the assistant is speaking — mute is only
    // ever driven by the user's mute button (setMuted).
    onLog("MIC", "Requesting microphone...");
    const { createLocalAudioTrack } = await import("livekit-client");
    // F2 — Enable echo cancellation, noise suppression, and auto gain control
    // so the greeting doesn't leak from speakers into the mic and trigger a
    // false barge-in via the user-* active-speaker signal.
    const audioTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
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
