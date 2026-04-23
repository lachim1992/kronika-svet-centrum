

# War Plan v16 — Full Implementation

Integrates all corrections from v1–v16 into executable changes. Three categories: normative documentation, read-side centralization, and write-side discipline.

---

## Part 1: Normative Documentation (7 files)

### 1.1 Create `docs/architecture/ledger-semantics.md`
Full field-level contract for `realm_resources`: 8 fields with mutation semantics, reconciliation modes, cost pool disambiguation, forbidden patterns (no absolute SET for `city_stability`), `CANCEL_BUILDING` refund policy (50% production, 0% gold — design decision), `ENACT_DECREE` delta source (lookup catalog — design decision), `UNIQUE(session_id, player_name)` reference, manpower invariant precondition on `military_stack_composition`.

### 1.2 Create `docs/architecture/command-proof-matrix.md`
13 Sprint-A commands with: executor (typed RPC — mandatory for all 13), tables mutated, cost source fields, 3-tier audit footprint (exact/minimum/forbidden), forbidden client writes. Sprint A idempotency labeled as "best-effort pre-check" only. Sprint B transactional gate via `INSERT ... ON CONFLICT DO NOTHING` inside RPC.

Canonical vs cosmetic field boundary for `military_stacks`:
- **Canonical** (must go through command path): `is_active`, `formation_type`, `general_id`, `morale`, `power`, `demobilized_turn`, `remobilize_ready_turn`, `hex_q`, `hex_r`, `moved_this_turn`, `is_deployed`
- **Cosmetic/exempt**: `image_url`, `image_prompt`, `image_confirmed`, `sigil_url`, `sigil_confirmed`, `army_sigil_url`, `army_sigil_confirmed`

### 1.3 Create `docs/architecture/read-model-contract.md`
Single projector rule: Dashboard does one `.find(r => r.player_name === myPlayerName)` on session-scoped `realmResources[]`, passes result as prop. Schema-backed by `UNIQUE(session_id, player_name)`. Acceptance grep gates for realm, military, and building tables. Helper/selector drift prohibition.

### 1.4 Create `docs/architecture/direct-write-deferred-files.txt`
Files exempt from write gates (dev tools, deferred Sprint B):
- `src/components/dev/DevPlayerEditor.tsx`
- `src/components/AdminMonitorPanel.tsx`
- `src/components/military/DeployBattlePanel.tsx` (deferred)
- `src/components/WorldHexMap.tsx` (deferred — movement commands)
- `src/lib/turnEngine.ts` (legacy migration only)

### 1.5 Create `docs/architecture/deferred-read-surfaces.txt` and `deferred-command-surfaces.md`

### 1.6 Update `.lovable/plan.md`
Replace stale v3 Decision Pack with War Plan v16 content. Authority precedence: normative documents override plan prose.

---

## Part 2: Sprint A — Foundation (read-side + idempotency)

Correct implementation order (stabilize reads before rewiring writes):

### Step 1: Idempotency pre-check in command-dispatch
**File**: `supabase/functions/command-dispatch/index.ts`

Add at top of `executeCommand` (before the `switch`):
```typescript
const { data: existingEvents } = await supabase
  .from("game_events")
  .select("id, event_type, command_id")
  .eq("command_id", commandId);
if (existingEvents && existingEvents.length > 0) {
  return { events: existingEvents, idempotent: true };
}
```
This is explicitly a **best-effort mitigation**, not transactional idempotency (that requires Sprint B RPCs).

### Step 2: Add `realm_resources` to useGameSession realtime channel
**File**: `src/hooks/useGameSession.ts`

Add to core channel (line ~200):
```typescript
.on("postgres_changes", { event: "*", schema: "public", table: "realm_resources", filter: `session_id=eq.${sessionId}` }, () => debouncedRefetchCore())
```

### Step 3: Dashboard single projector + prop threading
**File**: `src/pages/Dashboard.tsx`

Add `useMemo` to project current player's realm:
```typescript
const myRealm = useMemo(
  () => realmResources.find(r => r.player_name === myPlayerName) || null,
  [realmResources, myPlayerName]
);
```

Add `realm` to `sharedProps` and pass to ResourceHUD, HomeTab, ArmyTab, CouncilTab, RealmDashboard, CityManagement.

### Step 4: Remove independent realm fetches from surfaces

**ResourceHUD** (`src/components/layout/ResourceHUD.tsx`):
- Add `realm` prop to interface
- Remove independent `.select("realm_resources")` fetch (lines 29-37)
- Remove independent `.channel()` subscription (lines 41-47)
- Use `realm` prop instead of local state

**HomeTab** (`src/pages/game/HomeTab.tsx`):
- Add `realm` to Props interface
- Remove local `realm` state and `ensureRealmResources` call (lines 93-108)
- Use `realm` prop directly
- Remove `import { ensureRealmResources }` 

**ArmyTab** (`src/pages/game/ArmyTab.tsx`):
- Add `realm` to Props interface (alongside existing sessionId etc.)
- Remove local `realm` state
- Remove `ensureRealmResources` call in `fetchMilitary` (line 168)
- Use `realm` prop for display; keep local `setRealm` only for optimistic updates pending refetch

