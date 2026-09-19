# Chronicle integration and rollout

The repository now contains one physical goods solver, server-derived management
reports and a read-only scenario preview. Do not run a second basket solver or
restore the old player-turn call from a manual refresh.

## Coordinated deployment

The frontend alone is not this deployment. The backend project from config.toml
is `kvzzfthrefdisuohzfws`. Before enabling the new handlers on that project:

1. Apply `20260919120000_canonical_goods_economy.sql` and
   `20260919121000_turn_execution_guard.sql` in order. Preserve existing sessions.
2. Deploy all functions listed in `docs/deployment/chronicle-integration.json`,
   including shared module dependencies. Do not mix old fiscal and new goods code.
3. Run the live idempotence test against the designated test world only. It must
   compare fiscal state before the first refresh, as well as after two refreshes.
4. Verify the management RPC returns only the authenticated player's report and
   scenario previews do not mutate stocks, history, construction or turn number.
5. Publish the frontend and verify the Home, Economy, City and Army views on the
   actual hosted URL. Git synchronization and a local build are not deployment proof.

The requested test game is `eba99766-9046-4daf-a367-9f31380cbba1` (user calls it
`test01`). No production turn has been advanced by the integration work.

## Runtime invariants

- Physical stock has one ledger; inputs, deliveries, consumption, spoilage,
  storage and CAPEX reconcile for each good and city.
- Refresh never collects taxes, increments reserves or commits history.
- Fiscal application is guarded atomically by player and turn; world execution
  also has a session guard. A failed or crashed turn must be inspected and repaired
  before clearing its guard, since it may have partially applied world effects.
- Active soldiers reduce civilian workers once; population classes are not armies.
- Zero rated capacity and unstaffed production stay zero. Disconnected producers
  have explicit diagnostics instead of invented deliveries.
- Full solver snapshots are service-only. Player views use an owner-scoped RPC.

## Acceptance boundary

See `docs/architecture/integration-2026-09-19.md` for tests and remaining scope.
Do not label the complete management redesign or live rollout finished without
checking that acceptance list and the hosted backend.
