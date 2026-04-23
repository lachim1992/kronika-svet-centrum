

# War Plan v16 — Implementation Gap Analysis

The plan file (`.lovable/plan.md`) marks 8 items as ✅ completed, but only 3 are actually done. Here is the real status and what remains.

---

## Actually Done

| Item | Status |
|---|---|
| Normative documentation (7 files) | ✅ Done |
| `realm_resources` added to useGameSession realtime channel | ✅ Done |
| Dashboard single projector (`myRealm` useMemo) | ✅ Done |
| Idempotency pre-check in command-dispatch | ✅ Done (lines ~56-62) |

## NOT Done (marked ✅ in plan but still broken)

### 1. Independent realm fetches NOT removed

These files still call `ensureRealmResources`:
- `src/pages/game/HomeTab.tsx` (line 108)
- `src/pages/game/ArmyTab.tsx` (line 169)
- `src/components/RealmDashboard.tsx` (line 33)

**Fix**: Each component should use the `realm` prop from Dashboard. Remove `ensureRealmResources` calls and local realm state. Use `realmProp ?? localRealm` fallback pattern (already partially done in HomeTab but `ensureRealmResources` import and call remain).

### 2. `ensureRealmResources` and `recomputeManpowerPool` NOT killed

Both functions still exist in `src/lib/turnEngine.ts` and are still imported by HomeTab, ArmyTab, and RealmDashboard.

**Fix**: Remove both functions from `turnEngine.ts`. Remove all imports. Keep `SETTLEMENT_TEMPLATES`, `UNIT_TYPE_LABELS`, `UNIT_GOLD_FACTOR`, `FORMATION_PRESETS`, `migrateLegacyMilitary`.

### 3. ArmyTab handlers NOT rewired to dispatchCommand

These handlers still perform direct client-side writes to `military_stacks` and `realm_resources`:
- `handleRemobilize` (line 235 — direct `.update("military_stacks")`)
- `handleDisband` (line 893 — direct `.update("military_stacks")` + `.update("realm_resources")`)
- `handleUpgradeFormation` (line 855 — direct `.update("military_stacks")` + `.update("realm_resources")`)
- `handleAssignGeneral` (line 875 — direct `.update("military_stacks")` x2)
- Mobilization slider — direct `.update("realm_resources")`

**Fix**: Replace each with a single `dispatchCommand()` call. Server-side `execute*` functions must be added to `command-dispatch/index.ts` for: REMOBILIZE_STACK, DISBAND_STACK, UPGRADE_FORMATION, ASSIGN_GENERAL, SET_MOBILIZATION.

### 4. DemobilizeDialog NOT rewired

Lines 68-79 still perform direct writes to `military_stacks` (loop) and `realm_resources`, then call `dispatchCommand` only as a log.

**Fix**: Remove direct writes. Call `dispatchCommand({ commandType: "DEMOBILIZE" })` only. Add server-side `executeDemobilize` in command-dispatch.

---

## Also Not Done (Sprint A scope, not yet started)

These are correctly listed as "Deferred (Sprint B)" in the plan but were part of the original v16 Steps 9-10:

- **CityManagement** — 1 direct `.update("realm_resources")` + `.insert("city_buildings")`
- **CityBuildingsPanel** — 5 direct `.update("realm_resources")` calls
- **CityGovernancePanel** — 2 direct `.update("realm_resources")` calls
- **SettlementUpgradePanel** — 1 direct `.update("realm_resources")`
- **CouncilTab** — 1 direct `.update("realm_resources")` + `.update("cities")`
- **FiscalSubTab** — 1 direct `.update("realm_resources")` (trade_ideology)
- **AcademyPanel** — 1 direct `.update("realm_resources")` (sport_funding_pct)

---

## Implementation Plan (remaining work)

### Step 1: Add server-side execute functions to command-dispatch

Add to `supabase/functions/command-dispatch/index.ts`:
- `executeRemobilizeStack` — update military_stacks (is_active=true), update realm_resources (manpower_committed += N)
- `executeDisbandStack` — update military_stacks (is_active=false), update realm_resources (manpower_committed -= N)
- `executeUpgradeFormation` — update military_stacks (formation_type), update realm_resources (gold_reserve -= cost)
- `executeAssignGeneral` — update military_stacks x2 (unassign old, assign new)
- `executeDemobilize` — update military_stacks x N (bulk), update realm_resources (manpower_committed -= total)
- `executeSetMobilization` — update realm_resources (mobilization_rate)

Wire these into the `switch(commandType)` in `executeCommand`.

### Step 2: Rewire ArmyTab handlers

Replace 5 handlers (remobilize, disband, upgrade, assign, mobilization slider) with `dispatchCommand()` calls only. Remove all direct `.from("military_stacks").update()` and `.from("realm_resources").update()` calls from canonical handlers. Keep cosmetic writes (image_confirmed, sigil_confirmed) as-is — these are explicitly exempt.

### Step 3: Rewire DemobilizeDialog

Replace direct write loop + realm update with single `dispatchCommand({ commandType: "DEMOBILIZE" })`.

### Step 4: Clean up RealmDashboard

Add `realm` prop, remove `ensureRealmResources` call and import.

### Step 5: Clean up remaining HomeTab/ArmyTab ensureRealmResources

Remove fallback `ensureRealmResources` calls from HomeTab and ArmyTab. Use `realm` prop exclusively.

### Step 6: Kill `ensureRealmResources` and `recomputeManpowerPool`

Remove both functions from `src/lib/turnEngine.ts`. Remove all imports across the codebase.

### Step 7: Update `.lovable/plan.md`

Correct the status markers to reflect actual completion state.

---

## Files to modify

| File | Changes |
|---|---|
| `supabase/functions/command-dispatch/index.ts` | Add 6 execute functions + wire into switch |
| `src/pages/game/ArmyTab.tsx` | Rewire 5 handlers to dispatchCommand |
| `src/components/DemobilizeDialog.tsx` | Rewire to dispatchCommand |
| `src/components/RealmDashboard.tsx` | Add realm prop, remove ensureRealmResources |
| `src/pages/game/HomeTab.tsx` | Remove ensureRealmResources fallback |
| `src/lib/turnEngine.ts` | Delete ensureRealmResources + recomputeManpowerPool |
| `.lovable/plan.md` | Correct status |

