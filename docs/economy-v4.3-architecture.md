# Economy v4.3 — Architecture

> **Status:** Phase 1 active (12 of 30 planned baskets).
> **Last updated:** Task 1A/1B/3 — solver stability + AI basket awareness.

---

## 1. Cíl modelu

Nahradit plochý 10-basket systém hierarchickou strukturou **6 civilizačních tříd × 5 košů** (cílově 30 košů). V Phase 1 je aktivních **12 klíčových košů** pokrývajících materiální základnu civilizace. Třída `prestige` je rezervována pro Phase 2.

### Tier classes

| Třída | Účel | Aktivní koše (Phase 1) |
|---|---|---|
| `need` | Přežití | `staple_food`, `basic_clothing`, `tools`, `fuel` |
| `civic` | Organizace | `drinking_water`, `storage_logistics`, `admin_supplies` |
| `upgrade` | Kvalita | `construction`, `metalwork` |
| `military` | Moc | `military_supply` |
| `luxury` | Sláva / export | `luxury_clothing`, `feast` |
| `prestige` | (Phase 2) | — |

---

## 2. Datový model

### 2.1 Tabulky

- **`goods`** — definice systémových rodin produktů (zdroj `demand_basket` klíče).
- **`good_variants`** — narativní varianty (focaccia → baked_staples). Agregují se do rodičů pro simulaci.
- **`city_market_baskets`** — agregovaná data per město × basket (auto_supply, demand, satisfaction). **Primární zdroj pro UI a AI snapshoty.**
- **`city_market_summary`** — per-good detail (striktní FK na goods); **nelze** ukládat basket-level data sem.
- **`demand_baskets`** — runtime tabulka generovaná solverem (per node × basket).

### 2.2 Legacy mapping

`resolveBasketKey` + `LEGACY_BASKET_MAP` v `compute-trade-flows`:

| Legacy | Phase 1 |
|---|---|
| `variety` | `feast` |
| `ritual` / `prestige` | `luxury_clothing` |
| `basic_material` | `metalwork` |

**Fallback:** `staple_food` (bezpečný, ale významově zkresluje — dočasný most, nikoli finální sémantika).

---

## 3. Solver (compute-trade-flows)

### 3.1 Pipeline
1. Načti `goods` + resolve basket keys (s tracking counters).
2. Agreguj produkci per node × basket.
3. Aplikuj **soft gates** pro kondicionální koše:
   - `metalwork`: 100 % při lokální těžbě, 50 % při importu.
   - `drinking_water`: baseline 80 %, 100 % při řece.
   - `fuel`: baseline 70 %, 100 % při lese/uhlí.
4. Spočítej satisfaction per basket × city.
5. Zapiš do `city_market_baskets` + `demand_baskets`.

### 3.2 Diagnostika (Task 1A)

Solver vrací strukturované countery:

```json
{
  "ok": true,
  "version": "v4.3",
  "unmapped_count": 0,
  "legacy_remap_count": 5,
  "warnings": ["..."]
}
```

- `unmapped_count` — neznámé basket keys (vyžadují migraci `goods.demand_basket`).
- `legacy_remap_count` — počet aktivních legacy remapů.

### 3.3 Constraints (explicitně inactive)
- `stateEffect` — metadata only (Phase 2)
- `routeEffect` — metadata only (Phase 2)
- `uniqueProductSlots` — metadata only (Phase 2)

Solver zůstává **čistě ekonomický nástroj** bez side-effectů na stav světa nebo koridory.

---

## 4. Orchestrace přepočtu

### 4.1 `refresh-economy` (kanonický)
Bezpečný 4-krokový přepočet bez vedlejších účinků na herní čas:
1. `compute-province-routes`
2. `compute-hex-flows` (force_all)
3. `compute-economy-flow`
4. `compute-trade-flows`

