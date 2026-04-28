import type { Metadata, Viewport } from "next";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
};
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PWARegister } from "@/components/pwa-register";
import { IconProvider } from "@/components/ui/icon-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Invoicer — Crown Roofers",
  description: "Invoices, quotes, leads and work orders for Crown Roofers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Invoicer",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: "/icons/icon-192.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="console" suppressHydrationWarning>
      <body className={`${inter.variable} ${newsreader.variable} font-sans antialiased`} suppressHydrationWarning>
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
