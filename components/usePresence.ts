"use client";

import { useCallback, useEffect, useState } from "react";

// C5 — this host console's own identity for co-facilitation presence. The
// presenceId is per-TAB (sessionStorage, so it survives a refresh but two tabs
// are two consoles) and the display name is per-DEVICE (localStorage, shared
// across this operator's rooms). Both are self-asserted labels only — never an
// account, never a capability (the server derives power from the passcode).
const ID_KEY = "edges_presence_id";
const NAME_KEY = "edges_host_name";

function makeId(): string {
  try {
    const c = globalThis.crypto as Crypto | undefined;
    if (c?.randomUUID) return c.randomUUID().slice(0, 8);
  } catch {
    /* fall through */
  }
  // Deterministic-enough fallback (Date.now is unavailable in some sandboxes but
  // present in the browser); only needs to be unique among open consoles.
  return `h${Date.now().toString(36)}${Math.floor(performance.now()).toString(36)}`;
}

export function usePresence(): {
  presenceId: string;
  name: string;
  setName: (n: string) => void;
} {
  const [presenceId, setPresenceId] = useState("");
  const [name, setNameState] = useState("");

  useEffect(() => {
    try {
      let id = sessionStorage.getItem(ID_KEY);
      if (!id) {
        id = makeId();
        sessionStorage.setItem(ID_KEY, id);
      }
      setPresenceId(id);
      setNameState(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      // private mode / no storage — fall back to an ephemeral in-memory id.
      setPresenceId((prev) => prev || makeId());
    }
  }, []);

  const setName = useCallback((n: string) => {
    const clean = n.slice(0, 40);
    setNameState(clean);
    try {
      localStorage.setItem(NAME_KEY, clean);
    } catch {
      /* ignore */
    }
  }, []);

  return { presenceId, name, setName };
}
