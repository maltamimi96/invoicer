/**
 * IMAP email reader — fetches unseen emails and marks them as seen.
 * Uses imapflow for modern Promise-based IMAP access.
 */

import { ImapFlow } from "imapflow";

export interface RawEmail {
  uid: number;
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

function getImapConfig() {
  return {
    host: process.env.IMAP_HOST || "imap.hostinger.com",
    port: Number(process.env.IMAP_PORT) || 993,
    secure: true,
    auth: {
      user: process.env.IMAP_USER!,
      pass: process.env.IMAP_PASS!,
    },
    logger: false as const,
  };
}

/**
 * Fetch unseen emails from INBOX, mark them as seen, return parsed data.
 * Processes at most `maxEmails` per run to stay within serverless time limits.
 */
export async function fetchUnseenEmails(maxEmails = 15): Promise<RawEmail[]> {
  const config = getImapConfig();
  if (!config.auth.user || !config.auth.pass) {
    throw new Error("IMAP credentials not configured");
  }

  const client = new ImapFlow(config);
  const emails: RawEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search for unseen messages
      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids = Array.isArray(searchResult) ? searchResult : [];
      if (!uids.length) return [];

      // Limit to most recent N
      const toProcess = uids.slice(-maxEmails);

      for (const uid of toProcess) {
        try {
          const fetchResult = await client.fetchOne(String(uid), {
            envelope: true,
            source: true,
          }, { uid: true });

          // imapflow can return false on failure
          if (!fetchResult) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg = fetchResult as any as { envelope?: { from?: { name?: string; address?: string }[]; subject?: string; date?: string }; source?: Buffer };
          if (!msg.envelope) continue;

          const from = msg.envelope.from?.[0]
            ? `${msg.envelope.from[0].name || ""} <${msg.envelope.from[0].address || ""}>`.trim()
            : "unknown";

          const subject = msg.envelope.subject || "(no subject)";
          const date = msg.envelope.date ? new Date(msg.envelope.date) : new Date();

          // Parse body text from source
          let text = "";
          if (msg.source) {
            const raw = msg.source.toString();
            // Try to get plain text part
            const textMatch = raw.match(/Content-Type:\s*text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
            const htmlMatch = raw.match(/Content-Type:\s*text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);

            if (textMatch) {
              text = textMatch[1].trim();
            } else if (htmlMatch) {
              text = stripHtml(htmlMatch[1]);
            } else {
              // Fallback: everything after headers
              const bodyStart = raw.indexOf("\r\n\r\n");
              if (bodyStart > -1) {
                const body = raw.slice(bodyStart + 4);
                text = body.includes("<") ? stripHtml(body) : body;
              }
            }

            // Decode quoted-printable if needed
            if (text.includes("=\r\n") || text.includes("=3D")) {
              text = text
                .replace(/=\r\n/g, "")
                .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
                  String.fromCharCode(parseInt(hex, 16))
                );
            }
          }

          // Truncate very long emails
          if (text.length > 3000) {
            text = text.slice(0, 3000) + "\n...(truncated)";
          }

          emails.push({ uid, from, subject, text, date });

          // Mark as seen
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
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
