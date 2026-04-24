# Read Model Contract — Single Projector Rule

> **Evidence header**
> - Repo snapshot: main @ 2026-04-23
> - Authority: Normative.

## Canonical Source

`useGameSession.fetchCore()` fetches `realmResources[]` (session-scoped, all players).

## Single Projector Rule

**Dashboard** performs one `.find(r => r.player_name === myPlayerName)` on session-scoped `realmResources[]` and passes the result as a `realm` prop.

**No other component may**:
1. Call `.from("realm_resources").select(...)` independently
2. Create a `.channel()` subscription for `realm_resources`
3. Call `ensureRealmResources()` or `recomputeManpowerPool()`
4. Derive realm data from a helper/selector outside Dashboard

## Schema Guarantee

`UNIQUE(session_id, player_name)` on `realm_resources` ensures at-most-one row per player per session.

## Target State (Sprint A)

| Surface | Before | After |
|---|---|---|
| ResourceHUD | Independent `.select()` + `.channel()` | `realm` prop from Dashboard |
| HomeTab | `ensureRealmResources()` call | `realm` prop from Dashboard |
| ArmyTab | `ensureRealmResources()` call | `realm` prop from Dashboard |
| RealmDashboard | `ensureRealmResources()` call | `realm` prop from Dashboard |
| CouncilTab | Via sharedProps (verify) | `realm` prop from Dashboard |
| CityManagement | Independent `.select()` | `realm` prop (deferred) |
| EconomyTab | Already via projected realm prop | No change needed |

## Realtime

`useGameSession` core channel includes `realm_resources` subscription → `debouncedRefetchCore()`.
This ensures all surfaces update when any command mutates `realm_resources`.

## Deferred Surfaces

See `docs/architecture/deferred-read-surfaces.txt`.

## Acceptance Greps

```bash
# No independent realm_resources fetch outside Dashboard/useGameSession
grep -rEn 'from\(.realm_resources.\)\.select' \
  src/pages/ src/components/ \
  | grep -v Dashboard \
  | grep -v useGameSession \
  | grep -v 'dev/' \
  | grep -v -f docs/architecture/direct-write-deferred-files.txt
# Expected: 0
```

## World-Layer Reads (per `world-layer-contract.md` §9)

The single-projector rule extends to all world-layer state.

**Track 1:** read-path is unchanged. World-layer flavor data
(`worldgen_spec.ancient_layer`) is read only by:

1. The wizard step ("Founding Lineages"), via the existing `world_foundations`
   fetch in `useWorldSetupWizardState` / bootstrap helpers. **No new fetch.**
2. The mythic prequel UI (`WorldCreationOverlay`), via the same already-fetched
   `worldgen_spec`. **No new fetch.**
3. The dev-only `WorldLayerInspector` in `DevTab`, gated behind `useDevMode`.

No Track 1 component may add a new `.from("world_foundations")` fetch.

**Track 2:** new world-layer state views (`node_control_relations`,
`route_state`, `node_turn_state`) MUST be added as extensions of the
`useGameSession` Core channel — Core fetch + Core realtime subscription.

**Forbidden in Track 2:**

- Component-level `.from("node_control_relations").select(...)` (shadow fetch).
- Component-level `.channel(...)` for any world-layer table.
- Helper hooks that wrap a direct fetch and bypass `useGameSession`.

This preserves the same discipline that `realm_resources` was rewired to in
Sprint A. New world-layer reads MUST follow the same Dashboard-as-projector
pattern (props down, no shadow fetches).

