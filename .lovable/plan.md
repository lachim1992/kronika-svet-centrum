

# Post-Stabilization Audit — Implementation Plan

## Execution order (per user directive)

### Step 1: Remove dead `resources` prop threading

Remove `resources` from HomeTab and EconomyTab Props interfaces and destructuring. Stop passing `resources` to these two tabs from Dashboard.

**Files**: `src/pages/game/HomeTab.tsx`, `src/pages/game/EconomyTab.tsx`, `src/pages/Dashboard.tsx`

### Step 2: Remove 3 phantom realtime subscriptions

Remove `turn_summaries`, `world_feed_items`, `world_action_log` from the realtime channel in useGameSession. These are subscribed but never fetched — pure noise triggering global refetches.

**File**: `src/hooks/useGameSession.ts`

### Step 3: Split useGameSession into core+legacy and content pipelines

Split the single `fetchAll` into two functions with two separate realtime channels:

```text
fetchCoreAndLegacy():
  core: game_sessions, game_players, cities
  legacy support: player_resources, military_capacity, trade_log
  → sets: session, players, cities, resources, armies, trades

  Channel "core-{sessionId}" subscribes to:
    game_sessions, game_players, cities
    → triggers fetchCoreAndLegacy()

fetchContent():
  game_events + event_responses, world_memories,
  chronicle_entries, city_states, wonders, entity_traits,
  civilizations, great_persons, declarations,
  world_crises, secret_objectives
  → sets: events, responses, memories, chronicles, cityStates,
     wonders, entityTraits, civilizations, greatPersons,
     declarations, worldCrises, secretObjectives

  Channel "content-{sessionId}" subscribes to:
    game_events, chronicle_entries, world_memories,
    declarations, world_crises, wonders, entity_traits,
    civilizations, great_persons
    → triggers fetchContent()

No realtime (fetch-only):
  player_resources, military_capacity, trade_log,
  city_states, secret_objectives
```

Named honestly: "core refetch also refreshes legacy support bundle for compatibility" — not a clean bounded context, but a meaningful reduction in cross-contamination.

Code comments will note that `armies` maps to `military_capacity` table and that `player_resources` + `military_capacity` are legacy operational, not true core.

**File**: `src/hooks/useGameSession.ts`

### Step 4: Gate debug panels behind useDevMode

Wrap in `{devMode && ...}` in both HomeTab and EconomyTab:
- `FormulasReferencePanel` — HomeTab + EconomyTab
- `CapacityPanel` — HomeTab + EconomyTab
- `EconomyDependencyMap` — HomeTab + EconomyTab
- `GapAdvisorPanel` — EconomyTab only

This is first containment, not full isolation — other render paths may exist but these are the confirmed ones.

**Files**: `src/pages/game/HomeTab.tsx`, `src/pages/game/EconomyTab.tsx`

### Step 5: Create DEPRECATION.md

Contents: consumer map, canonical replacement target (`realm_resources` breakdown columns), blockers (EmpireOverview, LeaderboardsPanel, EmpireManagement, AdminMonitorPanel), impact if `player_resources` removed today, migration path. Includes note on `armies`/`military_capacity` naming inconsistency.

**File**: `DEPRECATION.md` (new)

---

## Files changed

| File | Steps |
|------|-------|
| `src/pages/game/HomeTab.tsx` | 1, 4 |
| `src/pages/game/EconomyTab.tsx` | 1, 4 |
| `src/pages/Dashboard.tsx` | 1 |
| `src/hooks/useGameSession.ts` | 2, 3 |
| `DEPRECATION.md` | 5 |

## What this does NOT do

- Does not remove `player_resources` table or backend writes
- Does not change any edge functions
- Does not redesign UI panels
- Does not claim to be a clean domain separation

## Verification

1. TypeScript build passes
2. HomeTab/EconomyTab render without `resources` prop
3. Debug panels visible only in dev mode
4. City rename does NOT trigger events/chronicles refetch
5. New chronicle does NOT trigger cities/players refetch
6. EmpireOverview, LeaderboardsPanel, EmpireManagement still receive and display `resources`

