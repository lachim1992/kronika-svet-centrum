# Plán v4 (final): Integrace budov do Goods Economy v4.3

Schválený scope z v3 + 5 finálních pojistek z review. Implementační.

## Cíl

Postavená budova je hráčská páka na deficity v `city_market_baskets`. Smyčka:

```text
deficit → postavím konkrétní budovu v konkrétním městě
        → refresh-economy přičte building_bonus
        → zlepší se local_supply / domestic_satisfaction
```

Žádný basket trade refactor, žádný HDP, žádný fiskál.

## Invariant (acceptance core)

Pokud město má completed building s `template.effects.basket_outputs.staple_food = 6`, po `refresh-economy` musí pro daný `(city, staple_food)` platit:

```
building_bonus > 0
bonus_supply  = recipe_bonus + building_bonus
local_supply  = auto_supply + bonus_supply
```

## Architektura

```text
building_templates.effects.basket_outputs   (primární zdroj)
city_buildings.effects.basket_outputs       (override; {} nebo null = suppress)
        │
        ▼
compute-trade-flows  (krok 4 v 6-step refresh)
  ├─ stávající: node recipes → recipe_bonus
  └─ NOVÉ:      buildings    → building_bonus
                       ▼
   city_market_baskets:
     recipe_bonus    (NOVÝ)
     building_bonus  (NOVÝ)
     bonus_supply    = recipe_bonus + building_bonus  (BC)
```

## Hard kanonický set baskets

```ts
const VALID_BASKETS = new Set([
  "staple_food","basic_clothing","tools","fuel","drinking_water",
  "storage_logistics","admin_supplies","construction","metalwork",
  "military_supply","luxury_clothing","feast",
]);
```

Neznámý klíč → warning, **nikdy** se nezakládá nový row `city_market_baskets.basket_key`.

## Resolution + suppress + clamp

```ts
const iEff = (b as any).effects ?? {};
const tEff = (b as any).building_templates?.effects ?? {};
const hasOverride = Object.prototype.hasOwnProperty.call(iEff, "basket_outputs");

let basketOutputs: Record<string, number> | null = null;
if (hasOverride) {
  const v = iEff.basket_outputs;
  if (v == null || (typeof v === "object" && Object.keys(v).length === 0)) {
    warnings.push(`instance_suppressed_template_basket_outputs city=${b.city_id} bld=${b.id}`);
    basketOutputs = null; // suppress
  } else {
    basketOutputs = v as Record<string, number>;
  }
} else {
  basketOutputs = (tEff.basket_outputs as Record<string, number> | undefined) ?? null;
}

// basket_quality clamp 0..3
const rawQ = Number(iEff.basket_quality ?? tEff.basket_quality ?? 1);
const quality = Math.min(3, Math.max(0, Number.isFinite(rawQ) ? rawQ : 1));

const level = Math.max(1, Number(b.current_level) || 1);
```

## Backend

### 1. Migrace — sloupce

```sql
ALTER TABLE public.city_market_baskets
  ADD COLUMN IF NOT EXISTS recipe_bonus   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS building_bonus numeric NOT NULL DEFAULT 0;
```

`bonus_supply` zůstává jako součet (BC pro AI advisor a frontend).

### 2. Seed migrace — deterministická + diagnostický report

