"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Building2, CreditCard, CheckCircle, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";

const steps = [
  { id: 1, title: "Business Details", icon: Building2 },
  { id: 2, title: "Payment Info", icon: CreditCard },
  { id: 3, title: "All done!", icon: CheckCircle },
];

const step1Schema = z.object({
  name: z.string().min(1, "Business name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  tax_number: z.string().optional(),
});

const step2Schema = z.object({
  bank_name: z.string().optional(),
  bank_account_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_sort_code: z.string().optional(),
  bank_iban: z.string().optional(),
  payment_terms: z.string().optional(),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema), defaultValues: { payment_terms: "Payment due within 30 days of invoice date." } });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleStep1 = (data: Step1Data) => {
    setStep1Data(data);
    setStep(2);
  };

  const handleStep2 = async (data: Step2Data) => {
    if (!step1Data) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let logo_url: string | null = null;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `${user.id}/logo.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("logos")
          .upload(path, logoFile, { upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
          logo_url = urlData.publicUrl;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("businesses") as any).upsert({
        user_id: user.id,
        ...step1Data,
        ...data,
        logo_url,
      });

      if (error) throw error;
      setStep(3);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (typeof err === "object" && err !== null && "message" in err ? String((err as Record<string, unknown>).message) : JSON.stringify(err));
      toast.error(msg || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const slideVariants = {
    enter: { opacity: 0, x: 40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Progress steps */}
        <div className="flex items-center justify-center gap-3 mb-10">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${step >= s.id ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}`}>
                <s.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{s.title}</span>
              </div>
              {i < steps.length - 1 && <div className={`h-px w-8 transition-colors duration-300 ${step > s.id ? "bg-blue-500" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
              <div className="mb-6">
                <h1 className="text-2xl font-bold">Your business details</h1>
                <p className="text-sm text-muted-foreground mt-1">This will appear on your invoices and quotes</p>
              </div>

              {/* Logo upload */}
              <div className="mb-6">
                <Label>Logo (optional)</Label>
                <div className="mt-2 flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/40">
                    {logoPreview ? (
                      <Image src={logoPreview} alt="Logo preview" width={80} height={80} className="object-contain w-full h-full" />
                    ) : (
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="logo-upload" className="cursor-pointer">
                      <Button type="button" variant="outline" size="sm" asChild>
                        <span><Upload className="w-3.5 h-3.5 mr-1.5" />Upload logo</span>
                      </Button>
                      <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                    </label>
                    {logoPreview && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setLogoFile(null); setLogoPreview(null); }}>
                        <X className="w-3.5 h-3.5 mr-1.5" />Remove
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">PNG, JPG or SVG, max 2MB</p>
                  </div>
                </div>
              </div>

              <form onSubmit={form1.handleSubmit(handleStep1)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Business / Trading name *</Label>
                  <Input placeholder="Acme Ltd" {...form1.register("name")} />
                  {form1.formState.errors.name && <p className="text-xs text-destructive">{form1.formState.errors.name.message}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" placeholder="info@acme.com" {...form1.register("email")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input placeholder="+44 7700 000000" {...form1.register("phone")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input placeholder="123 High Street" {...form1.register("address")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="col-span-1 space-y-1.5">
                    <Label>City</Label>
                    <Input placeholder="London" {...form1.register("city")} />
                  </div>
                  <div className="col-span-1 space-y-1.5">
                    <Label>Postcode</Label>
                    <Input placeholder="SW1A 1AA" {...form1.register("postcode")} />
                  </div>
                  <div className="col-span-1 space-y-1.5">
                    <Label>Country</Label>
                    <Input placeholder="United Kingdom" {...form1.register("country")} defaultValue="United Kingdom" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>VAT / Tax number</Label>
                  <Input placeholder="GB123456789" {...form1.register("tax_number")} />
                </div>
                <Button type="submit" className="w-full mt-2">Continue</Button>
              </form>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
              <div className="mb-6">
                <h1 className="text-2xl font-bold">Payment information</h1>
                <p className="text-sm text-muted-foreground mt-1">Shown on invoices to help clients pay you</p>
              </div>
              <form onSubmit={form2.handleSubmit(handleStep2)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Bank name</Label>
                  <Input placeholder="Barclays" {...form2.register("bank_name")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Account name</Label>
                  <Input placeholder="Acme Ltd" {...form2.register("bank_account_name")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Account number</Label>
                    <Input placeholder="12345678" {...form2.register("bank_account_number")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sort code</Label>
                    <Input placeholder="00-00-00" {...form2.register("bank_sort_code")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>IBAN (optional)</Label>
                  <Input placeholder="GB29NWBK60161331926819" {...form2.register("bank_iban")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Default payment terms</Label>
                  <Input {...form2.register("payment_terms")} />
                </div>
                <div className="flex gap-3 mt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                  <Button type="submit" className="flex-1" disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Finish setup
                  </Button>
                </div>
              </form>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="text-center py-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15 }} className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
              </motion.div>
              <h1 className="text-2xl font-bold mb-2">You&apos;re all set!</h1>
              <p className="text-muted-foreground mb-8">Your workspace is ready. Start creating professional invoices right away.</p>
              <Button className="w-full" size="lg" onClick={() => router.push("/dashboard")}>
                Go to dashboard
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
