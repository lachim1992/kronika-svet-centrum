# Discovery, Neutral Nodes & Influence Loop

> Status: Patch 0–8 ✅ · Patch 9a–9e ✅ · Patch 10 ✅ · Patch 11 ✅ · Patch 12 ✅ (multiplayer kontestace) · Patch 13 ✅ (AI faction reaguje na rivaly + používá block_node_annexation) · Patch 14 ✅ (rumors o objevech a anexích v tabulce `rumors`, dedupe přes source_hash)

## Verdikt po analýze repa

Reálný stav (ne jen dokumenty):

- `province_nodes` už **existuje** s `node_tier (major/minor/micro)`, `node_subtype`, `population`, `controlled_by`, `production_base`, `faith_output`, `metadata`. Není třeba paralelní `world_nodes` tabulka — rozšíříme stávající.
- `compute-province-nodes` ale **generuje uzly jen pro vlastněné provincie** (`prov.owner_player`). Neutrální nody nikdy nevzniknou.
- Existuje `discoveries` tabulka, ale jen per-player pro `entity_type='province_hex'`. `HexMapView` **fog of war nepoužívá**.
- `explore-hex` (tile-by-tile, adjacency check) **funguje** a píše do `discoveries`. Reusneme jeho logiku.
- `command-dispatch` nemá `EXPLORE_TILE`, `OPEN_TRADE_WITH_NODE`, `SEND_ENVOY_TO_NODE`, `APPLY_MILITARY_PRESSURE`, `ANNEX_NODE`.
- `generate-civ-start` **tvrdě generuje 800–1500 obyvatel** s peasants/burghers/clerics. Přímo proti zadání "100 rolníků". Validátor `validateAndClamp` to navíc clampuje na min 800 — i kdyby AI vrátila menší číslo, přepíše se zpět nahoru.
- `compute-trade-flows` nečte žádný neutral-node output.

## Cíl této iterace

Postavit první funkční discovery + influence smyčku **bez AI rozhodování**. AI pouze pojmenovává a popisuje (post-fact narratives). Engine drží stav, produkci, vliv, anexi.

## Architektonická pravidla (závazná)

1. AI **nesmí** rozhodovat: produkci nodu, populaci, objevenost, vliv, anexi, startovní populační třídy.
2. AI **smí**: po `discovered=true` napsat flavor text; po anexi napsat kroniku.
3. Žádná paralelní entita „world_node" — rozšíříme `province_nodes`.
4. Žádný shotgun katalog 1000 položek — **20 kultur × 30 profilů** stačí pro stovky variant.
5. Všechny hráčské akce jdou přes `command-dispatch` (Command Gateway).
6. **Engine override po AI** (ne jen prompt) — i kdyby AI vrátila špatná čísla, handler je tvrdě přepíše.

---

## Patch 0 — Fix startovní populace na 100 rolníků

`generate-civ-start`:

- Aktualizovat prompt (informativní, zarovnává AI rozumně).
- Klíčové: **přepsat `validateAndClamp` na engine override**, ne clamp. I kdyby AI vrátila 1200, handler uloží:

```ts
settlement: {
  population_total: 100,
  population_peasants: 100,
  population_burghers: 0,
  population_clerics: 0,
  settlement_level: "hamlet",
  city_stability: clamp(st.city_stability, 55, 80),
  special_resource_type: ...,    // může z AI
  settlement_flavor: ...,        // může z AI
}
```

AI smí pojmenovat osadu, navrhnout `special_resource_type`, napsat `settlement_flavor`, `core_myth`, `cultural_quirk`, `architectural_style`. Populační čísla a `settlement_level` jsou **konstanty z enginu**.

Aktualizovat i `getDefaults()` na 100/100/0/0.

---

## Patch 1 — Datový model

Migrace (jeden balík):

