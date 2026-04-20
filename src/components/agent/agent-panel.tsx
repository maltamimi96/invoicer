"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, Send, Loader2, CheckCircle2, AlertCircle, ChevronRight,
  Minimize2, Trash2, Sparkles, Mic,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { useVoiceCapture } from "./use-voice-capture";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolStep {
  id: string;
  name: string;
  label: string;
  status: "running" | "done" | "error";
  resultText?: string;
  error?: string;
}

interface NavSuggestion {
  path: string;
  label: string;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps: ToolStep[];
  navSuggestions: NavSuggestion[];
  streaming?: boolean;
}

// API message format (sent to /api/agent)
interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Tool step result label ────────────────────────────────────────────────────

function resultLabel(name: string, result: unknown): string {
  if (!result || typeof result !== "object") return "Done";
  const r = result as Record<string, unknown>;
  if (typeof r.message === "string") return r.message;
  if (name === "search_customers") return `Found ${(r.count as number) ?? 0} customer(s)`;
  return "Done";
}

// ── Step card ─────────────────────────────────────────────────────────────────

function StepCard({ step }: { step: ToolStep }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <div className="mt-0.5 flex-shrink-0">
        {step.status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        {step.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
        {step.status === "error" && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
      </div>
      <div className="text-xs leading-snug">
        <span className="text-muted-foreground">
          {step.status === "running" ? `${step.label}…` : (step.resultText ?? step.label)}
        </span>
        {step.status === "error" && step.error && (
          <p className="text-destructive mt-0.5">{step.error}</p>
        )}
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onNavigate,
}: {
  message: DisplayMessage;
  onNavigate: (path: string) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3.5 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Tool steps */}
        {message.steps.length > 0 && (
          <div className="rounded-xl bg-muted/50 border px-3 py-2 space-y-0.5">
            {message.steps.map((step) => (
              <StepCard key={step.id} step={step} />
            ))}
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
            {message.streaming && (
              <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-text-bottom" />
            )}
          </div>
        )}

        {/* Navigation suggestions */}
        {message.navSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {message.navSuggestions.map((nav) => (
              <button
                key={nav.path}
                onClick={() => onNavigate(nav.path)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                View {nav.label}
                <ChevronRight className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Send Mike to the Smith St job tomorrow at 2pm",
  "Create a work order for a roof inspection at 102 Main St",
  "Add a new customer John Doe and create a $1500 invoice",
  "Show me work orders scheduled this week",
];

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
      </div>
      <div>
        <p className="font-semibold text-sm">What can I help with?</p>
        <p className="text-xs text-muted-foreground mt-1">
          Type or hold the mic to talk. I can run accounts, sites, contacts, work orders, quotes, invoices and team scheduling.
        </p>
      </div>
      <div className="w-full space-y-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="w-full text-left text-xs px-3 py-2 rounded-lg border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function AgentPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [apiHistory, setApiHistory] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [open]);

  const clearConversation = () => {
    setMessages([]);
    setApiHistory([]);
  };

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput("");

    const userDisplayMsg: DisplayMessage = {
      id: uuidv4(),
      role: "user",
      content: trimmed,
      steps: [],
      navSuggestions: [],
    };

    const newApiHistory: ApiMessage[] = [...apiHistory, { role: "user", content: trimmed }];
    setApiHistory(newApiHistory);
    setMessages((prev) => [...prev, userDisplayMsg]);
    setLoading(true);

    // Add a streaming assistant message
    const assistantId = uuidv4();
    const assistantMsg: DisplayMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      steps: [],
      navSuggestions: [],
      streaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newApiHistory }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";

      const updateAssistant = (updater: (msg: DisplayMessage) => DisplayMessage) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? updater(m) : m))
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          switch (event.type) {
            case "text":
              finalText += event.content as string;
              updateAssistant((m) => ({ ...m, content: finalText }));
              break;

            case "tool_start":
              updateAssistant((m) => ({
                ...m,
                steps: [
                  ...m.steps,
                  {
                    id: event.id as string,
                    name: event.name as string,
                    label: event.label as string,
                    status: "running",
                  },
                ],
              }));
              break;

            case "tool_done":
              updateAssistant((m) => ({
                ...m,
                steps: m.steps.map((s) =>
                  s.id === event.id
                    ? { ...s, status: "done", resultText: resultLabel(s.name, event.result) }
                    : s
                ),
              }));
              break;

            case "tool_error":
              updateAssistant((m) => ({
                ...m,
                steps: m.steps.map((s) =>
                  s.id === event.id
                    ? { ...s, status: "error", error: event.error as string }
                    : s
                ),
              }));
              break;

            case "navigate":
              updateAssistant((m) => ({
                ...m,
                navSuggestions: [
                  ...m.navSuggestions,
                  { path: event.path as string, label: event.label as string },
                ],
              }));
              break;

            case "done":
              updateAssistant((m) => ({ ...m, streaming: false }));
              break;

            case "error":
              updateAssistant((m) => ({
                ...m,
                content: m.content || (event.message as string),
                streaming: false,
              }));
              break;
          }
        }
      }

      // Update API history with assistant's reply
      if (finalText) {
        setApiHistory((prev) => [...prev, { role: "assistant", content: finalText }]);
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: err instanceof Error ? err.message : "Something went wrong", streaming: false }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [loading, apiHistory]);

  // uuid helper (client-side only)
  function uuidv4() {
    return crypto.randomUUID();
  }

  // Voice capture — transcribed text is auto-sent
  const voice = useVoiceCapture(useCallback((text: string) => {
    sendMessage(text);
  }, [sendMessage]));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleNavigate = (path: string) => {
    router.push(path);
    setOpen(false);
  };

  return (
    <>
      {/* Floating trigger */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg bg-gradient-to-br from-purple-600 to-violet-700 text-white text-sm font-medium hover:from-purple-500 hover:to-violet-600 transition-all hover:shadow-xl"
          >
            <Bot className="w-4 h-4" />
            AI Assistant
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl shadow-2xl border bg-background overflow-hidden"
            style={{ height: "min(560px, calc(100vh - 5rem))" }}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white flex-shrink-0">
              <Bot className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold text-sm flex-1">AI Assistant</span>
              {messages.length > 0 && (
                <button
                  onClick={clearConversation}
                  className="p-1 rounded-md hover:bg-white/20 transition-colors opacity-80 hover:opacity-100"
                  title="Clear conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-white/20 transition-colors opacity-80 hover:opacity-100"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 ? (
                <EmptyState onSuggestion={(s) => { setInput(s); textareaRef.current?.focus(); }} />
              ) : (
                messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} onNavigate={handleNavigate} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t px-3 py-3 bg-background">
              {voice.recording && (
                <div className="mb-2 flex items-center justify-center gap-2 text-xs text-red-600 dark:text-red-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                  </span>
                  Listening… release to send
                </div>
              )}
              {voice.transcribing && !voice.recording && (
                <div className="mb-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Transcribing…
                </div>
              )}
              {voice.error && (
                <div className="mb-2 text-xs text-destructive text-center">{voice.error}</div>
              )}
              <div className="flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type or hold the mic to talk…"
                  className="resize-none text-sm min-h-[40px] max-h-[120px] flex-1 py-2.5"
                  rows={1}
                  disabled={loading || voice.recording}
                />
                <Button
                  size="icon"
                  variant={voice.recording ? "destructive" : "outline"}
                  className="h-10 w-10 flex-shrink-0 select-none touch-none"
                  disabled={loading || voice.transcribing}
                  onPointerDown={(e) => { e.preventDefault(); voice.start(); }}
                  onPointerUp={() => voice.stop()}
                  onPointerLeave={() => { if (voice.recording) voice.stop(); }}
                  onPointerCancel={() => voice.cancel()}
                  title="Hold to talk"
                >
                  <Mic className={`w-4 h-4 ${voice.recording ? "animate-pulse" : ""}`} />
                </Button>
                <Button
                  size="icon"
                  className="h-10 w-10 flex-shrink-0 bg-gradient-to-br from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600"
                  disabled={!input.trim() || loading}
                  onClick={() => sendMessage(input)}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                Enter to send · Shift+Enter for new line · Hold mic to talk
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
