import { Suspense } from "react";
import { KireiWordmark } from "@/components/brand/kirei-logo";
import { AuthErrorNotice } from "@/components/auth/auth-error-notice";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* Left panel — Kirei gradient hero */}
      <div
        className="hidden lg:flex flex-col text-white p-12 relative overflow-hidden"
        style={{
          backgroundImage: "linear-gradient(135deg, #1f4f4a 0%, #3a847e 45%, #7c3aed 100%)",
        }}
      >
        {/* Soft glows for depth */}
        <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl" aria-hidden />
        <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] rounded-full bg-violet-500/20 blur-3xl" aria-hidden />

        <div className="relative z-10 flex items-center mb-auto">
          <KireiWordmark className="h-9 w-auto" accentClassName="fill-[#F05A42]" />
        </div>

        <div className="relative z-10 space-y-6 max-w-md">
          <blockquote className="text-2xl font-light leading-relaxed text-white/95">
            &ldquo;Kirei keeps the whole job tidy — quotes, invoices, photos, payments. I stopped chasing paperwork and started chasing leads.&rdquo;
          </blockquote>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-sm font-semibold">
              JD
            </div>
            <div>
              <p className="font-semibold text-sm">James Davies</p>
              <p className="text-sm text-white/70">Roofing contractor</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="flex items-center mb-8 lg:hidden">
            <KireiWordmark className="h-8 w-auto text-foreground" />
          </div>
          {/* Suspense because useSearchParams opts the subtree into CSR — without
              it every statically-prerendered auth page fails the build. */}
          <Suspense fallback={null}>
            <AuthErrorNotice />
          </Suspense>
          {children}
        </div>
      </div>
    </div>
  );
}