```sql
ALTER TABLE province_nodes
  ADD COLUMN is_neutral boolean NOT NULL DEFAULT false,
  ADD COLUMN discovered boolean NOT NULL DEFAULT false,
  ADD COLUMN culture_key text,
  ADD COLUMN profile_key text,
  ADD COLUMN autonomy_score int DEFAULT 80,
  ADD COLUMN discovered_at timestamptz,
  ADD COLUMN discovered_by text;

-- Owned nodes hráčových měst se považují za "objevené" pro vlastníka:
UPDATE province_nodes SET discovered = true WHERE controlled_by IS NOT NULL;

CREATE TABLE map_visibility (
  session_id uuid NOT NULL,
  player_name text NOT NULL,
  tile_q int NOT NULL,
  tile_r int NOT NULL,
  visibility text NOT NULL DEFAULT 'unknown',  -- 'unknown'|'seen'|'visible'
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  discovered_by text,
  PRIMARY KEY (session_id, player_name, tile_q, tile_r)
);

CREATE TABLE world_node_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  node_id uuid NOT NULL REFERENCES province_nodes(id) ON DELETE CASCADE,
  basket_key text NOT NULL,
  good_key text,
  quantity numeric NOT NULL DEFAULT 1,
  quality numeric NOT NULL DEFAULT 1,
  exportable_ratio numeric NOT NULL DEFAULT 0.4
);

CREATE TABLE node_trade_links (
  session_id uuid NOT NULL,
  player_name text NOT NULL,
  node_id uuid NOT NULL REFERENCES province_nodes(id) ON DELETE CASCADE,
  link_status text NOT NULL DEFAULT 'none',
  -- none|contacted|trade_open|protected|vassalized|annexed
  trade_level int DEFAULT 0,
  route_safety numeric DEFAULT 1,
  route_distance numeric,
  export_access numeric,
  PRIMARY KEY (session_id, player_name, node_id)
);

CREATE TABLE node_influence (
  session_id uuid NOT NULL,
  player_name text NOT NULL,
  node_id uuid NOT NULL REFERENCES province_nodes(id) ON DELETE CASCADE,
  economic_influence numeric NOT NULL DEFAULT 0,
  political_influence numeric NOT NULL DEFAULT 0,
  military_pressure numeric NOT NULL DEFAULT 0,
  resistance numeric NOT NULL DEFAULT 50,
  integration_progress numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, player_name, node_id)
);
```

RLS: SELECT pro members session, INSERT/UPDATE pouze service_role.

---

## Patch 2 — Catalog (engine, žádné AI)

Soubor `src/lib/worldNodeCatalog.ts` + zrcadlo `supabase/functions/_shared/worldNodeCatalog.ts`:

- **20 kultur** (`river_clay_folk`, `highland_shepherds`, `salt_marsh_clans`, `forest_charcoal_burners`, `desert_caravan_kin`, …) — `terrainBias[]`, `worldToneBias[]`, `visualTags[]`, `socialTags[]`, `preferredBaskets[]`, `nameRoots[]`.
- **30 profilů** (`grain_hamlet`, `fishing_village`, `salt_panner`, `iron_outpost`, `forest_shrine`, `roadside_camp`, `ruined_keep`, …) — `nodeType`, `settlementTier`, `populationRange`, `outputBaskets[]`, `terrainBias[]`, `defenseRange`, `prosperityRange`, `autonomyRange`, `defaultGoods{}`.

Iterace 1 typy: `neutral_settlement`, `resource_outpost`, `shrine`, `ruin`.

Generátor jména = deterministická kombinace `culture.nameRoots` + `seedHash(node_key)`.

Test: shoda hashů obou kopií katalogu.

---

## Patch 3 — `generate-neutral-nodes` edge funkce

Vstup: `{ session_id, seed, count? }`.

