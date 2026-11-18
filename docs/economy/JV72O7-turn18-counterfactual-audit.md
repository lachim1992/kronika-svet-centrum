# JV72O7 — turn 18 counterfactual economy audit

**Session:** `d379caff-8992-48e2-9084-7c9d74acceb1`  
**Zdroj:** `economy_turn_ledgers.committed_result.snapshot`, committed turn 18 z 2026-11-15 18:25:14 UTC  
**Metoda:** pouze SELECT + čistý lokální `resolveGoodsEconomy(snapshot)`; žádný turn/refresh/command ani zápis do game DB.

## 1. Verdikt

- **Dominantní příčina kolapsu je extrémní testovací mobilizace, ne záporná pracovní síla ani chyba conservation.** Player má 7 542 vojáků proti 851 efektivně aktivním městským obyvatelům (součet per-city výpočtů), AI Frakce 1 má 7 373 proti 46. Kanonický `workforce = max(0, effectiveActivePop − soldiers)` proto správně vrací nulu.

- **Peacetime obnoví reálnou práci:** Player 851 civilních pracovníků a 712,00 obsazených městských pracovních míst; kanonický cap nechává 255 vojáků a 596 civilních pracovníků. Vojáci nemění `effectiveActivePop`, pouze z něj odečítají civilní práci.

- **Nulový obchod v A je důsledek prázdných zdrojů, ne prokázaná chyba trade solveru.** Všech 94 importních blockerů je `source_empty`. Po uvolnění práce vznikne fyzická dodávka 0,459 raw_timber Qweo → Lemini. Potraviny se ani v B neobchodují, protože žádné město nemá exportovatelný potravinový přebytek.

- **Obilný řetězec se peacetime sám neopraví.** Růst jídla Playera z 0,874 na 27,998 tvoří hlavně ryby (27,124). Raw_grain zůstává 0,567, mouka i pečivo nulové; palivo zůstává nulové ve všech scénářích.

- **Prokázané modelové slabé místo:** staffing předchází input sourcing. V B Lambadagrad přidělí pekárně 44,987 pracovníka, ale linka končí `missing_input_route` pro mouku, zatímco mlýny a obilné farmy zůstávají bez posádek. To je neefektivní alokace, ale její oprava vyžaduje samostatnou bezpečnou dvoufázovou změnu; v tomto auditním slice se produkční model nemění.

- **`grain_reserve = 1 000 000` je nekonzistentní testovací/legacy hodnota.** Současně `economy_detail.food_stored` i city goods ledger obsahují 0,002176618755707576. HUD čte správně city goods ledger, nikoli tento milion.

## 2. Reprodukce a bezpečnostní hranice

Fixture: `src/test/fixtures/jv72o7-turn18-snapshot.json`  
SHA-256: `2d42f319834b09fe1cd7161830416d4c5792747f7d6a5a7dd1df5aa39980447f`  
Velikost: 172 899 znaků; 7 měst, 42 statků, 130 producentů, 72 hran, 294 opening záznamů.

```sql
SELECT committed_result->'snapshot'
FROM public.economy_turn_ledgers
WHERE session_id = 'd379caff-8992-48e2-9084-7c9d74acceb1'
  AND turn_number = 18;
```

```bash
sha256sum src/test/fixtures/jv72o7-turn18-snapshot.json
bun scripts/jv72o7-turn18-counterfactual.ts > /tmp/jv72o7-turn18-counterfactual-report.json
bunx vitest run src/test/jv72o7-turn18-counterfactual.test.ts
```

Každý scénář vzniká `JSON.parse(JSON.stringify(snapshot))` hlubokým klonem. Kontrolní JSON před a po resolveru je identický (`resolverMutatedInput=false` u všech). Mění se pouze `cities[].soldiers`; goods, producers, edges, opening, budgets, priorPrices, rural populace, wages/settlement a ostatní pole zůstávají stejná.

### Baseline věrnost vůči committed ledgeru

| Kontrolní součet | Committed turn 18 | A — nový výpočet |
|---|---|---|
| effective active population | 972 | 972 |
| available urban workforce | 75 | 75 |
| urban employed | 66,9975 | 66,9975 |
| rural employed | 157 | 157 |
| flows | 0 | 0 |
| demand — všechny statky | 279.664 | 279.664 |
| stored — všechny statky | 10.051 | 10.051 |


Snapshot tedy není po resolveru znehodnocený a je vhodný jako fixture. Shoda je doložena kontrolními součty; nebyl spuštěn žádný serverový preview.

## 3. Pravidla scénářů a kanonický cap

- **A:** beze změny. **B:** všem městům `soldiers=0`. **C:** pouze Player `soldiers=0`, AI beze změny. **D:** pro každou frakci `min(actual, floor(effectiveActivePop × maxMobilization))`, s poměrným zachováním původního rozdělení vojáků mezi jejími městy.

- Cap používá skutečné `urbanClasses`, aktivní modifier a `computeWorkforceBreakdown`; v této hře je `maxMobilization=0,30`. Nejde o odhad ani o `mobilization_rate` z realm řádku.

- Cap počítá frakci agregátně: Player 853 × 0,30 → 255. Resolver počítá práci per-city a zaokrouhluje `effectiveActivePop` dolů v každém městě, proto je součet 851. Rozdíl 2 je zaokrouhlení per-city versus per-realm, ne ztráta populace. Fractional soldiers ve fixture jsou váhy pro rozdělení reálných stacků mezi městy, ne nové armády.

| Frakce | Vojáci před | effectiveActivePop pro cap | maxMobilization | Cap | Vojáci v D |
|---|---|---|---|---|---|
| AI Frakce 1 | 7373.000 | 46 | 30.00 % | 13 | 13.000 |
| AI Frakce 2 | 0 | 75 | 30.00 % | 22 | 0 |
| Player | 7542.000 | 853 | 30.00 % | 255 | 255.000 |


## 4. Pracovní síla a linky po frakcích

