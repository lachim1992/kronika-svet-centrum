---
status: Reference
authority_level: 2
applies_to: world-layer entity mapping (existing repo → v9.1 design)
---

# World Layer Entity Mapping

> **Purpose:** Single reference for "where does this attribute belong" when
> implementing world-layer features. Eliminates re-litigation about whether
> a given concept maps to existing tables or requires new ones.
>
> **Authority:** Reference. On conflict with
> `docs/architecture/world-layer-contract.md` (Normative), the contract wins.

---

## 1. Existing repo entities → v9.1 role

| Existing entity | v9.1 role | Track |
|---|---|---|
| `province_nodes` | Ontology core. T2 adds per-attribute extensions (see §2). Cache field `controlled_by` reclassified as render cache (K1). | T2 schema, T1 design |
| `province_routes` | Route identity + intent. T2 adds `lifecycle_state`, `route_doctrine`, `waypoint_hexes`, `route_kind`. | T2 |
| `flow_paths` | Materialized hex path. Unchanged. | — |
| `realm_resources` | Cost ledger for world-layer commands (FOUND_CITY drains gold/grain). | T2 |
| `city_market_baskets` | **Input for `needs_score` in migration pull** (see contract §7). | T2 |
| `cities` | Source of truth for city identity; FOUND_CITY inserts here. | T2 |
| `world_foundations.worldgen_spec` | Carrier for `ancient_layer` jsonb extension. | **T1** |
| `node_inventory` | Unchanged. | — |
| `node_flow_state` | Exists; T2 links to new `node_turn_state`. | T2 |
| `node_economy_history` | Exists; source for derived `source_profile` view. | — |
| `node_projects` | Route construction queue — drives `lifecycle_state` transitions. | T2 |
| `useGameSession` Core channel | T1: unchanged. T2: adds `node_control_relations` view. | T1/T2 |
| `command-dispatch` | T1: unchanged. T2: adds K1/K2 lint guard + new commands. | T2 |
| `commit-turn` | T1: unchanged. T2: adds Phase 4–9. | T2 |
| `chronicle_entries`, `world_events` | Narrative side-effects of world-layer events. Migration MUST NOT read these. | T2 (write-only side) |

---

## 2. `province_nodes` per-attribute mapping (Track 2)

Legend: **[E]** existing column / **[N]** new column / **[D]** derived view

| Attribute | Status | Layer | Source / definition |
|---|---|---|---|
| `id`, `province_id`, `hex_q`, `hex_r` | [E] | Ontology | unchanged |
| `node_class` | [E] | Ontology | T2 adds CHECK constraint enumerating allowed values |
| `name`, `description` | [E] | Ontology | unchanged |
| `growth_specialization` | [N] | Ontology | enum: `agrarian`, `industrial`, `mercantile`, `martial`, `sacred` |
| `founding_era` | [N] | Ontology | enum: `ancient`, `legendary`, `historical`, `recent` |
| `mythic_tag` | [N] | Ontology | nullable string; references `ancient_layer.mythic_seeds[].tag` |
| `strategic_kind` | [N] | Ontology | enum for strategic-build nodes (`toll`, `fort`, `signal`, `relay`) |
| `controlled_by` | [E] → reclassified | **Cache** (K1) | render cache; authoritative source is `node_control_relations` |
| `population`, `prosperity`, `stability` | [E] | State | existing semantics; T2 may rebalance via Phase 5 projection inputs |
| `source_profile` | [D] | Projection | derived view over `node_economy_history` |

---

## 3. New tables (Track 2)

| Table | Layer | Retention | Purpose |
|---|---|---|---|
| `node_control_relations` | State | forever | Per-(node, player) authoritative control: economic, security, cultural, admin scores → derived `control_state` |
| `route_state` | State | forever | Per-route runtime: `lifecycle_state`, `maintenance_level`, `quality_level`, `throughput_cap`, `last_maintained_turn` |
| `heritage_claims` | Ontology | forever | Per-(player, lineage) claim assignments + node bindings |
| `node_turn_state` | Projection | 20 turns | Per-(node, turn): `migration_push`, `migration_pull`, `needs_score`, `opportunity_score` |
| `node_migrations` | Projection | 50 turns | Per-(turn, route, origin, dest): population delta, cultural affinity modifier |
| `node_lifecycle_events` | Audit | forever | Permanent audit of node creation/destruction/promotion |
| `province_saturation_breakdown` | Projection | 20 turns | Per-(province, turn): admin/route/settlement/extraction component breakdown |

---

## 4. New table additions to existing tables (Track 2)

### `provinces`

| Column | Type | Purpose |
|---|---|---|
| `node_slot_soft_cap` | int | Soft limit on node count before saturation penalties |
| `carrying_capacity_base` | int | Baseline population capacity, scales with anchor + infrastructure |
| `anchor_node_id` | uuid FK | Reference to province's primary major node |

### `province_routes`

| Column | Type | Purpose |
|---|---|---|
| `lifecycle_state` | enum | `planned`, `under_construction`, `usable`, `maintained`, `degraded`, `blocked` |
| `route_doctrine` | enum | `fastest`, `safest`, `cheapest`, `cultural` |
| `waypoint_hexes` | jsonb | Ordered list of hex coords for non-greedy pathing |
| `route_kind` | enum | `trade`, `military`, `pilgrimage`, `migration` |

---

## 5. Track 1 mapping (only `worldgen_spec.ancient_layer`)

Track 1 touches **only** `world_foundations.worldgen_spec.ancient_layer`,
which is an optional jsonb extension. Field whitelist is locked by
`world-layer-contract.md` §4 (L2).

| `ancient_layer` field | Purpose | Generated by |
|---|---|---|
| `version` | Schema version (currently 1) | `translate-premise-to-spec` (T1-PR2) |
| `generated_with_prompt_version` | K3 determinism marker | `translate-premise-to-spec` |
| `seed_hash` | K3 determinism marker | `translate-premise-to-spec` |
| `reset_event` | Mythic prequel flavor (type, description, turn offset) | AI proposal, deterministic seed |
| `lineage_candidates[]` | 5–8 AI-proposed founding lineages | AI proposal |
| `selected_lineages[]` | User-confirmed lineage IDs | Wizard step |
| `mythic_seeds[]` | Hex coordinates + tags for future mythic node spawn | AI proposal, deterministic seed |

No Track 1 field maps to State or Projection layers.