```sql
WITH defaults AS (
  SELECT * FROM (VALUES
    (10,  'bakery',     jsonb_build_object('basket_outputs', jsonb_build_object('staple_food', 6))),
    (20,  'mill',       jsonb_build_object('basket_outputs', jsonb_build_object('staple_food', 4))),
    (30,  'granary',    jsonb_build_object('basket_outputs', jsonb_build_object('storage_logistics', 4, 'staple_food', 2))),
    (40,  'weaver',     jsonb_build_object('basket_outputs', jsonb_build_object('basic_clothing', 5))),
    (50,  'silk',       jsonb_build_object('basket_outputs', jsonb_build_object('luxury_clothing', 4))),
    (60,  'armory',     jsonb_build_object('basket_outputs', jsonb_build_object('military_supply', 4, 'metalwork', 1))),
    (70,  'arsenal',    jsonb_build_object('basket_outputs', jsonb_build_object('military_supply', 5))),
    (80,  'forge',      jsonb_build_object('basket_outputs', jsonb_build_object('tools', 5, 'metalwork', 2))),
    (90,  'smithy',     jsonb_build_object('basket_outputs', jsonb_build_object('tools', 4))),
    (100, 'lumberyard', jsonb_build_object('basket_outputs', jsonb_build_object('fuel', 6, 'construction', 2))),
    (110, 'woodcutter', jsonb_build_object('basket_outputs', jsonb_build_object('fuel', 5))),
    (120, 'aqueduct',   jsonb_build_object('basket_outputs', jsonb_build_object('drinking_water', 10))),
    (130, 'well',       jsonb_build_object('basket_outputs', jsonb_build_object('drinking_water', 6))),
    (140, 'warehouse',  jsonb_build_object('basket_outputs', jsonb_build_object('storage_logistics', 6))),
    (150, 'chancell',   jsonb_build_object('basket_outputs', jsonb_build_object('admin_supplies', 4))),
    (160, 'scriptorium',jsonb_build_object('basket_outputs', jsonb_build_object('admin_supplies', 3))),
    (170, 'stonecutter',jsonb_build_object('basket_outputs', jsonb_build_object('construction', 5))),
    (180, 'barracks',   jsonb_build_object('basket_outputs', jsonb_build_object('military_supply', 3))),
    (190, 'winery',     jsonb_build_object('basket_outputs', jsonb_build_object('feast', 5))),
    (200, 'tavern',     jsonb_build_object('basket_outputs', jsonb_build_object('feast', 4))),
    (210, 'pekár',      jsonb_build_object('basket_outputs', jsonb_build_object('staple_food', 6))),
    (220, 'mlýn',       jsonb_build_object('basket_outputs', jsonb_build_object('staple_food', 4))),
    (230, 'sýpk',       jsonb_build_object('basket_outputs', jsonb_build_object('storage_logistics', 4, 'staple_food', 2))),
    (240, 'tkal',       jsonb_build_object('basket_outputs', jsonb_build_object('basic_clothing', 5))),
    (250, 'ková',       jsonb_build_object('basket_outputs', jsonb_build_object('tools', 5, 'metalwork', 2))),
    (260, 'studn',      jsonb_build_object('basket_outputs', jsonb_build_object('drinking_water', 6))),
    (270, 'lázn',       jsonb_build_object('basket_outputs', jsonb_build_object('drinking_water', 8))),
    (280, 'sklad',      jsonb_build_object('basket_outputs', jsonb_build_object('storage_logistics', 6))),
    (290, 'kasár',      jsonb_build_object('basket_outputs', jsonb_build_object('military_supply', 3)))
  ) AS t(priority, pat, patch)
),
matched AS (
  SELECT
    bt.id,
    d.patch,
    ROW_NUMBER() OVER (PARTITION BY bt.id ORDER BY d.priority ASC) AS rn
  FROM public.building_templates bt
  JOIN defaults d
    ON LOWER(COALESCE(bt.name, '')) LIKE '%' || d.pat || '%'
  WHERE NOT (COALESCE(bt.effects, '{}'::jsonb) ? 'basket_outputs')
)
UPDATE public.building_templates bt
SET effects = COALESCE(bt.effects, '{}'::jsonb) || matched.patch
FROM matched
WHERE bt.id = matched.id
  AND matched.rn = 1;
```

Po seedu admin diagnostický view (read-only, není v Phase 1 UI, ale je spustitelný):

```sql
-- Templates ještě bez basket_outputs (kandidáti pro Phase 2 LLM hydrace)
SELECT id, name, category, effects
FROM public.building_templates
WHERE NOT (COALESCE(effects, '{}'::jsonb) ? 'basket_outputs')
ORDER BY name;
```

### 3. `compute-trade-flows/index.ts`

**3a. Načítání s bezpečným join + fallbackem:**

```ts
const { data: cityBuildingsRaw, error: bldErr } = await sb
  .from("city_buildings")
  .select(`
    id, city_id, current_level, effects, template_id, status,
    building_templates ( id, effects )
  `)
  .eq("session_id", session_id)
  .eq("status", "completed");

let cityBuildings = cityBuildingsRaw || [];
if (bldErr || cityBuildings.some(b => b.template_id && !(b as any).building_templates)) {
  const { data: legacy } = await sb
    .from("city_buildings")
    .select("id, city_id, current_level, effects, template_id, status")
    .eq("session_id", session_id)
    .eq("status", "completed");
  const templateIds = [...new Set((legacy || []).map(b => b.template_id).filter(Boolean))];
  const { data: templates } = await sb
    .from("building_templates")
    .select("id, effects")
    .in("id", templateIds);
  const tmap = new Map((templates || []).map(t => [t.id, t]));
  cityBuildings = (legacy || []).map(b => ({
    ...b,
    building_templates: b.template_id ? tmap.get(b.template_id) ?? null : null,
  }));
}
```

**3b. Agregace `cityBuildingBonus`:**