| Scénář | Frakce | Urban pop | Rural pop | Vojáci | Active | Civil WF | Rural WF | Urban employed | Rural employed | Running | no_workers | capacity/labor | missing inputs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A — skutečný stav | Player | 1855 | 3005 | 7542.000 | 851 | 0 | 223 | 0 | 84 | 32 | 37 | 13 | 0 |
| A — skutečný stav | AI Frakce 1 | 93 | 710 | 7373.000 | 46 | 0 | 37 | 0 | 37 | 12 | 7 | 1 | 0 |
| A — skutečný stav | AI Frakce 2 | 150 | 608 | 0 | 75 | 75.000 | 36 | 66.998 | 36 | 17 | 9 | 2 | 0 |
| B — všichni vojáci 0 | Player | 1855 | 3005 | 0 | 851 | 851.000 | 223 | 711.997 | 84 | 45 | 19 | 13 | 0 |
| B — všichni vojáci 0 | AI Frakce 1 | 93 | 710 | 0 | 46 | 46.000 | 37 | 41.593 | 37 | 15 | 3 | 1 | 0 |
| B — všichni vojáci 0 | AI Frakce 2 | 150 | 608 | 0 | 75 | 75.000 | 36 | 66.998 | 36 | 17 | 9 | 2 | 0 |
| C — Player 0, AI zachována | Player | 1855 | 3005 | 0 | 851 | 851.000 | 223 | 711.997 | 84 | 45 | 19 | 13 | 0 |
| C — Player 0, AI zachována | AI Frakce 1 | 93 | 710 | 7373.000 | 46 | 0 | 37 | 0 | 37 | 12 | 7 | 1 | 0 |
| C — Player 0, AI zachována | AI Frakce 2 | 150 | 608 | 0 | 75 | 75.000 | 36 | 66.998 | 36 | 17 | 9 | 2 | 0 |
| D — kanonický cap | Player | 1855 | 3005 | 255.000 | 851 | 596.000 | 223 | 510.263 | 84 | 44 | 20 | 13 | 0 |
| D — kanonický cap | AI Frakce 1 | 93 | 710 | 13.000 | 46 | 33.000 | 37 | 30.796 | 37 | 14 | 4 | 1 | 0 |
| D — kanonický cap | AI Frakce 2 | 150 | 608 | 0 | 75 | 75.000 | 36 | 66.998 | 36 | 17 | 9 | 2 | 0 |


**B versus C:** Player má v B i C identické hodnoty; AI Frakce 1 se v C nijak nezmění. C je tedy čistý důkaz, že hlavní změna Playera nevzniká obchodem ani chováním AI, ale uvolněním jeho vlastní práce a odstraněním vojenské spotřeby.

### Hráčská města — workforce a linky

| Scénář | Město | Urban | Rural | Vojáci | Active | Civil WF | Urban employed | Rural WF | Rural employed | Run | no_workers | cap/labor | missing inputs | other |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A — skutečný stav | Qweo | 309 | 590 | 1256.322 | 140 | 0 | 0 | 43 | 20 | 8 | 7 | 3 | 0 | 0 |
| A — skutečný stav | Lemini | 392 | 454 | 1593.781 | 177 | 0 | 0 | 39 | 16 | 6 | 10 | 2 | 0 | 0 |
| A — skutečný stav | Hakka | 339 | 437 | 1378.295 | 153 | 0 | 0 | 43 | 18 | 6 | 6 | 3 | 0 | 0 |
| A — skutečný stav | Lambadagrad | 214 | 1306 | 870.074 | 107 | 0 | 0 | 48 | 20 | 8 | 7 | 2 | 0 | 0 |
| A — skutečný stav | Kwak | 601 | 218 | 2443.527 | 274 | 0 | 0 | 50 | 10 | 4 | 7 | 3 | 0 | 0 |
| B — všichni vojáci 0 | Qweo | 309 | 590 | 0 | 140 | 140.000 | 133.180 | 43 | 20 | 12 | 3 | 3 | 0 | 0 |
| B — všichni vojáci 0 | Lemini | 392 | 454 | 0 | 177 | 177.000 | 146.038 | 39 | 16 | 8 | 7 | 2 | 0 | 1 |
| B — všichni vojáci 0 | Hakka | 339 | 437 | 0 | 153 | 153.000 | 127.462 | 43 | 18 | 8 | 3 | 3 | 0 | 1 |
| B — všichni vojáci 0 | Lambadagrad | 214 | 1306 | 0 | 107 | 107.000 | 90.987 | 48 | 20 | 10 | 3 | 2 | 0 | 2 |
| B — všichni vojáci 0 | Kwak | 601 | 218 | 0 | 274 | 274.000 | 214.330 | 50 | 10 | 7 | 3 | 3 | 0 | 1 |
| C — Player 0, AI zachována | Qweo | 309 | 590 | 0 | 140 | 140.000 | 133.180 | 43 | 20 | 12 | 3 | 3 | 0 | 0 |
| C — Player 0, AI zachována | Lemini | 392 | 454 | 0 | 177 | 177.000 | 146.038 | 39 | 16 | 8 | 7 | 2 | 0 | 1 |
| C — Player 0, AI zachována | Hakka | 339 | 437 | 0 | 153 | 153.000 | 127.462 | 43 | 18 | 8 | 3 | 3 | 0 | 1 |
| C — Player 0, AI zachována | Lambadagrad | 214 | 1306 | 0 | 107 | 107.000 | 90.987 | 48 | 20 | 10 | 3 | 2 | 0 | 2 |
| C — Player 0, AI zachována | Kwak | 601 | 218 | 0 | 274 | 274.000 | 214.330 | 50 | 10 | 7 | 3 | 3 | 0 | 1 |
| D — kanonický cap | Qweo | 309 | 590 | 42.477 | 140 | 97.523 | 94.500 | 43 | 20 | 12 | 3 | 3 | 0 | 0 |
| D — kanonický cap | Lemini | 392 | 454 | 53.887 | 177 | 123.113 | 104.330 | 39 | 16 | 8 | 7 | 2 | 0 | 1 |
| D — kanonický cap | Hakka | 339 | 437 | 46.601 | 153 | 106.399 | 91.393 | 43 | 18 | 8 | 3 | 3 | 0 | 1 |
| D — kanonický cap | Lambadagrad | 214 | 1306 | 29.418 | 107 | 77.582 | 67.261 | 48 | 20 | 10 | 3 | 2 | 0 | 2 |
| D — kanonický cap | Kwak | 601 | 218 | 82.617 | 274 | 191.383 | 152.780 | 50 | 10 | 6 | 4 | 3 | 0 | 1 |


## 5. Potraviny, voda a palivo

`supply` = fyzická produkce; `satisfied` = household + state consumption. `coverage = satisfied / demand`. Opening a import jsou v samostatných goods bilancích níže; zde jsou všechny importy kritických košů nulové.

### Potraviny

| Scénář | Frakce | Demand | Supply | Satisfied | Unmet | Coverage | Stored |
|---|---|---|---|---|---|---|---|
| A — skutečný stav | Player | 77.128 | 0.874 | 0.874 | 76.254 | 1.13 % | 0.002177 |
| A — skutečný stav | AI Frakce 1 | 37.522 | 0.473 | 0.473 | 37.049 | 1.26 % | 0 |
| A — skutečný stav | AI Frakce 2 | 7.580 | 5.712 | 5.712 | 1.868 | 75.35 % | 0 |
| B — všichni vojáci 0 | Player | 46.960 | 27.998 | 27.922 | 19.038 | 59.46 % | 0.002177 |
| B — všichni vojáci 0 | AI Frakce 1 | 8.030 | 5.051 | 5.051 | 2.979 | 62.91 % | 0 |
| B — všichni vojáci 0 | AI Frakce 2 | 7.580 | 5.712 | 5.712 | 1.868 | 75.35 % | 0 |
| C — Player 0, AI zachována | Player | 46.960 | 27.998 | 27.922 | 19.038 | 59.46 % | 0.002177 |
| C — Player 0, AI zachována | AI Frakce 1 | 37.522 | 0.473 | 0.473 | 37.049 | 1.26 % | 0 |
| C — Player 0, AI zachována | AI Frakce 2 | 7.580 | 5.712 | 5.712 | 1.868 | 75.35 % | 0 |
| D — kanonický cap | Player | 47.980 | 21.107 | 21.107 | 26.873 | 43.99 % | 0.002177 |
| D — kanonický cap | AI Frakce 1 | 8.082 | 3.934 | 3.934 | 4.148 | 48.68 % | 0 |
| D — kanonický cap | AI Frakce 2 | 7.580 | 5.712 | 5.712 | 1.868 | 75.35 % | 0 |



