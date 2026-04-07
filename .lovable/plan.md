

# Komplexní revize Dev Tabu, ResourceHUD, Observatory a Dead Data

## Rozsah

Čtyři propojené oblasti: (A) Recompute All tlačítko, (B) ResourceHUD fix, (C) Dev Tab reorganizace, (D) Observatory kompletní přepis, (E) Dead Data akční plán.

---

## A. Recompute All — okamžitá rekalkulace

**Nová Edge Function `recompute-all`** která spustí celý pipeline sekvečně:
1. `compute-province-routes` → routes
2. `compute-hex-flows` (force_all) → hex paths
3. `compute-economy-flow` → node-level metriky
4. `compute-trade-flows` → goods pipeline
5. `process-turn` (jen economy fáze, bez advance turn) → realm_resources update

Vrátí JSON s výsledky každého kroku (success/error, počty rows).

**UI**: Výrazné tlačítko "⚡ Recompute All" v DevTab headeru vedle "Next Turn", s loading spinner a toast s výsledky. Po dokončení zavolá `onRefetch()` → ResourceHUD se automaticky aktualizuje přes realtime subscription.

**Důležité**: `process-turn` bude potřebovat flag `recalcOnly: true` aby nepřepočítávala populaci/hladomor/events, jen ekonomické agregáty.

---

## B. ResourceHUD opravy

### Zásoby formát
Aktuálně: `20/500` s optionálním suffixem `(+X/k)`.  
Cíl: Sjednotit na stejný formát jako Produkce a Bohatství → `20 (+5/k)` kde 20 = grain_reserve, +5 = last_turn_grain_net.  
Odebrat `/500` (granary_capacity) z hlavního chipu — přesunout do tooltipu.

### Ověření dat
- Tooltip pro Zásoby: ukázat `Kapacita sýpek: X | Bilance: produkce − spotřeba − armáda`
- Ověřit, že `last_turn_grain_net` se skutečně zapisuje v process-turn (již existuje)

---

## C. Dev Tab reorganizace

### Současný stav: 15 tabů v ploché řadě
Mnoho je zastaralých nebo redundantních:
- **Lokální simulace**: Generuje fake events do DB, nespouští engine → zastaralé po RealSimulationSection
- **Event Engine**: Čistě statický přehled šablon → jen dokumentační
- **Quick Seed**: Generuje fake data client-side → překryto SeedSection a world-generate-init

### Nová struktura: 4 sekce (accordion/collapsible groups)

```text
┌─ ⚡ ENGINE ──────────────────────────────────────┐
│  [Recompute All] [Next Turn]                     │
│  • Simulace (RealSimulationSection)              │
│  • Hydratace (HydrationSection + backfill-tags)  │
│  • Integrita (WorldIntegritySection)             │
└──────────────────────────────────────────────────┘

┌─ 🗃️ DATA & SEEDING ─────────────────────────────┐
│  • Seed (SeedSection)                            │
│  • Seed Map (SeedMapManager)                     │
│  • Econ QA (EconomyQASection)                    │
│  • QA (QATestSection)                            │
└──────────────────────────────────────────────────┘

┌─ ✏️ EDITORS ─────────────────────────────────────┐
│  • Node Spawner (DevNodeSpawner)                 │
│  • Node Editor (DevNodeEditor)                   │
│  • Player Editor (DevPlayerEditor)               │
│  • Formula Tuner (FormulaTunerPanel)             │
└──────────────────────────────────────────────────┘

┌─ 🔭 OBSERVATORY ────────────────────────────────┐
│  (celý Observatory panel)                        │
└──────────────────────────────────────────────────┘
```

**Odstraněné/sloučené**:
- `Lokální simulace` → **ODSTRANIT** (redundantní s RealSimulation)
- `Event Engine` → **PŘESUNOUT** do Observatory jako sub-tab (referenční dokumentace)
- `Quick Seed` → **SLOUČIT** do Seed sekce jako rychlý režim

---

## D. Observatory — kompletní přepis System Graphu

### Problémy současného stavu
1. Chybí uzly pro goods pipeline (node_inventory, demand_baskets, trade_flows, recipes, deposits)
2. Chybí uzly pro nově integrované systémy (legitimacy drift, migration engine, labor modifiers)
3. Statický layout (6 sloupců) — nepřehledné při 30+ uzlech
4. Žádné vrstvy/filtry pro oddělení domén
5. Detail drawer ukazuje jen statická metadata — žádná live data

### Nový design

