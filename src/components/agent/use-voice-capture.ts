"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hold-to-talk voice capture for the AI assistant.
 *
 * Strategy:
 *  1. On press: start MediaRecorder (browser mic).
 *  2. On release: stop recorder, POST blob to /api/ai/transcribe.
 *  3. If server returns 501 (NO_PROVIDER), fall back to browser Web Speech API
 *     for that single utterance — same UX, just zero-config.
 *
 * The hook exposes `start()` / `stop()` so a button can use onPointerDown /
 * onPointerUp (and onPointerLeave for cancel-on-drag-out).
 */
export function useVoiceCapture(onText: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRef = useRef<any>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const browserFallback = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Voice not supported in this browser. Please type instead.");
      return;
    }
    setTranscribing(true);
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text) onText(text);
    };
    rec.onerror = () => setError("Speech recognition error");
    rec.onend = () => { setTranscribing(false); speechRef.current = null; };
    speechRef.current = rec;
    try { rec.start(); } catch { setTranscribing(false); }
  }, [onText]);

  const start = useCallback(async () => {
    setError(null);
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        cleanup();
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 500) { return; } // ignore taps shorter than ~half-second
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "voice.webm");
          const res = await fetch("/api/ai/transcribe", { method: "POST", body: fd });
          if (res.status === 501) {
            setTranscribing(false);
            browserFallback();
            return;
          }
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error ?? "Transcription failed");
          }
          const { text } = await res.json();
          if (text?.trim()) onText(text.trim());
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Microphone access denied");
      cleanup();
    }
  }, [cleanup, onText, browserFallback]);

  const stop = useCallback(() => {
    setRecording(false);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  return { recording, transcribing, error, start, stop, cancel };
}
