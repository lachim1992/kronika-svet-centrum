# TEST02 startup and turn repair

Generated nodes had positive production_base but zero rated production_output. The adapter now recovers the generated rating, new generation saves it, and the migration repairs existing active generated nodes. Explicit player capacities and inactive nodes are preserved.

Starter crews now scale once with population. Output rounds up per 150 residents; inland farms compensate for raw grain's 0.3 substitution efficiency. Tests resolve the actual goods solver for settlements of 100–4000 residents, with and without fisheries. Existing starter structures can be resized through backfill-starter-economy; player-built buildings are preserved.

Economic commands refresh the whole derived chain and return fresh/stale status separately from successful command application. Refresh failure must never cause users to repeat an already-paid action.

The production database lacked civ_tensions.prestige_reduction. The migration adds it, persists turn reports, and prevents a newer turn from overwriting a failed/running guard. Failed world ticks stop before calendar advancement; a failed existing tick is never treated as completed. Planned world effects are saved before projection.

Deploy migration 20260921070000_test02_economy_repair.sql and functions compute-province-nodes, compute-trade-flows, preview-economy, commit-turn, command-dispatch, create-world-bootstrap, world-generate-init and backfill-starter-economy. Test a full turn on a disposable session before reconciling TEST02.

TEST02 repair must preserve current populations, treasury, capital and committed history. Resize starter structures, refresh twice and verify fiscal invariance. Its historical failed ticks already projected some population changes; do not replay them or invent catch-up taxes/deaths. After successful checks, record an explicit administrative reconciliation of the failed turn guard in world_action_log and mark it reconciled, retaining original error evidence. This acknowledges partial historical effects rather than falsely claiming they completed. The next normal turn starts from the verified current state.

AI provider HTTP 402 is a separate credit limitation. The existing explicit hold-position fallback remains; no credit purchase is part of this repair.
