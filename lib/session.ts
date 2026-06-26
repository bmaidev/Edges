// Single-session configuration, read from env so reuse next month is a one-liner.

export const SESSION_ID = process.env.SESSION_ID || "edges";

export const SESSION_TOPIC =
  process.env.SESSION_TOPIC || "Teaming and organisational change";

export const TTL_SECONDS = 86_400; // 24h auto-wipe on every key.

// AI clustering is opt-in: invisible unless an API key is present.
export function clusterAssistAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// The default room id keeps the single-deploy app working unchanged: every
// store call defaults to roomId = SESSION_ID. Multi-room simply passes a real
// roomId through instead.
export const DEFAULT_ROOM_ID = SESSION_ID;

export interface RoomKeys {
  state: string;
  participants: string;
  submissions: string;
  content: string;
  patterns: string;
  passcodes: string;
  votes: string; // one hash for the whole room; field = `${phaseId}::${token}`
  words: string; // one list for the whole room; entries carry phaseId
  seen: string; // C2 liveness heartbeat hash; field = <token> -> epoch-ms
}

// Room-scoped key factory. `room:{roomId}:…` namespaces every key per room.
// The hash/list suffixes stay distinct so atomic ops never collide with a
// leftover plain-JSON value at an old key name.
export function roomKeys(roomId: string = DEFAULT_ROOM_ID): RoomKeys {
  const base = `room:${roomId}`;
  return {
    state: `${base}:state`,
    participants: `${base}:participants:hash`,
    submissions: `${base}:submissions:list`,
    content: `${base}:content`,
    patterns: `${base}:patterns`,
    passcodes: `${base}:passcodes:hash`,
    votes: `${base}:votes:hash`,
    words: `${base}:words:list`,
    seen: `${base}:seen`,
  };
}
