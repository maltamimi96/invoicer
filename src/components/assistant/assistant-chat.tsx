"use client";

/**
 * The assistant chat surface.
 *
 * The critical difference from the old floating panel: `apiHistory` here is a
 * real Anthropic block array, not `{role, content: string}`. The server returns
 * the updated history and we keep it verbatim — that's what lets the agent
 * remember an ID it looked up three turns ago instead of re-searching.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, Send, Loader2, CheckCircle2, AlertCircle, Sparkles, Mic,
  Square, Plus, Trash2, RotateCcw, Volume2, VolumeX, MessageSquare,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceCapture } from "@/components/agent/use-voice-capture";
import { getAgentContext } from "@/lib/actions/agent-context";
import {
  createAssistantConversation,
  deleteAssistantConversation,
  getAssistantConversation,
  saveAssistantTurn,
  undoAssistantAction,
} from "@/lib/actions/assistant";
import {
  ASSISTANT_MODELS, ASSISTANT_EFFORTS, DEFAULT_MODEL, DEFAULT_EFFORT,
  type AssistantModel, type AssistantEffort,
} from "@/lib/assistant/models";
import type { AssistantConversation, AssistantChangeEntry } from "@/types/database";
import { undoLabel } from "@/lib/assistant/undo";

// ── types ────────────────────────────────────────────────────────────────────

/** The real wire format. Blocks, not strings. */
type ApiMessage = { role: "user" | "assistant"; content: unknown };

interface ToolStep {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  result?: string;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps: ToolStep[];
  streaming?: boolean;
  /** Set once persisted, so Undo knows which row to reverse. */
  messageId?: string;
  changeLog?: AssistantChangeEntry[];
  undone?: boolean;
}

const uid = () => crypto.randomUUID();

/** Turn a snake_case tool name into something readable. */
function toolLabel(name: string): string {
  const s = name.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Pull plain text out of a block array, for display + persistence. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: string; text: string } =>
      !!b && typeof b === "object" && (b as { type?: string }).type === "text"
    )
    .map((b) => b.text)
    .join("");
}

// ── speech ───────────────────────────────────────────────────────────────────

/** Browser TTS. Off by default — nobody wants an app talking unprompted. */
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 1000));
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

// ── sub-components ───────────────────────────────────────────────────────────

