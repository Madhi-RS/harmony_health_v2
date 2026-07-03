"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useChatStore } from "@/stores/chat-store";
import { voiceService } from "@/services/voice";

const SITE_ID = "c2b1f7d9-6a11-4e8b-9d2c-4a7e5f1c8b21";
const TARGET_AUDIO_LEVEL = 60; // dB threshold

interface UseVoiceReturn {
  isRecording: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  duration: number;
  isLiveKitConnected: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  connectLiveKit: (conversationId?: string | null) => Promise<void>;
  disconnectLiveKit: () => Promise<void>;
  playAudio: (url: string) => Promise<void>;
  stopAudio: () => void;
  isSupported: boolean;
  error: string | null;
}

export function useVoice(): UseVoiceReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLiveKitConnected, setIsLiveKitConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRecording = useChatStore((s) => s.isRecording);
  const setRecording = useChatStore((s) => s.setRecording);

  // ── Refs ──
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // LiveKit
  const lkRoomRef = useRef<any>(null);
  const lkSessionRef = useRef<any>(null);
  const isConnectingRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  const isSupported =
    typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  // ── connectLiveKit — new flow via AI Sales Layer ──

  const connectLiveKit = useCallback(async (conversationId?: string | null) => {
    console.log("[VOICE] connectLiveKit called");
    if (isConnectingRef.current) {
      console.log("[VOICE] Already connecting — skip");
      return;
    }
    if (lkRoomRef.current && lkRoomRef.current.state !== "disconnected") {
      console.log("[VOICE] Disconnecting existing room first");
      try { lkRoomRef.current.disconnect(); } catch (e) {}
      lkRoomRef.current = null;
    }

    isConnectingRef.current = true;
    try {
      setError(null);

      // Step 1 — REST: Create voice session on AI Sales Layer
      console.log("[VOICE] Step 1: POST /api/v1/voice/sessions → AI Sales Layer");
      const session = await voiceService.createSession({ site_id: SITE_ID, agent_name: "Alex" });
      console.log("[VOICE] Session created:", session.session_id, "room:", session.room_name);
      lkSessionRef.current = session;

      // Step 2 — WS: Open signalling channel to AI Sales Layer
      console.log("[VOICE] Step 2: Opening WebSocket to /ws/voice");
      const ws = voiceService.openSignalling();
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
          console.log("[VOICE] WS open — sending join_room");
          ws.send(JSON.stringify({ type: "join_room", room_name: session.room_name }));
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          console.log("[VOICE] WS recv:", msg.type);

          if (msg.type === "session_started" && msg.data?.status === "room_joined") {
            console.log("[VOICE] Backend confirmed room_joined — resolving");
            resolve();
          }
          if (msg.type === "error") {
            console.error("[VOICE] WS error:", msg.data);
            if (!msg.data?.recoverable) reject(new Error(msg.data?.message));
          }
        };

        ws.onerror = (err) => {
          console.error("[VOICE] WS error event:", err);
          reject(new Error("WebSocket connection failed"));
        };

        // Timeout fallback: connect LiveKit even without room_joined (agent may join late)
        setTimeout(() => {
          if (!isLiveKitConnected) {
            console.log("[VOICE] Timeout — connecting LiveKit anyway");
            resolve();
          }
        }, 8000);
      });

      // Step 3 — RTC: Connect to LiveKit room via WebRTC
      console.log("[VOICE] Step 3: Connecting to LiveKit room");
      const { Room, RoomEvent, createLocalAudioTrack } = await import("livekit-client");

      const room = new Room({ adaptiveStream: true, dynacast: true });

      room.on(RoomEvent.Connected, () => {
        console.log("[VOICE] LiveKit room connected");
        setIsLiveKitConnected(true);
        setError(null);
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log("[VOICE] LiveKit room disconnected");
        setIsLiveKitConnected(false);
      });

      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (track.kind === "audio") {
          console.log("[VOICE] Agent audio track received from:", track.participant?.identity);
          track.attach();
          setIsSpeaking(true);
          track.on("ended", () => setIsSpeaking(false));
        }
      });

      room.on(RoomEvent.ParticipantConnected, (p: any) =>
        console.log("[VOICE] Participant joined:", p.identity)
      );
      room.on(RoomEvent.ParticipantDisconnected, (p: any) =>
        console.log("[VOICE] Participant left:", p.identity)
      );

      await room.connect(session.livekit_url, session.livekit_token);
      lkRoomRef.current = room;

      // Step 4 — Publish microphone
      const audioTrack = await createLocalAudioTrack();
      await room.localParticipant.publishTrack(audioTrack);
      setRecording(true);
      console.log("[VOICE] Mic published — voice session active");

    } catch (e: any) {
      console.error("[VOICE] connectLiveKit failed:", e.message);
      setError(e.message || "Failed to connect LiveKit");
      setIsLiveKitConnected(false);
    } finally {
      isConnectingRef.current = false;
    }
  }, [setRecording, setError, isLiveKitConnected]);

  // ── disconnectLiveKit ──

  const disconnectLiveKit = useCallback(async () => {
    console.log("[VOICE] disconnectLiveKit called");
    if (lkRoomRef.current) {
      lkRoomRef.current.disconnect();
      lkRoomRef.current = null;
    }
    if (lkSessionRef.current?.session_id) {
      voiceService.endSession(lkSessionRef.current.session_id).catch(() => {});
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsLiveKitConnected(false);
    setRecording(false);
  }, [setRecording]);

  // ── MediaRecorder fallback ──

  const startRecording = useCallback(async () => {
    if (!isSupported) { setError("Voice not supported"); return; }
    try {
      setError(null);
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.start(100);
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err: any) {
      setError(err.name === "NotAllowedError" ? "Microphone permission denied" : "Could not access microphone");
    }
  }, [isSupported, setRecording]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") { resolve(null); return; }
      recorder.onstop = () => resolve(new Blob(audioChunksRef.current, { type: recorder.mimeType }));
      recorder.stop();
      setRecording(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      setAudioLevel(0);
    });
  }, [setRecording]);

  const playAudio = useCallback(async (url: string) => {
    try {
      setIsSpeaking(true);
      const a = new Audio(url); audioElementRef.current = a;
      a.onended = () => setIsSpeaking(false);
      a.onerror = () => { setIsSpeaking(false); setError("Playback failed"); };
      await a.play();
    } catch { setIsSpeaking(false); setError("Playback failed"); }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioElementRef.current) { audioElementRef.current.pause(); audioElementRef.current = null; }
    setIsSpeaking(false);
  }, []);

  // ── Cleanup on unmount only ──
  const disconnectRef = useRef(disconnectLiveKit);
  disconnectRef.current = disconnectLiveKit;
  useEffect(() => {
    return () => {
      console.log("[VOICE] Cleanup on unmount");
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      disconnectRef.current();
    };
  }, []);

  return {
    isRecording, isSpeaking, audioLevel, duration, isLiveKitConnected,
    startRecording, stopRecording, connectLiveKit, disconnectLiveKit,
    playAudio, stopAudio, isSupported, error,
  };
}