**Vrstvy (filtrační tlačítka)**:
- 🏛️ **Core** — 6 pilířů + populace + stabilita + vliv + tenze
- ⚒️ **Economy v4.1** — deposits → capability_tags → recipes → node_inventory → demand_baskets → trade_flows → city_market → realm_resources
- ⚔️ **Military** — mobilizace → workforce → upkeep → morale → garrison → bitvy
- 📜 **Narrative** — kronika → wiki → zvěsti → diplomatická paměť
- 🔧 **Infrastructure** — isolation → node_score → dev_level → routes → hex_flows
- 👥 **Social** — legitimacy → frakce → migrace → labor allocation

**Nové uzly** (přidat do observatoryData.ts):
- `resource_deposits` — hex-level suroviny, source pro goods
- `capability_tags` — node tags matching recipes
- `production_recipes` — 45 receptů, transformace tags → goods
- `node_inventory` — výstup receptů per node
- `demand_baskets` — poptávkové koše per city
- `trade_flows` — meziměstské toky zboží
- `city_market_summary` — tržní souhrn per city
- `goods_macro_aggregation` — projekce goods → realm_resources
- `irrigation` — target pro canal labor mod (chybí jako node)
- `rebellion` — target pro legitimacy threshold (chybí jako node)

**Vylepšení detail draweru**:
- Pokud je dostupné `sessionId`, fetchnout **live data** pro vybraný uzel (např. kliknu na `node_inventory` → ukáže aktuální počet záznamů, top 5 goods)
- Zobrazit **skutečný SQL** nebo edge function, která zapisuje/čte daný uzel

**Layout**: Automatický force-directed layout místo manuálních pozic → škáluje s novými uzly.

### Ostatní Observatory taby
- **Data Flow Audit** — aktualizovat `dataFlowAuditData.ts` pro nové sloupce a tabulky (node_inventory, demand_baskets, trade_flows atd.)
- **Debug Tools (Dead Data)** — viz sekce E
- **Live Data** — ověřit, že čte správné sloupce po Phase 3 blendingu
- **Node Graph** — ověřit, že capability_tags a production_role se zobrazují

---

## E. Dead Data — audit + akční plán

### Problém
`dataFlowAuditData.ts` neobsahuje mnoho nově integrovaných sloupců → DeadDataDetector hlásí stovky false positives.

### Kroky
1. **Aktualizovat `dataFlowAuditData.ts`**:
   - Přidat entries pro capability_tags, production_role, guild_level na province_nodes
   - Přidat entries pro goods_production_value, goods_supply_volume, goods_wealth_fiscal, economy_version na realm_resources
   - Přidat entries pro tabulky node_inventory, demand_baskets, trade_flows, city_market_summary
   - Přidat entries pro legitimacy-related sloupce (legitimacy na cities)
   - Přidat entries pro migration sloupce (last_migration_in, last_migration_out, migration_pressure)

2. **Rozšířit DeadDataDetector UI**:
   - U každého "dead" sloupce přidat akční badge: `🗑️ Remove` / `🔧 Implement` / `📌 Reserved`
   - Přidat filtr: "Show only truly dead" (exclude FK-only, exclude reserved)
   - Barevné rozlišení: FK-only (šedá), unused ale plánované (žlutá), skutečně mrtvé (červená)

---

## Soubory k úpravě

| Soubor | Změna |
|--------|-------|
| `supabase/functions/recompute-all/index.ts` | NOVÝ — orchestrace pipeline |
| `supabase/functions/process-turn/index.ts` | Přidat `recalcOnly` flag |
| `src/pages/game/DevTab.tsx` | Reorganizace do 4 skupin, Recompute All tlačítko |
| `src/components/DevModePanel.tsx` | Zjednodušit — odebrat flat tabs, přejít na collapsible groups |
| `src/components/layout/ResourceHUD.tsx` | Fix formátu Zásob |
| `src/components/dev/observatory/observatoryData.ts` | Přidat ~10 nových uzlů, nové edges, layer metadata |
| `src/components/dev/observatory/SystemGraphPanel.tsx` | Layer filtry, force layout, live data v detail draweru |
| `src/components/dev/observatory/dataFlowAuditData.ts` | Přidat desítky nových entries |
| `src/components/dev/observatory/DebugToolsPanel.tsx` | Akční plán badges v DeadDataDetector |
| ODSTRANIT: `src/components/dev/LocalSimulationSection.tsx` | Nahrazeno RealSimulationSection |

## Pořadí implementace

```text
1. recompute-all Edge Function + process-turn recalcOnly flag
2. DevTab reorganizace + Recompute All UI
3. ResourceHUD fix (zásoby formát)
4. Observatory observatoryData.ts rozšíření (nové uzly/edges)
5. SystemGraphPanel přepis (vrstvy, layout, live data)
6. dataFlowAuditData.ts aktualizace
7. DebugToolsPanel akční plán UI
```

