"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Send, Loader2, Settings as SettingsIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
}

type AnthropicContent =
  | string
  | Array<{ type: string; [key: string]: unknown }>;

interface ApiMessage {
  role:    "user" | "assistant";
  content: AnthropicContent;
}

const SUGGESTIONS = [
  "Bondi café — replace 2 espresso machines + plumbing rough-in + counter install",
  "Standard 3-bed roof gutter clean + tile re-bed where loose",
  "Quote for 8m of fence repair, palings + posts, urgent",
  "What's our margin on materials? Remind me.",
];

export function QuotingAgentChatClient() {
  const [messages, setMessages]     = useState<DisplayMessage[]>([]);
  const [apiHistory, setApiHistory] = useState<ApiMessage[]>([]);
  const [input, setInput]           = useState("");
  const [busy, setBusy]             = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const nextDisplay: DisplayMessage[] = [...messages, { role: "user", text }];
    const nextHistory: ApiMessage[]     = [...apiHistory, { role: "user", content: text }];
    setMessages(nextDisplay);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/quoting-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextHistory }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `Server returned ${res.status}`);
      }
      const { text: reply, messages: updated } = await res.json() as { text: string; messages?: ApiMessage[] };
      setMessages([...nextDisplay, { role: "assistant", text: reply ?? "(no reply)" }]);
      if (Array.isArray(updated)) setApiHistory(updated);
      else setApiHistory([...nextHistory, { role: "assistant", content: reply ?? "" }]);
    } catch (e) {
      setMessages([...nextDisplay, {
        role: "assistant",
        text: e instanceof Error ? `Error: ${e.message}` : "Something went wrong.",
      }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-fuchsia-500 to-rose-500 flex items-center justify-center text-white">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="font-semibold leading-tight">Quoting Agent</h1>
          <p className="text-xs text-muted-foreground">Brief the agent in plain English. It builds the quote.</p>
        </div>
        <Button asChild variant="ghost" size="icon">
          <Link href="/quoting-agent/settings"><SettingsIcon className="w-5 h-5" /></Link>
        </Button>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setMessages([]); setApiHistory([]); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="max-w-md mx-auto text-center space-y-4 py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 via-fuchsia-500 to-rose-500 flex items-center justify-center text-white mx-auto">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Brief the agent</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Describe the job in your own words. The agent looks up your rates, makes itemised lines, applies your margin + tax, and saves the draft quote.
              </p>
            </div>
            <div className="space-y-2 text-left">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left p-3 rounded-lg border bg-card hover:bg-muted/40 text-sm transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl whitespace-pre-wrap text-sm leading-relaxed ${m.role === "user"
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted/50 rounded-bl-md"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-muted/50 rounded-bl-md flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Brief the agent — e.g. 'Smith residence, replace hot water service, supply + install'"
            rows={1}
            className="min-h-[44px] max-h-32 resize-none"
            disabled={busy}
          />
          <Button onClick={() => send(input)} disabled={busy || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
