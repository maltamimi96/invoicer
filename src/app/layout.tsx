import type { Metadata, Viewport } from "next";

// Note: deliberately NOT setting `export const dynamic = "force-dynamic"` here.
// Auth pages, dashboard, etc. become dynamic automatically via cookies()/headers()
// inside their server components. Forcing it globally killed static/PPR caching
// on every route (marketing, auth shells, etc.).

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
};
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PWARegister } from "@/components/pwa-register";
import { IconProvider } from "@/components/ui/icon-provider";

// One typeface across the app. Plus Jakarta is a variable font (weights
// 200–800), so both the UI stack (--font-sans) and the heavier display stack
// (--font-display) resolve to it — the display face just leans on the top of
// the weight range instead of a separate serif.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
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
      <body className={`${jakarta.variable} font-sans antialiased`} suppressHydrationWarning>
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
