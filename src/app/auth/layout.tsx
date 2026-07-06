import Image from "next/image";

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
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mr-3">
            <Image src="/kirei-logo.png" alt="Kirei" width={42} height={42} className="object-contain" priority />
          </div>
          <span className="text-2xl font-semibold tracking-tight">Kirei</span>
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
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
              style={{ backgroundImage: "linear-gradient(135deg, #3a847e, #1f4f4a)" }}
            >
              <Image src="/kirei-logo.png" alt="Kirei" width={36} height={36} className="object-contain" priority />
            </div>
            <span className="text-xl font-semibold tracking-tight">Kirei</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
