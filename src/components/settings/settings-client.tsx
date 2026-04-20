"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Upload, X, Building2, CreditCard, FileText, Palette, Check, Users, Key, Mail, Webhook } from "@/components/ui/icons";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Controller } from "react-hook-form";
import { updateBusiness, uploadLogo } from "@/lib/actions/business";
import { useAppearance, ACCENT_PRESETS, PATTERN_PRESETS, SIDEBAR_THEMES } from "@/components/layout/appearance-provider";
import { TeamSettings } from "@/components/settings/team-settings";
import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { EmailSettings } from "@/components/settings/email-settings";
import { WebhooksSettings } from "@/components/settings/webhooks-settings";
import type { Business, BusinessMember, BusinessApiKey, BusinessEmailConfig, BusinessWebhook } from "@/types/database";
import type { Role } from "@/lib/permissions";

const CURRENCIES = [
  { code: "GBP", label: "GBP — British Pound £" },
  { code: "USD", label: "USD — US Dollar $" },
  { code: "EUR", label: "EUR — Euro €" },
  { code: "CAD", label: "CAD — Canadian Dollar $" },
  { code: "AUD", label: "AUD — Australian Dollar $" },
  { code: "NZD", label: "NZD — New Zealand Dollar $" },
  { code: "CHF", label: "CHF — Swiss Franc Fr" },
  { code: "JPY", label: "JPY — Japanese Yen ¥" },
  { code: "SGD", label: "SGD — Singapore Dollar $" },
  { code: "HKD", label: "HKD — Hong Kong Dollar $" },
  { code: "NOK", label: "NOK — Norwegian Krone kr" },
  { code: "SEK", label: "SEK — Swedish Krona kr" },
  { code: "DKK", label: "DKK — Danish Krone kr" },
  { code: "AED", label: "AED — UAE Dirham د.إ" },
  { code: "ZAR", label: "ZAR — South African Rand R" },
  { code: "INR", label: "INR — Indian Rupee ₹" },
];

const PATTERN_PREVIEW: Record<string, React.CSSProperties> = {
  none: {},
  dots: {
    backgroundImage: "radial-gradient(circle, #94a3b8 1.5px, transparent 1.5px)",
    backgroundSize: "14px 14px",
  },
  grid: {
    backgroundImage:
      "linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)",
    backgroundSize: "14px 14px",
  },
  diagonal: {
    backgroundImage:
      "repeating-linear-gradient(45deg, transparent 0, transparent 8px, #cbd5e1 8px, #cbd5e1 9px)",
  },
  cross: {
    backgroundImage:
      "linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)",
    backgroundSize: "28px 28px",
  },
};

const businessSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  website: z.string().optional(),
  tax_number: z.string().optional(),
  currency: z.string().optional(),
});

const bankSchema = z.object({
  bank_name: z.string().optional(),
  bank_account_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_sort_code: z.string().optional(),
  bank_iban: z.string().optional(),
  payment_terms: z.string().optional(),
  default_notes: z.string().optional(),
});

const invoiceSchema = z.object({
  invoice_prefix: z.string().min(1, "Required"),
  invoice_next_number: z.coerce.number().min(1),
  quote_prefix: z.string().min(1, "Required"),
  quote_next_number: z.coerce.number().min(1),
});

type BusinessData = z.infer<typeof businessSchema>;
type BankData = z.infer<typeof bankSchema>;
type InvoiceData = z.infer<typeof invoiceSchema>;

interface SettingsClientProps {
  business: Business;
  members: BusinessMember[];
  apiKeys: Omit<BusinessApiKey, "key_hash">[];
  emailConfig: (Omit<BusinessEmailConfig, "imap_pass"> & { imap_pass_masked: string }) | null;
  webhooks: BusinessWebhook[];
  ownerEmail: string;
  userRole: Role;
}

