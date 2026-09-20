# Chronicle — Whole-game audit (HEAD, read-only)

Verification run this turn: typecheck clean, `vitest` 304 passed / 2 skipped, build OK. Test01 (session `eba9…1ed`, turn 64) read only, no turn advanced, no writes.

## A. Playable-state verdict

**An existing, hand-repaired world (Test01) is playable. A brand-new world is not economically playable without manual admin repair.**

What works end to end today: world bootstrap creates country/region/province/capital/nodes/routes/fog; commands go through `command-dispatch`; `commit-turn` is a genuine server-owned orchestrator with a DB turn lock, derived-economy chain, per-player `process-turn`, pipeline-guarded snapshot and stale-marking; the goods economy is a real conserved physical model (jobs → staffing → potential → inputs over the route graph → realized output → consumption/storage/spoilage) with a hard conservation assert; military recruitment, manpower, movement, battles, losses and upkeep all run through shared server helpers; victory conditions exist and are evaluated from `commit-turn`; the new build catalog, trade-corridor inspection and labor/production panels read canonical values.

What a player cannot do today: start a fresh game and have any production (no starter buildings, no demand baskets, no first economy pass are seeded at bootstrap); see truthful population dynamics (the migration and ledger tables are never written in turn-based mode); rely on numbers that survive a turn (route upkeep is charged after the fiscal snapshot); trust multiplayer integrity (any session member can write any row, and ~322 direct table writes still live in the UI, including gold).

Already correct at HEAD — do not re-request: household auto-production is off (`economyConfig.ts:38`, legacy path flag-gated), no duplicate production math in the frontend, one population writer per path with `total == sum(classes)` (confirmed in Test01 data for all 9 cities), no client invocation of `process-turn`, dev/admin panels are admin-gated.

## B. Prioritized backlog

### P0

1. **New game has no economy.** Symptom: fresh world shows zero production, empty baskets, no flows. Evidence: `ensureStarterEconomy` is called only from `backfill-starter-economy/index.ts:25` (self-labelled legacy) and `command-dispatch/index.ts:1002`; `create-world-bootstrap/index.ts` and `_shared/seed-realm-skeleton.ts` never insert `city_buildings`, never seed demand baskets, never run the derived chain. Root cause: starter economy lives on the backfill path, not the creation path. Target: bootstrap seeds the geography-appropriate starter bundle and runs one derived pass, idempotently. Test: bootstrap a scratch session and assert buildings > 0, `demand_baskets` > 0, `city_good_balances` > 0 before turn 1.
2. **UI writes canonical state directly.** Symptom: gold and city state change without a command, unaudited, unreplayable. Evidence: 322 direct `.update/.insert/.delete` calls in `src`, including `ArmyTab.tsx:1300` writing `realm_resources.gold_reserve`, `UprisingDialog.tsx:201-236` writing `realm_resources` + `cities`, `CouncilTab.tsx:494-640` writing `laws`/`cities`/`city_factions`, `useGameSession.ts:468-473` updating/deleting cities. Root cause: no enforcement of the single-write-entrypoint contract. Target: all gameplay mutations go through `command-dispatch`; UI writes limited to cosmetic/user-owned rows. Test: static test forbidding client writes to a canonical-table allowlist (gold, cities, stacks, laws, factions).
3. **RLS grants every session member full write on every session table.** Evidence: migration `20260919210123…` replaces per-table policies with `FOR ALL USING (is_session_member(session_id))`; `is_session_member` checks membership only, not row ownership, so ownership checks exist only inside `command-dispatch`. Target: per-row ownership (`owner_player` / player mapping) for write policies; reads may stay session-wide. Test: SQL test asserting player B cannot update player A's `realm_resources`/`military_stacks`.
4. **Route upkeep is charged outside the fiscal snapshot.** Symptom: treasury delta and fiscal history disagree; upkeep invisible in reports. Evidence: `world-layer-tick/index.ts:210-220` updates `gold_reserve` and is invoked at `commit-turn/index.ts:1051`, after the snapshot written at `commit-turn/index.ts:940-1003`; no `(session, turn)` idempotency guard in that function. Target: either move upkeep into `process-turn`'s fiscal pass or run world-layer-tick before the snapshot with a per-turn guard. Test: after one commit, snapshot fiscal delta equals the actual `gold_reserve` change; second invocation of the tick for the same turn changes nothing.
5. **No capital.** Symptom: "Hlavní město" never marked; capital-dependent logic silently falls back. Evidence: Test01 has 9 cities, `is_capital` false on all; consumers assume one (`HomeTab.tsx:93` fallback, `_shared/citySettlementNodes.ts:32-37` priority, `check-victory/index.ts:123-145` annexation/domination). Target: exactly one capital per realm, enforced on creation and on capital loss. Test: invariant test — every realm with ≥1 city has exactly one `is_capital`.
6. **Population ledger and migration are dead in turn-based mode.** Symptom: Realm → Populace shows no births/deaths/migration causes; city migration always 0. Evidence: Test01 `city_population_ledger` 0 rows, `hex_population` 0 rows, `last_migration_in/out` all 0; the only writers are the dead `world-tick` function (`world-tick/index.ts:775-777`) and the manual `compute-rural-population`; no function writes `city_population_ledger` at all. Target: canonical per-turn ledger write from the single population writer, conservative migration inside the turn pipeline. Test: after a commit, ledger rows exist for every city and `Σ(immigration) == Σ(emigration)`.

