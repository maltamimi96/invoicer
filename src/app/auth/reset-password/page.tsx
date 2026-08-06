"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  password:        z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match", path: ["confirmPassword"],
});
type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [showPassword, setShowPassword] = useState(false);
  const [ready, setReady] = useState<"checking" | "ok" | "expired">("checking");

  // The auth callback already exchanged the code for a session before
  // bouncing here; if there isn't one, the link expired (or was already used).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setReady(data.session ? "ok" : "expired");
    });
  }, [supabase]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    const { error } = await supabase.auth.updateUser({ password: data.password });
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated — signing you in…");
    router.push("/dashboard");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Set a new password</h1>
        <p className="text-sm text-muted-foreground mt-1">Choose something you&apos;ll remember.</p>
      </div>

      {ready === "checking" && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Verifying link…
        </div>
      )}

      {ready === "expired" && (
        <div className="space-y-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive font-medium">This reset link has expired or was already used.</p>
          <Button onClick={() => router.push("/auth/forgot-password")} className="w-full">
            Send a new reset link
          </Button>
        </div>
      )}

      {ready === "ok" && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} className="pr-10" {...register("password")} />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Toggle password visibility">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" type={showPassword ? "text" : "password"} {...register("confirmPassword")} />
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Save new password"}
          </Button>
        </form>
      )}
    </motion.div>
  );
}
