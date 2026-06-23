"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "@/components/ui/icons";

export function SignContract({ token, contractId }: { token: string; contractId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true; hasDrawn.current = true;
    const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e);
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a";
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const up = () => { drawing.current = false; };
  const clear = () => {
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height); hasDrawn.current = false;
  };

  const submit = () => {
    setError(null);
    if (!name.trim()) return setError("Please enter your full name.");
    if (!consent) return setError("Please tick the box to agree.");
    let signature: string | undefined;
    if (mode === "drawn") {
      if (!hasDrawn.current) return setError("Please draw your signature.");
      signature = canvasRef.current!.toDataURL("image/png");
    }
    start(async () => {
      const res = await fetch(`/api/portal/${token}/contract/${contractId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), method: mode, signature, consent }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Could not sign. Please try again.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
        {(["typed", "drawn"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${mode === m ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>
            {m === "typed" ? "Type signature" : "Draw signature"}
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      </div>

      {mode === "typed" ? (
        name && (
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Signature preview</p>
            <p className="text-2xl italic" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>{name}</p>
          </div>
        )
      ) : (
        <div>
          <canvas ref={canvasRef} width={500} height={160}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            className="w-full rounded-lg border border-border bg-background touch-none cursor-crosshair" />
          <button onClick={clear} className="mt-1 text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>I agree to sign this contract electronically and that my electronic signature is legally binding.</span>
      </label>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <Button onClick={submit} disabled={pending} size="lg" className="w-full bg-emerald-600 hover:bg-emerald-700">
        {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
        Sign contract
      </Button>
    </div>
  );
}