export function SettingsClient({ business: initial, members, apiKeys, emailConfig, webhooks, ownerEmail, userRole }: SettingsClientProps) {
  const [business, setBusiness] = useState(initial);
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logo_url);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const { setAccentColor, setBgPattern, setSidebarTheme, accentColor, bgPattern, sidebarTheme } = useAppearance();

  const businessForm = useForm<BusinessData>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      name: business.name,
      email: business.email ?? "",
      phone: business.phone ?? "",
      address: business.address ?? "",
      city: business.city ?? "",
      postcode: business.postcode ?? "",
      country: business.country ?? "",
      website: business.website ?? "",
      tax_number: business.tax_number ?? "",
      currency: business.currency ?? "GBP",
    },
  });

  const bankForm = useForm<BankData>({
    resolver: zodResolver(bankSchema),
    defaultValues: {
      bank_name: business.bank_name ?? "",
      bank_account_name: business.bank_account_name ?? "",
      bank_account_number: business.bank_account_number ?? "",
      bank_sort_code: business.bank_sort_code ?? "",
      bank_iban: business.bank_iban ?? "",
      payment_terms: business.payment_terms ?? "",
      default_notes: business.default_notes ?? "",
    },
  });

  const invoiceForm = useForm<InvoiceData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_prefix: business.invoice_prefix,
      invoice_next_number: business.invoice_next_number,
      quote_prefix: business.quote_prefix,
      quote_next_number: business.quote_next_number,
    },
  });

  const handleSaveBusiness = async (data: BusinessData) => {
    try {
      const updated = await updateBusiness(data);
      setBusiness((prev) => ({ ...prev, ...updated }));
      toast.success("Business details saved");
    } catch { toast.error("Failed to save"); }
  };

  const handleSaveBank = async (data: BankData) => {
    try {
      const updated = await updateBusiness(data);
      setBusiness((prev) => ({ ...prev, ...updated }));
      toast.success("Payment details saved");
    } catch { toast.error("Failed to save"); }
  };

  const handleSaveInvoice = async (data: InvoiceData) => {
    try {
      const updated = await updateBusiness(data);
      setBusiness((prev) => ({ ...prev, ...updated }));
      toast.success("Invoice settings saved");
    } catch { toast.error("Failed to save"); }
  };

  const handleAccentChange = async (key: string) => {
    setAccentColor(key); // live preview
    try {
      await updateBusiness({ accent_color: key });
    } catch { toast.error("Failed to save"); }
  };

  const handlePatternChange = async (key: string) => {
    setBgPattern(key);
    try {
      await updateBusiness({ bg_pattern: key });
    } catch { toast.error("Failed to save"); }
  };

  const handleThemeChange = async (key: string) => {
    setSidebarTheme(key);
    try {
      await updateBusiness({ sidebar_theme: key });
    } catch { toast.error("Failed to save"); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const url = await uploadLogo(formData);
      setBusiness((prev) => ({ ...prev, logo_url: url }));
      toast.success("Logo uploaded");
    } catch { toast.error("Failed to upload logo"); }
    setUploadingLogo(false);
  };

  const removeLogo = async () => {
    try {
      await updateBusiness({ logo_url: null });
      setLogoPreview(null);
      setBusiness((prev) => ({ ...prev, logo_url: null }));
      toast.success("Logo removed");
    } catch { toast.error("Failed to remove logo"); }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your business profile and preferences</p>
      </motion.div>

      <Tabs defaultValue="business">
        <div className="-mx-4 sm:mx-0 overflow-x-auto sm:overflow-visible">
          <TabsList className="px-4 sm:px-0 inline-flex sm:flex w-max sm:w-auto whitespace-nowrap">
            <TabsTrigger value="business"   className="gap-1.5"><Building2 className="w-3.5 h-3.5" />Business</TabsTrigger>
            <TabsTrigger value="payment"    className="gap-1.5"><CreditCard className="w-3.5 h-3.5" />Payment</TabsTrigger>
            <TabsTrigger value="documents"  className="gap-1.5"><FileText className="w-3.5 h-3.5" />Documents</TabsTrigger>
            <TabsTrigger value="appearance" className="gap-1.5"><Palette className="w-3.5 h-3.5" />Appearance</TabsTrigger>
            <TabsTrigger value="team"       className="gap-1.5"><Users className="w-3.5 h-3.5" />Team</TabsTrigger>
            <TabsTrigger value="api"        className="gap-1.5"><Key className="w-3.5 h-3.5" />API</TabsTrigger>
            <TabsTrigger value="email"      className="gap-1.5"><Mail className="w-3.5 h-3.5" />Email</TabsTrigger>
            <TabsTrigger value="webhooks"   className="gap-1.5"><Webhook className="w-3.5 h-3.5" />Webhooks</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Business tab ── */}
        <TabsContent value="business" className="space-y-4 mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Logo</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/40 flex-shrink-0">
                {logoPreview ? (
                  <Image src={logoPreview} alt="Logo" width={96} height={96} className="object-contain w-full h-full" />
                ) : (
                  <Palette className="w-8 h-8 text-muted-foreground/40" />
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="logo-upload">
                  <Button type="button" variant="outline" size="sm" asChild disabled={uploadingLogo}>
                    <span>
                      {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                      {uploadingLogo ? "Uploading..." : "Upload logo"}
                    </span>
                  </Button>
                  <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                {logoPreview && (
                  <Button type="button" variant="ghost" size="sm" onClick={removeLogo}>
                    <X className="w-3.5 h-3.5 mr-1.5" />Remove
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">PNG, JPG or SVG, max 2MB. Will appear on PDFs and the sidebar.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Business Details</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={businessForm.handleSubmit(handleSaveBusiness)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Business name *</Label>
                  <Input {...businessForm.register("name")} />
                  {businessForm.formState.errors.name && (
                    <p className="text-xs text-destructive">{businessForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>Email</Label><Input type="email" {...businessForm.register("email")} /></div>
                  <div className="space-y-1.5"><Label>Phone</Label><Input {...businessForm.register("phone")} /></div>
                </div>
                <div className="space-y-1.5"><Label>Website</Label><Input placeholder="https://..." {...businessForm.register("website")} /></div>
                <div className="space-y-1.5"><Label>Address</Label><Input {...businessForm.register("address")} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5"><Label>City</Label><Input {...businessForm.register("city")} /></div>
                  <div className="space-y-1.5"><Label>Postcode</Label><Input {...businessForm.register("postcode")} /></div>
                  <div className="space-y-1.5"><Label>Country</Label><Input {...businessForm.register("country")} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>VAT / Tax number</Label><Input {...businessForm.register("tax_number")} /></div>
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    <Controller
                      control={businessForm.control}
                      name="currency"
                      render={({ field }) => (
                        <Select value={field.value ?? "GBP"} onValueChange={field.onChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((c) => (
                              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <Separator />
                <Button type="submit" disabled={businessForm.formState.isSubmitting}>
                  {businessForm.formState.isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payment tab ── */}
        <TabsContent value="payment" className="space-y-4 mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Bank & Payment Details</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={bankForm.handleSubmit(handleSaveBank)} className="space-y-4">
                <div className="space-y-1.5"><Label>Bank name</Label><Input {...bankForm.register("bank_name")} /></div>
                <div className="space-y-1.5"><Label>Account name</Label><Input {...bankForm.register("bank_account_name")} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>Account number</Label><Input {...bankForm.register("bank_account_number")} /></div>
                  <div className="space-y-1.5"><Label>Sort code</Label><Input {...bankForm.register("bank_sort_code")} /></div>
                </div>
                <div className="space-y-1.5"><Label>IBAN</Label><Input {...bankForm.register("bank_iban")} /></div>
                <Separator />
                <div className="space-y-1.5"><Label>Default payment terms</Label><Textarea rows={2} {...bankForm.register("payment_terms")} /></div>
                <div className="space-y-1.5"><Label>Default notes to client</Label><Textarea rows={2} {...bankForm.register("default_notes")} /></div>
                <Button type="submit" disabled={bankForm.formState.isSubmitting}>
                  {bankForm.formState.isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Documents tab ── */}
        <TabsContent value="documents" className="space-y-4 mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Invoice & Quote Numbering</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={invoiceForm.handleSubmit(handleSaveInvoice)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Invoice prefix</Label>
                    <Input placeholder="INV" {...invoiceForm.register("invoice_prefix")} />
                    <p className="text-xs text-muted-foreground">e.g. INV → INV-0001</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Next invoice number</Label>
                    <Input type="number" min="1" {...invoiceForm.register("invoice_next_number")} />
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Quote prefix</Label>
                    <Input placeholder="QUO" {...invoiceForm.register("quote_prefix")} />
                    <p className="text-xs text-muted-foreground">e.g. QUO → QUO-0001</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Next quote number</Label>
                    <Input type="number" min="1" {...invoiceForm.register("quote_next_number")} />
                  </div>
                </div>
                <Button type="submit" disabled={invoiceForm.formState.isSubmitting}>
                  {invoiceForm.formState.isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Appearance tab ── */}
        <TabsContent value="appearance" className="space-y-4 mt-6">

          {/* Sidebar theme */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sidebar Theme</CardTitle>
              <p className="text-xs text-muted-foreground">Changes the sidebar colour scheme. Updates live instantly.</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {SIDEBAR_THEMES.map((theme) => {
                  const active = sidebarTheme === theme.key;
                  return (
                    <motion.button
                      key={theme.key}
                      type="button"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleThemeChange(theme.key)}
                      className="flex flex-col items-center gap-1.5 group"
                    >
                      {/* Mini app preview */}
                      <span className={`w-full aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all duration-200 shadow-sm flex ${
                        active ? "border-primary shadow-md shadow-primary/25" : "border-border group-hover:border-muted-foreground/40"
                      }`}>
                        {/* Sidebar strip */}
                        <span
                          className="w-[32%] h-full flex flex-col gap-1 p-1.5 flex-shrink-0"
                          style={{ backgroundColor: theme.sidebarBg }}
                        >
                          {/* Logo dot */}
                          <span className="w-4 h-4 rounded-md flex-shrink-0" style={{ backgroundColor: theme.dot, opacity: 0.9 }} />
                          {/* Nav lines */}
                          {[1,0.5,0.5,0.5].map((o, i) => (
                            <span key={i} className="h-1 rounded-full" style={{ backgroundColor: theme.sidebarFg, opacity: o * 0.5, width: i === 0 ? "80%" : "60%" }} />
                          ))}
                        </span>
                        {/* Content area */}
                        <span className="flex-1 h-full bg-background flex flex-col gap-1 p-1.5">
                          <span className="h-1.5 w-3/4 rounded-full bg-foreground/10" />
                          <span className="h-1 w-1/2 rounded-full bg-foreground/8" />
                          <span className="flex-1 rounded-md mt-0.5" style={{ backgroundColor: theme.dot, opacity: 0.12 }} />
                        </span>
                      </span>
                      <span className={`text-[10px] transition-colors ${active ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                        {theme.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Accent colour */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Accent Colour</CardTitle>
              <p className="text-xs text-muted-foreground">Highlights, buttons and active states across the app.</p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {ACCENT_PRESETS.map((preset) => (
                  <motion.button
                    key={preset.key}
                    type="button"
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleAccentChange(preset.key)}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-shadow duration-200 hover:shadow-lg"
                      style={{ backgroundColor: preset.hex }}
                    >
                      {accentColor === preset.key && (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
                          <Check className="w-4 h-4 text-white drop-shadow" />
                        </motion.span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{preset.label}</span>
                  </motion.button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Background pattern */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Background Pattern</CardTitle>
              <p className="text-xs text-muted-foreground">Subtle texture on the main content area.</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-3 sm:flex sm:flex-wrap">
                {PATTERN_PRESETS.map((pattern) => (
                  <motion.button
                    key={pattern.key}
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handlePatternChange(pattern.key)}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span
                      className={`w-full sm:w-16 h-12 rounded-xl border-2 flex items-center justify-center transition-all duration-200 overflow-hidden ${
                        bgPattern === pattern.key
                          ? "border-primary shadow-md shadow-primary/20"
                          : "border-border hover:border-muted-foreground/40"
                      }`}
                      style={{ backgroundColor: "hsl(var(--background))", ...PATTERN_PREVIEW[pattern.key] }}
                    >
                      {bgPattern === pattern.key && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 25 }}
                          className="bg-primary/90 rounded-full p-0.5"
                        >
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </motion.span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{pattern.label}</span>
                  </motion.button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Team tab ── */}
        <TabsContent value="team" className="mt-6">
          <TeamSettings
            members={members}
            ownerEmail={ownerEmail}
            userRole={userRole}
          />
        </TabsContent>

        {/* ── API tab ── */}
        <TabsContent value="api" className="mt-6">
          <ApiKeysSettings apiKeys={apiKeys} />
        </TabsContent>

        {/* ── Email tab ── */}
        <TabsContent value="email" className="mt-6">
          <EmailSettings config={emailConfig} />
        </TabsContent>

        {/* ── Webhooks tab ── */}
        <TabsContent value="webhooks" className="mt-6">
          <WebhooksSettings webhooks={webhooks} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