### Voda

| Scénář | Frakce | Demand | Supply | Satisfied | Unmet | Coverage | Stored |
|---|---|---|---|---|---|---|---|
| A — skutečný stav | Player | 19.178 | 4.633 | 4.633 | 14.545 | 24.16 % | 0 |
| A — skutečný stav | AI Frakce 1 | 3.212 | 0 | 0 | 3.212 | 0.00 % | 0 |
| A — skutečný stav | AI Frakce 2 | 3.032 | 2.250 | 2.250 | 0.782 | 74.21 % | 0 |
| B — všichni vojáci 0 | Player | 19.178 | 5.071 | 5.071 | 14.106 | 26.44 % | 0 |
| B — všichni vojáci 0 | AI Frakce 1 | 3.212 | 0.195 | 0.195 | 3.017 | 6.06 % | 0 |
| B — všichni vojáci 0 | AI Frakce 2 | 3.032 | 2.250 | 2.250 | 0.782 | 74.21 % | 0 |
| C — Player 0, AI zachována | Player | 19.178 | 5.071 | 5.071 | 14.106 | 26.44 % | 0 |
| C — Player 0, AI zachována | AI Frakce 1 | 3.212 | 0 | 0 | 3.212 | 0.00 % | 0 |
| C — Player 0, AI zachována | AI Frakce 2 | 3.032 | 2.250 | 2.250 | 0.782 | 74.21 % | 0 |
| D — kanonický cap | Player | 19.178 | 4.633 | 4.633 | 14.545 | 24.16 % | 0 |
| D — kanonický cap | AI Frakce 1 | 3.212 | 0 | 0 | 3.212 | 0.00 % | 0 |
| D — kanonický cap | AI Frakce 2 | 3.032 | 2.250 | 2.250 | 0.782 | 74.21 % | 0 |



### Palivo

| Scénář | Frakce | Demand | Supply | Satisfied | Unmet | Coverage | Stored |
|---|---|---|---|---|---|---|---|
| A — skutečný stav | Player | 28.635 | 0 | 0 | 28.635 | 0.00 % | 0 |
| A — skutečný stav | AI Frakce 1 | 4.818 | 0 | 0 | 4.818 | 0.00 % | 0 |
| A — skutečný stav | AI Frakce 2 | 4.548 | 0.371 | 0.371 | 4.177 | 8.16 % | 0 |
| B — všichni vojáci 0 | Player | 28.635 | 0 | 0 | 28.635 | 0.00 % | 0 |
| B — všichni vojáci 0 | AI Frakce 1 | 4.818 | 0 | 0 | 4.818 | 0.00 % | 0 |
| B — všichni vojáci 0 | AI Frakce 2 | 4.548 | 0.371 | 0.371 | 4.177 | 8.16 % | 0 |
| C — Player 0, AI zachována | Player | 28.635 | 0 | 0 | 28.635 | 0.00 % | 0 |
| C — Player 0, AI zachována | AI Frakce 1 | 4.818 | 0 | 0 | 4.818 | 0.00 % | 0 |
| C — Player 0, AI zachována | AI Frakce 2 | 4.548 | 0.371 | 0.371 | 4.177 | 8.16 % | 0 |
| D — kanonický cap | Player | 28.635 | 0 | 0 | 28.635 | 0.00 % | 0 |
| D — kanonický cap | AI Frakce 1 | 4.818 | 0 | 0 | 4.818 | 0.00 % | 0 |
| D — kanonický cap | AI Frakce 2 | 4.548 | 0.371 | 0.371 | 4.177 | 8.16 % | 0 |



Vojenská poptávka je zřetelná přímo z dat: Player A→B sníží food demand o 30,168 = 7 542 × 0,004; AI Frakce 1 o 29,492 = 7 373 × 0,004. V D je Player demand 47,980 = 46,960 + 255 × 0,004. Water demand se mobilizací nemění. Fuel coverage zůstává 0 % ve všech scénářích pro všechny tři frakce.

## 6. Kompletní goods bilance osmi požadovaných statků

Všechny hodnoty jsou fyzické jednotky z resolveru. `input` = consumed_as_input; `spoil` zahrnuje decay + transport/delivery + discard. Export/import jsou skutečně zúčtované množství, ne plán.