```ts
const cityBuildingBonus = new Map<string, Map<string, { qty: number; qSum: number; cnt: number }>>();
const w = { unknownKeys: 0, suppressed: 0, overshoot: 0, nullSuppressed: 0 };

for (const b of cityBuildings) {
  // ... resolution + suppress + clamp jak výše ...
  if (!basketOutputs) continue;

  let bag = cityBuildingBonus.get(b.city_id);
  if (!bag) { bag = new Map(); cityBuildingBonus.set(b.city_id, bag); }

  for (const [rawKey, base] of Object.entries(basketOutputs)) {
    if (!VALID_BASKETS.has(rawKey)) {
      w.unknownKeys++;
      warnings.push(`building_basket_unknown_key=${rawKey} city=${b.city_id} bld=${b.id}`);
      continue;
    }
    const qty = Number(base) * level;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const cur = bag.get(rawKey) || { qty: 0, qSum: 0, cnt: 0 };
    cur.qty += qty; cur.qSum += quality; cur.cnt += 1;
    bag.set(rawKey, cur);
  }
}
```

**3c. Insert/upsert `city_market_baskets` musí zapsat oba nové sloupce:**

```ts
const recipeBonus  = bonus?.quantity || 0;
const bldBonus     = cityBuildingBonus.get(city.id)?.get(bk);
const buildingBonus = bldBonus?.qty || 0;
const bonusSupply  = recipeBonus + buildingBonus;

if (demandQty > 0 && buildingBonus > demandQty * 1.5) w.overshoot++;

const bldQuality = bldBonus?.cnt ? bldBonus.qSum / bldBonus.cnt : 0;
const guildLevel = bonus?.count ? Math.round(bonus.qualitySum / bonus.count) : 0;
const effectiveQuality = Math.max(guildLevel, bldQuality);
const qualityWeight = Math.min(2.0, Math.max(1.0, 1 + effectiveQuality * 0.15));

cityBasketRows.push({
  ...,
  recipe_bonus:   recipeBonus,
  building_bonus: buildingBonus,
  bonus_supply:   bonusSupply,
  local_supply:   autoSupply + bonusSupply,
});
```

**Pokud současný kód používá `upsert(rows, { onConflict: "session_id,player_name,city_id,basket_key,turn_number" })`**, musí update path explicitně přepsat `recipe_bonus`, `building_bonus`, `bonus_supply`, `local_supply` (Supabase upsert defaultně nahrazuje celý row z payloadu — ověřit, že payload obsahuje všechny relevantní sloupce a žádný `DEFAULT` nezůstává stará hodnota). Pokud používá `delete + insert`, je to triviální.

`console.log("[building-bonus]", w)`.

## Frontend

### 4. `src/lib/goodsCatalog.ts` — helpers (+ suppress info)

```ts
export const VALID_BASKETS = [
  "staple_food","basic_clothing","tools","fuel","drinking_water",
  "storage_logistics","admin_supplies","construction","metalwork",
  "military_supply","luxury_clothing","feast",
] as const;

export type BasketSource = "none" | "template" | "instance_override" | "instance_suppress";

export function inspectBasketOutputs(b: any): {
  source: BasketSource;
  outputs: Record<string, number>;
} {
  const i = b?.effects ?? {};
  const t = b?.building_templates?.effects ?? {};
  const hasOverride = Object.prototype.hasOwnProperty.call(i, "basket_outputs");
  if (hasOverride) {
    const v = i.basket_outputs;
    if (v == null || (typeof v === "object" && Object.keys(v).length === 0)) {
      return { source: "instance_suppress", outputs: {} };
    }
    return { source: "instance_override", outputs: filterValid(v) };
  }
  if (t?.basket_outputs) return { source: "template", outputs: filterValid(t.basket_outputs) };
  return { source: "none", outputs: {} };
}

export function scaledBasketOutputs(b: any): Record<string, number> {
  const { outputs } = inspectBasketOutputs(b);
  const lvl = Math.max(1, b?.current_level || 1);
  return Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, Number(v) * lvl]));
}

function filterValid(o: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    if ((VALID_BASKETS as readonly string[]).includes(k)) out[k] = Number(v);
  }
  return out;
}
```

### 5. `CityBuildingsPanel.tsx` — vizuální separace

Načítání i `building_templates(effects)`. Pod kartou efektů dva oddělené bloky:

```
─── Rezerva říše ───
🌾 +5 obilí   💰 +3 zlato

─── Městský trh ───
🍞 +6 staple_food   📦 +2 storage_logistics
```

Bloky vždy odlišné, ne tooltip. V tomto panelu neřešíme suppress detaily (to je debug-only).

### 6. `DemandFulfillmentPanel.tsx` — city-scoped doporučení

U deficitního basketu (`unmet > 0`):

1. Tlačítko `Postavit budovu řešící deficit`.
2. Klik → mini-sheet s kandidátními městy seřazenými dle `unmet_demand` pro daný `basket_key` (per-row z `city_market_baskets`, nikoli z agregátu).
3. Default target = město s nejvyšším `unmet_demand`.
4. Druhý seznam: šablony s `effects.basket_outputs[basketKey] > 0`, filtrované `required_settlement_level <= city.settlement_level`.
5. Klik na pár (město, šablona) → naviguj na `CityBuildingsPanel` s route state `{ cityId, templateId, basketKey }`.

