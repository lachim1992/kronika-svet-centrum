
# World Ontology — Master Plan (v9.1 integrated)

> **Co je tento dokument:** Konsolidace celé designové iterace v5 → v9.1 do jednoho master plánu. Obsahuje finální design (v9.1), kompletní contract-lock klauzule (K1–K5, L1–L4), 6-podmínkový activation gate (G1–G6), 6 contract-lock delta patches (Δ-A až Δ-E z v9.1) a dvoutrack PR roadmapu od T1-PR1 do T2-PR5.
>
> **Status:** připraveno k zahájení T1-PR1.

---

## ČÁST I — Designové východisko (proč world layer)

### 1. Filozofická premisa

Svět nezačíná na prázdné mapě. Začíná **po velkém zlomu** — existuje pradávná vrstva, mytická paměť, rozbitá stará síť, jména a relikty starého řádu. Teprve po katastrofě vzniká věk hráčů. Hráč nestaví v prázdném hexovém poli, ale do krajiny, která už má vlastní paměť.

### 2. Tři vrstvy dat (klíčový rozpad)

| Vrstva | Změna | Příklady | Tabulky |
|---|---|---|---|
| **Ontology** | Permanentní traits | `node_class`, `founding_era`, `mythic_tag` | `province_nodes`, `provinces`, `heritage_claims` |
| **State** | Pomalá změna | `control_state`, `lifecycle_state`, `maintenance_level` | `node_control_relations`, `route_state` |
| **Per-turn projection** | Ephemeral, mažou se | `migration_push/pull`, `saturation_breakdown` | `node_turn_state`, `node_migrations`, `province_saturation_breakdown` |

**Důvod:** současný `province_nodes` má 73 sloupců a míchá všechny tři vrstvy. To zabíjí budoucí evoluci. Rozpad je nutný **před** přidáním jakékoli další funkčnosti.

### 3. User-confirmed designová rozhodnutí

| Otázka | Volba |
|---|---|
| Founder lineages | **Hybrid: AI navrhne, hráč potvrdí** |
| Reset event v UI | **Kombinace: timeline prequel + postupné odkrývání** |
| Player start | **Malá kolonie + 1 dependent minor node** |
| Migrace v UI | **Obojí: mapový overlay + event feed** |

---

## ČÁST II — Contract Lock (K + L + G + Δ)

### K1–K5 (původní v7 normativní kontrakty)

| # | Pravidlo | T1 | T2 |
|---|---|---|---|
| **K1** | Authoritative source vs cache: `node_control_relations` + `route_state` jsou pravdou; `province_nodes.controlled_by` je render cache (update jen v Phase 6) | Dokumentováno | Vynuceno lintem |
| **K2** | No-cross-layer: commandy nepíšou do projection layer, ontology nedrží ephemeral hodnoty | Dokumentováno | Vynuceno lintem v `command-dispatch` |
| **K3** | Worldgen determinism: `seed_hash + prompt_version` = identický `ancient_layer` při re-bootstrap | **Vynuceno už v T1** (cacheované lineage návrhy) | dtto |
| **K4** | Backward compat: chybějící `ancient_layer` = strict no-op v Phase 4–8 | **Vynuceno už v T1** (optional jsonb) | Phase 4–8 strict no-op |
| **K5** | Projection retention: `node_turn_state` 20 turnů, `node_migrations` 50 turnů, lifecycle audit forever | N/A | Cleanup v Phase 9 |

### L1–L4 (v9 contract-lock klauzule)

| # | Pravidlo | Enforcement |
|---|---|---|
| **L1** | Track 1 allowed writes: jen `UPDATE world_foundations.worldgen_spec` | `scripts/check-track1-writes.ts` (heuristika — Δ-D) |
| **L2** | `ancient_layer` field whitelist (7 polí) | TS uzavřený interface + Zod `.strict()` + testy (po Δ-A; DB CHECK přesunut do T2-PR0) |
| **L3** | Track 2 activation gate (G1–G6) | Manuální approval commit + CI |
| **L4** | `world-layer-contract.md` = Normative dokument | Frontmatter `status: Normative` + zařazení do autority precedence v `.lovable/plan.md` |

### Δ-A až Δ-E (v9.1 patches)

| # | Co řeší | Důsledek |
|---|---|---|
| **Δ-A** | L2 vs BETA_SCOPE.md rozpor (žádné migrace v beta okně) | T1-PR1 nemá žádnou DB migraci. Validace v TS + Zod + testy. CHECK constraint deferred do T2-PR0 |
| **Δ-B** | L1 whitelist vs smoke log tabulka rozpor | Žádná nová DB tabulka v T1. G3 verifikace přes existující CI/`dev_smoke_runs` nebo manuálně |
| **Δ-C** | L2 enforcement scope explicitně pojmenován (co vynucuje TS / Zod / testy) | Eliminuje overclaim "DB CHECK" v Track 1 |
| **Δ-D** | `check-track1-writes.ts` jako heuristika, ne formální důkaz | Reviewer ověří chybějící kategorie manuálně |
| **Δ-E** | L4 conflict resolution mezi normativními dokumenty (specializace > supersede commit > P0 freeze) | Eliminuje deadlock při kolizi dvou Normative |

