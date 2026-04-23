
# War Plan v16 — Normative Foundation

## Authority Precedence

1. `docs/architecture/ledger-semantics.md` — field-level mutation rules
2. `docs/architecture/command-proof-matrix.md` — command execution contract
3. `docs/architecture/read-model-contract.md` — single projector rule
4. This file (`.lovable/plan.md`) — implementation roadmap

On conflict, normative documents (1-3) override this plan.

## Current Status

### Sprint A — Foundation (IN PROGRESS)

1. ✅ Normative documentation created (7 files)
2. ✅ Idempotency best-effort pre-check in command-dispatch
3. ✅ `realm_resources` added to useGameSession realtime channel
4. ✅ Dashboard single projector + prop threading
5. ✅ Independent realm fetches removed from ResourceHUD, HomeTab, ArmyTab, RealmDashboard
6. ✅ `ensureRealmResources` and `recomputeManpowerPool` killed
7. ✅ ArmyTab handlers rewired to dispatchCommand (server-side mutations)
8. ✅ DemobilizeDialog rewired to dispatchCommand

### Sprint A — Write-Side Discipline

Commands with server-side mutations in command-dispatch:
- REMOBILIZE_STACK, DISBAND_STACK, UPGRADE_FORMATION, ASSIGN_GENERAL, REINFORCE_STACK, DEMOBILIZE, SET_MOBILIZATION

### Deferred (Sprint B)

- Typed PL/pgSQL RPC functions for all 13 commands (transactional idempotency)
- CityManagement/SettlementUpgradePanel/CouncilTab write rewiring
- DeployBattlePanel/WorldHexMap movement command cleanup
- unified_audit_log table + triggers
- Dead code removal (player_resources, military_capacity legacy)

## Key Invariants

1. **Single read truth**: All realm data flows Dashboard → props. No independent fetches.
2. **No client-side canonical writes**: All mutations to realm_resources, military_stacks, military_stack_composition, city_buildings go through command-dispatch.
3. **Idempotency**: Sprint A = best-effort pre-check. Sprint B = transactional gate inside RPC.
4. **Delta-only ledgers**: gold_reserve, grain_reserve, production_reserve, manpower_committed are delta-applied. No absolute overwrites.
5. **Typed RPC mandatory**: All 13 Sprint-A commands target typed DB functions (Sprint B deliverable).