function StepRow({ step }: { step: ToolStep }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <div className="mt-0.5 shrink-0">
        {step.status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        {step.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
        {step.status === "error" && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
      </div>
      <div className="text-xs leading-snug min-w-0">
        <span className={step.status === "error" ? "text-destructive" : "text-muted-foreground"}>
          {toolLabel(step.name)}
          {step.status === "running" ? "…" : ""}
        </span>
        {step.status === "error" && step.result && (
          <p className="text-destructive/80 mt-0.5 break-words">{step.result}</p>
        )}
      </div>
    </div>
  );
}

function UndoBar({
  message,
  onUndone,
}: {
  message: DisplayMessage;
  onUndone: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const log = message.changeLog ?? [];
  if (!message.messageId || log.length === 0) return null;

  if (message.undone) {
    return <p className="text-xs text-muted-foreground pt-1">Undone.</p>;
  }

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await undoAssistantAction(message.messageId!);
      onUndone(message.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't undo that");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-1 space-y-1">
      <Button variant="outline" size="sm" onClick={run} disabled={busy} className="h-7 text-xs gap-1.5">
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
        {log.length === 1 ? undoLabel(log[0]) : `Undo ${log.length} changes`}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Bubble({
  message,
  onUndone,
}: {
  message: DisplayMessage;
  onUndone: (id: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3.5 py-2.5 text-sm leading-relaxed break-words">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {message.steps.length > 0 && (
          <div className="rounded-xl bg-muted/50 border px-3 py-2 space-y-0.5">
            {message.steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
          </div>
        )}
        {message.text && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.text}
            {message.streaming && (
              <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-text-bottom" />
            )}
          </div>
        )}
        {message.streaming && !message.text && message.steps.length === 0 && (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        )}
        <UndoBar message={message} onUndone={onUndone} />
      </div>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What needs my attention today?",
  "Show me overdue invoices",
  "Create a quote for my most recent customer",
  "Which jobs are scheduled this week?",
];

export function AssistantChat({
  initialConversations,
}: {
  initialConversations: AssistantConversation[];
}) {
  const router = useRouter();

  const [conversations, setConversations] = useState(initialConversations);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [apiHistory, setApiHistory] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<AssistantModel>(DEFAULT_MODEL);
  const [effort, setEffort] = useState<AssistantEffort>(DEFAULT_EFFORT);
  const [speakReplies, setSpeakReplies] = useState(false);
  /** Voice transcript awaiting confirmation — never auto-sent. */
  const [pendingVoice, setPendingVoice] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Lets Stop actually abort the request instead of orphaning it. */
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const newChat = () => {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setApiHistory([]);
    setInput("");
  };

  const openConversation = async (id: string) => {
    abortRef.current?.abort();
    setLoading(true);
    try {
      const { conversation, messages: rows } = await getAssistantConversation(id);
      setConversationId(id);
      if (conversation.model) setModel(conversation.model as AssistantModel);
      setApiHistory(rows.map((r) => ({ role: r.role, content: r.content })));
      setMessages(
        rows.map((r) => ({
          id: r.id,
          messageId: r.id,
          role: r.role,
          text: textOf(r.content),
          steps: [],
          changeLog: r.change_log ?? [],
          undone: !!r.undone_at,
        }))
      );
    } catch {
      // Falls through to an empty chat rather than a broken one.
    } finally {
      setLoading(false);
    }
  };

  const removeConversation = async (id: string) => {
    await deleteAssistantConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (conversationId === id) newChat();
  };

  const markUndone = (displayId: string) =>
    setMessages((prev) => prev.map((m) => (m.id === displayId ? { ...m, undone: true } : m)));

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
  };

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setInput("");
      setPendingVoice(null);

      const userBlocks = [{ type: "text", text: trimmed }];
      const nextHistory: ApiMessage[] = [...apiHistory, { role: "user", content: userBlocks }];
      setApiHistory(nextHistory);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", text: trimmed, steps: [] },
      ]);

      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", text: "", steps: [], streaming: true },
      ]);
      setLoading(true);

      const update = (fn: (m: DisplayMessage) => DisplayMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        let context: unknown = null;
        try {
          context = await getAgentContext("/assistant");
        } catch {
          // Non-fatal: the agent just loses the live snapshot this turn.
        }

        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextHistory, context, model, effort }),
          signal: controller.signal,
        });

        // Surface what the server actually said. This previously threw a flat
        // "The assistant didn't respond. Try again." for every non-OK status,
        // which hid the reason entirely — a missing API key, a denied role and
        // a genuine crash all looked identical, to the user and to me.
        if (!res.ok) {
          const detail = await res
            .json()
            .then((j: { error?: string }) => j?.error)
            .catch(() => null);
          update((m) => ({
            ...m,
            text: detail ?? `The assistant returned ${res.status}. Try again.`,
            streaming: false,
          }));
          return;
        }
        if (!res.body) throw new Error("The assistant returned an empty response. Try again.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalText = "";
        let returnedHistory: ApiMessage[] | null = null;
        let changeLog: AssistantChangeEntry[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let ev: Record<string, unknown>;
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }

            switch (ev.type) {
              case "text":
                finalText += ev.content as string;
                update((m) => ({ ...m, text: finalText }));
                break;
              case "tool_start":
                update((m) => ({
                  ...m,
                  steps: [...m.steps, { id: ev.id as string, name: ev.name as string, status: "running" }],
                }));
                break;
              case "tool_done":
                update((m) => ({
                  ...m,
                  steps: m.steps.map((s) => (s.id === ev.id ? { ...s, status: "done" } : s)),
                }));
                break;
              case "tool_error":
                update((m) => ({
                  ...m,
                  steps: m.steps.map((s) =>
                    s.id === ev.id ? { ...s, status: "error", result: ev.result as string } : s
                  ),
                }));
                break;
              case "error":
                // Append: an error after some text used to be dropped entirely,
                // so a cut-off turn looked like a complete answer.
                finalText = finalText ? `${finalText}\n\n${ev.message as string}` : (ev.message as string);
                update((m) => ({ ...m, text: finalText }));
                break;
              case "done":
                returnedHistory = (ev.messages as ApiMessage[]) ?? null;
                changeLog = (ev.changeLog as AssistantChangeEntry[]) ?? [];
                update((m) => ({ ...m, streaming: false }));
                break;
            }
          }
        }

        // Keep the server's history verbatim — blocks and all. Rebuilding it
        // from text here is exactly the bug this feature exists to fix.
        if (returnedHistory) setApiHistory(returnedHistory);
        if (speakReplies && finalText) speak(finalText);

        // Persist. Best-effort: a failed save must not lose the visible reply.
        try {
          let convId = conversationId;
          if (!convId) {
            const created = await createAssistantConversation(trimmed.slice(0, 60));
            convId = created.id;
            setConversationId(convId);
            setConversations((prev) => [created, ...prev]);
          }
          const assistantBlocks =
            returnedHistory && returnedHistory.length > 0
              ? returnedHistory[returnedHistory.length - 1].content
              : [{ type: "text", text: finalText }];

          const { assistantMessageId } = await saveAssistantTurn({
            conversationId: convId,
            userContent: userBlocks,
            assistantContent: Array.isArray(assistantBlocks) ? assistantBlocks : [assistantBlocks],
            model,
            changeLog,
          });
          update((m) => ({ ...m, messageId: assistantMessageId, changeLog }));
        } catch {
          // Not fatal — the turn happened, it just isn't saved.
          update((m) => ({ ...m, changeLog }));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          update((m) => ({ ...m, streaming: false, text: m.text || "Stopped." }));
        } else {
          update((m) => ({
            ...m,
            streaming: false,
            text: err instanceof Error ? err.message : "Something went wrong",
          }));
        }
      } finally {
        abortRef.current = null;
        setLoading(false);
        router.refresh();
      }
    },
    [apiHistory, conversationId, effort, loading, model, router, speakReplies]
  );

  // Voice never auto-sends: a misheard "delete the Smith invoice" would fire
  // straight into tools. Show it, let the user confirm or edit.
  const voice = useVoiceCapture(
    useCallback((text: string) => setPendingVoice(text), [])
  );

  return (
    <div className="flex gap-4 h-[calc(100vh-11rem)] min-h-[28rem]">
      {/* Conversations */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col gap-2">
        <Button onClick={newChat} variant="outline" size="sm" className="gap-1.5 justify-start">
          <Plus className="w-3.5 h-3.5" /> New chat
        </Button>
        <div className="flex-1 overflow-y-auto space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-3">No saved chats yet.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs cursor-pointer hover:bg-muted ${
                conversationId === c.id ? "bg-muted" : ""
              }`}
              onClick={() => openConversation(c.id)}
            >
              <MessageSquare className="w-3 h-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{c.title ?? "Untitled"}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void removeConversation(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                aria-label="Delete conversation"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <div className="flex-1 flex flex-col border rounded-xl bg-card min-w-0">
        {/* Controls */}
        <div className="flex items-center gap-2 border-b px-3 py-2 flex-wrap">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as AssistantModel)}
            className="text-xs border rounded-md px-2 py-1 bg-background"
            title={ASSISTANT_MODELS.find((m) => m.id === model)?.blurb}
          >
            {ASSISTANT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value as AssistantEffort)}
            className="text-xs border rounded-md px-2 py-1 bg-background"
            title={ASSISTANT_EFFORTS.find((e) => e.id === effort)?.blurb}
          >
            {ASSISTANT_EFFORTS.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSpeakReplies((v) => !v)}
            className={`text-xs flex items-center gap-1 rounded-md px-2 py-1 border ${
              speakReplies ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground"
            }`}
            title={speakReplies ? "Replies are spoken aloud" : "Replies are silent"}
          >
            {speakReplies ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            {speakReplies ? "Speaking" : "Silent"}
          </button>
          <div className="ml-auto">
            {loading && (
              <Button variant="outline" size="sm" onClick={stop} className="h-7 text-xs gap-1.5">
                <Square className="w-3 h-3" /> Stop
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">What can I help with?</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  I can see your live data and run anything in Kirei — quotes, invoices, jobs,
                  customers, leads and more.
                </p>
              </div>
              <div className="w-full max-w-sm space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <Bubble key={m.id} message={m} onUndone={markUndone} />)
          )}
          <div ref={endRef} />
        </div>

        {/* Voice confirmation */}
        {pendingVoice && (
          <div className="border-t px-3 py-2 bg-muted/40 space-y-2">
            <p className="text-xs text-muted-foreground">Heard — send this?</p>
            <p className="text-sm break-words">{pendingVoice}</p>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={() => void send(pendingVoice)}>
                Send
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setInput(pendingVoice);
                  setPendingVoice(null);
                  inputRef.current?.focus();
                }}
              >
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPendingVoice(null)}>
                Discard
              </Button>
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="border-t p-2.5">
          {voice.recording && voice.interimText && (
            <p className="text-xs text-muted-foreground px-1 pb-1.5 italic">{voice.interimText}</p>
          )}
          {voice.error && <p className="text-xs text-destructive px-1 pb-1.5">{voice.error}</p>}
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask anything, or tap the mic…"
              rows={1}
              className="resize-none min-h-[38px] max-h-32 text-sm"
              disabled={loading}
            />
            <Button
              type="button"
              variant={voice.recording ? "default" : "outline"}
              size="icon"
              className="h-[38px] w-[38px] shrink-0"
              onClick={() => (voice.recording ? voice.stop() : void voice.start())}
              disabled={loading || voice.transcribing}
              title={voice.recording ? "Tap to stop" : "Tap to talk"}
            >
              {voice.transcribing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>
            <Button
              size="icon"
              className="h-[38px] w-[38px] shrink-0"
              onClick={() => void send(input)}
              disabled={loading || !input.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
