"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice capture for the AI assistant — tap-to-toggle.
 *
 * Strategy: prefer the browser's built-in SpeechRecognition (Web Speech API)
 * when available — it's free, instant, and doesn't need a server hop. Falls
 * back to MediaRecorder → /api/ai/transcribe for browsers that don't support
 * Web Speech (Firefox, Safari sometimes), which routes to OpenAI Whisper if
 * the env is configured.
 *
 * Toggle mode: caller calls `start()` once to begin, again to stop & submit.
 */
export function useVoiceCapture(onText: (text: string) => void) {
  const [recording,    setRecording]    = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  /** Live text-as-you-speak (Web Speech API only — Whisper is one-shot). */
  const [interimText,  setInterimText]  = useState<string>("");

  /**
   * Callbacks fire from recogniser events long after start(), so reading
   * `onText` out of the closure captured the version that existed when
   * recording began. Callers pass a useCallback whose identity changes every
   * turn (it closes over the conversation), so a recording started mid-turn
   * delivered its transcript to a stale handler — silently reverting the
   * conversation to an earlier state. Always call through the ref.
   */
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; }, [onText]);

  // Web Speech API instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRef    = useRef<any>(null);
  const speechActive = useRef(false);

  // MediaRecorder fallback refs
  const recorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<BlobPart[]>([]);
  const streamRef    = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);

  const cleanupMR = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanupMR(), [cleanupMR]);

  // ── Web Speech API path (preferred — free, fast, no server) ────────────
  const startSpeech = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (typeof window !== "undefined") && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) return false;

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;        // ← stream as the user speaks
    rec.continuous = true;            // keep listening until tapped to stop
    rec.maxAlternatives = 1;

    let finalText = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      // Walk all results — those with isFinal accumulate into finalText, the
      // rest go into a live preview string the UI can render under the input.
      for (let i = e.resultIndex ?? 0; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r?.[0]?.transcript ?? "";
        if (r?.isFinal) {
          finalText += (finalText ? " " : "") + t;
        } else {
          interim += t;
        }
      }
      setInterimText((finalText + (interim ? " " + interim : "")).trim());
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const msg = e?.error === "not-allowed" ? "Microphone permission denied"
                : e?.error === "no-speech"   ? "Didn't catch that — try again"
                : `Voice error: ${e?.error ?? "unknown"}`;
      setError(msg);
      speechActive.current = false;
      setRecording(false);
    };
    rec.onend = () => {
      speechActive.current = false;
      setRecording(false);
      const out = finalText.trim();
      setInterimText("");
      if (out) onTextRef.current(out);
    };

    try {
      rec.start();
      speechRef.current = rec;
      speechActive.current = true;
      setRecording(true);
      setError(null);
      setInterimText("");
      return true;
    } catch {
      return false;
    }
  }, []);

  const stopSpeech = useCallback(() => {
    if (speechRef.current && speechActive.current) {
      try { speechRef.current.stop(); } catch { /* ignore */ }
    }
  }, []);

  // ── MediaRecorder fallback (Safari/Firefox or when Web Speech blocked) ─
  const startMR = useCallback(async () => {
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        cleanupMR();
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 500) {
          setError("Recording too short — try again and speak for at least a second.");
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "voice.webm");
          const res = await fetch("/api/ai/transcribe", { method: "POST", body: fd });
          if (res.status === 501) {
            // Whisper isn't configured AND Web Speech wasn't available either.
            setError("Voice not supported in this browser. Try Chrome, or ask the admin to set OPENAI_API_KEY.");
            return;
          }
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error ?? "Transcription failed");
          }
          const { text } = await res.json();
          if (text?.trim()) onTextRef.current(text.trim());
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setError(null);
    } catch {
      setError("Microphone access denied");
      cleanupMR();
    }
  }, [cleanupMR]);

  const stopMR = useCallback(() => {
    setRecording(false);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  // ── Public API ──────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setError(null);
    // Prefer Web Speech — free, no server hop, no recording artifacts.
    const ok = startSpeech();
    if (!ok) await startMR();
  }, [startSpeech, startMR]);

  const stop = useCallback(() => {
    if (speechActive.current) stopSpeech();
    else                       stopMR();
  }, [stopSpeech, stopMR]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (speechActive.current) {
      // Drop any captured speech without firing onend's onText.
      try { speechRef.current?.abort?.(); } catch { /* */ }
      speechActive.current = false;
      setRecording(false);
    } else {
      stopMR();
    }
  }, [stopMR]);

  return { recording, transcribing, error, interimText, start, stop, cancel };
}
