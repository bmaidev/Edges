# Edges — Backlog Specs (A → H)

Executable build specs for every improvement in the "most sought-after facilitation app" backlog, derived from a non-technical master facilitator's first-run experience.

Each spec was produced by a 4-stage pipeline — **design → architecture → adversarial pressure-test → synthesis** — and the pressure-test fixes are *folded into* each spec, so they are ready to execute, not just sketches. Every spec is grounded in the real architecture (the module contract, the `rev`/authoritative-apply state model with **no KV read-back**, the account-less off-the-record privacy ethos, Vitest/CI).

**Totals:** 37 specs · **≈197 dev-days** · 14×P0 (68.5d), 16×P1 (87d), 7×P2 (42d).

Each spec follows the same shape: _Problem & facilitator value · MVP cut vs Full vision · Experience & flows · Architecture (exact files / data model / API+host-commands / capability gating) · Implementation plan · Acceptance criteria · Test plan · Privacy & ethos check · Risks & mitigations · Out of scope._

---

## Index

### A. First-run & access — *stop making smart people feel dumb* (21.5d)
| ID | Improvement | Pri | Days | Depends on |
|----|-------------|-----|------|------------|
| [A1](A1-create-workshop-wizard.md) | Create-a-workshop wizard (unify room + session + brand + share) | P0 | 6 | — |
| [A2](A2-named-roles-magic-links.md) | Named roles + magic links (replace raw passcodes; fixes admin-vs-facilitator footgun) | P0 | 4 | — |
| [A3](A3-tutorial-and-sample-room.md) | 5-min tutorial + pre-loaded sample workshop room | P0 | 6.5 | — |
| [A4](A4-memorable-room-urls.md) | Memorable, editable room names & URLs | P1 | 2 | — |
| [A5](A5-my-workshops-duplicate-room.md) | "My workshops" view + duplicate-a-room | P1 | 3 | — |

### B. Session design — *think like a facilitator, not a database* (33d)
| ID | Improvement | Pri | Days | Depends on |
|----|-------------|-----|------|------------|
| [B1](B1-agenda-arc-timeline.md) | Agenda/timeline view with per-phase timings + energy curve | P0 | 3 | — |
| [B2](B2-room-preview-in-builder.md) | Per-module "what the room sees" live preview in builder | P0 | 7 | — |
| [B3](B3-facilitator-runsheet.md) | Facilitator notes / run-sheet per phase (printable) | P0 | 5.5 | — |
| [B4](B4-save-session-as-template.md) | Save custom session as reusable template + share/import | P1 | 4 | — |
| [B5](B5-rehearsal-dry-run.md) | Rehearsal / dry-run mode | P1 | 4 | — |
| [B6](B6-plain-language-module-cards.md) | Plain-language module cards + dependency explainer | P1 | 3.5 | B1, B2, A1 |
| [B7](B7-ai-design-partner-transform.md) | AI design partner (transform an existing session) | P2 | 6 | — |

### C. Running live — *the cockpit* (30d)
| ID | Improvement | Pri | Days | Depends on |
|----|-------------|-----|------|------------|
| [C1](C1-facilitate-mode-cockpit.md) | "Facilitate" mode — one-screen live cockpit | P0 | 4.5 | — |
| [C2](C2-live-participation-signals.md) | Live participation signals on every gather phase | P0 | 5 | — |
| [C3](C3-calm-recovery-controls.md) | Calm recovery controls (re-poll / reset / skip / back / undo) | P0 | 4.5 | — |
| [C4](C4-spotlight-response-to-projector.md) | Spotlight a participant response to the projector | P1 | 2.5 | — |
| [C5](C5-co-facilitation-presence-driving.md) | Real co-facilitation (presence + who-is-driving) | P1 | 4.5 | — |
| [C6](C6-room-felt-timer.md) | Room-felt timer (synced countdown, chime, "2 min left") | P1 | 3 | — |
| [C7](C7-ai-cofacilitator-nudges.md) | AI co-facilitator — live nudges | P2 | 6 | — |

### D. Participant experience — *inclusion is the brand* (22d)
| ID | Improvement | Pri | Days | Depends on |
|----|-------------|-----|------|------------|
| [D1](D1-join-instructions-anonymity.md) | Dead-simple join + per-phase instructions + anonymity clarity | P0 | 3 | — |
| [D2](D2-accessibility-pillar.md) | Accessibility pillar (text size, dyslexia/colour-blind-safe, screen reader, WCAG AA) | P0 | 6 | — |
| [D3](D3-live-i18n.md) | Live multi-language / i18n (translate prompts + submissions) | P1 | 7 | — |
| [D4](D4-graceful-reconnect-latecomer-join.md) | Graceful reconnect + latecomer join mid-session | P1 | 6 | — |

