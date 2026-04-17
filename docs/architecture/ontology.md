# Chronicle — Architecture Ontology

> **Descriptive document.** Every entity and entrypoint listed under "Canonical"
> and "Not canonical" is verifiable in the current repo. Anything aspirational
> belongs in **Target model (follow-up)** and must be marked as such.
>
> Do not promote items out of "Target model" without first reading the code that
> implements them.

---

## Canonical (verified in repo)

### Core state

| Entity | Role |
|---|---|
| `game_sessions` | Per-game session row. Authoritative session lifecycle. |
| `game_players` | Per-session player roster (human + AI factions). Source of `turn_closed`. |
| `cities` | Settlement state (population, stability, owner, location). |
| `realm_resources` | **Canonical economic ledger** (per player per session). |
| `province_nodes` | Strategic graph nodes (cities, forts, mines, ports, …). |
| `node_inventory` | Per-node good stocks. |
| `province_routes` | Inter-node trade/movement edges. |
| `flow_paths` | Hex-level path materialization for routes. |
| `city_market_baskets` | Aggregated demand-basket state per city per turn. |

### Projection / narrative state

| Entity | Role |
|---|---|
| `chronicle_entries` | AI-narrated history projection. |
| `world_memories` | Player-curated/auto-extracted facts (geographically anchored). |
| `wiki_entries` | ChroWiki entity index. Auto-created via DB triggers for cities, provinces, regions, persons, wonders, academies, buildings. |

### Economy orchestration

- **Canonical entrypoint:** `refresh-economy` (snake_case `session_id`).
  Returns `{ ok, session_id, totalMs, refreshed_domains, steps: [{ name, ok, durationMs, detail }], warnings }`.
- **Chain:** `compute-province-routes` → `compute-hex-flows` → `compute-economy-flow` → `compute-trade-flows`.
- **Back-compat adapter:** `recompute-all` (camelCase `sessionId`). NOT a canonical entrypoint. Pure boundary layer that delegates to `refresh-economy` and adapts the response shape for legacy `DevTab` consumers. Optionally appends `process-turn (recalcOnly)`.

---

## Not canonical

These exist in the repo and are read at runtime, but **must not be extended**.

### Legacy state tables

| Entity | Replacement | See |
|---|---|---|
| `player_resources` | `realm_resources` | DEPRECATION.md |
| `military_capacity` | `military_stacks` | DEPRECATION.md |
| `trade_log` | (legacy event log; no direct replacement — derive from canonical state) | DEPRECATION.md |

### Legacy code surfaces

- `useGameSession.initPlayerResources` — seed-path compat.
- `useGameSession.updateResource` — editor-API compat.
- `useGameSession.fetchLegacyCompat` — read compat for the three tables above.
- `recompute-all` edge function — back-compat adapter only.

### Not authoritative for state

- **UI props** carrying legacy `resources` arrays (prop-threading without real dependency).
- **All AI-derived narrative text** — sagas, rumors, advisor copy, council dialogue, chronicle prose.
  AI narrates state; AI does not produce state. See "AI grounding rule" below.

---

## Target model (follow-up — NOT verified by reading code in this commit)

The following are present in design notes / memory but were not re-verified by
reading source in this consolidation commit. Treat as direction, not contract.

- **Event sourcing** via `game_events` + `command-dispatch` + `commit-turn`
  as the single write path. (See `mem://tech/event-sourcing-architecture`.)
- **Per-resource columns** on `realm_resources` (e.g., `gold_income`,
  `grain_income`, `gold_upkeep`, `grain_upkeep`, …) to retire the row-per-resource
  shape of `player_resources`. (See DEPRECATION.md → Migration path.)
- **Septanda / rumors** dedicated tables and feed pipeline.

When promoting any of these to "Canonical", verify the implementing code and
update this document in the same commit.

---

## AI grounding rule

AI never invents numbers or mechanical outcomes. AI narrates the canonical
state produced by the engine. See `mem://constraints/narrative-grounding`.

This rule is part of the ontology because it defines what AI output is —
narrative projection, not state. Any AI surface that mutates state directly is
a bug.
