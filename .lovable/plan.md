# Economy Audit — co je rozbité a proč

## Co ukazují data (session `0de6fab4`, kolo 2)

Podíval jsem se přímo do DB. Najdeš tam tři vážné nesrovnalosti, které spolu souvisí:

### 1. `total_wealth` ≈ 0 u všech hráčů, ale komponenty wealth jsou velké
```
player                       total_wealth | wealth_pop_tax | wealth_domestic_market | wealth_route_commerce | goods_wealth_fiscal
Lachim                              0.44 |              0 |                   16.1 |                   3.5 |                 3.5
Stříbrné řeky                       0.41 |              0 |                   15.9 |                   3.0 |                 3.6
Liga Karavanních měst               0.33 |              0 |                   22.9 |                   3.7 |                 5.1
```
HUD ukazuje `Bohatství +7/k`, ale kanonický field `total_wealth` je ~0,4. To znamená, že:
- `compute-economy-flow` přepisuje `total_wealth` z `nodeResults.wealth_output` (per‑node), ale ten už nezohledňuje žádný z nově zavedených wealth proudů (`pop_tax`, `domestic_market`, `route_commerce`). Komponenty se počítají jinde a pak zůstávají osamělé.
- HUD a Economy panel proto čtou jiné číslo než engine používá pro tah → **kompletně rozbitá zpětná vazba**.

### 2. `total_capacity` = 0 / 0.01 u všech, přitom uzly existují
```
player                        nodes (major/minor/micro) | total_capacity
Lachim                                       2 / 4 / 5 |           0.01
Stříbrné řeky                                2 / 3 / 4 |           0.00
Liga Karavanních měst                        3 / 3 / 5 |           0.01
```
HUD ukazuje `Kapacita 0.0`, hráč nemůže nic stavět. `compute-economy-flow` sčítá `nr.capacity_score`, který je ale per‑node v rozsahu 0–0.01 (zlomek), zatímco UI/projekty očekávají celočíselnou logistic kapacitu (řády jednotek až desítek). Buď se **špatně vypočítává `capacity_score`**, nebo se aggregace dělá ze špatného pole (`logistic_capacity` se vůbec neagreguje).

### 3. Poptávkové koše jsou systémově rozladěné
```
basket             demand  supply  satisfaction
admin_supplies       1.0    0.0    0%   ← absolutní deficit
storage_logistics    1.0    0.0    0%   ← absolutní deficit
fuel                 6.0    0.9   15%   ← kritický
drinking_water       4.0    0.7   18%   ← kritický
tools                7.0    3.6   39%   ← deficit
metalwork            2.0   44.8   80% ✓ ale 22× nadprodukce
construction         1.0  101.6   100% ✓ ale 100× nadprodukce
staple_food         11.0   90.2   93% ✓ ale 8× nadprodukce
feast                0.0   19.0   100% (žádná poptávka, jen produkce)
```
Některé recepty / capability_tagy chybí (admin, storage, fuel, water), zatímco základní zboží má **nadprodukci o 1–2 řády**. Ekonomika je nezbalancovaná hned od kola 0 — chybí zdrojové uzly pro `fuel`/`water`/`admin`/`storage` (pravděpodobně chybí mapování capability_tag → basket).

### 4. Republika Korálových břehů má jediný major node a `total_production = 0.72`
Wealth = 0, supplies = 0,9. Hráč fakticky nemá ekonomiku. Buď chybí auto‑capability_tagy pro pobřežní/ostrovní spawn, nebo má jediný node bez tagů. Vyžaduje hydrate‑pass.

## Hypotéza root cause

`compute-economy-flow` byl přepsán na novou skladbu wealth (pop tax + domestic market + route commerce + fiscal goods), ale **finální zápis do `realm_resources`** (řádky 870–891) stále zapisuje jen starý `wealth_output` per node a `capacity_score` per node. Nová pole se počítají v jiné funkci/jiném průchodu (zřejmě `compute-trade-flows` nebo `economy-recompute`) a nikdo je nesumarizuje do kanonických polí, která čte HUD i AI.

Druhá hypotéza: `Recompute All` orchestrátor neběží v plné sekvenci po startu světa, takže `economy_version=3` schéma nestihne hydratovat. To by vysvětlilo i chybějící baskety (admin/storage/fuel/water).

## Plán oprav (3 fáze)

### Fáze A — Sjednotit wealth a capacity zápis (kritické)
1. V `compute-economy-flow` (řádky 829–891) změnit aggregaci tak, aby `total_wealth` = `wealth_pop_tax + wealth_domestic_market + wealth_route_commerce + goods_wealth_fiscal` (sečteno per hráč z toho, co je v `realm_resources` po předchozích krocích) — ne z `nr.wealth_output`.
2. Aggregovat `logistic_capacity` (z node) do `total_capacity` místo `capacity_score` (nebo násobit `capacity_score * 100` pokud je to fragment).
3. Garantovat pořadí v `refresh-economy`:
   `compute-province-nodes → compute-trade-flows → compute-wealth-components → compute-economy-flow (final aggregate)`
   tak, aby finální agregace byla VŽDY poslední krok.

### Fáze B — Hydratace basketů a tagů
4. Zavést validaci v `refresh-economy`: pokud chybí basket s `local_supply > 0` pro `admin_supplies`, `storage_logistics`, `fuel`, `drinking_water`, hodit warning a pokusit se o auto‑hydrate (přidat capability_tagy `admin`, `storage`, `fuel_gathering`, `water_source` na vhodné minor uzly).
5. Mapování `LEGACY_BASKET_MAP` rozšířit o tyto 4 chybějící baskety, aby production_recipes uměly vyrobit jejich supply.
6. Pro Republiku Korálových břehů (a jiné single‑major frakce) spustit `hydrate-province-tags`, aby měly minimum funkčních tagů.

### Fáze C — UI parity & diagnostika
7. HUD `Bohatství +X/k` a Economy panel musí číst stejné pole, které engine používá pro tah. Pokud HUD ukazuje `+7/k`, ale `total_wealth = 0.44`, ukazujeme hráči lež.
8. V Dev Mode → Observatory přidat sekci „Wealth Composition“ s breakdown: `pop_tax + domestic_market + route_commerce + fiscal = total_wealth` a červené flag, když součet ≠ canonical.
9. V `EconomyTabDevPanels` ukázat per‑basket deficit/surplus s flagem „> 5× nad poptávkou = nezbalancováno“.

## Co po dokončení

- `total_wealth` v DB bude konzistentní s tím, co vidí hráč v HUD.
- `total_capacity` poskočí z 0 → reálných hodnot (cca 5–25 podle počtu uzlů), čímž se odblokují stavby.
- Basket satisfaction přestane mít absolutní 0% u základních košů; nadprodukce přestane být 100×.
- Republika Korálových břehů začne mít alespoň minimální produkci.

## Otázka k tobě

Mám pokračovat plnou implementací všech 3 fází (A+B+C), nebo chceš nejdřív jen **Fázi A** (kritická oprava — wealth & capacity zápis), spustit `Recompute All` a podívat se, jestli se čísla zarovnají, a teprve pak rozhodnout o B/C?
