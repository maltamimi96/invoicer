import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col bg-zinc-900 dark:bg-zinc-950 text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-indigo-600/20" />
        <div className="relative z-10 flex items-center gap-3 mb-auto">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Invoicer</span>
        </div>
        <div className="relative z-10 space-y-6">
          <blockquote className="text-2xl font-light leading-relaxed text-zinc-100">
            "The cleanest invoicing tool I've ever used. My clients pay faster and I look more professional."
          </blockquote>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium">
              JD
            </div>
            <div>
              <p className="font-medium text-sm">James Davies</p>
              <p className="text-sm text-zinc-400">Freelance Designer</p>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
      </div>
      {/* Right panel */}
      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold">Invoicer</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