### G1–G6 (Track 2 Activation Gate)

| # | Podmínka | Owner |
|---|---|---|
| **G1** | `BETA_SCOPE.md` rozšířen o "World-layer simulation (post-beta)" mergnutý jako samostatný PR | Beta scope owner |
| **G2** | T1-PR1+PR2+PR3 v `main` minimálně 7 dní | CI |
| **G3** | `BetaSmokeHarness` zelený 7 dní v řadě | CI/manuál (per Δ-B) |
| **G4** | Žádný open P0/P1 issue v canonical loop scope | Triage owner |
| **G5** | Track 2 vlastní smoke profile testuje no-op Phase 4–9 bez `ancient_layer` | Track 2 PR author |
| **G6** | `world-layer-contract.md` má status `Normative` | Architecture owner |

---

## ČÁST III — Two-Track Split

### Track 1 — Beta-safe foundation (lze začít hned)

**Co obsahuje:**
- Dokumentace 5 normativních kontraktů (K1–K5, L1–L4)
- `world_foundations.worldgen_spec.ancient_layer` jako optional jsonb extension (žádný nový sloupec)
- `translate-premise-to-spec` rozšíření: AI navrhne 5–8 lineages
- Wizard krok "Founding Lineages: AI navrhne, hráč potvrdí"
- Mytický prequel obrazovka (čte z `ancient_layer`)
- Dev-only `WorldLayerInspector`
- CI lint guard `check-track1-writes.ts`

**Co neobsahuje:**
- Žádné nové tabulky
- Žádné DB migrace
- Žádné nové commandy
- Žádné změny v `commit-turn` chování
- Žádné map overlays
- Žádný gameplay impact

**Track 1 invariant:** Beta Smoke 30-turn loop musí projít s i bez `ancient_layer`. Zero gameplay impact, zero runtime regression.

### Track 2 — Post-beta activation (vyžaduje G1–G6)

**Co obsahuje:**
- Všechny nové tabulky (7): `node_control_relations`, `route_state`, `node_turn_state`, `node_migrations`, `node_lifecycle_events`, `province_saturation_breakdown`, `heritage_claims`
- Schema změny v `province_nodes` (nové sloupce per §IV.1) a `provinces` (saturation caps)
- Nové `commit-turn` Phase 4–9
- Nové commandy (`FOUND_CITY`, `PLAN_ROUTE`, `CLAIM_HERITAGE`, `RESTORE_MYTHIC_NODE`, `ESTABLISH_CONTACT`, `INTEGRATE_NODE`)
- `rpc_found_city` PL/pgSQL procedura (8-step transakce)
- `route_state` runtime + lifecycle transitions
- Migration pull/push + UI overlays + chronicle feed
- DB CHECK constraint `validate_ancient_layer` (přesunuto z T1 per Δ-A)

**Track 2 invariant:** žádný PR se nemerguje, dokud nejsou splněny všechny G1–G6 současně.

---

## ČÁST IV — Klíčové technické kontrakty (Track 2)

### 1. `province_nodes` per-attribute mapping

Každý nový atribut explicitně označen [E] existing / [N] new / [D] derived:
- `growth_specialization` [N], `founding_era` [N], `mythic_tag` [N], `strategic_kind` [N]
- `controlled_by` [E] → reklasifikováno jako **render cache** (K1)
- `source_profile` [D] = derived view nad `node_economy_history`

### 2. `rpc_found_city` — atomická 8-step transakce

```
PL/pgSQL SECURITY DEFINER, jediný owner:
  1. INSERT cities
  2. INSERT province_nodes (major)
  3. INSERT node_control_relations (anchored, 4×100)
  4. UPDATE province_nodes.controlled_by (cache seed)
  5. UPDATE provinces (anchor_node_id, carrying_capacity_base)
  6. INSERT province_routes (planned, do nejbližšího node)
  7. INSERT/UPDATE province_saturation_breakdown (recompute baseline)
  8. INSERT world_events (city_founded chronicle)
```

Žádný edge function helper ani client kód nesmí provádět dílčí kroky samostatně. `bootstrap=true` flag přidá heritage_claim row a dependent minor node v 9. kroku.

### 3. Route lifecycle (Phase 4 owner)

`planned` → `under_construction` (gold/labor per turn) → `usable` (build 100%) → `maintained` (maintenance paid: `length × quality_mult × 0.5 gold/turn`) → `degraded` (3 turny unpaid) → `blocked` (event/command).