### P1

7. **`world-tick` (~1600 lines) plus `src/lib/ai.ts:101 runWorldTick` are unreachable**, yet hold the only migration/social-mobility implementation; `commit-turn` reimplements a different subset inline. Target: delete or explicitly quarantine, after extracting the logic Phase-2 needs.
8. **Two orchestrators for one chain**: `refresh-economy/index.ts:125-134` vs the inline chain in `commit-turn/index.ts:786-864`, kept in sync only by pattern-matching tests. Target: one shared step-list module.
9. **Legacy `wealth_output` still drives player UI** (`IsometricSquareMap.tsx:185,383,1058`, `NodeFlowBreakdown.tsx`, `useProvinceGraph.ts`, `_shared/ai-context.ts:675`), while the engine forbids reading it; the guard test allowlists only 7 files — false confidence.
10. **Settlement upgrade and city management gate on the deprecated ledger** `production_reserve` / `player_resources` (`SettlementUpgradePanel.tsx:39-61`, `CityManagement.tsx:181`), both still dual-written at bootstrap (`seed-realm-skeleton.ts:291,299-312`).
11. **Two road models, misleading names**: player roads (`road_projects`/`road_segments`) render inline, while `RoadNetworkOverlay.tsx:68-78` actually draws `province_routes`/`flow_paths`; `compute-trade-systems` reads segments while the tick reads routes.
12. **Gameplay randomness in the client**: `DiplomacyPanel.tsx:199` leak chance, `ArmyTab.tsx:1281` general skill, `DraftRecruitDialog.tsx:23-28` player stats — not server-authoritative.
13. **Diplomacy half-enforced**: embargo, defense pact and condemnation have engine effects; `alliance`, `open_borders`, `joint_decree` only score prestige (`process-turn/index.ts:1288-1293`) and are never enforced.
14. **AI faction turn aborts on provider 402/429** (`ai-faction-turn/index.ts:932-936`) with no heuristic fallback and no confirmed retry — a faction silently skips its turn.
15. **Production orders unused**: Test01 has 0 `structure_production_orders`, 0 `node_production_orders`, and only 4 `trade_flows` against 134 `basket_trade_flows`.

### P2

