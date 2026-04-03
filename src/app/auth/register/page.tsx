"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const inviteEmail = searchParams.get("email") ?? "";
  const inviteBiz = searchParams.get("biz") ?? "";
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (inviteEmail) setValue("email", inviteEmail);
  }, [inviteEmail, setValue]);

  const redirectAfterAuth = () => {
    if (inviteBiz) {
      // Use full navigation so the Route Handler's redirect is followed correctly
      window.location.href = `/api/activate-invite?biz=${encodeURIComponent(inviteBiz)}`;
    } else {
      router.push("/dashboard");
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      // Create the user via server-side admin API — no confirmation email, no rate limits.
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password, full_name: data.name }),
      });

      let json: { error?: string; ok?: boolean } = {};
      try {
        json = await res.json();
      } catch {
        // Response wasn't JSON (e.g. Next.js HTML error page)
        toast.error(`Server error (${res.status}) — make sure SUPABASE_SERVICE_ROLE_KEY is set in .env.local and the dev server was restarted`);
        return;
      }

      if (!res.ok) {
        const msg: string = json.error ?? "Failed to create account";
        // User already exists — guide them to sign in instead
        if (
          msg.toLowerCase().includes("already registered") ||
          msg.toLowerCase().includes("already exists") ||
          msg.toLowerCase().includes("user already")
        ) {
          toast.error("You already have an account — sign in instead", {
            action: {
              label: "Sign in",
              onClick: () => {
                const params = new URLSearchParams();
                if (inviteEmail) params.set("email", inviteEmail);
                if (inviteBiz) params.set("biz", inviteBiz);
                router.push(`/auth/login?${params.toString()}`);
              },
            },
          });
        } else {
          toast.error(msg);
        }
        return;
      }

      // Sign in immediately (account is already confirmed)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInError) {
        toast.error(signInError.message);
        return;
      }

      toast.success("Account created! Loading your workspace...");
      redirectAfterAuth();
    } catch (err) {
      console.error("Register error:", err);
      toast.error("Something went wrong — check the browser console for details");
    }
  };

  // Build the sign-in link preserving invite params
  const signInHref = (() => {
    const params = new URLSearchParams();
    if (inviteEmail) params.set("email", inviteEmail);
    if (inviteBiz) params.set("biz", inviteBiz);
    const qs = params.toString();
    return `/auth/login${qs ? `?${qs}` : ""}`;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Invite banner */}
      {inviteEmail && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 border border-blue-200 mb-6">
          <UserCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-blue-800">You&apos;ve been invited to a team</p>
            <p className="text-xs text-blue-600 truncate">
              Register with <span className="font-semibold">{inviteEmail}</span> to get access
            </p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {inviteEmail ? "Set a password to join your team" : "Start invoicing professionally today"}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" placeholder="John Smith" {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            readOnly={!!inviteEmail}
            className={inviteEmail ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}
            {...register("email")}
          />
          {inviteEmail && <p className="text-xs text-muted-foreground">Use this email — it&apos;s the one your team owner added</p>}
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 characters"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {inviteEmail ? "Join team" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Already have an account?{" "}
        <Link href={signInHref} className="text-foreground font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </motion.div>
  );
}
