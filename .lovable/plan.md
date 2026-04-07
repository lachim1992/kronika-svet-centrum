

# Fáze 4: Propojení Dead Metrik — Implementační plán

## Audit: Co je mrtvé a proč

| Metrika | Stav | Kdo zapisuje | Kdo čte | Problém |
|---------|------|-------------|---------|---------|
| `legitimacy` | DEAD | `command-dispatch` (dobytí -30), `games-announce` (+5/+10) | UI only (`RealmIndicators`, `CityGovernancePanel`) | Žádný downstream efekt na engine |
| `migration_pressure` | DEAD | Nikdo (sloupec existuje, ale žádná funkce jej nezapisuje!) | Nikdo | Kompletně mrtvé — ani se nepočítá |
| `labor_allocation` | PARTIALLY DEAD | UI (`CityGovernancePanel`) | `computeSocialMobility()` v `demographics.ts` — ale ta funkce se nikde nevolá | Funkce existuje, ale není zapojena do world-tick ani process-turn |

## Plán integrace — 3 metriky

### 1. Legitimacy → Stabilita + Frakce + AI kontext

**Kde se bude počítat**: `world-tick` (per-city, jednou za kolo)

**Formule**:
```text
legitimacy_drift =
  + (demand_satisfaction > 0.7 ? +1 : 0)     // dobře zásobené město
  - (famine_consecutive_turns > 0 ? -3 : 0)   // hladomor
  + (temple_level * 0.5)                       // chrámový efekt
  - (was_conquered_recently ? -5 : 0)          // efekt z dobytí
  + (policy legitimacy_effect sum)             // politiky s legitimacy_effect
  
new_legitimacy = clamp(0, 100, legitimacy + drift)
```

**Downstream efekty**:
- **Stabilita**: `city_stability += (legitimacy - 50) * 0.05` — nízká legitimita táhne stabilitu dolů
- **Frakce**: `city_factions.loyalty` bonus/malus dle legitimity (nobles reagují silněji)
- **Rebelie práh**: legitimacy < 25 → práh rebelie snížen o 10 bodů
- **AI kontext**: Přidat do `ai-context.ts` pro AI frakce a kronikáře

**Změny v souborech**:
- `supabase/functions/world-tick/index.ts` — přidat legitimacy drift výpočet do city loop
- `supabase/functions/_shared/physics.ts` — přidat `computeLegitimacyDrift()` funkci
- `supabase/functions/_shared/ai-context.ts` — přidat legitimacy do kontextu

### 2. Migration Pressure → Přesuny populace

**Kde se bude počítat**: `world-tick` (per-city, jednou za kolo)

**Formule**:
```text
push_factors =
  + (famine_severity * 10)
  + max(0, overcrowding_ratio - 1.0) * 20
  + (city_stability < 30 ? (30 - city_stability) : 0)
  + (epidemic_active ? 15 : 0)

pull_factors =
  + (city_stability > 70 ? (city_stability - 70) * 0.5 : 0)
  + (market_level * 3)
  + (housing_capacity - population_total > 100 ? 5 : 0)

migration_pressure = push_factors - pull_factors  // >0 = emigrace, <0 = imigrace
```

**Downstream efekty**:
- **Populační přesuny**: Pokud `migration_pressure > 15`, město ztrácí 1-3% populace (zapisuje se do `last_migration_out`)
- **Cílové město**: Nejbližší město se `migration_pressure < -5` stejného hráče získá emigranty (zapisuje se do `last_migration_in`)
- **Event generace**: Migration event do `world_events` při výrazné migraci (>50 lidí)

**Změny v souborech**:
- `supabase/functions/world-tick/index.ts` — přidat migration výpočet po stability loop
- `supabase/functions/_shared/physics.ts` — přidat `computeMigrationPressure()` a `resolveMigration()`

### 3. Labor Allocation → Social Mobility + Production Modifiers

**Stav**: Funkce `computeSocialMobility()` již existuje v `demographics.ts` a správně čte `labor_allocation.scribes`. Jen nikdy není volána.

**Integrace**:
1. **Zapojit do `world-tick`**: V city loop zavolat `computeSocialMobility()` s daty města
2. **Rozšířit na produkční modifikátory**: `labor_allocation.farming` → modifier na `food_value` uzlů, `labor_allocation.crafting` → modifier na `production_output`
3. **Kanál (canal)**: `labor_allocation.canal` → modifier na `irrigation_level`, který ovlivňuje výnosy

**Formule rozšíření**:
```text
farming_mod = 1.0 + (labor.farming - 50) * 0.005   // 60% farming → +5% food
crafting_mod = 1.0 + (labor.crafting - 20) * 0.008  // 30% crafting → +8% prod
canal_mod = labor.canal * 0.01                       // 10% canal → irrigation +0.1
```

**Změny v souborech**:
- `supabase/functions/world-tick/index.ts` — zavolat `computeSocialMobility()`, aplikovat labor modifikátory
- `supabase/functions/_shared/demographics.ts` — přidat labor production modifiers export

## Observatory aktualizace

- `observatoryData.ts`: Změnit status `labor_allocation` z `dead` → `active`, `legitimacy` downstream z 0 → 3+, `migration_pressure` status z `auto` → `active` s downstream
- `dataFlowAuditData.ts`: Aktualizovat readers pro všechny tři metriky
- `SystemGraphPanel.ts`: Přidat nové edge vazby (legitimacy→stability, migration→population)

## UI doplňky (minimální)

- `RealmIndicators.tsx` — tooltip na legitimitu s vysvětlením driftu
- `CityGovernancePanel.tsx` — tooltip na labor allocation s reálnými efekty
- Migration pressure indikátor v city detailu (šipka ↗️ emigrace / ↙️ imigrace)

## Pořadí implementace

```text
1. physics.ts — nové funkce (computeLegitimacyDrift, computeMigrationPressure)
2. demographics.ts — labor production modifiers
3. world-tick — zapojit všechny tři metriky do city loop
4. observatoryData.ts + dataFlowAuditData.ts — dokumentace
5. UI tooltips (RealmIndicators, CityGovernancePanel)
```

## Souhrnné změny souborů

| Soubor | Typ změny |
|--------|-----------|
| `supabase/functions/_shared/physics.ts` | Přidat 2 nové funkce |
| `supabase/functions/_shared/demographics.ts` | Přidat labor modifiers export |
| `supabase/functions/world-tick/index.ts` | Zapojit 3 metriky do city loop |
| `supabase/functions/_shared/ai-context.ts` | Přidat legitimacy |
| `src/components/dev/observatory/observatoryData.ts` | Aktualizovat statusy a vazby |
| `src/components/dev/observatory/dataFlowAuditData.ts` | Aktualizovat readers |
| `src/components/realm/RealmIndicators.tsx` | Tooltip legitimita |
| `src/components/city/CityGovernancePanel.tsx` | Tooltip labor, migration badge |

