---
status: Normative
authority_level: 1
supersedes: none
applies_to:
  - worldgen_spec.ancient_layer (Track 1)
  - node_control_relations, route_state, node_turn_state, node_migrations,
    province_saturation_breakdown, heritage_claims (Track 2)
  - commit-turn Phase 4–9 (Track 2)
  - rpc_found_city, FOUND_CITY, PLAN_ROUTE, CLAIM_HERITAGE,
    RESTORE_MYTHIC_NODE, ESTABLISH_CONTACT, INTEGRATE_NODE (Track 2)
enforcement:
  - L1: scripts/check-track1-writes.ts (CI heuristic guardrail)
  - L2: TS closed interface + Zod .strict() + tests (Track 1); validate_ancient_layer() PL/pgSQL CHECK (T2-PR0)
  - L3: docs/architecture/world-layer-activation-gate.md (manual approval + CI)
  - K1, K2: command-dispatch lint guard (Track 2)
  - K3: deterministic re-bootstrap test (Track 1 + Track 2)
  - K4: no-op smoke profile (Track 2)
  - K5: retention cleanup PL/pgSQL function (Track 2)
on_conflict: |
  Two Normative documents resolve in this order:
  1. Specialization wins over generality (narrower applies_to scope wins).
  2. Equal scope → explicit supersede commit with message tag
     `[normative-supersede: <other-doc-path>]` merged by architecture owner.
  3. Otherwise → P0 issue, both docs paused until resolution PR.
---

# World Layer Contract

> **Authority:** Normative. On conflict with `.lovable/plan.md`, this document wins.
> **Conflict with peer Normative docs:** see frontmatter `on_conflict`.

This document defines the contract for the **World Layer** — the simulation
of permanent world traits, slow-changing state, and per-turn projections that
sit alongside (not inside) the canonical economy/military/realm loop.

It is the result of design iteration v5 → v9.1. See `.lovable/plan.md` for
the integrated master plan.

---

## 1. Three-Layer Data Model

The world layer enforces a strict separation between three data layers.
Mixing them produces the v5 monolith problem (a single `province_nodes` table
holding identity, control, and per-turn projections simultaneously).

| Layer | Mutation cadence | Examples | Tables (Track 2) |
|---|---|---|---|
| **Ontology** | Permanent traits; written at creation, rarely after | `node_class`, `founding_era`, `mythic_tag`, `strategic_kind` | `province_nodes`, `provinces`, `heritage_claims` |
| **State** | Slow change over many turns; derived from cumulative actions | `control_state`, `lifecycle_state`, `maintenance_level`, `integration_progress` | `node_control_relations`, `route_state` |
| **Per-turn projection** | Ephemeral; written each turn, retention-bounded | `migration_push/pull`, `saturation_breakdown`, `node_turn_state` rows | `node_turn_state`, `node_migrations`, `province_saturation_breakdown` |

**Track 1** introduces only an *Ontology-adjacent flavor artifact*
(`worldgen_spec.ancient_layer`). It does not touch State or Projection layers.

---

## 2. Normative Contracts (K1–K5)

### K1 — Authoritative Source vs Render Cache

`node_control_relations` and `route_state` are the **only** authoritative
sources of truth for control and route state. Fields like
`province_nodes.controlled_by` are **render caches** and may only be updated
by the dedicated projector in `commit-turn` Phase 6.

- **Track 1**: Documented only.
- **Track 2**: Enforced by lint in `command-dispatch`; cache fields carry
  `COMMENT ON COLUMN ... IS '[CACHE: K1 — see world-layer-contract.md]'`.

### K2 — No Cross-Layer Writes

- Commands MUST NOT write to the projection layer (`node_turn_state`,
  `node_migrations`, `province_saturation_breakdown`).
- The ontology layer MUST NOT store ephemeral per-turn scores.
- The projection layer MUST NOT mutate ontology or state.

- **Track 1**: Documented only.
- **Track 2**: Enforced by lint in `command-dispatch`.

### K3 — Worldgen Determinism

The same `(seed_hash, prompt_version)` MUST produce an identical
`ancient_layer` artifact when re-bootstrapping the same world.

- **Track 1**: Enforced via cache-by-hash in `translate-premise-to-spec`
  (see T1-PR2).
- **Track 2**: Same rule extends to all generated world-layer artifacts.

### K4 — Backward Compatibility

If `worldgen_spec.ancient_layer` is missing or malformed, all world-layer
runtime code (Track 2 Phase 4–8) MUST be a strict no-op. The canonical
loop must remain green with zero ancient-layer data.

