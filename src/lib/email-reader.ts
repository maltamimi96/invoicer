/**
 * IMAP email reader.
 * Accepts per-business config (SaaS-ready) instead of env vars.
 */

import { ImapFlow } from "imapflow";

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface RawEmail {
  uid: number;
  messageId: string | null;
  from: string;
  subject: string;
  text: string;
  date: Date;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#?\w+;/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Test an IMAP connection — returns true on success, error message on failure.
 */
export async function testImapConnection(config: ImapConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false as const,
  });

  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try { await client.logout(); } catch { /* already disconnected */ }
    return { ok: false, error: msg };
  }
}

function parseEmailSource(raw: string): string {
  const textMatch = raw.match(/Content-Type:\s*text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
  const htmlMatch = raw.match(/Content-Type:\s*text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);

  let text = "";
  if (textMatch) {
    text = textMatch[1].trim();
  } else if (htmlMatch) {
    text = stripHtml(htmlMatch[1]);
  } else {
    const bodyStart = raw.indexOf("\r\n\r\n");
    if (bodyStart > -1) {
      const body = raw.slice(bodyStart + 4);
      text = body.includes("<") ? stripHtml(body) : body;
    }
  }

  if (text.includes("=\r\n") || text.includes("=3D")) {
    text = text
      .replace(/=\r\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
  }

  if (text.length > 3000) {
    text = text.slice(0, 3000) + "\n...(truncated)";
  }

  return text;
}

/**
 * Fetch every email delivered since `since`, without modifying \Seen flags.
 * Dedupe is the caller's responsibility — each email exposes its RFC-822 Message-ID.
 */
export async function fetchEmailsSince(
  config: ImapConfig,
  since: Date,
  maxEmails = 200,
): Promise<RawEmail[]> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false as const,
  });

  const emails: RawEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const searchResult = await client.search({ since }, { uid: true });
      const uids = Array.isArray(searchResult) ? searchResult : [];
      if (!uids.length) return [];

      // Newest first, capped.
      const toProcess = uids.slice(-maxEmails).reverse();

      for (const uid of toProcess) {
        try {
          const fetchResult = await client.fetchOne(String(uid), {
            envelope: true,
            source: true,
          }, { uid: true });

          if (!fetchResult) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg = fetchResult as any as {
            envelope?: {
              from?: { name?: string; address?: string }[];
              subject?: string;
              date?: string;
              messageId?: string;
            };
            source?: Buffer;
          };
          if (!msg.envelope) continue;

          const from = msg.envelope.from?.[0]
            ? `${msg.envelope.from[0].name || ""} <${msg.envelope.from[0].address || ""}>`.trim()
            : "unknown";

          const subject = msg.envelope.subject || "(no subject)";
          const date = msg.envelope.date ? new Date(msg.envelope.date) : new Date();
          const messageId = msg.envelope.messageId || null;

          const text = msg.source ? parseEmailSource(msg.source.toString()) : "";

          emails.push({ uid, messageId, from, subject, text, date });
        } catch (e) {
          console.error(`Failed to process email uid=${uid}:`, e);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (e) {
    console.error("IMAP connection error:", e);
    try { await client.logout(); } catch { /* already disconnected */ }
    throw e;
  }

  return emails;
}
