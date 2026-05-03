## Princip

Šest inkrementů, každý mergeable samostatně. Pohybová fyzika je nízkoúrovňová (žádný `trade_system` v movement engine). AI počítá záměr, zápis vede stejnou cestou jako hráč. Pět implementačních pojistek z review je zapracováno přímo v DB checklistu, vzorcích a pipeline.

---

## Inkrement 0 — DB checklist a invariants

Ověřit `read_query` před implementací 1–3, doplnit migracemi pokud chybí.

```sql
-- world_events: idempotence + claim lock
ALTER TABLE world_events
  ADD COLUMN IF NOT EXISTS processed_at            timestamptz NULL,
  ADD COLUMN IF NOT EXISTS processing_started_at   timestamptz NULL,
  ADD COLUMN IF NOT EXISTS turn_number             int         NULL,
  ADD COLUMN IF NOT EXISTS route_id                uuid        NULL,
  ADD COLUMN IF NOT EXISTS construction_generation int         NULL;

CREATE UNIQUE INDEX IF NOT EXISTS world_events_route_completed_uniq
  ON world_events(session_id, route_id, event_type, construction_generation)
  WHERE event_type = 'route_completed' AND route_id IS NOT NULL;

-- flow_paths: upsert key
CREATE UNIQUE INDEX IF NOT EXISTS flow_paths_route_id_uniq
  ON flow_paths(route_id) WHERE route_id IS NOT NULL;

-- province_routes
ALTER TABLE province_routes
  ADD COLUMN IF NOT EXISTS path_dirty              boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS completed_at            timestamptz NULL,
  ADD COLUMN IF NOT EXISTS planned_hex_path        jsonb       NULL,
  ADD COLUMN IF NOT EXISTS construction_generation int         NOT NULL DEFAULT 1;
```

**Pokud `world_events` nemá vlastní sloupce a používá `reference` jsonb**, místo varianty A nasadit expression index:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS world_events_route_completed_uniq
  ON world_events(
    session_id,
    event_type,
    ((reference->>'route_id')),
    ((reference->>'construction_generation'))
  ) WHERE event_type = 'route_completed';
```

**Definice / invariants používané v dalších inkrementech:**
- `pathEdgeCount = planned_hex_path.length - 1` (kroky, ne hexy).
- `hardTerrainHexes` = počet **vstupních** hard hexů na trase = `planned_hex_path.slice(1)` filtrované na `mountain | swamp | dense_forest`.
- `compute-hex-flows` pro constructed routes **preferuje `planned_hex_path` jako autoritativní `flow_paths.hex_path`**. A* je pouze fallback (chybí / nevalidní planned).
- `mountain_road` slouží průchodnosti / trade / propojení / vizuálu — **nedává 2 hex/tah přes mountain** (hard terrain pravidlo platí univerzálně).

---

## Inkrement 1 — Shared movement engine + atomický zápis

**Soubory:**
- `supabase/functions/_shared/movement.ts` (čistý výpočet)
- `supabase/functions/_shared/stackMovementCommand.ts` (autoritativní zápis)
- `supabase/functions/command-dispatch/index.ts` — `MOVE_STACK` deleguje
- `supabase/functions/ai-faction-turn/index.ts` — generuje záměr, volá `applyStackMove`

**API:**
```ts
buildRoadEdgeIndex(sessionId)            // Map<edgeKey, { routeId, complete, open }>
computeStackPath(start, target)          // A* v bbox kolem start↔target
computeAllowedMove(stack, plannedPath, roadEdgeIndex)
  → { allowedSteps, finalHex, usedRoadBonus, blockedReason }
explainMove(...)
applyStackMove(sb, { sessionId, stackId, plannedPath, actor })
```

**Pravidla pohybu:**
- Vstup na libovolný `is_passable` hex.
- Base = **1 hex/tah**.
- Bonus na **2 hex/tah** jen pokud:
  1. obě po sobě jdoucí edges `(cur→s1)`, `(s1→s2)` jsou road edges,
  2. obě edges patří **ke stejnému `route_id`** (cross-route chaining odloženo do 1B),
  3. ta route má `construction_state='complete'` AND `control_state='open'`,
  4. edges existují jako po sobě jdoucí v `flow_paths.hex_path`.
- Hard terrain = vstup ukončí pohyb (varianta B), univerzálně.
- Impassable / `Infinity` = nikdy.

**Atomicita zápisu (`applyStackMove`):**
Minimum — conditional update proti původní pozici:
```sql
UPDATE military_stacks
   SET q = $final_q, r = $final_r, updated_at = now()
 WHERE id = $stack_id
   AND session_id = $session_id
   AND q = $start_q
   AND r = $start_r