Vrací `ok: true` jen při úspěchu všech 4 kroků. Best-effort in-memory guard proti paralelnímu spuštění (HTTP 409). **Klíče jsou snake_case** (`session_id`).

### 4.2 `recompute-all` (dev orchestrátor)
Stejná pipeline + volitelný `process-turn` v `recalcOnly: true` módu. Pozor: `process-turn` vyžaduje **camelCase** `sessionId`.

### 4.3 Dev UI feedback (Task 1B)
`DevTab.tsx` parsuje `compute-trade-flows.detail` z recompute response a zobrazuje toasty:
- `unmapped_count > 0` → `toast.warning` (zkontrolovat goods tabulku).
- `legacy_remap_count > 0` → `toast.info` (legacy bridge aktivní).

---

## 5. AI vrstva (Task 3)

### 5.1 Sdílený builder
`supabase/functions/_shared/basket-context.ts` → `buildBasketSnapshot(sb, opts)`:

- `playerName` → player scope
- `cityId` → city scope
- ani jedno → world scope

**Výstup:**
```
[ECONOMY SNAPSHOT — Baskets v4.3, scope: player=Aurelius]
- fuel [NEED]: 45% 🔴
- drinking_water [NEED]: 72% ⚠️
- staple_food [NEED]: 95% ✅
...
(Use only for narrative grounding / advice. Do NOT invent numerical effects.)
```

### 5.2 Integrace

| Edge funkce | Scope | Limit | Effect |
|---|---|---|---|
| `economy-advisor` | player | 12 | Doporučení akcí na základě deficitů |
| `turn-briefing` | player | 12 | Hospodářská sekce zmiňuje deficitní koše |
| `city-rumors` | city | 6 | Fámy reflektují lokální nedostatek |
| `news-rumors` | world | 5 | Globální fámy o krizích |
| `ai-faction-turn` | player (faction) | 12 | AI hráči vidí vlastní basket nasycení |

### 5.3 Constraint
Každý prompt obsahuje grounding rule:
> *"Use basket data only for narrative grounding / advice. Do NOT invent numerical effects."*

V souladu s `narrative-grounding` memory — AI nesmí vymýšlet číselné dopady, jen interpretovat strukturovaná data.

### 5.4 Mimo scope AI vrstvy
- Nezasahuje do `ai-context.ts` priority stacku [P1]–[P7].
- Nepřidává per-good detail (jen agregát po koších).
- Decision logika `ai-faction-turn` se nemění — jen dostává víc kontextu.

---

## 6. UI hierarchie

| Vrstva | Účel |
|---|---|
| **HomeTab** | Hráčské signály (rezervy, alerty, akce). Žádná dev diagnostika. |
| **EconomyTab** | Analýza trhů a nasycení (player-facing). |
| **DevTab** | Formule, simulace, recompute toasty (skryto za dev-mode gate). |

---

## 7. Roadmap

### Phase 2 (plánováno)
- Aktivace třídy `prestige` (5 košů).
- Aktivace `stateEffect` (vliv na stabilitu měst).
- Aktivace `routeEffect` (vliv na koridory).
- Migrace `goods.demand_basket` na nové klíče → odstranění `LEGACY_BASKET_MAP`.

### Phase 3 (long-term)
- Plných 30 košů (6 vrstev × 5).
- `uniqueProductSlots` mechanika.
- Per-good narativní detail v AI snapshots.

---

## 8. Známá omezení

1. **Fallback `staple_food`** — když se basket key nepřemapuje, padne sem. Bezpečné, ale významově zkreslující. Phase 2 odstraní.
2. **`drinking_water` / `fuel` baseline** — simplifikovaný proxy, ne environmentální simulace.
3. **AI snapshot nemá per-good rozpad** — záměrné pro úsporu tokenů; rozšířit lze v Phase 3.
4. **In-memory guard v `refresh-economy`** — best-effort, nikoli distribuovaný lock. Při více edge instancích může selhat.