| Scénář | Frakce | Good | Opening | Produced | Household | State | Input | Import | Export | Stored | Spoil | Unmet |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A — skutečný stav | Player | raw_grain | 0 | 0.567 | 0 | 0.567 | 0 | 0 | 0 | 0 | 0 | 7.573 |
| A — skutečný stav | Player | flour | 0.002203 | 0 | 0 | 0 | 0 | 0 | 0 | 0.002177 | 0.000026 | 0 |
| A — skutečný stav | Player | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 13.857 |
| A — skutečný stav | Player | raw_fish | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17.872 |
| A — skutečný stav | Player | raw_meat | 0 | 0.306 | 0 | 0.306 | 0 | 0 | 0 | 0 | 0 | 16.730 |
| A — skutečný stav | Player | well_water | 0 | 4.633 | 4.633 | 0 | 0 | 0 | 0 | 0 | 0 | 14.545 |
| A — skutečný stav | Player | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17.443 |
| A — skutečný stav | Player | charcoal | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11.192 |
| A — skutečný stav | AI Frakce 1 | raw_grain | 0 | 0.052 | 0 | 0.052 | 0 | 0 | 0 | 0 | 0 | 2.550 |
| A — skutečný stav | AI Frakce 1 | flour | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| A — skutečný stav | AI Frakce 1 | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4.787 |
| A — skutečný stav | AI Frakce 1 | raw_fish | 0 | 0.351 | 0 | 0.351 | 0 | 0 | 0 | 0 | 0 | 16.999 |
| A — skutečný stav | AI Frakce 1 | raw_meat | 0 | 0.071 | 0 | 0.071 | 0 | 0 | 0 | 0 | 0 | 5.795 |
| A — skutečný stav | AI Frakce 1 | well_water | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3.212 |
| A — skutečný stav | AI Frakce 1 | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.937 |
| A — skutečný stav | AI Frakce 1 | charcoal | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.881 |
| A — skutečný stav | AI Frakce 2 | raw_grain | 0 | 0.105 | 0.105 | 0 | 0 | 0 | 0 | 0 | 0 | 0.553 |
| A — skutečný stav | AI Frakce 2 | flour | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| A — skutečný stav | AI Frakce 2 | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| A — skutečný stav | AI Frakce 2 | raw_fish | 0 | 5.535 | 5.535 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| A — skutečný stav | AI Frakce 2 | raw_meat | 0 | 0.072 | 0.072 | 0 | 0 | 0 | 0 | 0 | 0 | 0.634 |
| A — skutečný stav | AI Frakce 2 | well_water | 0 | 2.250 | 2.250 | 0 | 0 | 0 | 0 | 0 | 0 | 0.782 |
| A — skutečný stav | AI Frakce 2 | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.273 |
| A — skutečný stav | AI Frakce 2 | charcoal | 0 | 0.371 | 0.371 | 0 | 0 | 0 | 0 | 0 | 0 | 1.904 |
| B — všichni vojáci 0 | Player | raw_grain | 0 | 0.567 | 0.567 | 0 | 0 | 0 | 0 | 0 | 0 | 2.097 |
| B — všichni vojáci 0 | Player | flour | 0.002203 | 0 | 0 | 0 | 0 | 0 | 0 | 0.002177 | 0.000026 | 0 |
| B — všichni vojáci 0 | Player | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.213 |
| B — všichni vojáci 0 | Player | raw_fish | 0 | 27.124 | 27.049 | 0 | 0 | 0 | 0 | 0 | 0.076 | 1.310 |
| B — všichni vojáci 0 | Player | raw_meat | 0 | 0.306 | 0.306 | 0 | 0 | 0 | 0 | 0 | 0 | 6.205 |
| B — všichni vojáci 0 | Player | well_water | 0 | 5.071 | 5.071 | 0 | 0 | 0 | 0 | 0 | 0 | 14.106 |
| B — všichni vojáci 0 | Player | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17.443 |
| B — všichni vojáci 0 | Player | charcoal | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11.192 |
| B — všichni vojáci 0 | AI Frakce 1 | raw_grain | 0 | 0.052 | 0.052 | 0 | 0 | 0 | 0 | 0 | 0 | 0.505 |
| B — všichni vojáci 0 | AI Frakce 1 | flour | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| B — všichni vojáci 0 | AI Frakce 1 | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| B — všichni vojáci 0 | AI Frakce 1 | raw_fish | 0 | 4.929 | 4.929 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| B — všichni vojáci 0 | AI Frakce 1 | raw_meat | 0 | 0.071 | 0.071 | 0 | 0 | 0 | 0 | 0 | 0 | 1.185 |
| B — všichni vojáci 0 | AI Frakce 1 | well_water | 0 | 0.195 | 0.195 | 0 | 0 | 0 | 0 | 0 | 0 | 3.017 |
| B — všichni vojáci 0 | AI Frakce 1 | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.937 |
| B — všichni vojáci 0 | AI Frakce 1 | charcoal | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.881 |
| B — všichni vojáci 0 | AI Frakce 2 | raw_grain | 0 | 0.105 | 0.105 | 0 | 0 | 0 | 0 | 0 | 0 | 0.553 |
| B — všichni vojáci 0 | AI Frakce 2 | flour | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| B — všichni vojáci 0 | AI Frakce 2 | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| B — všichni vojáci 0 | AI Frakce 2 | raw_fish | 0 | 5.535 | 5.535 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| B — všichni vojáci 0 | AI Frakce 2 | raw_meat | 0 | 0.072 | 0.072 | 0 | 0 | 0 | 0 | 0 | 0 | 0.634 |
| B — všichni vojáci 0 | AI Frakce 2 | well_water | 0 | 2.250 | 2.250 | 0 | 0 | 0 | 0 | 0 | 0 | 0.782 |
| B — všichni vojáci 0 | AI Frakce 2 | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.273 |
| B — všichni vojáci 0 | AI Frakce 2 | charcoal | 0 | 0.371 | 0.371 | 0 | 0 | 0 | 0 | 0 | 0 | 1.904 |
| C — Player 0, AI zachována | Player | raw_grain | 0 | 0.567 | 0.567 | 0 | 0 | 0 | 0 | 0 | 0 | 2.097 |
| C — Player 0, AI zachována | Player | flour | 0.002203 | 0 | 0 | 0 | 0 | 0 | 0 | 0.002177 | 0.000026 | 0 |
| C — Player 0, AI zachována | Player | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.213 |
| C — Player 0, AI zachována | Player | raw_fish | 0 | 27.124 | 27.049 | 0 | 0 | 0 | 0 | 0 | 0.076 | 1.310 |
| C — Player 0, AI zachována | Player | raw_meat | 0 | 0.306 | 0.306 | 0 | 0 | 0 | 0 | 0 | 0 | 6.205 |
| C — Player 0, AI zachována | Player | well_water | 0 | 5.071 | 5.071 | 0 | 0 | 0 | 0 | 0 | 0 | 14.106 |
| C — Player 0, AI zachována | Player | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17.443 |
| C — Player 0, AI zachována | Player | charcoal | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11.192 |
| C — Player 0, AI zachována | AI Frakce 1 | raw_grain | 0 | 0.052 | 0 | 0.052 | 0 | 0 | 0 | 0 | 0 | 2.550 |
| C — Player 0, AI zachována | AI Frakce 1 | flour | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| C — Player 0, AI zachována | AI Frakce 1 | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4.787 |
| C — Player 0, AI zachována | AI Frakce 1 | raw_fish | 0 | 0.351 | 0 | 0.351 | 0 | 0 | 0 | 0 | 0 | 16.999 |
| C — Player 0, AI zachována | AI Frakce 1 | raw_meat | 0 | 0.071 | 0 | 0.071 | 0 | 0 | 0 | 0 | 0 | 5.795 |
| C — Player 0, AI zachována | AI Frakce 1 | well_water | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3.212 |
| C — Player 0, AI zachována | AI Frakce 1 | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.937 |
| C — Player 0, AI zachována | AI Frakce 1 | charcoal | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.881 |
| C — Player 0, AI zachována | AI Frakce 2 | raw_grain | 0 | 0.105 | 0.105 | 0 | 0 | 0 | 0 | 0 | 0 | 0.553 |
| C — Player 0, AI zachována | AI Frakce 2 | flour | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| C — Player 0, AI zachována | AI Frakce 2 | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| C — Player 0, AI zachována | AI Frakce 2 | raw_fish | 0 | 5.535 | 5.535 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| C — Player 0, AI zachována | AI Frakce 2 | raw_meat | 0 | 0.072 | 0.072 | 0 | 0 | 0 | 0 | 0 | 0 | 0.634 |
| C — Player 0, AI zachována | AI Frakce 2 | well_water | 0 | 2.250 | 2.250 | 0 | 0 | 0 | 0 | 0 | 0 | 0.782 |
| C — Player 0, AI zachována | AI Frakce 2 | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.273 |
| C — Player 0, AI zachována | AI Frakce 2 | charcoal | 0 | 0.371 | 0.371 | 0 | 0 | 0 | 0 | 0 | 0 | 1.904 |
| D — kanonický cap | Player | raw_grain | 0 | 0.567 | 0.477 | 0.090 | 0 | 0 | 0 | 0 | 0 | 3.732 |
| D — kanonický cap | Player | flour | 0.002203 | 0 | 0 | 0 | 0 | 0 | 0 | 0.002177 | 0.000026 | 0 |
| D — kanonický cap | Player | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.230 |
| D — kanonický cap | Player | raw_fish | 0 | 20.234 | 19.724 | 0.510 | 0 | 0 | 0 | 0 | 0 | 1.354 |
| D — kanonický cap | Player | raw_meat | 0 | 0.306 | 0.118 | 0.188 | 0 | 0 | 0 | 0 | 0 | 10.218 |
| D — kanonický cap | Player | well_water | 0 | 4.633 | 4.633 | 0 | 0 | 0 | 0 | 0 | 0 | 14.545 |
| D — kanonický cap | Player | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17.443 |
| D — kanonický cap | Player | charcoal | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11.192 |
| D — kanonický cap | AI Frakce 1 | raw_grain | 0 | 0.052 | 0.048 | 0.003605 | 0 | 0 | 0 | 0 | 0 | 0.509 |
| D — kanonický cap | AI Frakce 1 | flour | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| D — kanonický cap | AI Frakce 1 | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.957 |
| D — kanonický cap | AI Frakce 1 | raw_fish | 0 | 3.812 | 3.781 | 0.031 | 0 | 0 | 0 | 0 | 0 | 0 |
| D — kanonický cap | AI Frakce 1 | raw_meat | 0 | 0.071 | 0.063 | 0.008129 | 0 | 0 | 0 | 0 | 0 | 1.193 |
| D — kanonický cap | AI Frakce 1 | well_water | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3.212 |
| D — kanonický cap | AI Frakce 1 | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.937 |
| D — kanonický cap | AI Frakce 1 | charcoal | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.881 |
| D — kanonický cap | AI Frakce 2 | raw_grain | 0 | 0.105 | 0.105 | 0 | 0 | 0 | 0 | 0 | 0 | 0.553 |
| D — kanonický cap | AI Frakce 2 | flour | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| D — kanonický cap | AI Frakce 2 | baked_staples | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| D — kanonický cap | AI Frakce 2 | raw_fish | 0 | 5.535 | 5.535 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| D — kanonický cap | AI Frakce 2 | raw_meat | 0 | 0.072 | 0.072 | 0 | 0 | 0 | 0 | 0 | 0 | 0.634 |
| D — kanonický cap | AI Frakce 2 | well_water | 0 | 2.250 | 2.250 | 0 | 0 | 0 | 0 | 0 | 0 | 0.782 |
| D — kanonický cap | AI Frakce 2 | peat | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.273 |
| D — kanonický cap | AI Frakce 2 | charcoal | 0 | 0.371 | 0.371 | 0 | 0 | 0 | 0 | 0 | 0 | 1.904 |