RETURNING *;
```
0 řádků z RETURNING ⇒ retry/abort, ne tichý overwrite.
**Doporučeno**: vyklopit do Postgres RPC `rpc_apply_stack_move(session_id, stack_id, planned_path jsonb, actor jsonb)` — validace + zápis v jedné transakci. Pokud RPC v tomto sprintu nestihneš, conditional update je povinné minimum.

**Server validace plannedPath:**
- `path[0]` = aktuální pozice stacku,
- každý krok = sousední hex,
- každý hex passable,
- `allowedSteps ≥ pathEdgeCount`.

**Akceptace:**
- Hráč i AI volají `applyStackMove`. `military_stacks.position` mění výhradně tato funkce / RPC.
- Seed s existující `flow_paths.hex_path` na complete+open route → 2 hexy/tah.
- Mountain road → 1 hex (hard terrain blokuje druhý krok).
- Dvě sousedící routes bez společného `route_id` → 1 hex.
- Dva paralelní `applyStackMove` na stejný stack → uspěje právě jeden.

---

## Inkrement 2 — Lifecycle stavby silnic (s planned path)

**Soubory:**
- `supabase/functions/command-dispatch/index.ts` (`executeBuildRoute`)
- `supabase/functions/process-turn/index.ts` (construction tick)

**Změny:**
- `BUILD_ROUTE` spočítá `planned_hex_path` přes shared A* a uloží do `province_routes.planned_hex_path`. Stejná trasa pro cenu, overlay UC, i jako preferovaná `flow_paths.hex_path` po dokončení.
- `totalWork`:
  ```
  pathEdgeCount   = planned_hex_path.length - 1
  hardTerrainHexes = count(planned_hex_path.slice(1) where terrain ∈ {mountain,swamp,dense_forest})

  totalWork = baseWorkByType
            + pathEdgeCount   * workPerHexByType
            + hardTerrainHexes * hardPenaltyByType
  ```
  MVP tabulka:
  ```
  land_road:     base 20 + 5/edge + 8/hard
  river_route:   base 15 + 3/edge
  mountain_road: base 40 + 8/edge + 12/hard
  ```
  Sanity: 1‑edge land_road bez hard = 25, 6‑edge bez hard = 50.
- Tick: `baseLaborTick = max(2, round(allocated_labor * 0.20))`.
- **Completion guard** přechodem stavu (atomicky):
  ```sql
  UPDATE province_routes
     SET construction_state='complete',
         path_dirty=true,
         completed_at=now(),
         control_state = COALESCE(NULLIF(control_state,''),'open')
   WHERE id = $id AND construction_state = 'under_construction'
  RETURNING id, construction_generation, node_a, node_b;
  ```
  Insert `world_events` typ `route_completed` JEN když RETURNING vrátil řádek. Insert nese `route_id`, `construction_generation`, `turn_number`. Unique index z Inkr. 0 zajistí idempotenci.
- Rebuild po destrukci: před přechodem zpět na `under_construction` zvýšit `construction_generation += 1`. Tím nový `route_completed` projde indexem.

**Akceptace:**
- 6‑edge land_road = 50 work, 1‑edge = 25.
- `UnderConstructionRoutesOverlay` kreslí přesně `planned_hex_path` použitý pro cenu.
- 2× volání BUILD_ROUTE bez postupu nezpůsobí 2× event.
- Po `complete` existuje právě 1 nezpracovaný `route_completed` event s odpovídajícím `construction_generation`.

---

## Inkrement 3 — Refresh pipeline + bezpečný claim

**Soubory:**
- `supabase/functions/commit-turn/index.ts`
- `supabase/functions/refresh-economy/index.ts`

**Pořadí (přesné):**
```
1. commit-turn vyhodnotí, zda tento běh ADVANCED world turn → advancedTurnNumber
2. pokud NE → konec (žádný claim, žádná pipeline)
3. pokud ANO → atomický claim:
```
```sql
UPDATE world_events
   SET processing_started_at = now()
 WHERE session_id = $1
   AND event_type = 'route_completed'
   AND processed_at IS NULL
   AND processing_started_at IS NULL
   AND turn_number <= $2          -- advancedTurnNumber
RETURNING id, route_id;
```
```
4. claim ≥ 1 řádek → refresh-economy({ session_id, reason:'route_completed' })
   refresh-economy orchestruje:
     compute-hex-flows(force_all:false)   // pro constructed routes preferuje planned_hex_path
     → compute-trade-systems
     → compute-trade-flows
