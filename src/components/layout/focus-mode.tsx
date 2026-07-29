"use client";

import { createContext, useContext, useState } from "react";

/**
 * Focus mode — an ephemeral, opt-in "hide the nav and give the document the
 * whole screen" state used by the MYOB-style editors (a MYOB-like distraction-
 * free document view). Default OFF; not persisted, so leaving the editor
 * restores the normal layout. Lives at the shell so the sidebar can react to it.
 */
interface FocusModeValue {
  focus: boolean;
  setFocus: (v: boolean) => void;
  toggle: () => void;
}

const FocusModeContext = createContext<FocusModeValue>({
  focus: false,
  setFocus: () => {},
  toggle: () => {},
});

export function FocusModeProvider({ children }: { children: React.ReactNode }) {
  const [focus, setFocus] = useState(false);
  return (
    <FocusModeContext.Provider value={{ focus, setFocus, toggle: () => setFocus((f) => !f) }}>
      {children}
    </FocusModeContext.Provider>
  );
}

export function useFocusMode() {
  return useContext(FocusModeContext);
}
