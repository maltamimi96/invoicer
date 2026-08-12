/**
 * Everything a CUSTOMER sees, pinned to a light theme.
 *
 * The root layout ships `data-theme="Midnight"` and a boot script that reads
 * the operator's own theme out of localStorage. That is right for the
 * dashboard and wrong for every page a customer opens: there was no layout
 * under portal/, f/, book/ or embed/, so a homeowner who tapped "view your
 * invoice" in a text message got a dark navy SaaS panel — the software's
 * identity, not the roofer's.
 *
 * Two things have to move together, which is why this is one component:
 *
 *   1. The TOKENS. `[data-theme="Daylight"]` is a plain attribute selector, so
 *      a wrapper element re-declares the whole palette for its subtree. That
 *      part is server-rendered and needs no JavaScript.
 *
 *   2. The `.dark` CLASS on <html>, which Tailwind's `dark:` variants key off.
 *      Leave it and you get the worst of both: dark tokens with `dark:`
 *      utilities resolving light, which is how the portal ended up rendering
 *      dark green text on dark navy. A nested layout can't change <html>
 *      server-side, so a pre-paint script does it — before first paint, so
 *      there is no flash.
 *
 * The customer's own device preference is deliberately ignored. This is a
 * document from a business, not an app the customer configured; it should look
 * the same in their hand as it does in the tradie's.
 */

const PIN_LIGHT = `(function(){try{
  var d=document.documentElement;
  d.dataset.theme='Daylight';
  d.classList.remove('dark');
}catch(e){}})();`;

export function CustomerSurface({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PIN_LIGHT }} />
      <div data-theme="Daylight" className="min-h-screen bg-background text-foreground">
        {children}
      </div>
    </>
  );
}
