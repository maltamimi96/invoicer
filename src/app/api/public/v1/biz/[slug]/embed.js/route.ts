/**
 * GET /api/public/v1/biz/{slug}/embed.js
 * One-line embed: a business drops
 *   <script src="https://kireihq.com/api/public/v1/biz/{slug}/embed.js" async></script>
 * into their site and this injects a responsive booking iframe where the
 * script tag sits. Listens for height postMessages so the iframe auto-grows.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const origin = new URL(req.url).origin;
  const safeSlug = JSON.stringify(slug);

  const js = `(function(){
  var origin = ${JSON.stringify(origin)};
  var slug = ${safeSlug};
  var src = origin + "/book/" + encodeURIComponent(slug) + "?embed=1";
  var current = document.currentScript;
  var iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.title = "Online booking";
  iframe.loading = "lazy";
  iframe.style.cssText = "width:100%;border:0;min-height:640px;max-width:600px;display:block;margin:0 auto;border-radius:16px;";
  iframe.setAttribute("scrolling", "no");
  if (current && current.parentNode) current.parentNode.insertBefore(iframe, current.nextSibling);
  else document.body.appendChild(iframe);
  window.addEventListener("message", function(e){
    if (e.origin !== origin || !e.data) return;
    if (e.data.kireiBookingHeight && typeof e.data.kireiBookingHeight === "number") {
      iframe.style.height = (e.data.kireiBookingHeight + 8) + "px";
    }
  });
})();`;

  return new NextResponse(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
