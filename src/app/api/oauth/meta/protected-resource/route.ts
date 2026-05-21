/**
 * RFC 9728 protected-resource metadata. Tells an MCP client (claude.ai)
 * which authorization server guards /api/mcp.
 */
import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";

function origin(req: Request): string {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.kireihq.com";
  return `${proto}://${host}`;
}

export function GET(req: Request) {
  const base = origin(req);
  return protectedResourceHandler({
    authServerUrls: [base],
    resourceUrl: `${base}/api/mcp`,
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