- **Track 1**: Enforced by `ancient_layer` being optional jsonb extension.
  No code changes to `commit-turn` whatsoever.
- **Track 2**: Phase 4–8 stubs check for `ancient_layer` presence first.

### K5 — Projection Retention

Per-turn projection tables have bounded retention:

| Table | Retention | Purpose |
|---|---|---|
| `node_turn_state` | 20 turns | Migration metrics, saturation deltas |
| `node_migrations` | 50 turns | Migration event audit |
| `node_lifecycle_events` | forever | Permanent lifecycle audit |
| `province_saturation_breakdown` | 20 turns (per turn snapshot) | UI history |

- **Track 1**: N/A.
- **Track 2**: Enforced in `commit-turn` Phase 9 cleanup function.

---

## 3. Track 1 / Track 2 Split

### Track 1 — Beta-safe foundation

**Allowed writes (L1):** Exactly one new write path beyond today's canonical loop:

```sql
UPDATE world_foundations
   SET worldgen_spec = jsonb_set(worldgen_spec, '{ancient_layer}', :payload)
 WHERE id = :world_foundations_id;
```

Plus UI-local React state and localStorage for wizard drafts.

**Forbidden in Track 1:**

| Surface | Status |
|---|---|
| `realm_resources` (writes) | ❌ |
| `cities`, `province_nodes`, `province_routes`, `flow_paths` | ❌ |
| `node_inventory`, `node_flow_state`, `node_economy_history` | ❌ |
| `military_stacks`, `military_stack_composition` | ❌ |
| `city_buildings`, `city_market_baskets` | ❌ |
| `commit-turn`, `refresh-economy`, `command-dispatch`, `useGameSession` runtime | ❌ |
| New edge functions (except extending `translate-premise-to-spec`) | ❌ |
| New DB migrations | ❌ |
| New DB tables | ❌ |

### Track 2 — Post-beta activation

Activated only when all six gate conditions (G1–G6) in
`docs/architecture/world-layer-activation-gate.md` are simultaneously met.

---

## 4. `ancient_layer` Field Whitelist (L2)

`worldgen_spec.ancient_layer` may contain **only** these top-level keys:

```ts
interface AncientLayerSpec {
  version: 1;
  generated_with_prompt_version: number;     // K3 determinism
  seed_hash: string;                         // K3 determinism
  reset_event: {                             // FLAVOR
    type: string;
    description: string;
    turn_offset: number;
  };
  lineage_candidates: LineageProposal[];     // SEED ARTIFACT (AI proposals)
  selected_lineages: string[];               // USER CHOICE (IDs only)
  mythic_seeds: MythicSeed[];                // SEED ARTIFACT (hex coords + tag)
}
```

**Forbidden categories** in `ancient_layer` (any track):

| Category | Examples | Belongs in |
|---|---|---|
| Runtime counters | `population`, `gold_reserve` | `realm_resources`, `cities` |
| Control state | `controlled_by`, `integration_progress` | `node_control_relations` (T2) |
| Route state | `lifecycle_state`, `maintenance_level` | `route_state` (T2) |
| Migration state | `migration_pull`, `flow_volume` | `node_turn_state`, `node_migrations` (T2) |
| Per-turn projections | anything mutated per `commit-turn` | dedicated projection tables (T2) |
| Long AI narrative outputs | chronicle entries | `chronicle_entries`, `world_events` |

### L2 Enforcement Scope (post Δ-A, Δ-C)

| Layer | Enforces | Does NOT enforce |
|---|---|---|
| TypeScript (closed interface, no index signature) | top-level key whitelist (compile-time) | runtime shape |
| Zod `.strict()` in `translate-premise-to-spec` | top-level whitelist + nested shape | direct SQL writes outside the edge function |
| Test layer | regression on the above | anything outside tested files |

**What Track 1 explicitly does NOT enforce:** direct `UPDATE world_foundations`
outside `translate-premise-to-spec`. The committer set in Track 1 is small
enough (`translate-premise-to-spec` + UI wizard step) that the L1 whitelist
plus code review provides adequate protection. Full DB enforcement
(`validate_ancient_layer` CHECK constraint) lands in **T2-PR0**.

---

## 5. Track 2 Activation Gate (L3 → G1–G6)

See `docs/architecture/world-layer-activation-gate.md` for the full gate
specification. Summary:

| # | Condition |
|---|---|
| G1 | `BETA_SCOPE.md` extended with "World-layer simulation (post-beta)" via separate PR |
| G2 | T1-PR1+PR2+PR3 in `main` for ≥7 calendar days |
| G3 | `BetaSmokeHarness` 30-turn green for 7 consecutive days |
| G4 | No open `priority:P0`/`P1` issues in canonical loop scope |
| G5 | Track 2 has its own smoke profile testing Phase 4–9 no-op without `ancient_layer` |
| G6 | This document has `status: Normative` |

Opening Track 2 mainline merges requires an **explicit signed approval
commit** in `world-layer-activation-gate.md`. Without it, CI rejects
Track 2 PRs.

---

## 6. CI Heuristic Guardrail (Δ-D)

`scripts/check-track1-writes.ts` is a **heuristic** CI guardrail, not a
formal proof of absence of forbidden write paths.

**Detects:**

- Direct `.from("<table>").insert/update/upsert/delete(...)` in TS/JS
- New `INSERT/UPDATE/DELETE` in SQL migration files
- New `supabase.rpc("<name>", ...)` calls against a baseline allowlist

**Does NOT detect:**

- Helper wrappers (`db.write(...)`) without static analysis
- Dynamically-built table names (`from(varName)`)
- Indirect writes inside existing RPCs that begin mutating forbidden tables
- DB triggers activated by writes to allowed tables

For Track 1 this heuristic is sufficient because the new committer set is
very small. Reviewers must manually verify the missing categories during
code review using the checklist in §8.

---

## 7. Track 2 Technical Contracts (preview)

Full implementation specs land with their respective Track 2 PRs. Brief preview:

- **`rpc_found_city`** — atomic 8-step PL/pgSQL transaction owned by a single
  `SECURITY DEFINER` procedure. No edge function helper or client code may
  perform partial steps.
- **Route lifecycle** — owned by `commit-turn` Phase 4.
  `planned → under_construction → usable → maintained → degraded → blocked`
  with explicit gold/turn maintenance sink from `realm_resources.gold_reserve`.
- **Control progression** — `unknown < contacted < connected < dependent <
  integrated < anchored`. `anchored` is the only non-reversible state.
  Maximum 1 demote per turn (graduated decay). `contested` is a derived
  flag, never resets state.
- **Migration ↔ economy contract** — `needs_score` from `city_market_baskets`
  need baskets; `opportunity_score` from civic baskets surplus +
  `route_state.quality_level` + carrying capacity headroom. Migration
  never reads narrative/AI outputs.
- **Commit-turn ordering** — Phase 4 (route) → Phase 5 (projection) →
  Phase 6 (control + cache) → Phase 7 (migration) → Phase 8 (neutral
  lifecycle) → Phase 9 (retention cleanup).

---

## 8. Reviewer Checklist (T1 PRs)

For each Track 1 PR, the reviewer must verify:

- [ ] No new `.insert/.update/.upsert/.delete` against any forbidden table (§3)
- [ ] No changes to `commit-turn`, `refresh-economy`, `command-dispatch`,
      `useGameSession` runtime behavior
- [ ] No new edge functions (except `translate-premise-to-spec` extension in T1-PR2)
- [ ] No DB migrations
- [ ] No new DB tables
- [ ] `BetaSmokeHarness` 30-turn green
- [ ] `scripts/check-track1-writes.ts` passes
- [ ] If `ancient_layer` is touched: Zod schema accepts/rejects the right shapes
      (covered by `src/test/world-layer/*.test.ts`)
- [ ] No helper wrappers added that obscure DB writes (manual scan)

---

## 9. Read-Model Discipline (cross-ref)

World-layer reads must follow the single-projector rule defined in
`docs/architecture/read-model-contract.md`. No new world-layer view may
bypass `useGameSession` Core channel via shadow `.from(...)` in components.

- **Track 1**: read-path is unchanged. No new world-layer reads.
- **Track 2**: new world-layer views (`node_control_relations`, `route_state`,
  `node_turn_state`) are added as Core channel extensions, never as
  component-level fetches.

---

## 10. Document History

| Version | Change |
|---|---|
| v5 | First world-as-ontology proposal (monolithic) |
| v6 | Three-layer split introduced |
| v7 | K1–K5 normative contracts |
| v8 | Two-track split (beta-safe vs post-beta) |
| v9 | L1–L4 contract-lock clauses + G1–G6 gate |
| v9.1 | Δ-A to Δ-E delta patches (current) |