5. úspěch → processed_at = now()
6. chyba → processing_started_at = NULL (re-claim možný)
```

`refresh-economy` musí být **idempotentní** (deterministický rebuild, upserty `flow_paths` přes unique `route_id`); claim je optimalizace.

**Akceptace:**
- Po commitu world turn s `route_completed`: `path_dirty=false`, `flow_paths` row pro `route_id` (`length(hex_path)>=2`), trade systems route vidí.
- Pipeline neproběhne, pokud commit nebyl world-turn advance.
- Dva paralelní commity → pipeline 1×.
- Pending event z dřívějšího turnu se claimne při dalším skutečném advance.

---

## Inkrement 4 — Overlaye podle DB pravdy

**4A (povinné):**
- `RoadNetworkOverlay` → `.eq('construction_state','complete')`.
- `UnderConstructionRoutesOverlay` → `.eq('construction_state','under_construction')`, kreslí z `planned_hex_path`.
- Po `commit-turn` / `BUILD_ROUTE` / `DevRoadSpeedup`:
  ```ts
  queryClient.invalidateQueries({ queryKey:['province_routes', sessionId] });
  queryClient.invalidateQueries({ queryKey:['flow_paths',     sessionId] });
  ```
- `worldMapBus` zůstává jako lokální nudge.

**4B (volitelné, později):** Supabase realtime subscription na `province_routes` a `flow_paths` filtrované `session_id`.

**Akceptace:** přechod UC → complete do 2 s bez ručního refresh; žádná route v obou vrstvách současně.

---

## Inkrement 5 — AI akce nad hotovou fyzikou

**Soubor:** `supabase/functions/ai-faction-turn/index.ts`

**Akce:** `build_route`, `expand_node`, `repair_route`. **Movement výhradně přes `applyStackMove`.**

**`build_route` scoring:**
```
routeScore = targetNodeValue
           + connectsOwnClusterBonus
           + neutralExpansionBonus
           + marketBasketBonus
           + frontierBonus
           - distancePenalty
           - hostileRiskPenalty
           - duplicateNetworkPenalty
```
Trigger ≥1: hlavní node bez complete route / izolovaný own node mimo trade_system / discovered neutral ≤6 hex se score≥30 a non-duplicate.

**`expand_node` — podle síly přítomnosti:**
- adjacent/inside owned military stack → `annex_node`
- bez stacku, ale `influence ≥ threshold` → `start_claim_project` (dozraje za N tahů)
- jinak → ne

Společné předpoklady: `controlled_by IS NULL`, `is_neutral=true`, `hostile=false`, vzdálenost ≤ doctrine range.

**Doctrine váhy:**
- `defenders`: fortify_node, repair_route, garrison
- `expansion`: build_route, expand_node, found_settlement
- `dominate`: recruit_army, move_stack, attack_target

**Auto‑deploy s limitem:** zachovat `max(1 stack, 30% total_military_power)` v capital, zbytek na nejbližší frontier.

**Akceptace (seeded):** doctrine `expansion`, město + frontier + discovered neutral ≤4 hex. Do 3 AI tahů: BUILD_ROUTE command nebo `province_routes` řádek + pohyb stacku přes `applyStackMove` + claim/annex pokus.

---

## Inkrement 6 — Dev tools

- `DevRoadSpeedupPanel` po dokončení volá `refresh-economy({ reason:'route_completed' })`.
- `DevModePanel` tlačítko **„Spustit AI tah pro všechny frakce"** (sériově, log do toast).
- Volitelně **Movement explainer** — stack + cíl → výstup `explainMove()`.

---

## Mapování pojistek z review

| Pojistka | Vyřešeno v |
|---|---|
| Idempotence klíč fyzicky v DB | Inkr. 0: sloupce + partial unique index (var. A nebo expression index B) |
| Claim až po world-turn advance | Inkr. 3: explicitní pořadí 1→2→3, `turn_number ≤ advancedTurnNumber` |
| `applyStackMove` atomicita | Inkr. 1: conditional update min., RPC doporučeno |
| `pathEdgeCount = length-1` | Inkr. 0 invariants + Inkr. 2 vzorec |
| `planned_hex_path` autoritativní pro flow | Inkr. 0 invariants + Inkr. 3 popis `compute-hex-flows` |
| `mountain_road` ≠ rychlost přes mountain | Inkr. 0 explicitní poznámka |
| Movement bez vazby na `trade_system` | Inkr. 1 pravidla |
| AI bez vlastního zápisu pohybu | Inkr. 1 + 5 |
| Overlaye realtime split | Inkr. 4A/4B |
| `expand_node` bez magic annex | Inkr. 5 |

---

## Pořadí merge

`0 → 1 → 2 → 3 → 4A → 5 → 6` (4B a 1B kdykoli později).
