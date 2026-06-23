"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import Image from "next/image";

interface AppLoadingValue {
  /** Show a full-screen takeover with the Kirei logo + spinner and a label
   *  (e.g. while switching business). Pass null to dismiss. */
  setBusy: (label: string | null) => void;
  busy: string | null;
}

const AppLoadingCtx = createContext<AppLoadingValue>({ busy: null, setBusy: () => {} });

export function useAppLoading() {
  return useContext(AppLoadingCtx);
}

export function AppLoadingProvider({ children }: { children: ReactNode }) {
  const [busy, setBusyState] = useState<string | null>(null);
  const setBusy = useCallback((label: string | null) => setBusyState(label), []);

  return (
    <AppLoadingCtx.Provider value={{ busy, setBusy }}>
      {children}
      {busy && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-background"
          role="status"
          aria-live="polite"
        >
          {/* Kirei logo inside a spinning accent ring */}
          <div className="relative flex items-center justify-center w-24 h-24">
            <span className="absolute inset-0 rounded-full border-[3px] border-primary/15 border-t-primary animate-spin" />
            <Image
              src="/kirei-logo.png"
              alt="Kirei"
              width={56}
              height={56}
              priority
              className="object-contain"
            />
          </div>
          {busy && <span className="text-sm font-medium text-muted-foreground">{busy}</span>}
        </div>
      )}
    </AppLoadingCtx.Provider>
  );
}
