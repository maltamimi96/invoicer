"use client";

/**
 * Markdown → React, for assistant replies.
 *
 * Claude writes markdown, so rendering replies as plain text showed users
 * literal `**bold**` and dead links.
 *
 * Renders from marked's *token tree* into React elements rather than piping
 * marked's HTML through dangerouslySetInnerHTML. That matters here: the
 * assistant echoes business data, so a lead who submits
 * `<img src=x onerror=...>` as their name would otherwise get that HTML
 * executed in the owner's session the moment the assistant lists leads. Going
 * through tokens makes injection structurally impossible instead of something
 * a sanitiser has to catch — and the repo has no sanitiser installed.
 */

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { marked, type Token, type Tokens } from "marked";

/** Same-origin app paths route through the SPA; anything else opens safely. */
function MdLink({ href, children }: { href: string; children: ReactNode }) {
  const isInternal = href.startsWith("/") && !href.startsWith("//");

  if (isInternal) {
    return (
      <Link href={href} className="text-primary underline underline-offset-2 hover:opacity-80">
        {children}
      </Link>
    );
  }

  // Only http(s) escapes. Anything else — javascript:, data:, vbscript: — is
  // rendered as inert text rather than made clickable.
  const safe = /^https?:\/\//i.test(href);
  if (!safe) return <span>{children}</span>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  );
}

/** Inline tokens: bold, italic, code, links, breaks. */
function Inline({ tokens }: { tokens?: Token[] }) {
  if (!tokens) return null;
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case "text": {
            const tok = t as Tokens.Text;
            // Nested tokens exist when the text contains further inline markup.
            return tok.tokens ? (
              <Inline key={i} tokens={tok.tokens} />
            ) : (
              <Fragment key={i}>{tok.text}</Fragment>
            );
          }
          case "strong":
            return (
              <strong key={i} className="font-semibold">
                <Inline tokens={(t as Tokens.Strong).tokens} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <Inline tokens={(t as Tokens.Em).tokens} />
              </em>
            );
          case "del":
            return (
              <del key={i} className="opacity-70">
                <Inline tokens={(t as Tokens.Del).tokens} />
              </del>
            );
          case "codespan":
            return (
              <code
                key={i}
                className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] break-words"
              >
                {(t as Tokens.Codespan).text}
              </code>
            );
          case "link": {
            const tok = t as Tokens.Link;
            return (
              <MdLink key={i} href={tok.href}>
                <Inline tokens={tok.tokens} />
              </MdLink>
            );
          }
          case "br":
            return <br key={i} />;
          case "escape":
            return <Fragment key={i}>{(t as Tokens.Escape).text}</Fragment>;
          // Images and raw HTML are deliberately not rendered — the assistant
          // has no reason to emit either, and both are injection surface.
          case "image":
          case "html":
            return null;
          default: {
            const raw = (t as { raw?: string }).raw;
            return raw ? <Fragment key={i}>{raw}</Fragment> : null;
          }
        }
      })}
    </>
  );
}

function ListBlock({ token }: { token: Tokens.List }) {
  const cls = "my-1.5 space-y-0.5 pl-5 " + (token.ordered ? "list-decimal" : "list-disc");
  const items = token.items.map((item, i) => (
    <li key={i} className="leading-relaxed">
      <Blocks tokens={item.tokens} tight />
    </li>
  ));
  return token.ordered ? (
    <ol className={cls} start={Number(token.start) || 1}>
      {items}
    </ol>
  ) : (
    <ul className={cls}>{items}</ul>
  );
}

function TableBlock({ token }: { token: Tokens.Table }) {
  // Wide tables scroll inside their own container — the chat column must never
  // scroll sideways.
  return (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b">
            {token.header.map((cell, i) => (
              <th key={i} className="text-left font-semibold px-2 py-1 whitespace-nowrap">
                <Inline tokens={cell.tokens} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {token.rows.map((row, r) => (
            <tr key={r} className="border-b last:border-0">
              {row.map((cell, c) => (
                <td key={c} className="px-2 py-1 align-top">
                  <Inline tokens={cell.tokens} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Block-level tokens. `tight` drops paragraph margins inside list items. */
function Blocks({ tokens, tight = false }: { tokens: Token[]; tight?: boolean }) {
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case "paragraph":
            return (
              <p key={i} className={tight ? "" : "my-1.5 first:mt-0 last:mb-0 leading-relaxed"}>
                <Inline tokens={(t as Tokens.Paragraph).tokens} />
              </p>
            );
          case "text": {
            const tok = t as Tokens.Text;
            return tok.tokens ? (
              <Inline key={i} tokens={tok.tokens} />
            ) : (
              <Fragment key={i}>{tok.text}</Fragment>
            );
          }
          case "heading": {
            const tok = t as Tokens.Heading;
            // Chat bubbles are small — scale headings down so an h1 doesn't
            // dwarf the conversation around it.
            const size =
              tok.depth <= 2 ? "text-sm font-semibold" : "text-[13px] font-semibold";
            return (
              <p key={i} className={`${size} mt-3 first:mt-0 mb-1`}>
                <Inline tokens={tok.tokens} />
              </p>
            );
          }
          case "code": {
            const tok = t as Tokens.Code;
            return (
              <pre
                key={i}
                className="my-2 overflow-x-auto rounded-lg border bg-muted/60 p-2.5 text-xs"
              >
                <code className="font-mono">{tok.text}</code>
              </pre>
            );
          }
          case "blockquote":
            return (
              <blockquote key={i} className="my-2 border-l-2 pl-3 text-muted-foreground">
                <Blocks tokens={(t as Tokens.Blockquote).tokens} />
              </blockquote>
            );
          case "list":
            return <ListBlock key={i} token={t as Tokens.List} />;
          case "table":
            return <TableBlock key={i} token={t as Tokens.Table} />;
          case "hr":
            return <hr key={i} className="my-3 border-border" />;
          case "space":
            return null;
          case "html":
            return null; // never rendered — see the file header
          default: {
            const raw = (t as { raw?: string }).raw;
            return raw ? <Fragment key={i}>{raw}</Fragment> : null;
          }
        }
      })}
    </>
  );
}

export function Markdown({ children }: { children: string }) {
  if (!children) return null;
  // gfm gives tables and strikethrough. `breaks` keeps single newlines visible,
  // which matches how the model formats short chat replies.
  const tokens = marked.lexer(children, { gfm: true, breaks: true });
  return (
    <div className="text-sm leading-relaxed break-words">
      <Blocks tokens={tokens} />
    </div>
  );
}
