## 🏭 Správa goods — Fáze 1A (schváleno, s pojistkami)

Player-facing Goods Command Center. Žádné solver změny, žádná nová DB tabulka, žádné writy do `city_market_baskets`. Node production orders odloženy do Fáze 1B (vyžaduje production budget v solveru).

---

### Implementační guards (před kódem)

**G1 — `basket_trade_flows` je optional**
Import sloupec v Basket Matrix čte ze `basket_trade_flows`. Pokud tabulka neexistuje nebo query selže, sloupec zobrazí `—` a celý tab funguje dál. Žádný hard error, žádný blokující await.

**G2 — Všechny `city_market_baskets` queries filtrují na aktuální turn**
Primárně `turn_number = currentTurn`. Pokud pro aktuální turn nejsou data, fallback na `max(turn_number)` v rámci session+player a v UI ukázat malý badge `"snapshot z turnu N"`. Nikdy nemíchat řádky napříč turny.

**G3 — Weighted satisfaction je demand-weighted** *(detail dokončit po zprávě)*
Per basket aggregace přes města hráče:
```
weighted_sat = Σ(sat_city × demand_city) / Σ(demand_city)
```
Pokud `Σ demand = 0`, sat = 100%. Stejný vzorec jako v `_shared/basket-context.ts` → jeden zdroj pravdy, copy-paste helper.

**G4 — _čeká na doplnění_**

---

### Scope (beze změny od minulé verze)

**MarketsHub** dostane subtab `🏭 Správa goods` → `GoodsProductionManager`.

Sekce:
1. **Crisis Header** — top 3 deficitní baskety hráče (worst sat first), CTA `[Řešit]`.
2. **Basket Matrix** — 12 košů × `Demand | Local | Auto | Recipe | Building | Import | Unmet | Sat% | Cities | Akce`.
3. **Basket Detail Drawer** — affected cities + cause diagnosis.
4. **City Action Panel** v Draweru:
   - A) Doporučené budovy (aktivní, CTA `[Postavit v {city}]` → CityBuildingsPanel s route state).
   - B) Candidate nodes (read-only, `[Set order]` disabled s tooltipem "coming next").
   - C) Trade/import vysvětlení (access + surplus z dosažitelných měst).
5. **Production Plan placeholder** + tlačítko `[Přepočítat ekonomiku]`.

### Soubory
- **new** `src/components/economy/GoodsProductionManager.tsx`
- **new** `src/components/economy/goods-production/CrisisHeader.tsx`
- **new** `src/components/economy/goods-production/BasketMatrix.tsx`
- **new** `src/components/economy/goods-production/BasketDetailDrawer.tsx`
- **new** `src/components/economy/goods-production/CityActionPanel.tsx`
- **edit** `src/components/economy/MarketsHub.tsx` (přidat subtab)
- **edit** `src/lib/goodsCatalog.ts` (helpers + sdílený weighted-sat)

### Acceptance
1. Subtab `🏭 Správa goods` existuje v `Ekonomika → Trhy`.
2. Crisis Header ukáže 3 worst baskety hráče.
3. Drawer ukáže affected cities + příčiny + budovy + nody + trade access.
4. `[Postavit v {city}]` odnaviguje na CityBuildingsPanel s předvybraným templatem.
5. Po stavbě + `refresh-economy` Matrix ukáže ↑ building_bonus a ↓ unmet.
6. **G1**: pád `basket_trade_flows` query nerozbije tab.
7. **G2**: queries filtrují na current turn s fallbackem + badge.
8. **G3**: sat % v Headeru i Matrix počítá demand-weighted, identicky s `basket-context.ts`.
9. Žádný frontend write do `city_market_baskets` ani `node_production_orders`.
10. Build prochází.

---

### Fáze 1B (NEimplementovat v tomto ticketu)

`node_production_orders` + edge function `set-node-production-order` + přepis recipe fáze v `compute-trade-flows` na **production budget alokaci** (ne sort). Spouští se až bude budget v solveru — bez něj jsou orders no-op.

DB má **CHECK na 12 kanonických basket keys** a RLS s **WITH CHECK (false)** pro všechny mutace (jediný writer = edge function s service role). Plně popsáno v předchozí verzi plánu.

---

**Čekám na dokončení G3 detailu (případně) a znění G4 před spuštěním implementace.**