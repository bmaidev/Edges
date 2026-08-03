// Platform-generic fallback copy. Room-specific framing comes from the room's
// topic + branding (headline/tagline) — see ParticipantApp / ProjectorApp.

export const STRINGS = {
  title: "Join the room",
  subtitle: "A live workshop companion",

  joinBody:
    "This companion helps the room surface what it's thinking, in real time. You'll write or dictate short notes during the session. Each phase explains whether notes stay with facilitators or are intentionally shared, rotated, or aggregated. Facilitator-triggered AI features may send relevant notes to Anthropic for synthesis.",

  lobby: "We'll begin shortly.",

  privacyLine:
    "No account needed. Pick a handle or stay anonymous. Live notes and browser drafts expire within 24 hours and are erased on End. A handle-free synthesis and agreed action items may remain in the facilitator's workspace; raw responses do not.",

  faceToFace: "Now talk face-to-face. The app waits.",

  // Fallback end screen when no recap was published. (A published session shows
  // the keepable recap instead — see TakeawayScreen.)
  ended: "Session closed. Thanks for being here.",
};
