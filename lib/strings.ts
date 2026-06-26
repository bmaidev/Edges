// Platform-generic fallback copy. Room-specific framing comes from the room's
// topic + branding (headline/tagline) — see ParticipantApp / ProjectorApp.

export const STRINGS = {
  title: "Join the room",
  subtitle: "A live workshop companion",

  joinBody:
    "This companion helps the room surface what it's thinking, in real time. You'll write or dictate short notes during the session. The facilitators see raw notes; everyone else sees only the patterns or aggregates. Nothing is kept beyond the session.",

  lobby: "We'll begin shortly.",

  privacyLine:
    "Nothing here is recorded beyond this session. Your raw notes are seen only by the facilitators, never other participants. Your handle is whatever you like — or stay anonymous. All data is deleted when the session ends.",

  faceToFace: "Now talk face-to-face. The app waits.",

  // Fallback end screen when no recap was published. (A published session shows
  // the keepable recap instead — see TakeawayScreen.)
  ended: "Session closed. Thanks for being here.",
};