## 7. Obilný řetězec a vstupy

V A jsou všechny aktivně deklarované harvest/mill/bake linky Playera bez posádek. V B se obsadí pouze Lambadagradská pekárna (44,987/50), ale nespustí se: plánovaný flour input je 0,927856875, `supplier=null`, `blocked=missing_supplier`, diagnostika `missing_input_route`. V D má stejná pekárna 26,488 pracovníka a plánovaný flour input 0,5463142215, opět bez dodavatele.

| Scénář | Město | Recipe | Producer | Capacity | Jobs | Employed | Staffing | Potential | Realized | Blocked |
|---|---|---|---|---|---|---|---|---|---|---|
| A — skutečný stav | Lemini | harvest_barley | 8bba3416-afbc-4ed8-a960-26d044459692:harvest_barley | 7.000 | 33.333 | 0 | 0 | 0 | 0 | no_workers |
| A — skutečný stav | Lemini | harvest_wheat | 8bba3416-afbc-4ed8-a960-26d044459692:harvest_wheat | 7.000 | 33.333 | 0 | 0 | 0 | 0 | no_workers |
| A — skutečný stav | Kwak | mill_grain | 865b41b8-cd07-4b96-9ee3-646bb9684d3f:mill_grain | 4.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| A — skutečný stav | Lambadagrad | mill_grain | ce0c53b1-ad90-49ec-a039-91dcea59e41b:mill_grain | 4.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| A — skutečný stav | Lemini | mill_grain | e88a08f1-5918-4219-8d9f-4c2369b3b524:mill_grain | 4.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| A — skutečný stav | Lambadagrad | bake_staples | 0edb77b4-980e-460f-8ae7-631f56da182e:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| A — skutečný stav | Lambadagrad | bake_staples | 18edbfc7-fabb-4cc5-899a-b72f7eb7cfc7:bake_staples | 5.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| A — skutečný stav | Lemini | bake_staples | 1a5fff2b-5fdc-4ed5-8c8d-863956279557:bake_staples | 5.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| A — skutečný stav | Lemini | bake_staples | 38f6ec57-2782-487e-8b59-bcf2fdedf5ae:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| A — skutečný stav | Qweo | bake_staples | 7783f6cf-194c-488f-b05d-b6ce75668965:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| A — skutečný stav | Qweo | bake_staples | 7e92522f-9651-402a-a2d2-ba5a011b87fb:bake_staples | 5.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| A — skutečný stav | Hakka | bake_staples | 9d3ab82e-4ced-443f-a805-07fbda03899e:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| A — skutečný stav | Kwak | bake_staples | bd09fcf6-6cf5-4f88-aa0f-7f83c77b4869:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| B — všichni vojáci 0 | Lemini | harvest_barley | 8bba3416-afbc-4ed8-a960-26d044459692:harvest_barley | 7.000 | 33.333 | 0 | 0 | 0 | 0 | no_workers |
| B — všichni vojáci 0 | Lemini | harvest_wheat | 8bba3416-afbc-4ed8-a960-26d044459692:harvest_wheat | 7.000 | 33.333 | 0 | 0 | 0 | 0 | no_workers |
| B — všichni vojáci 0 | Kwak | mill_grain | 865b41b8-cd07-4b96-9ee3-646bb9684d3f:mill_grain | 4.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| B — všichni vojáci 0 | Lambadagrad | mill_grain | ce0c53b1-ad90-49ec-a039-91dcea59e41b:mill_grain | 4.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| B — všichni vojáci 0 | Lemini | mill_grain | e88a08f1-5918-4219-8d9f-4c2369b3b524:mill_grain | 4.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| B — všichni vojáci 0 | Lambadagrad | bake_staples | 0edb77b4-980e-460f-8ae7-631f56da182e:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| B — všichni vojáci 0 | Lemini | bake_staples | 1a5fff2b-5fdc-4ed5-8c8d-863956279557:bake_staples | 5.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| B — všichni vojáci 0 | Lemini | bake_staples | 38f6ec57-2782-487e-8b59-bcf2fdedf5ae:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| B — všichni vojáci 0 | Qweo | bake_staples | 7783f6cf-194c-488f-b05d-b6ce75668965:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| B — všichni vojáci 0 | Qweo | bake_staples | 7e92522f-9651-402a-a2d2-ba5a011b87fb:bake_staples | 5.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| B — všichni vojáci 0 | Hakka | bake_staples | 9d3ab82e-4ced-443f-a805-07fbda03899e:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| B — všichni vojáci 0 | Kwak | bake_staples | bd09fcf6-6cf5-4f88-aa0f-7f83c77b4869:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| B — všichni vojáci 0 | Lambadagrad | bake_staples | 18edbfc7-fabb-4cc5-899a-b72f7eb7cfc7:bake_staples | 5.000 | 50.000 | 44.987 | 0.900 | — | 0 | missing_input_route |
| D — kanonický cap | Lemini | harvest_barley | 8bba3416-afbc-4ed8-a960-26d044459692:harvest_barley | 7.000 | 33.333 | 0 | 0 | 0 | 0 | no_workers |
| D — kanonický cap | Lemini | harvest_wheat | 8bba3416-afbc-4ed8-a960-26d044459692:harvest_wheat | 7.000 | 33.333 | 0 | 0 | 0 | 0 | no_workers |
| D — kanonický cap | Kwak | mill_grain | 865b41b8-cd07-4b96-9ee3-646bb9684d3f:mill_grain | 4.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| D — kanonický cap | Lambadagrad | mill_grain | ce0c53b1-ad90-49ec-a039-91dcea59e41b:mill_grain | 4.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| D — kanonický cap | Lemini | mill_grain | e88a08f1-5918-4219-8d9f-4c2369b3b524:mill_grain | 4.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| D — kanonický cap | Lambadagrad | bake_staples | 0edb77b4-980e-460f-8ae7-631f56da182e:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| D — kanonický cap | Lemini | bake_staples | 1a5fff2b-5fdc-4ed5-8c8d-863956279557:bake_staples | 5.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| D — kanonický cap | Lemini | bake_staples | 38f6ec57-2782-487e-8b59-bcf2fdedf5ae:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| D — kanonický cap | Qweo | bake_staples | 7783f6cf-194c-488f-b05d-b6ce75668965:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| D — kanonický cap | Qweo | bake_staples | 7e92522f-9651-402a-a2d2-ba5a011b87fb:bake_staples | 5.000 | 50.000 | 0 | 0 | 0 | 0 | no_workers |
| D — kanonický cap | Hakka | bake_staples | 9d3ab82e-4ced-443f-a805-07fbda03899e:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| D — kanonický cap | Kwak | bake_staples | bd09fcf6-6cf5-4f88-aa0f-7f83c77b4869:bake_staples | 0 | 0 | 0 | 0 | 0 | 0 | capacity_labor_or_staffing |
| D — kanonický cap | Lambadagrad | bake_staples | 18edbfc7-fabb-4cc5-899a-b72f7eb7cfc7:bake_staples | 5.000 | 50.000 | 26.488 | 0.530 | — | 0 | missing_input_route |