Pipeline (čistě deterministická, bez AI):
1. Načíst `province_hexes` + `worldgen_spec` + premise tone.
2. Vyloučit: tiles startovních měst + radius 2 kolem nich + neprůchozí biomy.
3. Spočítat `count` podle map size (default `floor(hexCount / 8)`, clamp 8–20).
4. Pro každý slot: seeded random tile → match `profile_key` na biom → match `culture_key` na terén+tone → vygenerovat `name`, `population`, `defense`, `prosperity`, `autonomy`.
5. Insert do `province_nodes` (`is_neutral=true`, `discovered=false`, `controlled_by=null`, `is_active=true`).
6. Insert do `world_node_outputs` (1 produkt pro hamlet/outpost/shrine, 0 pro ruin).

**Pořadí v `create-world-bootstrap`** (oprava):

```text
1. generate-world-map
2. založit startovní města + provincie hráče + AI
3. compute-province-nodes  (jen owned provincie — beze změny)
4. generate-neutral-nodes  (neowned tiles uprostřed mapy)
5. world-generate-init     (kroniky / lore, background)
```

Failure non-fatal (warning v `steps[]`).

---

## Patch 4 — Fog of war při bootstrapu + UI

Bootstrap: po vytvoření `cities` zapsat počáteční `map_visibility` per player:
- Tile startovního města → `visible`.
- Sousedi (radius 1) → `visible`.
- Radius 2 → `seen`.

`HexMapView`:
- Načíst `map_visibility` pro `currentPlayerName`.
- `unknown` → černá maska, žádné labely.
- `seen` → ztlumeně (opacity 0.4), poslední známý stav.
- `visible` → plně.
- Neutral nody se kreslí jen pokud `discovered=true` AND tile aspoň `seen`.

---

## Patch 5 — `EXPLORE_TILE` command

Přidat do `command-dispatch`:

```
EXPLORE_TILE: { tile_q, tile_r, actor_city_id? }
```

Validace: cílový tile musí být sousední k některému `visible` tile hráče.

Handler (`command-explore-tile` nebo inline):
1. `map_visibility` pro tile → `visible`, sousedy → `seen` (pokud `unknown`).
2. Pokud na tile `province_node WHERE is_neutral=true AND discovered=false` → set `discovered=true`, `discovered_by=playerName`, `discovered_at=now()`.
3. Insert `discoveries` (per-player) + `world_memories` (geo-vázáno).
4. Insert `world_action_log`.
5. **Background** (`EdgeRuntime.waitUntil`): `event-narrative` pro flavor text — non-blocking.

---

## Patch 6 — Trade & Influence commands

Čtyři nové commands:

```
OPEN_TRADE_WITH_NODE       { node_id }
SEND_ENVOY_TO_NODE         { node_id }
APPLY_MILITARY_PRESSURE    { node_id, stack_id }
ANNEX_NODE                 { node_id }
```

| Command | Effect |
|---|---|
| OPEN_TRADE_WITH_NODE | `link_status='trade_open'`, `trade_level=1`; `economic_influence += 5/turn`; vyžaduje `discovered=true` |
| SEND_ENVOY_TO_NODE | `political_influence += 8` (one-shot/turn); cost: wealth |
| APPLY_MILITARY_PRESSURE | `military_pressure += 10`; `prosperity_score -= 1`; +unrest hráče |
| ANNEX_NODE | povoleno **pouze** pokud `integrationPressure ≥ resistance + autonomy*0.5` |

Formule (sdílená utilita `_shared/nodeInfluence.ts`):

```ts
integrationPressure = econ*0.45 + pol*0.35 + mil*0.20
annexAllowed = integrationPressure >= resistance + autonomy*0.5
```

Anexe:
- `province_nodes`: `is_neutral=false`, `controlled_by=playerName`.
- `node_trade_links.link_status='annexed'`.
- Adapter `ownedNeutralNodesAsMinorEconomyInputs()` přičte produkci hráči — **bez** vytvoření `cities` row.
- `world_chronicle` event (background).

---

## Patch 7 — Economy integration

