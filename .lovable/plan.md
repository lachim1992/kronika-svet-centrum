

# Oprava: Generované uzly nemají trasy ani toky

## Problém

Když se uzly vygenerují přes `compute-province-nodes` nebo se ručně postaví přes `BuildNodeDialog`, NIKDY se automaticky nespustí:
1. **`compute-province-routes`** — vytváří trasy (route edges) mezi uzly
2. **`compute-hex-flows`** — počítá hex-by-hex cesty podél tras (flow_paths)
3. **`compute-economy-flow`** — aktualizuje ekonomické toky na uzlech

Takže uzly existují v DB, ale nemají žádné propojení → na mapě se nezobrazí žluté/zelené linky.

Svatyně, kterou jsi postavil ručně, pravděpodobně měla trasy buď z předchozího přepočtu, nebo z manuálního spuštění v DevTabu.

## Řešení

### 1. Auto-recompute po stavbě uzlu (`BuildNodeDialog.tsx`)
Po úspěšném insertu uzlu automaticky zavolat celý řetězec:
```
compute-province-routes → compute-hex-flows → compute-economy-flow
```
S loading toast indikátorem ("Propojuji trasy…").

### 2. Auto-recompute po generování uzlů (`compute-province-nodes`)
Na konci edge funkce `compute-province-nodes` přidat interní volání `compute-province-routes` a `compute-hex-flows` (chain call), aby se po každém generování okamžitě vytvořily trasy.

### 3. Přidat chain do `commit-turn`
V pipeline `commit-turn` (po world-tick, před economy) přidat:
- `compute-province-routes` (pokud existují dirty routes nebo nové uzly)
- `compute-hex-flows` (force_all)

Tím se zajistí, že i pokud hráč mezi tahy postavil nový uzel, trasy se přepočtou v dalším tahu.

### 4. Refresh vizualizace na mapě
Po dokončení recompute v `BuildNodeDialog` → `onBuilt` callback už volá `setRouteRefreshKey` — `RouteCorridorsOverlay` se překreslí z čerstvých DB dat.

## Technické kroky

| Soubor | Změna |
|--------|-------|
| `src/components/BuildNodeDialog.tsx` | Po insertu zavolat 3 edge funkce (routes → flows → economy) s toast progress |
| `supabase/functions/compute-province-nodes/index.ts` | Na konci po insertu zavolat `compute-province-routes` a `compute-hex-flows` interně |
| `supabase/functions/commit-turn/index.ts` | Přidat kroky routes + flows do pipeline před economy |