### 7. `EconomyDebugTab.tsx` — engine breakdown + suppress

Tabulka per city × basket čte přímo `recipe_bonus`, `building_bonus`:

```
| city | basket | demand | auto | recipe_bonus | building_bonus | total | sat% | flag |
```

Flagy:

- `building_bonus > demand × 1.5` → ⚠️ overshoot
- completed building s `basket_outputs[basket] > 0` ale `building_bonus = 0` → 🔴 desync
- warning `instance_suppressed_template_basket_outputs` → 🟠 suppressed

**Sekce "Building contributions"** rozlišuje per budovu 4 stavy přes `inspectBasketOutputs(...).source`:

- `none` — žádný basket effect (tichá budova)
- `template` — používá template effects
- `instance_override` — instance má vlastní `basket_outputs`
- `instance_suppress` — instance explicitně potlačila template ({} nebo null)

## Acceptance criteria (finální)

1. Postavená pekárna se v dalším tahu objeví v `city_market_baskets.building_bonus` pro `staple_food`; `bonus_supply = recipe_bonus + building_bonus`; `local_supply = auto_supply + bonus_supply`.
2. **Opakovaný `refresh-economy` na stejném turn přepíše `recipe_bonus` a `building_bonus` na aktuální hodnotu** (ověřit upsert/insert path; pokud upsert, payload obsahuje oba sloupce).
3. `compute-trade-flows` čte template effects přes PostgREST relation; **při selhání joinu existuje in-memory fallback** přes `building_templates.in(template_id)`.
4. Hráč v `CityBuildingsPanel` vidí blok **"Městský trh"** vizuálně oddělený od **"Rezerva říše"**, škálovaný úrovní budovy.
5. `DemandFulfillmentPanel` u deficitního basketu nabídne pár (město, šablona); default město = s nejvyšším `unmet_demand` pro daný basket. Klik otevře `CityBuildingsPanel` toho města.
6. Debug tab ukazuje per-city per-basket `auto | recipe_bonus | building_bonus | total` přímo ze sloupců; sekce "Building contributions" rozlišuje 4 stavy zdroje (`none/template/instance_override/instance_suppress`).
7. **Neznámý basket key se zahazuje s warning**; nikdy se nezakládá nový `city_market_baskets` row pro neznámý klíč. Test: `{ "basic_food": 5 }` → warning, žádný row.
8. **`basket_outputs: {}` i `basket_outputs: null`** na instanci jsou identifikované jako explicitní suppress, oba loguje `instance_suppressed_template_basket_outputs`.
9. **`basket_quality` se clampuje do 0–3** před agregací (hodnota mimo rozsah nebo NaN → fallback 1, log warning volitelně).
10. Seed migrace je **deterministická a idempotentní**: opakované spuštění nemění žádný řádek, šablona matchující víc patternů dostane patch s nejnižší `priority`.
11. **Post-seed diagnostický query** vrací seznam šablon stále bez `basket_outputs` (jen jako audit, nikoli blocker).
12. Pokud žádná budova nemá `basket_outputs`, výstup = baseline (`building_bonus = 0`, `bonus_supply = recipe_bonus`).
13. Žádná zmínka o `basket_trade_flows` ani fiskální pipeline v této fázi.

## Deployment order (kritické)

```text
1. DB migration: city_market_baskets.{recipe_bonus, building_bonus}
2. Seed migration: building_templates.effects backfill (+ run audit query)
3. Deploy compute-trade-flows (čte i zapisuje nové sloupce)
4. Deploy frontend (panels, debug tab, helpers)
5. Manuální refresh-economy v existující session → ověření invariantu
```

Sloupce **musí** existovat před deployem funkce.

## Mimo scope (Phase 2+)

- LLM hydrace `basket_outputs` pro template bez seedu (audit list je vstup).
- Per-level `level_data[i].basket_outputs` override.
- Demand modifikátory (Lázně ↓ drinking_water need atd.).
- Council decree spawnující budovu s bonus multiplikátorem.
- Basket-level trade flows, `goods_wealth_fiscal` integrace.
- Deprecate `compute-economy-flow` v3.
- Seed match přes `category` a `building_tags`.

## Rizika

- **Šablony bez `basket_outputs`** zůstanou pro Goods neviditelné — audit query je vstup pro Phase 2.
- **Lineární `base × level`** může u lvl 5 přestřelit; overshoot warning to označí, balancing přes seed hodnoty, ne přes formuli.
- **Double-counting `food_income` (Rezerva říše) vs `staple_food` (Městský trh)** — ortogonální vrstvy; vizuální separace v UI je závazek.