`compute-trade-flows`:
- Načíst `world_node_outputs` JOIN `node_trade_links WHERE link_status IN ('trade_open','protected','vassalized')` pro každého hráče.
- Přičíst `quantity * exportable_ratio * route_safety` do supply hráče per basket.
- **Annexed** nody přes adapter, plnou produkci, bez safety penalty.

`refresh-economy` beze změny logiky.

---

## Patch 8 — UI

**Mapa** (`HexMapView`): fog vrstva (Patch 4).

**`NeutralNodePanel.tsx`** (klik na discovered neutral node):
- Název, kultura, profil, populace, autonomy, defense, prosperity.
- **Produkce**: list `world_node_outputs`.
- **Vliv hráče**: 3 progress bary (econ/pol/mil) + resistance + integration progress.
- Tlačítka (disabled podle stavu): Otevřít obchod / Poslat vyslance / Vojenský tlak / Anektovat.
- Pod Anektovat vždy zobrazit chybějící podmínku, pokud nepovoleno.

**EconomyTab**: nová sekce „Příspěvek z neutrálních uzlů" — list aktivních trade links + množství.

---

## Co NEděláme v této iteraci

- Prehistoric / ancient remnant nody s lore mechanikou.
- AI generování kultur za běhu.
- Komplexní diplomacie s nody, války, contested influence.
- Konverze anexovaného nodu → plnohodnotné `cities`.
- Multiplayer paralelní vliv více hráčů na týž node.
- Katalog 1000 kultur — později.
- AI faction fog of war (AI vidí všechno, zjednodušení).

---

## Pořadí patchů (commits)

1. **Patch 0** — start populace 100 (engine override).
2. **Patch 1** — migrace.
3. **Patch 2** — catalog (frontend + shared, hash test).
4. **Patch 3** — `generate-neutral-nodes` + zařazení **ZA** `compute-province-nodes`.
5. **Patch 4** — fog of war (data + render).
6. **Patch 5** — `EXPLORE_TILE` command + handler.
7. **Patch 6** — Trade & Influence commands + handlers.
8. **Patch 7** — `compute-trade-flows` integrace.
9. **Patch 8** — UI panely.

Každý patch musí jít zvlášť testovat.

---

## Technical notes

- Catalog je sdílen mezi frontend a edge funkcí — duplikát s test hash.
- Seed pro generaci nodů: `${session_id}:${spec.seed}:neutral_nodes:v1` — deterministický, verzovaný.
- `map_visibility` je per-player. AI frakce v iteraci 1 fog neřeší.
- `world_node_outputs.basket_key` musí matchovat kanonické baskety (`staple_food`, `tools`, …) — viz `mem://features/economy/market-baskets-naming`.
- AI flavor v `event-narrative` čerpá ze stavu **po** commitu — viz `mem://constraints/narrative-grounding`.
- RLS na nových tabulkách: SELECT pro session members, INSERT/UPDATE jen service_role.

---

# Konsolidace v4 — Wiki Orchestrator · Decree Engine · Free Cities · Terminologie

> Status (2026-04-26): **Track B — Wiki Orchestrator: in progress.**
> Pořadí: B → D → C1+C2 → A0 → A1 → A2 → [baseline snapshot] → A3 → A4.

## Track B — Wiki Orchestrator (✅ partially shipped)

- ✅ Migrace: `wiki_entries` rozšířena o `content_locked`, `image_locked`, `generation_status`, `image_generation_status`, `generation_version`, `last_generated_at` + index `(session_id, generation_status)`.
- ✅ `supabase/functions/wiki-orchestrator/index.ts` — JEDINÁ gateway s akcemi `ensure | regenerate | lock | unlock` a per-entity `GENERATION_POLICY` (`law/chronicle/treaty/declaration` = text-only).
- ⏳ Refactor existujících funkcí na delegátory (`wiki-generate`, `wiki-enrich`, `backfill-wiki`, `batch-regenerate-wiki`, `encyclopedia-generate`, `encyclopedia-image`).
- ⏳ UI v `WikiPanel`: tlačítka „Regenerovat" + „Vygenerovat obrázek" (pro text-only entity), indikátor 🔒 / ⏳ / ⚠️.
- 🔒 Pravidlo: žádný `lovable-ai-*` ani image call mimo `wiki-orchestrator/index.ts`.