### E. Front-of-room (projector) — *make the facilitator look like a pro* (11.5d)
| ID | Improvement | Pri | Days | Depends on |
|----|-------------|-----|------|------------|
| [E1](E1-stunning-join-lobby.md) | Stunning "join" lobby screen (QR, room name, live count, logo) | P0 | 2.5 | — |
| [E2](E2-presenter-polish.md) | Presenter polish (transitions, fullscreen, now/next ribbon) | P1 | 3.5 | — |
| [E3](E3-ambient-calm-room-states.md) | Ambient / calm room states between activities | P2 | 5.5 | — |

### F. Outcomes & deliverables — *what gets you re-hired* (21d)
| ID | Improvement | Pri | Days | Depends on |
|----|-------------|-----|------|------------|
| [F1](F1-client-ready-report-exports.md) | One-tap client-ready report + exports (PDF/Notion/Miro/Doc) | P0 | 6 | — |
| [F2](F2-action-items.md) | Action items with owners + due dates | P1 | 5 | — |
| [F3](F3-send-the-room-a-summary.md) | Send-the-room-a-summary | P1 | 6 | F2 |
| [F4](F4-cross-session-analytics.md) | Cross-session analytics for the facilitator | P2 | 4 | — |

### G. Differentiators / moonshots — *why they choose you* (49.5d)
| ID | Improvement | Pri | Days | Depends on |
|----|-------------|-----|------|------------|
| [G1](G1-hybrid-remote-video-presence.md) | Hybrid/remote first-class (video presence + breakouts) | P1 | 18 | B7, C1, C5 |
| [G2](G2-optional-facilitator-accounts.md) | Optional facilitator accounts (privacy-preserving) | P1 | 11 | B4 |
| [G3](G3-community-template-marketplace.md) | Community template marketplace | P2 | 7 | B4, G2 |
| [G4](G4-integrations-slack-launch-recap.md) | Integrations (Slack/Teams, calendar, Miro/Mural, Zoom/Meet) | P2 | 3.5 | E1, F1 |
| [G5](G5-ipad-tablet-host-console.md) | iPad/tablet-optimised host console | P2 | 10 | C1, C2, C5 |

### H. Trust & reliability — *the invisible table stakes* (9d)
| ID | Improvement | Pri | Days | Depends on |
|----|-------------|-----|------|------------|
| [H1](H1-room-never-breaks.md) | "The room never breaks" resilience (offline, reconnect, status) | P0 | 5 | (synergy: C2, C5) |
| [H2](H2-preflight-check.md) | Pre-flight check before going live | P1 | 4 | — |

---

## Recommended roadmap

Dependency-ordered, value-weighted. The three P0 sprints get a non-technical facilitator to credible success; moonshots (G) come last because they depend on the foundations.

**Sprint 1 — "Get a facilitator to first success" (≈21d)**
A2 magic links *(also fixes the live admin-vs-facilitator launch bug)* → A1 create-a-workshop wizard → E1 stunning join lobby → A3 tutorial + sample room → A4 memorable URLs.

**Sprint 2 — "Run the room with confidence" (≈22d)**
C1 facilitate mode → C2 live participation signals → C3 calm recovery → C6 room-felt timer → H1 "room never breaks" resilience.

**Sprint 3 — "Look like a pro / get re-hired" (≈25d)**
F1 client-ready report → B1 agenda/arc → B3 run-sheet → B2 room preview → D1 join/instructions/anonymity → D2 accessibility pillar.

**Then, by value:** the i18n wedge (D3), spotlight + co-facilitation + presenter polish (C4, C5, E2), outcomes (F2, F3), reuse (B4, B5, B6, A5), AI design/co-facilitator (B7, C7), pre-flight (H2), ambient (E3, F4).

**Moonshots last (they unlock the "category leader" story):** G2 facilitator accounts → G1 hybrid video → G3 marketplace → G4 integrations → G5 iPad console.

---

## How to execute a spec

1. Branch from `main`: `git checkout -b feat/<id>-<slug>`.
2. Read the spec end-to-end; build the **MVP cut** first.
3. Follow the *Implementation plan*; satisfy *Acceptance criteria*; add the *Test plan* Vitest cases.
4. `npm run verify` (typecheck + lint + test) + `npm run build` must pass; CI runs the same on Node 24.
5. Re-read the *Privacy & ethos check* and *Risks & mitigations* before opening the PR.

> Specs reflect the codebase as of `feature/backlog-specs`. Verify file paths/types against current `main` before building — the platform moves fast.