Maintenance je **explicitní resource sink** odečítaný z `realm_resources.gold_reserve` v Phase 4.

### 4. Control progression — reversibility + monotonicity

`unknown < contacted < connected < dependent < integrated < anchored`.

- `anchored` je **jediný non-reversible** stav (jednou anchored, jen contestable).
- V jednom turnu max **1 demote** (graduální decay).
- `contested` je derivovaný flag (≥2 hráči nad threshold), nikdy neresetuje state.

### 5. Migration ↔ Economy explicitní kontrakt

| Komponenta | Vstup |
|---|---|
| `needs_score` (push) | `city_market_baskets.fulfillment_ratio` pro `staple_food`, `basic_clothing`, `fuel` |
| `opportunity_score` (pull) | civic baskets surplus + `route_state.quality_level` + carrying capacity headroom |
| `route_throughput_cap` | `route_state.throughput × lifecycle_multiplier` |
| `cultural_affinity` | `heritage_claims` shoda (×1.2 / ×0.8) |

**Tvrdá pravidla:** migration nikdy nečte `world_events`, `chronicle_entries`, ani raw `production_recipes`. Solver běží **před** migration v commit-turn pořadí.

### 6. Commit-turn pořadí (Track 2)

```
Phase 1: Command dispatch resolution           (existing)
Phase 2: World physics tick                    (existing)
Phase 3: Economy solver (refresh-economy)      (existing)
Phase 4: Route state refresh + lifecycle       (NEW)
Phase 5: Node projection (node_turn_state)     (NEW)
Phase 6: Control progression + cache update    (NEW)
Phase 7: Migration resolve                     (NEW)
Phase 8: Neutral lifecycle (mythic spawn)      (NEW)
Phase 9: Projection retention cleanup          (NEW)
Phase 10: Chronicle entries                    (existing)
```

Bez `ancient_layer` jsou Phase 4–8 strict no-op (K4).

---

## ČÁST V — PR Roadmap

### Track 1 PRs

#### **T1-PR1 — Contracts + types + Zod + CI lint** (start hned)

1. **Documentation (5 souborů):**
   - `docs/architecture/world-layer-contract.md` (Normative, frontmatter L4 + Δ-E `on_conflict`, plný text K1–K5 + L1–L4)
   - `docs/architecture/world-layer-entity-mapping.md` (existing-repo entity → v9.1 mapping)
   - `docs/architecture/world-layer-activation-gate.md` (G1–G6, prázdný approval slot)
   - Update `.lovable/plan.md` autority precedence (přidat `world-layer-contract.md` na pozici 4)
   - Update `docs/architecture/read-model-contract.md` (sekce "World-layer reads")

2. **Types (no runtime impact):**
   - `supabase/functions/_shared/world-bootstrap-types.ts`: `AncientLayerSpec` (uzavřený interface — Δ-C), `LineageProposal`, `MythicSeed`, optional `ancient_layer` ve `WorldgenSpecV1`
   - `src/types/worldBootstrap.ts`: re-export

3. **Validation (in-app, no DB):**
   - `supabase/functions/_shared/ancient-layer-schema.ts`: Zod schema `.strict()` (Δ-A, Δ-C)

4. **CI lint guard:**
   - `scripts/check-track1-writes.ts` (heuristika — Δ-D)
   - `package.json` scripts entry + CI workflow zapojení

5. **Tests:**
   - `tests/world-layer/ancient-layer-whitelist.test.ts` (Zod reject extra keys)
   - `tests/world-layer/ancient-layer-shape.test.ts` (nested shape)

**Acceptance:** Beta Smoke zelený, Zod testy zelené, žádná DB migrace v PR, žádná nová tabulka, žádná změna v `commit-turn`/`refresh-economy`/`command-dispatch`/`useGameSession`.

#### **T1-PR2 — translate-premise-to-spec ancient_layer extension**

- Edge function rozšíření: AI vygeneruje 5–8 lineage návrhů + reset event flavor + mythic seed hexes
- Determinismus: `seed_hash + prompt_version` cache (K3)
- Output do `worldgen_spec.ancient_layer.lineage_candidates`
- Wizard krok "Founding Lineages" (default: AI vybere první 3 → quick bootstrap nezablokovaný)
- `selected_lineages` do `worldgen_spec.ancient_layer.selected_lineages`
- **Žádné DB schema změny. Read-path beze změny.**

#### **T1-PR3 — Mytický prequel UI + Dev inspection**

- `WorldCreationOverlay` rozšířen o "Mytický prequel" obrazovku před turn 1
- Dev-only `WorldLayerInspector` v `DevTab` zobrazuje raw `ancient_layer` JSON
- **Žádný gameplay impact**

---

### Track 2 PRs (po G1–G6)

