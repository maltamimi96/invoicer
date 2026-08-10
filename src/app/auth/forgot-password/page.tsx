"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

const schema = z.object({ email: z.string().email("Enter a valid email") });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const supabase = createClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    // Come back to the ORIGIN THEY ARE ON, not NEXT_PUBLIC_APP_URL.
    //
    // Two reasons. The PKCE code verifier is stored per-origin, so the
    // exchange only works on the host that started it. And APP_URL is the
    // marketing apex, so every reset link took a kireihq.com → www → app
    // detour before arriving anywhere useful.
    //
    // ⚠️ Whatever origin this resolves to must be in Supabase's redirect
    // allow-list (Auth → URL Configuration) or Supabase ignores it and falls
    // back to the Site URL.
    const origin = typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "");
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
    });
    if (error) { toast.error(error.message); return; }
    setSent(true);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      {sent ? (
        <div className="text-center space-y-4">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto shadow-sm text-white"
            style={{ backgroundImage: "linear-gradient(135deg, #34d399, #047857)" }}
          >
            <span className="text-2xl">✉️</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Check your email</h1>
          <p className="text-sm text-muted-foreground">We sent a password reset link to your email address.</p>
          <Link href="/auth/login">
            <Button variant="outline" className="w-full">Back to sign in</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Reset password</h1>
            <p className="text-sm text-muted-foreground mt-1">We&apos;ll email you a reset link</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send reset link
            </Button>
          </form>
          <Link href="/auth/login" className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-6">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </>
      )}
    </motion.div>
  );
}
