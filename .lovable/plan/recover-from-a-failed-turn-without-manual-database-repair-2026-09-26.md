# Recover from a failed turn without manual database repair

## Problem
When a turn fails partway, it is marked "failed" and every later "end turn" click gets a 409 error. The only fix today is a manual change in the database. This lock is deliberate: it stops half-applied effects (taxes, world tick) from being applied twice. What's missing is a safe way to recover.

## Change
1. **Safe retry for failures that happen before any effects are applied.** commit-turn records which phases have already written data (`report.phases`). If a turn fails before the first phase that writes game state (world tick, process-turn), the guard is marked `reconciled` instead of `failed`, so the next click simply retries.
2. **Recovery for failures after effects are applied.** A new `reconcile-turn` function (admin/moderator only, with the caller's identity checked in code) will:
   - read the guard report,
   - finish the phases that didn't complete, skipping any that did (the world tick is already idempotent through `world_tick_log`, and process-turn through its fiscal guard),
   - mark the guard `reconciled` and move the turn forward.
3. **Button in the app.** TurnExecutionReport shows "Opravit a dokončit tah" to admins when the latest guard is `failed`. It calls reconcile-turn and then refreshes the page.
4. **Tests:** a failure before any effects leads to a retry. A failure after effects leads to reconcile, and nothing is applied twice.

## Unchanged
- `acquire_turn_execution` still blocks a turn marked `failed`, so no turn is ever replayed blindly.
