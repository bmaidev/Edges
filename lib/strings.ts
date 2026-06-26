// Platform-generic fallback copy. Room-specific framing comes from the room's
// topic + branding (headline/tagline) — see ParticipantApp / ProjectorApp.

export const STRINGS = {
  title: "Join the room",
  subtitle: "A live workshop companion",

  joinBody:
    "This companion helps the room surface what it's thinking, in real time. You'll write or dictate short notes during the session. The facilitators see raw notes; the room sees only patterns or aggregates. Each phase shows whether your response is named or facilitators-only.",

  lobby: "We'll begin shortly.",

  privacyLine:
    "No account needed. The facilitators see your raw notes; other participants never do. Pick a handle or stay anonymous. After the session a handle-free recap is available for 24 hours, then all data is deleted.",

  faceToFace: "Now talk face-to-face. The app waits.",

  // Fallback end screen when no recap was published. (A published session shows
  // the keepable recap instead — see TakeawayScreen.)
  ended: "Session closed. Thanks for being here.",
};
