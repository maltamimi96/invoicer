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

    // Drop low-confidence + silent segments BEFORE concatenation. Whisper
    // sometimes emits a few silent/hallucinated segments alongside good
    // speech — by filtering at segment level we preserve the real speech
    // and drop the garbage.
    let text = "";
    if (data.segments && data.segments.length > 0) {
      const clean = data.segments.filter((s) => {
        const noSpeech = s.no_speech_prob ?? 0;
        const logProb  = s.avg_logprob   ?? 0;
        return noSpeech < 0.6 && logProb > -1.0;
      });
      text = clean.map((s) => s.text).join(" ").trim();
    } else {
      text = (data.text ?? "").trim();
    }

    // De-duplicate adjacent repeated phrases — Whisper sometimes emits the
    // same n-gram back-to-back even when there's real speech around it.
    text = collapseRepeats(text);

    // Hard repetition guard — if the result is still mostly the same word/
    // phrase, blank it out.
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

/** Collapse adjacent duplicate n-grams. "tomorrow tomorrow at 9" → "tomorrow at 9".
 *  Checks n-grams up to 5 words long. */
function collapseRepeats(text: string): string {
  let words = text.split(/\s+/).filter(Boolean);
  for (let n = 5; n >= 1; n--) {
    const out: string[] = [];
    let i = 0;
    while (i < words.length) {
      out.push(words[i]);
      // Look ahead: are the next n words equal to the previous n?
      if (out.length >= n) {
        const prev = out.slice(out.length - n).map((w) => w.toLowerCase()).join(" ");
        let runs = 1;
        while (i + 1 + runs * n - 1 < words.length) {
          const next = words.slice(i + 1 + (runs - 1) * n, i + 1 + runs * n)
            .map((w) => w.toLowerCase()).join(" ");
          if (next === prev) runs++;
          else break;
        }
        if (runs > 1) {
          i += (runs - 1) * n; // skip the duplicates
        }
      }
      i++;
    }
    words = out;
  }
  return words.join(" ").trim();
}

/** Returns true if the transcript looks like a Whisper repetition artefact:
 *  - Same 1-3 word phrase repeated ≥ 3× consecutively
 *  - Most segments flagged as silence
 *  - Very low unique-word ratio over a long transcript */
function isLikelyHallucination(text: string, segments?: Array<{ no_speech_prob?: number }>): boolean {
  const lower = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // All segments flagged as silence
  if (segments && segments.length > 0) {
    const silent = segments.filter((s) => (s.no_speech_prob ?? 0) > 0.7).length;
    if (silent / segments.length > 0.6) return true;
  }

  // Same 1-4-word phrase ≥ 3× anywhere in the transcript
  for (const span of [1, 2, 3, 4]) {
    if (words.length < span * 3) continue;
    for (let start = 0; start + span * 3 <= words.length; start++) {
      const first = words.slice(start, start + span).join(" ");
      let repeats = 1;
      for (let i = start + span; i + span <= words.length; i += span) {
        if (words.slice(i, i + span).join(" ") !== first) break;
        repeats++;
      }
      if (repeats >= 3) return true;
    }
  }

  // Very low unique-token ratio over a long transcript = repetition spam
  const unique = new Set(words);
  if (words.length > 8 && unique.size / words.length < 0.4) return true;

  return false;
}