#### **T2-PR0 — `BETA_SCOPE.md` aktualizace + DB CHECK constraint**

- Přidat sekci "World-layer simulation (post-beta-foundation)" do `BETA_SCOPE.md`
- DB migration: `validate_ancient_layer(jsonb)` PL/pgSQL function + `worldgen_spec_ancient_layer_whitelist` CHECK constraint na `world_foundations` (přesunuto z T1 per Δ-A)
- **Tento PR je gate pro všechny ostatní Track 2 PRs**

#### **T2-PR1 — Schema migrace + invariant scaffolding**

- 7 nových tabulek: `node_control_relations`, `route_state`, `node_turn_state`, `node_migrations`, `node_lifecycle_events`, `province_saturation_breakdown`, `heritage_claims`
- `province_nodes`: nové sloupce per ČÁST IV.1 + CHECK constraint na `node_class`
- `provinces`: `node_slot_soft_cap`, `carrying_capacity_base`, `anchor_node_id`
- `province_routes`: `lifecycle_state`, `route_doctrine`, `waypoint_hexes`, `route_kind`
- COMMENT ON COLUMN pro K1 cache fields
- Backfill funkce pro existing rows
- Lint guard utility v `command-dispatch` (K2 enforcement)
- Retention cleanup PL/pgSQL function (K5)
- `commit-turn` Phase 4–9 stuby (strict no-op bez `ancient_layer`)

#### **T2-PR2 — Route doctrine + waypoint pathfinding + lifecycle**

- Phase 4 plně aktivní (route lifecycle transitions per ČÁST IV.3)
- Maintenance gold sink z `realm_resources.gold_reserve`
- Waypoint pathfinding přes hexy

#### **T2-PR3 — `rpc_found_city` + FOUND_CITY + PLAN_ROUTE**

- PL/pgSQL `rpc_found_city` (8-step transakce per ČÁST IV.2)
- `command-dispatch` handlery: `FOUND_CITY`, `PLAN_ROUTE` volají RPC
- UI: `FoundCityDialog`, `RoutePlannerPanel`, saturation widget (4 bary)
- `useGameSession` Core: přidat `node_control_relations` view (per L4 read-model contract)

#### **T2-PR4 — Control progression + migration + lifecycle commandy**

- Phase 5–7 plně aktivní
- Reversibility/monotonicity per ČÁST IV.4
- Economy→migration kontrakt per ČÁST IV.5
- Migration overlay (mapa) + chronicle feed events
- Commandy: `ESTABLISH_CONTACT`, `INTEGRATE_NODE`, `CLAIM_HERITAGE`, `RESTORE_MYTHIC_NODE`

#### **T2-PR5 — Neutral lifecycle + strategic build commandy**

- Phase 8 plně aktivní (mythic node spawn, neutral growth)
- Specializované strategické nody (`BUILD_TOLL_NODE`, `BUILD_FORT_NODE`)

---

## ČÁST VI — Co výslovně NEDĚLÁME

- ❌ Persistent tick ve world-layeru (mimo `commit-turn`)
- ❌ AI factions logika v Track 1
- ❌ Multiplayer rozšíření > 2 humans
- ❌ Sport/league/academy integrace s world-layerem
- ❌ Lore-heavy generators jako blocking součást player loopu
- ❌ Smíchání ontology / state / projection do jedné tabulky (původní v5 chyba)

---

## ČÁST VII — Souhrn celé iterace v5 → v9.1

| Verze | Hlavní přínos | Hlavní problém |
|---|---|---|
| **v5** | První pokus o world-as-ontology | Monolitní `province_nodes`, vše v jedné tabulce |
| **v6** | 3-vrstvý rozpad (ontology/state/projection) | Stále nedostatečně specifické kontrakty |
| **v7** | K1–K5 normativní kontrakty | Šlo proti beta scope (migrace, nový bootstrap) |
| **v8** | Two-track split (beta-safe foundation vs post-beta) | Měkký activation gate, neuzamčený whitelist |
| **v9** | L1–L4 contract-lock klauzule + G1–G6 gate | DB migrace v T1 vs `BETA_SCOPE.md` rozpor |
| **v9.1** | Δ-A až Δ-E delta patches | — (final, ready for T1-PR1) |

---

## ČÁST VIII — Doporučený další krok

**Spustit T1-PR1.** Žádný gameplay impact, žádná DB změna, žádná regrese Beta Smoke. Otevírá cestu pro T1-PR2 (translate-premise-to-spec extension) a T1-PR3 (mytický prequel UI).

Po splnění G1–G6 (typicky 7+ dní po T1-PR3 v `main`) následuje T2-PR0 a postupně T2-PR1 → T2-PR5.

**Po tvém schválení tohoto master plánu otevírám T1-PR1 v Default mode** s 5 deliverables popsanými v ČÁST V.
