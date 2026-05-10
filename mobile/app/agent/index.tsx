import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Send, Sparkles, Mic, Square } from "lucide-react-native";
import { useAudioRecorder, AudioModule, RecordingPresets } from "expo-audio";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "What's overdue?",
  "Who hasn't paid this month?",
  "What's on today?",
  "Any new leads?",
  "Show stale quotes",
];

/** On-the-go AI assistant. Hits /api/mobile/agent with a bearer token,
 *  small read-mostly tool surface (search, briefing, schedule, status updates). */
export default function AgentChat() {
  const router = useRouter();
  const { active } = useActiveBusiness();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  /** Start/stop voice recording. On stop, upload to /api/ai/transcribe
   *  with the user's bearer token and stuff the result into the input
   *  field — user can review before sending. */
  const toggleRecord = async () => {
    if (recording) {
      try {
        await recorder.stop();
        setRecording(false);
        const uri = recorder.uri;
        if (!uri) return;
        setTranscribing(true);
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) throw new Error("Not signed in");

        const form = new FormData();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        form.append("audio", { uri, name: "voice.m4a", type: "audio/m4a" } as any);

        const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
        const res = await fetch(`${base}/api/ai/transcribe`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}` },
          body: form,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Transcribe failed: ${res.status}`);
        }
        const { text } = await res.json() as { text: string };
        if (text) setInput((prev) => (prev ? prev + " " : "") + text);
      } catch (e) {
        Alert.alert("Couldn't transcribe", e instanceof Error ? e.message : "Unknown error");
      } finally {
        setTranscribing(false);
      }
    } else {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) { Alert.alert("Mic permission required"); return; }
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecording(true);
      } catch (e) {
        Alert.alert("Couldn't start recording", e instanceof Error ? e.message : "Unknown error");
      }
    }
  };

  const send = async (text: string) => {
    if (!active || !text.trim() || busy) return;
    const next: Message[] = [...messages, { role: "user", text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not signed in");

      const base = process.env.EXPO_PUBLIC_APP_URL ?? "https://kireihq.com";
      const res = await fetch(`${base}/api/mobile/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          business_id: active.id,
          // Only send simplified text history; the server doesn't need our tool round-trips
          messages: next.map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Server returned ${res.status}`);
      }
      const { text: reply } = await res.json() as { text: string };
      setMessages([...next, { role: "assistant", text: reply ?? "(no reply)" }]);
    } catch (e) {
      Alert.alert("Couldn't reach assistant", e instanceof Error ? e.message : "Unknown error");
      setMessages(messages); // rollback so user can retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Sparkles size={18} color={colors.primary} />
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Assistant</Text>
        <View style={{ flex: 1 }} />
        {messages.length > 0 && (
          <Pressable onPress={() => setMessages([])} hitSlop={8}>
            <Text style={{ fontSize: 12, color: colors.muted }}>Clear</Text>
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={{ flex: 1, gap: space.md }}>
              <View style={{ alignItems: "center", marginTop: space.xl, gap: 6 }}>
                <Sparkles size={36} color={colors.primary} />
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Ask anything about your business</Text>
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", maxWidth: 280 }}>
                  I can look up customers, invoices, quotes, leads, today's schedule, and update statuses.
                </Text>
              </View>
              <View style={{ gap: space.sm, marginTop: space.md }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable key={s} onPress={() => send(s)}
                    style={({ pressed }) => ({
                      padding: space.md, borderRadius: radius.lg,
                      backgroundColor: pressed ? colors.muted : colors.card,
                      borderWidth: 1, borderColor: colors.hairline,
                    })}>
                    <Text style={{ fontSize: 14, color: colors.text }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : messages.map((m, i) => (
            <View key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: space.md,
              borderRadius: radius.lg,
              backgroundColor: m.role === "user" ? colors.primary : colors.card,
              borderWidth: m.role === "user" ? 0 : 1,
              borderColor: colors.hairline,
            }}>
              <Text style={{ fontSize: 14, color: m.role === "user" ? "#fff" : colors.text, lineHeight: 20 }}>
                {m.text}
              </Text>
            </View>
          ))}
          {busy && (
            <View style={{ alignSelf: "flex-start", padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, flexDirection: "row", gap: 8, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted }}>Thinking…</Text>
            </View>
          )}
        </ScrollView>

        <View style={{ flexDirection: "row", padding: space.sm, gap: space.sm, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.card }}>
          <Pressable
            onPress={toggleRecord}
            disabled={busy || transcribing}
            style={({ pressed }) => ({
              padding: 12, borderRadius: radius.lg,
              backgroundColor: recording ? "#dc2626" : pressed ? colors.muted : colors.canvas,
              borderWidth: 1, borderColor: recording ? "#dc2626" : colors.hairline,
              alignItems: "center", justifyContent: "center",
              opacity: transcribing ? 0.6 : 1,
            })}>
            {transcribing ? <ActivityIndicator size="small" color={colors.text} />
              : recording ? <Square size={18} color="#fff" fill="#fff" />
              : <Mic size={18} color={colors.text} />}
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={recording ? "Recording…" : "Ask anything…"}
            placeholderTextColor={colors.muted}
            multiline
            onSubmitEditing={() => send(input)}
            editable={!busy}
            style={{
              flex: 1, paddingHorizontal: space.md, paddingVertical: 10,
              borderRadius: radius.lg, backgroundColor: colors.canvas,
              borderWidth: 1, borderColor: colors.hairline,
              color: colors.text, fontSize: 14,
              maxHeight: 120,
            }}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={busy || !input.trim()}
            style={({ pressed }) => ({
              padding: 12, borderRadius: radius.lg,
              backgroundColor: !input.trim() || busy ? colors.muted : pressed ? "#0d6e6a" : colors.primary,
              alignItems: "center", justifyContent: "center",
            })}>
            <Send size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
