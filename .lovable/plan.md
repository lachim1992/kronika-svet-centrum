## Cíl

Eliminovat strukturální 0% baskety (`min_sat=0.00` u všech hráčů) a dát AI advisorovi/UI konkrétní cíl k optimalizaci. Dvě úzce související změny v jedné dávce.

## Kontext (current state)

- `node_inventory` se plní správně z `capability_tags` × `recipes` (verified v `compute-trade-flows` Phase 1a).
- `BIOME_BONUS_TAGS` v `compute-province-nodes/index.ts` (ř. 49–66) přiřazuje max 2 tagy per biome a zcela chybí **processing tagy** (`smithing`, `weaving`, `leatherwork`, `brewing`, `baking`, `pottery`).
- `city_market_baskets` má `local_demand`, `local_supply`, `domestic_satisfaction` — ale **chybí `unmet_demand`** jako persistovaný kolumn → AI advisor i UI ho musí pokaždé počítat klientsky a nemůže filtrovat/řadit přes index.
- Real data potvrzují deficit: každý hráč má 4–7 basketů se sat<0.5, typicky `metalwork`, `tools`, `leather_goods`, `textiles`.

## Změna 1: Rozšířený biome → tag mapping + processing tagy z urban/source vztahu

**Soubor:** `supabase/functions/compute-province-nodes/index.ts`

Rozšířit `BIOME_BONUS_TAGS` a `NODE_CAPABILITY_MAP`:

- `village` → přidat `baking`, `brewing` (každá vesnice peče a vaří)
- `mining_camp` (minor subtype) → potvrdit `mining` + přidat `quarrying`
- `lumber_camp` → `logging` + `carpentry`
- `pastoral_camp` → `herding` + `leatherwork` + `weaving` (vlna)
- `fishing_village` → `fishing` + `salting`
- `smithy` (existing) → `smelting` + `smithing` ✓
- Nový `trade_hub` urban tagy: přidat `pottery`, `weaving` (městská řemesla)

**Biome bonus rozšíření:**
- `coastal/lake/river` → `fishing` + `salting`
- `plains/grassland` → `farming` + `herding` + `weaving` (len)
- `forest` → `logging` + `gathering` + `carpentry`
- `hills/mountain` → `mining` + `quarrying` + `smelting` (přístup k rudě)

Důsledek: každý zalidněný hex bude mít 3–5 capability tagů místo 1–2 → recipes pokryjí všech 12 baskets.

## Změna 2: Backfill existujících nodů

**Soubor:** `supabase/functions/backfill-economy-tags/index.ts`

Přepoužít rozšířený `resolveCapabilityTags` na všechny existující nody v běžících sessions. Spustit z dev tools (Recompute panel).

## Změna 3: `unmet_demand` jako persistovaná kolumna

**Migrace:** přidat sloupec do `city_market_baskets`:
```sql
ALTER TABLE city_market_baskets 
  ADD COLUMN IF NOT EXISTS unmet_demand numeric DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_cmb_unmet 
  ON city_market_baskets(session_id, turn_number, unmet_demand DESC) 
  WHERE unmet_demand > 0;
```

**Soubor:** `supabase/functions/compute-trade-flows/index.ts` (kolem ř. 510)
- Po výpočtu `localSupply` + případných importů spočítat:
  ```ts
  unmet_demand = max(0, demandQty - localSupply - importedQty)
  ```
- Persistovat jako další pole v `cityBasketRows`.

## Změna 4: AI Advisor & UI využití

**Soubor:** `supabase/functions/economy-advisor/index.ts`
- Místo počítání deficit per request: query `city_market_baskets WHERE unmet_demand > 0 ORDER BY unmet_demand DESC LIMIT 5`.
- Doporučení mapovat: `basket_key` → chybějící `capability_tag` → konkrétní node subtype k postavení (např. `metalwork` → chybí `smithing` → postav `smithy` minor).

**UI:** `src/pages/game/EconomyTab.tsx` (nebo Markets panel)
- Sloupec „Chybí" v basket tabulce zobrazující `unmet_demand` s červeným badge.
- Sort by `unmet_demand DESC` jako default view.

## Technická poznámka pro non-tech

Hra teď ví, kolik města vyrábí a kolik chtějí, ale nezná **jak moc jim chybí konkrétně**. Po této změně každý město přesně řekne „chybí mi 3.2 jednotek nářadí" a AI poradce může říct „postav kovárnu na hexu X". Současně rozšíříme typy řemesel, které vesnice automaticky umí, aby existovala šance na 100 % saturaci bez zázračné expanze.

## Pořadí implementace

1. Migrace `unmet_demand` (DB schema)
2. `compute-province-nodes` rozšíření tagů
3. `compute-trade-flows` zápis `unmet_demand`
4. `backfill-economy-tags` přepočet na existujících sessions (jednorázový dev call)
5. `economy-advisor` query + recommendation mapping
6. UI badge + sort

## Soubory k úpravě

- `supabase/migrations/<new>.sql` (nový, ALTER TABLE)
- `supabase/functions/compute-province-nodes/index.ts`
- `supabase/functions/backfill-economy-tags/index.ts`
- `supabase/functions/compute-trade-flows/index.ts`
- `supabase/functions/economy-advisor/index.ts`
- `src/pages/game/EconomyTab.tsx` (případně související basket panel)

## Co tato změna **nedělá** (mimo scope)

- Reconcile `production_output` ↔ `node_inventory.quantity` (separátní práce, lze udělat potom)
- Wealth realization / monetization opravy (samostatný kanál)
- Nový dev panel „Node → Basket trace" (může přijít později)