**Proč pekárna nemůže péct:** `mill_grain` potřebuje raw_grain; `bake_staples` potřebuje flour a palivový vstup (peat/charcoal). Ve všech scénářích je flour production i peat/charcoal production nulová. Peacetime tedy není důkaz funkčního obilného řetězce; je to důkaz obnovení pracovní síly a nezávislé produkce ryb.

### Dopad staffing→input pořadí

`goodsEconomy.ts` nejprve alokuje práci podle subsistence priority a teprve později zjišťuje fyzické vstupy a trasy. V B tedy 44,987 pracovníka obsadí downstream pekárnu, která nemá mouku, zatímco upstream mlýny mají `no_workers`. To je měřitelná alokační neefektivita. Bezpečná oprava není globální zvýšení produkce, ale samostatný dvoufázový návrh: nejprve určit provozuschopné kritické řetězce a rezervovat upstream posádky, poté rozdělit zbytek; declared jobs/capacity se nemají skrývat ani krátit.

## 8. Flows, cesty a blokované importy

| Scénář | Reason | Good | Source → target | Qty | Delivered | Path | Edges | Owners |
|---|---|---|---|---|---|---|---|---|
| A — skutečný stav | — | — | — | 0 | 0 | — | — | — |
| B — všichni vojáci 0 | production_input | raw_timber | Qweo → Lemini | 0.459 | 0.459 | -10,-1 → -10,0 → -9,0 → -8,0 → -8,-1 → -8,-2 | river:-10,-1>-10,0 → river:-10,0>-9,0 → river:-9,0>-8,0 → river:-8,-1>-8,0 → river:-8,-2>-8,-1 | Player → Player |
| C — Player 0, AI zachována | production_input | raw_timber | Qweo → Lemini | 0.459 | 0.459 | -10,-1 → -10,0 → -9,0 → -8,0 → -8,-1 → -8,-2 | river:-10,-1>-10,0 → river:-10,0>-9,0 → river:-9,0>-8,0 → river:-8,-1>-8,0 → river:-8,-2>-8,-1 | Player → Player |
| D — kanonický cap | production_input | raw_timber | Qweo → Lemini | 0.459 | 0.459 | -10,-1 → -10,0 → -9,0 → -8,0 → -8,-1 → -8,-2 | river:-10,-1>-10,0 → river:-10,0>-9,0 → river:-9,0>-8,0 → river:-8,-1>-8,0 → river:-8,-2>-8,-1 | Player → Player |


- A: 94/94 blockerů `source_empty`; žádný trade flow.
- B: 62 `source_empty` + 1 `margin_unprofitable`; jeden flow výše. Výjimka je raw_fish Kwak → Lambadagrad, unmet 1,3104628163.
- C: 62 `source_empty`, 1 `margin_unprofitable`, 1 `trade_blocked`; AI Frakce 1 nemůže nakoupit raw_fish od Player Kwak kvůli aktivní válce. Jediný uskutečněný flow je opět interní Player Qweo → Lemini.
- D: 82/82 `source_empty`; jeden stejný raw_timber flow.

Závěr: nulový obchod v A je prostý důsledek nulových přebytků a neaktivních input-linek. V B solver dokazuje, že umí vytvořit trasu, rezervovat edges a zúčtovat delivered qty; nebyl prokázán bug nulového obchodu.

## 9. Ceny, mzdy a sektorová práce

V A je mzdová sazba všech hráčských měst 0,06 a všechny čtyři sektorové labor_supply jsou nulové. Návrat práce v B snižuje mzdy tam, kde roste nabídka práce; Qweo zůstává na 0,06 kvůli vysokým vacancies. Ceny reagují na fyzickou dostupnost: raw_fish v Qweo/Lemini/Hakka/Kwak klesá z přibližně 1,059 na 0,4. Baked_staples klesá z 3,9715 na 1,725 ve čtyřech městech díky substitučnímu pokrytí koše, nikoli kvůli nové produkci pečiva.

