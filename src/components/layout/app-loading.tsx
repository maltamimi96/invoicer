"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { Loader2 } from "@/components/ui/icons";

interface AppLoadingValue {
  /** Show a full-screen scrim with a spinner + label (e.g. while switching business). */
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
          className="fixed inset-0 z-[90] flex items-center justify-center bg-background/70 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-card border border-border shadow-lg">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm font-medium">{busy}</span>
          </div>
        </div>
      )}
    </AppLoadingCtx.Provider>
  );
}
