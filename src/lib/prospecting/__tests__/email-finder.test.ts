import { describe, it, expect, vi, afterEach } from "vitest";
import { findEmail } from "../email-finder";

/** Serve fixed HTML per URL; any URL not listed 404s. */
function serve(pages: Record<string, string>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = pages[String(url)];
    const headers = { get: (): string => "text/html; charset=utf-8" };
    if (body === undefined) return { ok: false, headers };
    return { ok: true, headers, text: async () => body };
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("findEmail", () => {
  it("reads a mailto: link off the homepage", async () => {
    serve({ "https://ace.com.au": `<a href="mailto:info@ace.com.au">Email us</a>` });
    expect(await findEmail("https://ace.com.au")).toEqual({
      email: "info@ace.com.au", source: "https://ace.com.au",
    });
  });

  it("falls through to the contact page when the homepage has nothing", async () => {
    serve({
      "https://ace.com.au": "<p>Welcome</p>",
      "https://ace.com.au/contact": "<p>Reach us at office@ace.com.au</p>",
    });
    const found = await findEmail("ace.com.au");
    expect(found?.email).toBe("office@ace.com.au");
    expect(found?.source).toBe("https://ace.com.au/contact");
  });

  // A theme's placeholder address looks exactly like a real find to a regex,
  // and mailing it is worse than finding nothing.
  it("ignores template placeholders and platform noise", async () => {
    serve({
      "https://ace.com.au": `
        you@example.com  no-reply@ace.com.au  postmaster@ace.com.au
        abc123@sentry.io  logo@ace.com.au.png
        <a href="mailto:info@ace.com.au">real one</a>`,
    });
    expect((await findEmail("https://ace.com.au"))?.email).toBe("info@ace.com.au");
  });

  // The commonest wrong answer: the web agency that built the site.
  it("prefers an address on the business's own domain over the web developer's", async () => {
    serve({ "https://ace.com.au": "hello@webagency.com.au and enquiries@ace.com.au" });
    expect((await findEmail("https://ace.com.au"))?.email).toBe("enquiries@ace.com.au");
  });

  it("prefers an enquiry address over a careers or billing one", async () => {
    serve({ "https://ace.com.au": "careers@ace.com.au accounts@ace.com.au hello@ace.com.au" });
    expect((await findEmail("https://ace.com.au"))?.email).toBe("hello@ace.com.au");
  });

  it("handles www and a bare domain the same way", async () => {
    serve({ "https://www.ace.com.au": `<a href="mailto:info@ace.com.au">e</a>` });
    expect((await findEmail("www.ace.com.au"))?.email).toBe("info@ace.com.au");
  });

  // Not finding one is the normal outcome for a lot of small businesses and
  // must never throw — a run would lose everything after it.
  it("returns null rather than throwing when there is nothing to find", async () => {
    serve({ "https://ace.com.au": "<p>Call us on 0400 000 000</p>" });
    expect(await findEmail("https://ace.com.au")).toBeNull();
  });

  it("returns null for a missing or unparseable website", async () => {
    serve({});
    expect(await findEmail(null)).toBeNull();
    expect(await findEmail("")).toBeNull();
    expect(await findEmail("not a url")).toBeNull();
  });

  it("survives a site that refuses every request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    expect(await findEmail("https://ace.com.au")).toBeNull();
  });

  it("ignores non-HTML responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: { get: (): string => "application/pdf" },
      text: async () => "info@ace.com.au",
    })));
    expect(await findEmail("https://ace.com.au")).toBeNull();
  });
});
