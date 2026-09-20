# Economy chain closure — 2026-09-20

This change closes seven gaps between the goods catalogue, the physical solver and capital spending:

- Finished construction materials become CAPEX without also remaining in storage.
- Upstream recipes precede customers; partial producers retain their remaining capacity.
- Industrial processing and industrial exports protect local edible food requirements.
- Substitution uses relative efficiency and preserves state consumption attribution.
- Famine mortality scales with the deficit; deficits below 5% are handled by ordinary basket feedback.
- Charcoal consumes raw timber, granary services consume lumber, and master recipes explicitly qualify for fame.
- Recruitment spends persistent `production_reserve`, matching construction CAPEX. Food and military goods remain recurrent physical demand. Recruitment does not debit the derived `grain_reserve` or individual weapons; this is the existing abstract capital model, now used consistently. The recruitment UI quotes the same unit production factors as the server.

Database migration: `20260920190000_economy_chain_closure.sql`. It changes only the two broken recipe input lists and is idempotent. It does not retroactively change committed history or player balances.

Deploy the shared-module consumers: `compute-trade-flows`, `preview-economy`, `commit-turn`, plus `process-turn` and `command-dispatch`. Publish the frontend after repository synchronization. Verify both repaired DB recipes, a derived-only refresh, fiscal/history invariance and a second identical refresh. Do not advance a live player's turn as a deployment check.

Validation before deployment: full Vitest suite, application and edge TypeScript checks, production Vite build. Dedicated regressions exercise all 50 catalogue recipes, material conservation, UUID-independent production, cyclic partial production, food protection, substitution, famine scaling and the real recruitment handler with injected database boundaries. On this Windows host the local runner uses the same Vitest/Vite tooling with esbuild's WASM implementation and worker threads; GitHub CI uses the standard npm commands.

The economy still intentionally aggregates building materials into a realm-wide capital account, uses one generic ore, and does not yet model industrial fuel consumption or sea edges. Those are separate simulation features, not changed by this bug fix.