**RealmDashboard** (`src/components/RealmDashboard.tsx`):
- Add `realm` prop
- Remove `fetchData` with `ensureRealmResources` (lines 27-36)
- Use `realm` prop

**CouncilTab** (`src/pages/game/CouncilTab.tsx`):
- Receives `realm` via `sharedProps` already; verify no independent fetch

### Step 5: Kill `ensureRealmResources` and `recomputeManpowerPool`
**File**: `src/lib/turnEngine.ts`
- Remove `ensureRealmResources` function (lines 63-85)
- Remove `recomputeManpowerPool` function (lines 91-116)
- Keep exports for `SETTLEMENT_TEMPLATES`, `UNIT_TYPE_LABELS`, `UNIT_GOLD_FACTOR`, `FORMATION_PRESETS`, `migrateLegacyMilitary`

---

## Part 3: Sprint A — Write-side discipline

### Step 6: Rewire ArmyTab handlers to use `dispatchCommand`

Current pattern (example — `handleRemobilize`):
```typescript
// BEFORE: direct write + then dispatchCommand as log
await supabase.from("military_stacks").update({...}).eq("id", stack.id);
await supabase.from("realm_resources").update({...}).eq("id", realm?.id);
await dispatchCommand({...commandType: "REMOBILIZE_STACK"...});
```

Target pattern:
```typescript
// AFTER: dispatchCommand only — server does all mutations
const result = await dispatchCommand({
  sessionId,
  actor: { name: currentPlayerName },
  commandType: "REMOBILIZE_STACK",
  commandPayload: { stackId: stack.id, stackName: stack.name, manpower: totalManpower },
});
if (!result.ok) { toast.error(result.error); return; }
```

**Handlers to rewire** (all in ArmyTab):
1. `handleRemobilize` — remove direct `.update("military_stacks")` and `.update("realm_resources")`
2. `handleDisband` — remove direct `.update("military_stacks")` and `.update("realm_resources")`
3. `handleUpgrade` (formation) — remove direct `.update("military_stacks")` and `.update("realm_resources")`
4. `handleAssignGeneral` — remove direct `.update("military_stacks")` x2
5. `handleReinforce` — remove direct `.update/.insert("military_stack_composition")` and `.update("realm_resources")`
6. Mobilization slider `onValueCommit` — remove direct `.update("realm_resources")`

### Step 7: Rewire DemobilizeDialog
**File**: `src/components/DemobilizeDialog.tsx`
- Remove direct `.update("military_stacks")` loop (lines 68-73)
- Remove direct `.update("realm_resources")` (lines 77-79)
- Move mutation logic to `command-dispatch` DEMOBILIZE command; client only calls `dispatchCommand`

### Step 8: Add server-side mutation logic to command-dispatch
**File**: `supabase/functions/command-dispatch/index.ts`

For commands that currently only insert events but don't mutate state (REMOBILIZE_STACK, DISBAND_STACK, UPGRADE_FORMATION, ASSIGN_GENERAL, REINFORCE_STACK, DEMOBILIZE, SET_MOBILIZATION):

Add `execute*` functions similar to existing `executeRecruitStack`. Each function:
1. Validates preconditions (enough manpower/gold)
2. Performs mutations on canonical tables
3. Inserts `game_events` row
4. Returns result

Example for REMOBILIZE_STACK:
```typescript
async function executeRemobilizeStack(supabase, base, actor, payload, commandId, sessionId, turnNumber) {
  const { stackId } = payload;
  // Fetch stack + composition + realm
  // Validate available manpower
  // Update military_stacks (is_active=true, demobilized_turn=null)
  // Update realm_resources (manpower_committed += totalManpower)
  // Insert event
  return insertEvents(supabase, commandId, [...], { stackId });
}
```

### Step 9: Rewire CityManagement and SettlementUpgradePanel
**File**: `src/components/CityManagement.tsx`
- `buildFromTemplate` and `confirmAIBuild`: Replace direct `.update("realm_resources")` + `.insert("city_buildings")` with `dispatchCommand({ commandType: "BUILD_BUILDING", ... })`
- Add server-side `executeBuildBuilding` in command-dispatch that handles resource deduction + building insertion

**File**: `src/components/SettlementUpgradePanel.tsx`
- Replace direct `.update("realm_resources")` with `dispatchCommand({ commandType: "UPGRADE_SETTLEMENT", ... })`

### Step 10: Rewire CouncilTab decree execution
**File**: `src/pages/game/CouncilTab.tsx` (line ~128-141)
- Replace direct `.update("realm_resources")` and `.update("cities")` with `dispatchCommand({ commandType: "ENACT_DECREE", ... })`

---

## Estimated scope

- **Part 1**: 7 doc files created/updated
- **Part 2**: ~6 source files modified (useGameSession, Dashboard, ResourceHUD, HomeTab, ArmyTab, RealmDashboard, turnEngine)
- **Part 3**: ~5 source files modified (ArmyTab, DemobilizeDialog, CityManagement, SettlementUpgradePanel, CouncilTab) + 1 edge function significantly expanded (command-dispatch)
- **Total**: ~12 source files + 7 doc files

