"use server";

/**
 * Assistant conversations: persistence + undo.
 *
 * The assistant previously had neither. History lived in useState (a refresh
 * destroyed it), and nothing it did was logged or reversible — it could call
 * deleteCustomer with no snapshot and no way back.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { getMyRoleCached } from "@/lib/role";
import { assistantScopesForRole } from "@/lib/assistant/scopes";
import type {
  AssistantConversation,
  AssistantMessage,
  AssistantChangeEntry,
} from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/**
 * Every action here goes through this. RLS already scopes these tables to the
 * owning user and excludes workers, but the assistant is a service-role
 * surface elsewhere — so the role check is repeated at the action layer rather
 * than assumed. Returns the caller's identity.
 */
async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const role = await getMyRoleCached();
  if (!assistantScopesForRole(role)) {
    throw new Error("The assistant isn't available for your access level.");
  }
  return { supabase, user, businessId };
}

// ── conversations ────────────────────────────────────────────────────────────

export async function listAssistantConversations(): Promise<AssistantConversation[]> {
  const { supabase, user, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "assistant_conversations")
    .select("id, business_id, user_id, title, model, created_at, updated_at")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as AssistantConversation[];
}

export async function getAssistantConversation(
  conversationId: string
): Promise<{ conversation: AssistantConversation; messages: AssistantMessage[] }> {
  const { supabase, user, businessId } = await ctx();

  const { data: conversation, error: convErr } = await tbl(supabase, "assistant_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (convErr) throw new Error(convErr.message);
  if (!conversation) throw new Error("Conversation not found");

  const { data: messages, error: msgErr } = await tbl(supabase, "assistant_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: true });
  if (msgErr) throw new Error(msgErr.message);

  return {
    conversation: conversation as AssistantConversation,
    messages: (messages ?? []) as AssistantMessage[],
  };
}

export async function createAssistantConversation(title?: string): Promise<AssistantConversation> {
  const { supabase, user, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "assistant_conversations")
    .insert({
      business_id: businessId,
      user_id: user.id,
      title: title?.trim() || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/assistant");
  return data as AssistantConversation;
}

export async function renameAssistantConversation(
  conversationId: string,
  title: string
): Promise<void> {
  const { supabase, user, businessId } = await ctx();
  const { error } = await tbl(supabase, "assistant_conversations")
    .update({ title: title.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/assistant");
}

export async function deleteAssistantConversation(conversationId: string): Promise<void> {
  const { supabase, user, businessId } = await ctx();
  const { error } = await tbl(supabase, "assistant_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/assistant");
}

// ── turns ────────────────────────────────────────────────────────────────────

/**
 * Persist one exchange.
 *
 * `content` is the full Anthropic block array on both sides — never flattened
 * to text. That flattening is the bug this whole feature exists to fix.
 */
export async function saveAssistantTurn(input: {
  conversationId: string;
  userContent: unknown[];
  assistantContent: unknown[];
  model: string;
  changeLog?: AssistantChangeEntry[];
}): Promise<{ assistantMessageId: string }> {
  const { supabase, user, businessId } = await ctx();

  // Next sequence number. A unique (conversation_id, seq) index means two
  // racing turns collide loudly rather than silently interleaving.
  const { data: last } = await tbl(supabase, "assistant_messages")
    .select("seq")
    .eq("conversation_id", input.conversationId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSeq = ((last?.seq as number | undefined) ?? -1) + 1;

  const base = {
    conversation_id: input.conversationId,
    business_id: businessId,
    user_id: user.id,
    model: input.model,
  };

  const { data, error } = await tbl(supabase, "assistant_messages")
    .insert([
      { ...base, role: "user", content: input.userContent, seq: nextSeq, change_log: [] },
      {
        ...base,
        role: "assistant",
        content: input.assistantContent,
        seq: nextSeq + 1,
        change_log: input.changeLog ?? [],
      },
    ])
    .select("id, role");
  if (error) throw new Error(error.message);

  await tbl(supabase, "assistant_conversations")
    .update({ updated_at: new Date().toISOString(), model: input.model })
    .eq("id", input.conversationId);

  const assistant = (data ?? []).find((m: { role: string }) => m.role === "assistant");
  return { assistantMessageId: assistant?.id as string };
}

// ── undo ─────────────────────────────────────────────────────────────────────

/**
 * Reverse everything one assistant turn changed.
 *
 * Same reverse-replay as undoCleanup (src/lib/actions/cleanup.ts:437): walk the
 * log backwards so dependent operations untangle, restore only the keys that
 * actually changed (so a concurrent edit to an untouched column isn't
 * clobbered), and re-insert deleted rows wholesale.
 */
export async function undoAssistantAction(
  messageId: string
): Promise<{ reverted: number }> {
  const { supabase, user, businessId } = await ctx();

  const { data: message, error } = await tbl(supabase, "assistant_messages")
    .select("*")
    .eq("id", messageId)
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!message) throw new Error("Message not found");
  if (message.undone_at) throw new Error("This has already been undone");

  const log = (message.change_log ?? []) as AssistantChangeEntry[];
  if (log.length === 0) throw new Error("There's nothing to undo here");

  let reverted = 0;

  for (const entry of [...log].reverse()) {
    if (entry.op === "update") {
      const before = entry.before as (Record<string, unknown> & { id?: string }) | null;
      const after = (entry.after ?? {}) as Record<string, unknown>;
      if (!before?.id) continue;

      // Restore only what we changed. Rewriting the whole row would clobber
      // any column someone else edited in the meantime.
      const restore: Record<string, unknown> = {};
      for (const key of Object.keys(after)) {
        if (key === "id" || key === "updated_at") continue;
        if (before[key] !== after[key]) restore[key] = before[key];
      }
      if (Object.keys(restore).length === 0) continue;

      const { error: upErr } = await tbl(supabase, entry.table)
        .update(restore)
        .eq("id", before.id)
        .eq("business_id", businessId);
      if (upErr) throw new Error(`Couldn't undo the change to ${entry.table}: ${upErr.message}`);
      reverted++;
    } else if (entry.op === "delete") {
      const before = entry.before as Record<string, unknown> | null;
      if (!before) continue;
      const { error: insErr } = await tbl(supabase, entry.table).insert(before);
      if (insErr) throw new Error(`Couldn't restore the ${entry.table} row: ${insErr.message}`);
      reverted++;
    }
  }

  await tbl(supabase, "assistant_messages")
    .update({ undone_at: new Date().toISOString() })
    .eq("id", messageId);

  revalidatePath("/assistant");
  return { reverted };
}