| Scénář | Město | Wage | raw_grain | raw_fish | baked_staples | well_water | peat | charcoal |
|---|---|---|---|---|---|---|---|---|
| A — skutečný stav | Qweo | 0.060 | 1.600 | 1.059 | 3.972 | 1.816 | 2.648 | 5.295 |
| A — skutečný stav | Lemini | 0.060 | 1.600 | 1.059 | 3.972 | 1.725 | 2.648 | 5.295 |
| A — skutečný stav | Hakka | 0.060 | 1.840 | 1.059 | 3.972 | 2.093 | 2.648 | 5.295 |
| A — skutečný stav | Lambadagrad | 0.060 | 1.600 | 1.059 | 3.972 | 2.105 | 2.648 | 5.295 |
| A — skutečný stav | Kwak | 0.060 | 1.600 | 1.059 | 3.970 | 2.128 | 2.648 | 5.295 |
| B — všichni vojáci 0 | Qweo | 0.060 | 1.600 | 0.400 | 1.725 | 1.816 | 2.648 | 5.295 |
| B — všichni vojáci 0 | Lemini | 0.060 | 0.500 | 0.400 | 1.725 | 1.725 | 2.648 | 5.295 |
| B — všichni vojáci 0 | Hakka | 0.045 | 0.575 | 0.400 | 1.725 | 2.093 | 2.648 | 5.295 |
| B — všichni vojáci 0 | Lambadagrad | 0.042 | 1.600 | 0.522 | 3.972 | 2.105 | 2.648 | 5.295 |
| B — všichni vojáci 0 | Kwak | 0.037 | 0.500 | 0.400 | 1.725 | 1.949 | 2.648 | 5.295 |


### Peacetime sektory Playera (native labor_supply → employed; retraining je součástí employed)

| Město | Sektor | Native supply | Employed | Vacancies | Transferred in |
|---|---|---|---|---|---|
| Qweo | farming | 84.000 | 100.765 | 327.235 | 16.765 |
| Qweo | crafting | 21.700 | 22.415 | 83.585 | 0.715 |
| Qweo | administration | 7.000 | 0 | 0 | 0 |
| Qweo | logistics | 14.000 | 10.000 | 0 | 0 |
| Lemini | farming | 106.200 | 130.038 | 447.962 | 23.838 |
| Lemini | crafting | 44.250 | 6.000 | 0 | 0 |
| Lemini | administration | 8.850 | 0 | 0 | 0 |
| Lemini | logistics | 17.700 | 10.000 | 0 | 0 |
| Hakka | farming | 91.800 | 111.462 | 366.538 | 19.662 |
| Hakka | crafting | 38.250 | 6.000 | 0 | 0 |
| Hakka | administration | 7.650 | 0 | 0 | 0 |
| Hakka | logistics | 15.300 | 10.000 | 0 | 0 |
| Lambadagrad | farming | 64.200 | 74.987 | 83.013 | 10.787 |
| Lambadagrad | crafting | 26.750 | 6.000 | 0 | 0 |
| Lambadagrad | administration | 5.350 | 0 | 0 | 0 |
| Lambadagrad | logistics | 10.700 | 10.000 | 0 | 0 |
| Kwak | farming | 164.400 | 198.330 | 329.670 | 33.930 |
| Kwak | crafting | 68.500 | 6.000 | 0 | 0 |
| Kwak | administration | 13.700 | 0 | 0 | 0 |
| Kwak | logistics | 27.400 | 10.000 | 0 | 0 |


## 10. Skladování a spoilage

Baseline stored všech statků je 10,0512640544; peacetime 8,6630541475. Jídlo je v podstatě bez zásob: Player food stored je v A i B 0,0021766188. Vyšší produkce ryb v B vytvoří 0,0756894179 discard v Kwak; ostatní ztráty jsou malé opening decay. Transport loss je nulový, včetně jediné dodávky raw_timber.

| Scénář | Město | Stored — vše | Spoilage | Decay | Transport loss | Discard |
|---|---|---|---|---|---|---|
| A — skutečný stav | Qweo | 1.190 | 0.000448 | 0.000448 | 0 | 0 |
| A — skutečný stav | Lemini | 0 | 0 | 0 | 0 | 0 |
| A — skutečný stav | Hakka | 0.941 | 0.000135 | 0.000135 | 0 | 0 |
| A — skutečný stav | AI Frakce 1 – Hlavní | 5.876 | 0.002400 | 0.002400 | 0 | 0 |
| A — skutečný stav | Lambadagrad | 0.537 | 0.000138 | 0.000138 | 0 | 0 |
| A — skutečný stav | Kwak | 0.200 | 0.000079 | 0.000079 | 0 | 0 |
| A — skutečný stav | AI Frakce 2 – Hlavní | 1.309 | 0.000527 | 0.000527 | 0 | 0 |
| B — všichni vojáci 0 | Qweo | 0.966 | 0.000448 | 0.000448 | 0 | 0 |
| B — všichni vojáci 0 | Lemini | 0 | 0 | 0 | 0 | 0 |
| B — všichni vojáci 0 | Hakka | 0.597 | 0.000135 | 0.000135 | 0 | 0 |
| B — všichni vojáci 0 | AI Frakce 1 – Hlavní | 5.531 | 0.002400 | 0.002400 | 0 | 0 |
| B — všichni vojáci 0 | Lambadagrad | 0.258 | 0.000138 | 0.000138 | 0 | 0 |
| B — všichni vojáci 0 | Kwak | 0.002177 | 0.076 | 0.000079 | 0 | 0.076 |
| B — všichni vojáci 0 | AI Frakce 2 – Hlavní | 1.309 | 0.000527 | 0.000527 | 0 | 0 |


## 11. Conservation residual

Pro každou city×good bilanci: `opening + produced + imported − exported − household − state − input − spoilage − stored − capex`. Resolver také interně ověřuje physical trade journal.

| Scénář | Max \|residual\| | Součet \|residual\| |
|---|---|---|
| A — skutečný stav | 2,220446049250313e-16 | 3,885780586188048e-16 |
| B — všichni vojáci 0 | 2,220446049250313e-16 | 4,0116158008321467e-16 |
| C — Player 0, AI zachována | 2,220446049250313e-16 | 4,0116158008321467e-16 |
| D — kanonický cap | 4,996003610813204e-16 | 1,20780799641243e-15 |


Residual je pouze floating-point šum; žádný scénář nevytváří ani neničí zboží mimo zdokumentované spotřeby, skladu, capex a spoilage.

## 12. Audit `grain_reserve` versus fyzické jídlo

| Zdroj | Player hodnota | Význam |
|---|---|---|
| `realm_resources.grain_reserve` | 1 000 000 | Legacy integer sloupec; aktuálně nekonzistentní s fyzickým ledgerem. |
| `realm_resources.economy_detail.food_stored` | 0,002176618755707576 | Agregace committed goods balances za staple_food. |
| `city_good_balances`, turn 18 | 0,002176618755707576 | Autoritativní fyzický city goods ledger (40 food rows pro Player). |
| Snapshot A, food stored | 0,002176618755707576 | Stejná hodnota po čistém přepočtu. |
| `cities.local_grain_reserve` | 0 ve všech 5 městech | Stará lokální sýpka; není součet canonical city goods stocks. |


