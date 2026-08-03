// Expiring browser persistence for crash/offline recovery. Participant-authored
// text and bearer tokens must never outlive the server-side 24-hour contract.

export const CLIENT_RETENTION_MS = 24 * 60 * 60 * 1000;

interface Envelope<T> {
  version: 1;
  expiresAt: number;
  value: T;
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function setExpiring<T>(
  key: string,
  value: T,
  ttlMs: number = CLIENT_RETENTION_MS,
  now: number = Date.now(),
): void {
  const storage = browserStorage();
  if (!storage) return;
  const envelope: Envelope<T> = {
    version: 1,
    expiresAt: now + Math.max(0, ttlMs),
    value,
  };
  try {
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Private mode/quota failure: recovery is best-effort.
  }
}

export function getExpiring<T>(
  key: string,
  now: number = Date.now(),
): T | null {
  const storage = browserStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Envelope<T>>;
    if (
      parsed.version !== 1 ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now ||
      !("value" in parsed)
    ) {
      // Legacy unbounded values and expired envelopes are deliberately removed.
      storage.removeItem(key);
      return null;
    }
    return parsed.value as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function removeStored(key: string): void {
  try {
    browserStorage()?.removeItem(key);
  } catch {
    // Best-effort cleanup.
  }
}

export function clearParticipantSession(apiBase: string, token?: string): void {
  const storage = browserStorage();
  if (!storage) return;
  const exact = new Set([
    `edges_handle:${apiBase}`,
    `edges_token:${apiBase}`,
    `edges_queue:${apiBase}`,
  ]);
  const draftPrefix = token ? `edges_draft:${token}:` : null;
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && (exact.has(key) || (draftPrefix && key.startsWith(draftPrefix)))) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Best-effort cleanup.
  }
}