## Track D — Terminologie + Wiki root „Svět" (todo)

- D1: V `mp-world-generate` zavolat `wiki-orchestrator ensure { entity_type:'world', entity_id:session_id }` z `world_premise`.
- D2: UI rename `Stát → Země`, `Vládce státu → Vládce země`, `Státní bonusy → Bonusy země`. Fáze: Zakladatel města → Protektor provincie → Vládce země.
- D3: ChroWiki taby `Svět`, `Svobodná města`, `Provincie`, `Země`, `Neutrální clustery`, `Zákony`, `Smlouvy`, `Dynastie`, `Náboženství`, `Obchodní sítě`, `Stavby`, `Války`, `Kronika`.

## Track C1+C2 — Political schema + Free Cities seed (todo)

- C1: `political_entities`, `political_entity_nodes`, rozšíření `province_nodes` o `political_status`, `political_entity_id`, `province_entity_id`, `legitimacy_score`, `integration_score`. RLS: members read, service_role write.
- C2: V `mp-world-generate` / `create-world-bootstrap` pro každý unowned city node založit `free_city` political entity + `wiki-orchestrator ensure entity_type='free_city'`.

## Track A — Decree Engine (rozděleno)

- **A0** (todo): `CREATE TABLE IF NOT EXISTS law_effects` (`effect_mode: instant_delta|recurring_delta|temporary_modifier`, `effect_priority`, `stacking_rule`, `duration_turns`, `remaining_turns`); `CREATE TABLE IF NOT EXISTS realm_metrics`. `_shared/decreeEngine.ts` s `ALLOWED_EFFECT_TARGETS` (whitelist; `wealth → realm_resources.total_wealth`), `MODE_TARGET_RULES` (pipeline modifiery jen pro `temporary_modifier`), `validateAndClampPayload`, `resolveConflicts`. Init upsert `realm_metrics` v `mp-world-generate` a `join-game`.
- **A1** (todo): `decree-interpret` — Lovable AI překlad NL → JSON payload, validace, preview.
- **A2** (todo): `decree-enact` — `lifecycle_status='active'`, `expires_at_turn = current_turn + max(duration_turns)`, `INSERT law_effects` s `remaining_turns = duration_turns` pro ongoing, aplikuje POUZE `instant_delta`, `wiki-orchestrator ensure entity_type='law'`.
- **GATE**: baseline snapshot ekonomiky před A3.
- **A3** (gated): `aggregateActiveModifiers` čte `law_effects WHERE laws.lifecycle_status='active' AND effect_mode='temporary_modifier' AND remaining_turns > 0`. Hook do `compute-trade-flows` + `compute-economy-flow`. NIKDY nezapisuje do `realm_resources`.
- **A4** (after A3): Tick `applyActiveDecrees` aplikuje `recurring_delta` (s filtrem `laws.lifecycle_status='active'`), decay `remaining_turns`, `expired` lifecycle, `administrative_pressure *= 0.9`. UI Council: preview modal s per-effect badges, sekce „Aktivní dekrety" s `Zrušit`.

## Pojistky (závazné)

1. `CREATE TABLE IF NOT EXISTS` — všechny migrace idempotentní.
2. Filtr `laws.lifecycle_status = 'active'` ve VŠECH dotazech nad `law_effects` (`aggregateActiveModifiers`, `applyActiveDecrees`). Revoked/expired nesmí ožít.
3. `wealth ↔ realm_resources.total_wealth` mapování v engine vrstvě, ne v UI.
4. Wiki orchestrator policy: `law/chronicle/treaty/declaration` = text-only by default. Image jen přes `regenerate fields:['image']`.