`economyAdapter.ts` počítá `economy_detail.food_stored` ze `result.balances.stored`. `process-turn` z něj v `fiscalPatch` zapisuje `grain_reserve = Math.round(food_stored)`; pro turn 18 by tedy z kanonického writeru vzniklo 0, ne 1 000 000. Samotný SELECT nedokáže určit původce pozdější změny, ale hodnota není reprodukovatelná z turn-18 resolveru a je konzistentní s testovacím/out-of-band přepsáním.

**UI:** `ResourceHUD.tsx` načítá poslední dva turny `city_good_balances` a chip „Zásoby“ ukazuje `foodNow`, tedy správných 0,0021766; `grainReserve` je v souboru stále pomocná legacy proměnná, ale tento chip ji nepoužívá. `CityManagement`, `UprisingDialog`, dev panely a některé staré prerequisite kontroly dál čtou `grain_reserve` nebo `local_grain_reserve`. Tyto spotřebitele je nutné oddělit jako legacy/debug nebo převést na canonical goods; nesmí se zaměňovat s fyzickým jídlem.

## 13. Workforce, rural catchments a turn writer — code audit

- `manpower.ts`: vážená urban active populace, `effectiveActivePop=floor(activePopRaw×effectiveRatio)`, `maxMobilization` clamp 0,05–0,50 (zde 0,30), `workforce=max(0,effectiveActivePop−soldiers)`. Nulová práce při extrémní armádě je očekávaná; armáda nevytváří active pop.

- `economyAdapter.ts`: nejprve načte městskou populaci/třídy; potom `ruralCatchments` přiřadí každou owned/passable buňku právě jednomu městu. `urbanPopulation` a `urbanClasses` se zmrazí před přičtením rural populace do market `population/classes`. Proto rural domácnosti zvyšují poptávku městského trhu, ale ne urban workforce.

- `goodsEconomy.ts`: urban workforce používá pouze `urbanClasses`. Parcel producenci dostávají `ruralLabor={cell,population}`; `allocateRuralLabor` alokuje sdílený cell pool jednou, `RURAL_WORKFORCE_SHARE=0,5`. Rural employed je proto ve všech scénářích invariantní (Player 84), zatímco urban employed roste z 0 na 712.

- Food demand zahrnuje state rations 0,004/soldier. Rural populace zvyšuje market demand, což vysvětluje vysoký food demand i při malém městě; není to přičtení rural workers do urban labor.

- Trade solver převádí pouze dostupné jednotky nad retention/reserve pravidly a zaznamenává `source_empty`, `trade_blocked`, `margin_unprofitable`. Conservation a physical trade journal prošly.

- Turn writer nemění counterfactual: `resolveGoodsEconomy` je pure a audit nespustil `process-turn`. Fiskální `grain_reserve` je zaokrouhlená projekce physical `food_stored`, ne nezávislý důkaz skladu.

### Committed snapshot versus pozdější live data

Turn-18 fixture obsahuje Player urban population 1 855 (Qweo 309, Lemini 392, Hakka 339, Lambadagrad 214, Kwak 601). Aktuální SELECT nad `cities` ukazuje 1 741; AI Frakce 1 88 místo 93 a AI Frakce 2 149 místo 150. Live armády zůstávají Player 7 542 a AI Frakce 1 7 373. Proto se do výpočtů nemíchá aktuální populace ani pozdější parcels; jediným baseline je committed turn 18.

## 14. Doporučené kroky

### Nutné v kódu / dalším bezpečném slice

1. **Přidat regresní ochranu workforce invariantů** — provedeno v tomto reportovacím slice: žádná záporná práce, armáda nevytváří active pop, peacetime vrací reálnou práci, rural pool zůstává oddělený, cap respektuje skutečnou effectiveActivePop a conservation platí.

2. **Navrhnout a nejdřív testem specifikovat vstupně-aware subsistence staffing.** Cíl: downstream linka bez dostupného kritického inputu nesmí pohlttí posádku, pokud upstream může vytvořit chybějící input. Nejdřív malý syntetický grain→flour→bread fixture; změna nesmí snížit declared jobs/capacity ani vytvořit druhý solver. V tomto auditu nebyla produkční oprava provedena.

3. **Sjednotit prezentaci fyzických zásob.** Canonical je city goods ledger. Staré UI/akce čtoucí `grain_reserve`/`local_grain_reserve` označit legacy nebo migrovat odděleně; neprovádět čištění v rámci read-only auditu. Opravit i zastaralý komentář v ResourceHUD tvrdící, že `grain_reserve` se už nezapisuje.

### Co vyčistit pouze v testovací hře (neprovedeno)

- Player `grain_reserve=1 000 000` nahradit hodnotou odvozenou z canonical goods, pokud bude legacy sloupec nadále používán.

- Extrémní armády Player 7 542 a AI Frakce 1 7 373 odmobilizovat/smazat podle zvoleného testovacího scénáře; kanonický cap by zde byl 255 a 13. Samotné čištění je datový zásah a v tomto úkolu byl zakázán.

- Posouzení aktuální populace 1 741 versus snapshot 1 855 provést až jako samostatný audit pozdějších admin/map změn; nepřepisovat committed historii.

### Kalibrovat až po peacetime baseline

- Geografickou dostupnost vody a paliva (peat/charcoal), počet a umístění zdrojových parcel a možnost zásobit mlýn skutečným obilím.

- Rozdělení práce mezi přímé kalorické zdroje a upstream zpracování; teprve potom kapacitu farem/mlýnů/pekáren a případné substitute preference.

- Až po několika čistých peacetime tazích skladovací kapacitu, reserveTurns, spoilage a obchodní marže. **Nenásobit globálně produkci:** v A by se neobsazenost linek nezměnila a v B by se prohloubil přebytek ryb bez obilí, mouky a paliva.

## 15. Limity a validace

- Jde o jednokrokový fyzický counterfactual nad turn-18 inputem, ne o vícekrokovou simulaci ani fiskální process-turn. Nemění se ekologie, populace, mzdy settlement, treasury, budovy, zásoby ani trasy.

- Prior prices, budgets a committed wage settlement jsou záměrně zachované. Cenové/mzdové výstupy jsou nový výsledek resolveru, ne nové committed ceny.

- Přesný JSON všech city/owner/goods/chain/price/storage polí lze kdykoli znovu vytvořit uvedeným Bun skriptem. Report nenahrazuje tento strojový výstup.

- Nové testy: **5/5 prošlo**. Produkční ekonomický model nebyl změněn; přidány jsou pouze fixture, scénářový helper, reprodukční skript, test a dokumentace.

- Relevantní sada: **71/71 testů prošlo** (5 souborů: nový counterfactual, rural gameplay, subsistence labour, perishable labour demand, economy integrity). `oj typecheck -b --noEmit` prošel bez výstupu a `bun run build` prošel za 30,07 s; pouze stávající varování o velikosti chunků. Finální commit SHA je uveden v odevzdání.
