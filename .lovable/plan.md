

# Audit: Herní mechaniky, logika tahu a multiplayerová provázanost

## Shrnutí stavu

Systém je **celkově funkční**, ale obsahuje několik konkrétních problémů, které způsobují nekonzistentní chování.

---

## Nalezené problémy

### 1. KRITICKÉ: Dvojitý růst populace (DUPLICATE GROWTH)

**Problém:** Populace roste DVAKRÁT za kolo.

- **`commit-turn` (Step 1, řádky 1119–1176):** `runWorldTickEvents()` volá `computeSettlementGrowth()` a zapisuje růst do `cityEvents` → projektuje do `cities` tabulky přes `projectCityUpdates()`.
- **`process-turn` (řádky 552–643):** Znovu počítá růst populace (`BASE_GROWTH_RATE = 0.012`) a zapisuje do `cities` tabulky.

Oba systémy zapisují `population_total`, `population_peasants` atd. nezávisle. Výsledek: populace roste ~2× rychleji než zamýšleno.

**Oprava:** Odstranit demografický růst z `process-turn` (řádky 552–643) — nechat ho pouze v `world-tick` části `commit-turn`, kde běží s plnou fyzikou (`computeSettlementGrowth` ze `_shared/physics.ts`).

### 2. KRITICKÉ: Dvojitý settlement upgrade

**Problém:** `commit-turn/runWorldTickEvents` (ř. 1119) i `process-turn` (ř. 625–643) oba kontrolují settlement level threshold a oba mohou zapsat upgrade event. To může generovat duplicitní `settlement_upgrade` události.

**Oprava:** Odstranit settlement upgrade logiku z `process-turn`.

### 3. STŘEDNÍ: `world-tick` vs `commit-turn` redundance

**Problém:** Existují DVĚ kopie world-tick logiky:
- **Standalone `world-tick/index.ts`** (1224 řádků) — volán z DevTab
- **Inline `runWorldTickEvents()` v `commit-turn/index.ts`** (řádky 1045–1522) — volán v produkčním tahu

Tyto dvě verze se liší v detailech (commit-turn má navíc trait modifiers, civ DNA bonusy, diplomatické projekce). DevTab volá starou verzi.

**Oprava:** DevTab by měl volat `commit-turn` místo `world-tick` + manuálního orchestrování. Alternativně sjednotit obě verze.

### 4. STŘEDNÍ: Ekonomický flow běží PŘED world-tick v `commit-turn`

**Problém:** `process-turn` (Step 5, ř. 509–535) běží po advance turn a čte `realm.total_production` z `realm_resources`, ale `compute-economy-flow` (Step 12f z paměti) by měl běžet v rámci world-tick. Aktuálně `commit-turn` nevolá `compute-economy-flow` explicitně — spoléhá na to, že data jsou z minulého kola.

**Oprava:** Přidat volání `compute-economy-flow` před Step 5 v `commit-turn`, aby `process-turn` měl čerstvá makro data.

### 5. NÍZKÉ: `closeTurnForPlayer` legacy p1/p2 logika

**Problém:** Funkce `closeTurnForPlayer` (ř. 297–307) stále zapisuje do `turn_closed_p1`/`turn_closed_p2` na `game_sessions`, což je legacy logika pro 2 hráče. U 3+ hráčů se nepropisuje správně.

**Oprava:** Odstranit `turn_closed_p1`/`turn_closed_p2` zápisy a spoléhat pouze na `game_players.turn_closed`.

---

## Multiplayerová provázanost — stav

### ✅ Funguje správně:
- **Realtime subscription** (`useGameSession.ts` ř. 117–143): Naslouchá na 18 tabulek přes Supabase Realtime s debounced refetch (800ms).
- **Auto-commit trigger** (`Dashboard.tsx` ř. 86–99): Když `players.every(p => p.turn_closed)` → volá `processNextTurn()` (→ `commit-turn`).
- **Chat** (`TurnProgressionPanel.tsx`): Realtime INSERT subscription na `game_chat`.
- **Turn readiness UI**: Zobrazuje status každého hráče a `TurnCloseBadge` v headeru.
- **Force close**: Admini mohou vynutit uzavření tahu neaktivním hráčům.

### ⚠️ Potenciální race condition:
- Pokud dva hráči uzavřou tah současně a oba detekují `allPlayersClosed`, oba zavolají `commit-turn`. Idempotence je zajištěna přes `world_tick_log`, ale `process-turn` má idempotenci na `last_processed_turn`, takže by neměl běžet dvakrát. **Riziko je nízké, ale existuje.**

---

## Pořadí zpracování tahu (`commit-turn`)

```text
1. World Tick (physics: growth, influence, tension, rebellion)
   → lock via world_tick_log (idempotent)
   → project city/influence/tension/diplomatic updates
2. Process-tick (housekeeping: action_queue, travel_orders)
2b. Auto-resolve battle lobbies
3. AI Factions (sequential, with battle resolution)
3b. Diplomatic pacts (expiration, defense pact auto-war)
3c. Trade offers (AI evaluation, expiration, route creation)
4. ADVANCE TURN (current_turn + 1, reset turn_closed)
5. Economy (process-turn for all players + AI factions)
5b. Strategic graph recompute (hex flows, collapse chain)
6. Background tasks (chronicles, wiki, academy, league, victory)
```

**Problém:** Ekonomika (Step 5) běží PO advance turn (Step 4), což znamená, že `process-turn` vidí `current_turn = N+1` ale zpracovává data z kola N. To je záměr (idempotence na `last_processed_turn`), ale může být matoucí.

---

## Plán oprav

### Krok 1: Odstranit duplicitní populační růst z `process-turn`
- Smazat řádky 552–643 v `process-turn/index.ts` (celou sekci "POPULATION GROWTH & DEMOGRAPHICS")
- Ponechat růst pouze v `commit-turn/runWorldTickEvents()`

### Krok 2: Přidat `compute-economy-flow` do `commit-turn`
- Vložit volání po world-tick a před process-turn (mezi Step 1 a Step 5)

### Krok 3: Opravit `closeTurnForPlayer` legacy logiku
- Odstranit zápisy do `turn_closed_p1`/`turn_closed_p2`

### Krok 4: Sjednotit DevTab s produkčním pipeline
- DevTab "Next Turn" by měl volat `commit-turn` místo manuální orchestrace

### Krok 5: Přidat multiplayerový guard proti race condition
- V `Dashboard.tsx` přidat `useRef` lock, aby `processNextTurn` nemohl být volán dvakrát

