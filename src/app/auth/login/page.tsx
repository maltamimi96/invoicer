"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, UserCheck } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  const inviteEmail = searchParams.get("email") ?? "";
  const inviteBiz = searchParams.get("biz") ?? "";
  // Where to go after sign-in. Only same-origin relative paths are honoured
  // (must start with a single "/") so this can't be used as an open redirect.
  const nextParamRaw = searchParams.get("next") ?? "";
  const nextParam = /^\/(?!\/)/.test(nextParamRaw) ? nextParamRaw : "";

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

  const onSubmit = async (data: FormData) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (inviteBiz) {
      // Use full navigation so the Route Handler's redirect is followed correctly
      window.location.href = `/api/activate-invite?biz=${encodeURIComponent(inviteBiz)}`;
    } else if (nextParam) {
      // Return to the OAuth consent screen (or wherever sent us here). Full
      // navigation so any route-handler redirect at the destination is followed.
      window.location.href = nextParam;
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Invite banner for users who already have an account */}
      {inviteEmail && inviteBiz && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 border border-blue-200 mb-6">
          <UserCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-blue-800">You&apos;ve been invited to a team</p>
            <p className="text-xs text-blue-600">Sign in to get access to the shared workspace</p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground mt-1">Sign in to your Kirei account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            readOnly={!!inviteEmail}
            className={`${inviteEmail ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`}
            {...register("email")}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/auth/forgot-password" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              className="pr-10"
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
        {/* The app's Button, like every other form in the product — including
            the sibling forgot-password and reset-password pages. This was an
            AnimatedPress, which is an unstyled motion.div: it carried bg-primary
            but no radius, height or padding (note the double space where those
            classes had been removed), so the primary call to action rendered as
            a 20px-tall square-cornered strip. A div is also not focusable and
            isn't announced as a button, which is a poor thing for the one
            control on the sign-in page to be. */}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href={(() => {
            const qp = new URLSearchParams();
            if (inviteEmail) qp.set("email", inviteEmail);
            if (inviteBiz)   qp.set("biz", inviteBiz);
            const qs = qp.toString();
            return qs ? `/auth/register?${qs}` : "/auth/register";
          })()}
          className="text-foreground font-medium hover:underline">
          Sign up
        </Link>
      </p>
    </motion.div>
  );
}
