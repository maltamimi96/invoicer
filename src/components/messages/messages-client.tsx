"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Plus, Send, Phone, User, Search, Loader2, ChevronLeft } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  getMessages, sendSms, markConversationRead, startConversation,
  type SmsConversation, type SmsMessage,
} from "@/lib/actions/sms";
import type { Customer } from "@/types/database";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatPhone(phone: string) {
  // Pretty-print Australian numbers
  const clean = phone.replace(/\D/g, "");
  if (clean.startsWith("61") && clean.length === 11) {
    return `0${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  return phone;
}

interface Props {
  conversations: SmsConversation[];
  customers: Customer[];
  autoOpenConvId?: string | null;
}

export function MessagesClient({ conversations: initialConvs, customers, autoOpenConvId }: Props) {
  const [conversations, setConversations] = useState<SmsConversation[]>(initialConvs);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    autoOpenConvId ?? initialConvs[0]?.id ?? null
  );
  const [mobileShowThread, setMobileShowThread] = useState(!!autoOpenConvId);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, startSending] = useTransition();
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedConv = conversations.find((c) => c.id === selectedConvId) ?? null;

  // Load messages when conversation changes
  useEffect(() => {
    if (!selectedConvId) return;
    setLoadingMessages(true);
    getMessages(selectedConvId)
      .then((msgs) => { setMessages(msgs); })
      .catch(() => toast.error("Failed to load messages"))
      .finally(() => setLoadingMessages(false));

    // Mark as read
    markConversationRead(selectedConvId).catch(() => {});
    setConversations((prev) =>
      prev.map((c) => c.id === selectedConvId ? { ...c, unread_count: 0 } : c)
    );
  }, [selectedConvId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Supabase realtime — subscribe to new messages in the selected conversation
  useEffect(() => {
    if (!selectedConvId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`sms-messages-${selectedConvId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_messages", filter: `conversation_id=eq.${selectedConvId}` },
        (payload) => {
          const newMsg = payload.new as SmsMessage;
          setMessages((prev) => {
            // Avoid duplicates (outbound messages are already added optimistically)
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConvId]);

  // Supabase realtime — conversation list updates (new inbound convs, unread counts)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("sms-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sms_conversations" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setConversations((prev) => [payload.new as SmsConversation, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setConversations((prev) =>
              prev
                .map((c) => c.id === payload.new.id ? { ...c, ...payload.new } : c)
                .sort((a, b) => {
                  if (!a.last_message_at) return 1;
                  if (!b.last_message_at) return -1;
                  return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
                })
            );
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSend = () => {
    if (!messageText.trim() || !selectedConv) return;
    const body = messageText.trim();
    setMessageText("");

    startSending(async () => {
      try {
        // Optimistic update
        const optimisticId = `opt-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: optimisticId,
            conversation_id: selectedConv.id,
            business_id: selectedConv.business_id,
            direction: "outbound",
            body,
            from_number: "",
            to_number: selectedConv.customer_phone,
            twilio_sid: null,
            status: "sending",
            created_at: new Date().toISOString(),
          },
        ]);

        await sendSms({
          to: selectedConv.customer_phone,
          body,
          customerName: selectedConv.customer_name,
          customerId: selectedConv.customer_id,
        });

        // Remove optimistic and let realtime replace it
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to send");
        setMessageText(body); // restore
        setMessages((prev) => prev.filter((m) => !m.id.startsWith("opt-")));
      }
    });
  };

  const handleSelectConv = (id: string) => {
    setSelectedConvId(id);
    setMobileShowThread(true);
  };

  const filteredConvs = conversations.filter((c) =>
    c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    c.customer_phone.includes(search)
  );

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Messages</h1>
          {totalUnread > 0 && (
            <Badge className="bg-blue-500 text-white text-xs">{totalUnread}</Badge>
          )}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowNewModal(true)}>
          <Plus className="w-4 h-4" />
          New Message
        </Button>
      </div>

      {/* Main panel */}
      <div className="flex flex-1 border rounded-xl overflow-hidden min-h-0">
        {/* Conversation list */}
        <div className={cn(
          "flex flex-col border-r bg-muted/20 flex-shrink-0",
          "w-full md:w-72 lg:w-80",
          mobileShowThread ? "hidden md:flex" : "flex"
        )}>
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {conversations.length === 0
                    ? "No conversations yet. Send a message to get started."
                    : "No results"}
                </p>
              </div>
            ) : (
              filteredConvs.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConv(conv.id)}
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-3 border-b text-left transition-colors hover:bg-muted/50",
                    conv.id === selectedConvId && "bg-muted"
                  )}
                >
                  {/* Avatar */}
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-semibold text-sm">
                    {conv.customer_name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-sm truncate", conv.unread_count > 0 && "font-semibold")}>
                        {conv.customer_name}
                      </p>
                      {conv.last_message_at && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {formatTime(conv.last_message_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{formatPhone(conv.customer_phone)}</p>
                    {conv.unread_count > 0 && (
                      <div className="mt-0.5">
                        <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0">{conv.unread_count} new</Badge>
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread panel */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0",
          !mobileShowThread ? "hidden md:flex" : "flex"
        )}>
          {selectedConv ? (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-background flex-shrink-0">
                <button
                  onClick={() => setMobileShowThread(false)}
                  className="md:hidden p-1 rounded hover:bg-muted"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                  {selectedConv.customer_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{selectedConv.customer_name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" />
                    {formatPhone(selectedConv.customer_phone)}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <div className="flex justify-center pt-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                    <MessageSquare className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
                  </div>
                ) : (
                  <>
                    <AnimatePresence initial={false}>
                      {messages.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "flex",
                            msg.direction === "outbound" ? "justify-end" : "justify-start"
                          )}
                        >
                          <div className={cn(
                            "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                            msg.direction === "outbound"
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted text-foreground rounded-bl-sm"
                          )}>
                            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                            <p className={cn(
                              "text-[10px] mt-1",
                              msg.direction === "outbound" ? "text-primary-foreground/60 text-right" : "text-muted-foreground"
                            )}>
                              {msg.status === "sending" ? "Sending..." : formatTime(msg.created_at)}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <div ref={bottomRef} />
                  </>
                )}
              </div>

              {/* Input */}
              <div className="border-t p-3 flex-shrink-0">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a message... (Enter to send)"
                    rows={1}
                    className="resize-none min-h-[40px] max-h-32"
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={sending || !messageText.trim()}
                    className="h-10 w-10 flex-shrink-0"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 pl-1">Shift+Enter for new line</p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
              <MessageSquare className="w-12 h-12 text-muted-foreground/40" />
              <div>
                <p className="font-medium text-muted-foreground">Select a conversation</p>
                <p className="text-sm text-muted-foreground/60 mt-1">or start a new one with a customer</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowNewModal(true)} className="gap-1.5">
                <Plus className="w-4 h-4" /> New Message
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* New conversation modal */}
      <NewConversationModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        customers={customers}
        onCreated={(convId) => {
          setShowNewModal(false);
          setSelectedConvId(convId);
          setMobileShowThread(true);
        }}
      />
    </div>
  );
}

function NewConversationModal({
  open, onClose, customers, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  onCreated: (convId: string) => void;
}) {
  const NO_CUSTOMER = "__none__";
  const [customerId, setCustomerId] = useState(NO_CUSTOMER);
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [saving, startSaving] = useTransition();

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const handleCreate = () => {
    const phone = selectedCustomer?.phone ?? manualPhone.trim();
    const name = selectedCustomer?.name ?? manualName.trim();
    if (!phone) { toast.error("Phone number is required"); return; }
    if (!name) { toast.error("Name is required"); return; }

    startSaving(async () => {
      try {
        const convId = await startConversation({
          customerPhone: formatE164(phone),
          customerName: name,
          customerId: selectedCustomer?.id ?? null,
        });
        onCreated(convId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to start conversation");
      }
    });
  };

  function formatE164(phone: string) {
    const digits = phone.replace(/\D/g, "");
    // Australian mobile: 04xxxxxxxx → +614xxxxxxxx
    if (digits.startsWith("04") && digits.length === 10) return `+61${digits.slice(1)}`;
    if (digits.startsWith("61")) return `+${digits}`;
    if (!digits.startsWith("+")) return `+${digits}`;
    return phone;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Customer (optional)</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a customer..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CUSTOMER}>
                  <span className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Enter manually</span>
                </SelectItem>
                {customers.filter((c) => c.phone).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.phone ? ` · ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {customerId === NO_CUSTOMER && (
            <>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  placeholder="John Smith"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone number</Label>
                <Input
                  placeholder="0412 345 678"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Australian mobiles: 04xx xxx xxx</p>
              </div>
            </>
          )}

          {selectedCustomer && (
            <div className="rounded-lg bg-muted p-3 text-sm space-y-0.5">
              <p className="font-medium">{selectedCustomer.name}</p>
              <p className="text-muted-foreground flex items-center gap-1">
                <Phone className="w-3 h-3" /> {selectedCustomer.phone}
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
            Start Conversation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