16. Fiscal naming drift: tax bases still stored as `last_turn_gdp_*`; `total_wealth` still populated (210.2) though the contract forbids using it.
17. `CitiesTab.tsx` is imported in `Dashboard.tsx:29` but never rendered — `CityDirectory`, `GreatPersonsPanel`, `EmpireManagement` unreachable.
18. Fixture-mocked tests (`economy-snapshots.test.ts`, `engine/recruitment-economy.test.ts`) mock `supabase.from` entirely and cannot catch schema drift.
19. `CityEconomyAnalytics.tsx:118-129` silently falls back to a broader turn scan instead of an honest empty state.
20. Mobile: only Home/WorldMap have `useIsMobile` branches; Economy/Army/Council/Chronicles rely on CSS only. `ChroniclesTab`/`RealmTab` lack top-level loading/empty guards.

### P3

21. `compute-hex-flows/index.ts:122` hardcodes `infrastructure_level: 0`.
22. `empireOverviewAdapter.ts:37,76` schema gaps (no per-unit upkeep breakdown).
23. Sphaera/league writes bypass the command path (out of beta scope per `docs/BETA_SCOPE.md`).

## C. Implementation phases

**Phase 1 — closure only, no overlap with the labor/jobs work.**
1a Starter economy + demand baskets + one derived pass inside `create-world-bootstrap` (idempotent, reuses `ensureStarterEconomy`).
1b Capital invariant on creation, conquest and capital loss.
1c Route upkeep inside the fiscal boundary with a per-turn guard.
1d Scratch-session acceptance test: create → build → commit → read, with fiscal delta == snapshot.

**Phase 2 — authority and integrity.** Route the UI's canonical writes through `command-dispatch` (gold, cities, laws, factions, stacks first); add ownership-scoped RLS write policies; static guard test against client writes.

**Phase 3 — population truth.** One canonical per-turn ledger write; conservative intra-turn migration; wire Realm → Populace to real rows and show honest empty states until then; decide the rural-transfer (Phase C) boundary.

**Phase 4 — legacy removal.** Quarantine/remove `world-tick` + `runWorldTick`, retire `wealth_output` from player UI, move settlement upgrade off `production_reserve`/`player_resources`, delete or mount `CitiesTab`.

**Phase 5 — unification.** Single shared derived-chain module for `commit-turn`/`refresh-economy`; one road/route model with honest overlay naming; replace fixture-mocked tests with contract tests.

**Phase 6 — systems depth.** Enforce alliance/open_borders/joint_decree; AI provider fallback and retry; move client randomness server-side; wire production orders or remove them.

## D. Decisions that need you

1. **Migration scope now**: implement intra-turn city↔city migration only, or also the rural transfer (Phase C) in the same pass?
2. **Persistent/time-based mode**: is it abandoned? If yes, `world-tick`, `process-tick`, `action_queue` and `time_pools` get deleted rather than quarantined.
3. **Multiplayer write model**: per-row ownership RLS (needs a player↔row mapping for shared tables like `laws`, `diplomatic_pacts`) versus keeping enforcement only in `command-dispatch` and accepting the trust boundary.
4. **Alliance semantics**: should an alliance mechanically block war declarations, and should `open_borders` gate movement?
5. **Settlement upgrade currency**: keep `production_reserve`, or gate upgrades on goods/basket satisfaction from the canonical economy?
6. **Sphaera/league**: keep in the build or freeze it behind a flag for the beta window?

## E. Removal / quarantine candidates

`supabase/functions/world-tick` and `src/lib/ai.ts:runWorldTick` (dead duplicate) · `_shared/demographics.ts:264-353 computeMigrationFlows` (deprecated, no callers) · `src/pages/game/CitiesTab.tsx` + `src/components/EmpireManagement.tsx` (unreachable) · `wealth_output` reads outside the engine · `player_resources` dual-write and `production_reserve` gating · `backfill-starter-economy` once bootstrap seeds correctly · fixture-mocked economy tests · `AdminMonitorPanel`/`LeaderboardsPanel` (legacy per `docs/BETA_SCOPE.md`).
