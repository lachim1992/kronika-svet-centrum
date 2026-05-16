## Cíl

Odstranit logický rozpor v `NodeFlowBreakdown.tsx`, kde `Realizovaná produkce` převyšuje dosud deklarovaný `Výrobní potenciál`, ale UI ukazuje `100 % využití`.

Důvod:
- `sum(province_nodes.production_output)` = surový infrastrukturní/node-level output
- `realm_resources.goods_production_value` = realizovaný tržní objem / HDP z Goods v4.3
- Nejsou to srovnatelné veličiny a nesmí se z nich počítat utilization.

Pouze frontend změna v: `src/components/economy/NodeFlowBreakdown.tsx`

---

## 1. Přejmenovat sekundární kartu

`🏗️ Výrobní potenciál (infrastruktura)` → `🏗️ Infrastrukturní vstup (node raw output)`

Tooltip: surový fyzický výkon uzlů / node-level output. Není to horní strop ekonomiky a není přímo srovnatelný s realizovanou produkcí z Goods v4.3 (jiná vrstva, potenciálně jiná jednotka).

Štítky:
- `potenciál` → `node prod`
- `hrubý wealth` ponechat
- `kapacita` ponechat

---

## 2. Odstranit "využití potenciálu" z primární karty

Odstranit třetí KPI: `utilPct`, ikonu `Gauge`, label `využití potenciálu`, výpočet `Math.min(1, goodsProd / infraTotals.prod)`.

Místo toho KPI **Fiskální záchyt**:

```ts
const fiscalCapture = goodsProd > 0 ? goodsWealth / goodsProd : 0;
```

(`goodsWealth` = `realm.goods_wealth_fiscal`, již načítáno.)

Zobrazit jako procento. **Nepoužívat `commercial_capture`** — to je tržní/exportní capture, ne treasury capture.

### Správné labely tří KPI v primární kartě

Tři KPI musí jasně rozlišovat základnu a výnos:

- `goods_production_value` → label **„realizovaný tržní objem / HDP"** (to je fiskální *báze*)
- `goods_wealth_fiscal` → label **„fiskální výnos"** nebo **„příjem koruny"** (NE „fiskální báze"; báze je HDP, ne výnos)
- `fiscalCapture` → label **„fiskální záchyt %"**

> Pozor na label: `goods_wealth_fiscal` není fiskální báze, ale fiskální výnos / treasury capture z goods ekonomiky. Fiskální báze je `goods_production_value`.

---

## 3. Upravit bottlenecks

Zachovat:
- **`Údržba > fiskál`** — porovnávat **pouze** wealth/fiscal upkeep proti `goods_wealth_fiscal`. Tedy `infraTotals.upkeepW > goodsWealth`. **Neporovnávat** `upkeepS` (production/supplies upkeep) proti `goodsWealth` — to by bylo jednotkově špatně.
- `Nedostatečná kapacita`
- `Chybí data trhu`

Odstranit:
- `Nízká poptávka / fill` (odvozeno z poměru goods / infra)
- `Mírná netěženost`

Přidat:
- `Slabý fiskální záchyt`, pokud `fiscalCapture < 0.08` (rozumný práh; 0.30 by skoro pořád falešně hlásilo problém).

---

## 4. Dev-only semantic warning

V Dev Mode bloku Diagnostic throughput, pokud `goodsProd > infraTotals.prod * 1.05`, zobrazit červené:

> ⚠ Semantic warning: realizovaná produkce (X) > infrastrukturní vstup (Y). To není nutně chyba ekonomiky — Goods v4.3 může zahrnovat vrstvy mimo node-level output (city auto-production, baskets, market access, tržní transformace). Metriky nejsou přímo srovnatelné. Nepoužívat jejich poměr jako utilization.

**Nepoužívat název "Invariant violation"** — po přejmenování už nejde o porušení invariantů.

---

## 5. TODO komentář u Diagnostic bloku

```ts
// TODO: Pro skutečnou metriku "využití potenciálu" je potřeba spočítat
// goods_potential_value v Goods v4.3 solveru ve stejné jednotce jako
// goods_production_value. Musí zahrnovat city auto-production, baskets,
// logistiku, market access a capacity constraints. Do té doby utilization
// nezobrazovat v player UI.
```

---

## 6. Cleanup

Odstranit nepoužívané: `Gauge` import (pokud nikde jinde nezůstane), `utilPct`, `utilization`, bottleneck výpočty založené na `goodsProd / infraTotals.prod`.

---

## Co se nemění

DB, edge functions, backend, `TreasuryPanel`, `process-turn`, `command-dispatch`. Per-node rozpad zůstává stejný, jen je jasně zarámován jako infrastrukturní/node-level vrstva. `sum(province_nodes.production_output)` z diagnostiky **nemizí** — jen přestane lhát, že je to „potenciál".

---

## Acceptance

- Sekundární karta se jmenuje `Infrastrukturní vstup (node raw output)`, ne `Výrobní potenciál`.
- UI nikde neukazuje `100 % využití potenciálu`, pokud je realizovaná produkce > node raw output.
- Primární karta má tři konzistentní KPI z Goods/fiskální vrstvy:
  - realizovaný tržní objem / HDP = `goods_production_value`
  - fiskální výnos = `goods_wealth_fiscal` (NE „fiskální báze")
  - fiskální záchyt = `goods_wealth_fiscal / goods_production_value`
- `goods_production_value` se nikde nepoměřuje se `sum(province_nodes.production_output)` jako utilization.
- Fiskální záchyt používá `goods_wealth_fiscal / goods_production_value`, **ne** `commercial_capture`.
- Bottleneck `Údržba > fiskál` porovnává pouze wealth upkeep (`upkeepW`) proti `goods_wealth_fiscal`, ne production upkeep.
- Dev Mode ukazuje *semantic warning* (ne invariant violation), pokud goods output převyšuje node raw output.
- Build prochází bez unused importů.
