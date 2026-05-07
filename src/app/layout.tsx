import type { Metadata, Viewport } from "next";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
};
import { Geist, Fraunces } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PWARegister } from "@/components/pwa-register";
import { IconProvider } from "@/components/ui/icon-provider";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  title: "Kirei — Tidy your trade business",
  description: "Quotes, invoices, leads, jobs and reports — clean, organised, and AI-assisted. Built for tradies.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kirei",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon:  "/kirei-logo.png",
    apple: "/kirei-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="console" suppressHydrationWarning>
      <body className={`${geist.variable} ${fraunces.variable} font-sans antialiased`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <IconProvider>
            {children}
            <Toaster richColors position="top-right" />
            <PWARegister />
          </IconProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
