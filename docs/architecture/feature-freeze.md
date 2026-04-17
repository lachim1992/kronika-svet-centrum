# Feature Freeze (4–6 weeks)

> **Purpose:** keep entropy down while the source-of-truth consolidation
> (legacy → `realm_resources`, single orchestrator, event-sourcing target)
> is in flight. This is a working agreement, not a runtime feature flag.
> No flags. No conditional code paths. Just discipline.

---

## Core (development allowed)

These are the load-bearing systems of the consolidation effort. Active
development, refactor, and bug fixes are all in scope.

- Session lifecycle (`useGameSession`, create/join flows).
- Economy refresh chain: `compute-province-routes` → `compute-hex-flows` →
  `compute-economy-flow` → `compute-trade-flows`, orchestrated by
  `refresh-economy`.
- Turn processing: `process-turn`, `commit-turn`, `world-tick`.
- Chronicle / history persistence (`chronicle_entries`, `world_memories`,
  `wiki_entries`).
- Core UI read model: HomeTab, EconomyTab, WorldTab, CitiesTab.
- Architecture documentation under `docs/architecture/`.

---

## Frozen (4–6 weeks — bug fixes only)

No new features. Bug fixes are allowed only if they unblock Core work or
fix a regression reported by a player. No scope creep dressed as a fix.

- Leagues / sports associations / academies UI.
- Games (sport): qualification, hosting, resolution, newspapers.
- Extra rumors / Septanda generators beyond the existing minimal pipeline.
- AI lore generators: saga generation, history synthesis, encyclopedia
  generation, manual creator panels.
- Portrait / wonder / building image generation flows.
- World crisis / collapse-chain narrative additions.
- Manual world & lore generators (promo world, manual creator).

---

## Not in scope of the freeze

- Refactors that reduce entropy (welcome).
- Bug fixes in Core (welcome).
- Documentation (welcome).
- Removing legacy code paths (welcome — see `DEPRECATION.md`).

---

## How to enforce

1. PRs touching frozen areas require a one-line justification in the description.
2. New files under frozen areas require explicit approval.
3. If a frozen feature breaks Core, fix Core first; patch frozen feature only
   to the minimum required to unblock.

No runtime flags. No conditional UI. The freeze lives in the team agreement
and in this document.
