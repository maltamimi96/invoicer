/**
 * MCP tools for assistant conversations.
 *
 * Read + delete only. There is deliberately no "send a message as the user"
 * tool: the assistant already runs the full registry, so such a tool would let
 * an agent drive an agent — a loop with no supervision and no undo.
 */

import { z } from "zod";
import { assertScope, t, text } from "../context";
import { ctxFrom, UUID, type ToolFn } from "./shared";

export function registerAssistantTools(tool: ToolFn): void {
  tool(
    "list_assistant_conversations",
    "List saved AI assistant conversations for this business, newest first. Returns titles and timestamps, not the message bodies.",
    {
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra);
      assertScope(ctx, "assistant:read");
      const { data, error } = await t(ctx, "assistant_conversations")
        .select("id, title, model, created_at, updated_at, user_id")
        .eq("business_id", ctx.businessId)
        .order("updated_at", { ascending: false })
        .limit(args.limit ?? 30);
      if (error) throw new Error(error.message);
      return text(data ?? []);
    }
  );

  tool(
    "get_assistant_conversation",
    "Get one AI assistant conversation with its full message history, including the tool calls the assistant made and their results.",
    {
      conversation_id: UUID,
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra);
      assertScope(ctx, "assistant:read");

      const { data: conversation, error: convErr } = await t(ctx, "assistant_conversations")
        .select("*")
        .eq("id", args.conversation_id)
        .eq("business_id", ctx.businessId)
        .maybeSingle();
      if (convErr) throw new Error(convErr.message);
      if (!conversation) throw new Error("Conversation not found");

      const { data: messages, error: msgErr } = await t(ctx, "assistant_messages")
        .select("id, role, content, seq, model, change_log, undone_at, created_at")
        .eq("conversation_id", args.conversation_id)
        .eq("business_id", ctx.businessId)
        .order("seq", { ascending: true });
      if (msgErr) throw new Error(msgErr.message);

      return text({ conversation, messages: messages ?? [] });
    }
  );

  tool(
    "delete_assistant_conversation",
    "Permanently delete an AI assistant conversation and all of its messages. This cannot be undone.",
    {
      conversation_id: UUID,
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra);
      assertScope(ctx, "assistant:write");
      const { error } = await t(ctx, "assistant_conversations")
        .delete()
        .eq("id", args.conversation_id)
        .eq("business_id", ctx.businessId);
      if (error) throw new Error(error.message);
      return text({ deleted: true, id: args.conversation_id });
    }
  );
}
