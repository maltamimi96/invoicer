"use client";

import { createContext, useContext, useState } from "react";

/**
 * Shared open-state for the floating AI assistant panel, so a button in the
 * top bar (or anywhere in the shell) can open it — instead of only the panel's
 * own floating trigger.
 */
interface AssistantValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const AssistantContext = createContext<AssistantValue>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
});

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AssistantContext.Provider value={{ open, setOpen, toggle: () => setOpen((o) => !o) }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  return useContext(AssistantContext);
}
