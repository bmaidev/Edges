"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { A11yTray } from "@/components/A11yTray";
import {
  DEFAULT_PREFS,
  loadPrefs,
  savePrefs,
  type A11yPrefs,
} from "@/lib/a11y/prefs";

type Ctx = { prefs: A11yPrefs; update: (p: Partial<A11yPrefs>) => void };
const A11yContext = createContext<Ctx | null>(null);
export const useA11y = () => useContext(A11yContext);

// D2 — is colour-safe / high-contrast mode on? Drives the `.a11y-pattern` texture
// + non-colour markers in result bars. Defaults false where there's no provider
// (e.g. the projector), where the host AA toggle handles it separately.
export const useColourSafe = (): boolean => useContext(A11yContext)?.prefs.contrast ?? false;

// D2 — applies the participant's accessibility prefs to the document (one root
// scale var + a few body classes) and renders the floating "Aa" control. Wrap a
// participant/projector tree in this; it cleans the document classes on unmount,
// so admin/builder trees are never affected.
export function A11yProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT_PREFS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const b = document.body;
    b.classList.toggle("a11y-contrast", prefs.contrast);
    b.classList.toggle("a11y-readable", prefs.readable);
    b.classList.toggle("a11y-reduce-motion", prefs.reduceMotion);
    document.documentElement.style.setProperty("--a11y-scale", String(prefs.scale));
    savePrefs(prefs);
  }, [prefs, mounted]);

  // Strip the document-level effects when this tree unmounts.
  useEffect(
    () => () => {
      document.body.classList.remove(
        "a11y-contrast",
        "a11y-readable",
        "a11y-reduce-motion",
      );
      document.documentElement.style.removeProperty("--a11y-scale");
    },
    [],
  );

  const update = (p: Partial<A11yPrefs>) =>
    setPrefs((cur) => ({ ...cur, ...p }));

  return (
    <A11yContext.Provider value={{ prefs, update }}>
      {children}
      <A11yTray prefs={prefs} update={update} />
    </A11yContext.Provider>
  );
}
