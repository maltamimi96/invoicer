import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupaClient } from "@supabase/supabase-js";

/**
 * Audio transcription endpoint for voice prompts.
 *
 * Accepts a multipart form with field "audio" (any browser-recorded blob —
 * webm/opus, mp4/aac, wav, ogg). Returns { text }.
 *
 * Uses OpenAI Whisper if OPENAI_API_KEY is set. If not, returns a 501 so the
 * client can fall back to the browser's Web Speech API.
 */
export async function POST(request: NextRequest) {
  // Accept either cookie auth (web) or Bearer auth (mobile)
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  let user = null;
  if (bearer) {
    const supa = createSupaClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data } = await supa.auth.getUser(bearer);
    user = data.user;
  } else {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server transcription not configured. Use browser speech recognition.", code: "NO_PROVIDER" },
      { status: 501 }
    );
  }

  const formData = await request.formData();
  const audio = formData.get("audio") as File | null;
  if (!audio || typeof (audio as File).arrayBuffer !== "function") {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  const upstream = new FormData();
  const filename = audio.name || "voice.webm";
  upstream.append("file", audio, filename);
  upstream.append("model", "whisper-1");
  // verbose_json gives us per-segment confidence + no_speech_prob so we can
  // filter Whisper's known hallucination pattern (it repeats words / phrases
  // when the audio is silent or mostly noise).
  upstream.append("response_format", "verbose_json");
  // Deterministic — temperature > 0 makes the repetition problem worse.
  upstream.append("temperature", "0");
  // Skip language auto-detect (it's wrong often on short clips and biases
  // toward weird output). Set this from a header if you ever need non-en.
  upstream.append("language", "en");
  // No vocabulary-stuffing prompt — that was forcing Whisper to repeat the
  // bias words ("work order, invoice, customer…") when the actual audio was
  // unclear. Keep it short + stylistic only.
  upstream.append("prompt", "Conversational voice command.");

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Whisper error: ${errText}` }, { status: 502 });
    }
    type Segment = { text: string; no_speech_prob?: number; avg_logprob?: number };
    const data = (await res.json()) as { text?: string; segments?: Segment[]; duration?: number };
    let text = (data.text ?? "").trim();

    // Repetition guard — Whisper's classic failure mode on silence is to
    // output the same word/phrase 10+ times. Detect and blank it.
    if (text && isLikelyHallucination(text, data.segments)) {
      text = "";
    }

    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}

/** Returns true if the transcript looks like a Whisper repetition artefact:
 *  - The same short word/phrase repeated > 4×
 *  - Or every segment is mostly silence (no_speech_prob > 0.8)
 *  - Or fewer than 2 unique tokens for a long-ish transcript */
function isLikelyHallucination(text: string, segments?: Array<{ no_speech_prob?: number }>): boolean {
  const lower = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // All segments flagged as silence
  if (segments && segments.length > 0) {
    const silent = segments.filter((s) => (s.no_speech_prob ?? 0) > 0.8).length;
    if (silent / segments.length > 0.7) return true;
  }

  // Same 1-3-word phrase ≥ 4× in a row
  for (const span of [1, 2, 3]) {
    if (words.length < span * 4) continue;
    const first = words.slice(0, span).join(" ");
    let repeats = 1;
    for (let i = span; i + span <= words.length; i += span) {
      if (words.slice(i, i + span).join(" ") !== first) break;
      repeats++;
    }
    if (repeats >= 4) return true;
  }

  // Very low unique-token ratio over a long transcript = repetition spam
  const unique = new Set(words);
  if (words.length > 10 && unique.size / words.length < 0.25) return true;

  return false;
}
