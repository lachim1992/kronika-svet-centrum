## Inventura ekonomiky — finální plán

Po odpovědích: **vše naráz · Overview smazat · Produkce jako nový tab · TaxPolicy zůstává sub-tab v Pokladnici**.

---

## Cílová struktura `EconomyTab`

```text
Macro summary row (beze změny):  💰 Bohatství   🌾 Zásoby   🏛️ Kapacita

🌾 Produkce        🏪 Trhy & Obchod        🏛️ Pokladnice        🏙️ Sídla
```

4 taby. Dev panely zůstávají gated pod hlavním tabem.

---

### 1. 🌾 Produkce (nový tab)

Co říše VYRÁBÍ a kdo to dělá. Two-layer model nahoře, vše ostatní pod ním.

- **ProductionOverviewCard (nový)** — sjednotí dva primární KPI:
  - *Realizovaný tržní objem (HDP)* = `goods_production_value`
  - *Infrastrukturní vstup (node raw)* = Σ `province_nodes.production_output` — sekundární, šedý
  - Bez fake „využití potenciálu". Pokud `goods > infra * 1.05`, v Dev Mode červené upozornění (z minulého sprintu).
- **PopulationPanel** (přesun z Overview) — pracovní síla je input produkce.
- **Workforce block** — vyříznout z `EconomyTab.tsx` (řádky ~217-243) do samostatné `WorkforcePanel.tsx` a posunout sem.
- **DemandFulfillmentPanel** — *přesun z Trhů* sem? Ne, zůstává v Trzích (poptávková strana). Tady jen odkaz „viz Trhy → Poptávka".

### 2. 🏪 Trhy & Obchod (sjednocený, dnešní 3 taby v 1)

Vnitřně sub-taby (Tabs ve vnořeném komponentu), aby nebyla zahlcená scrollovací zeď:

```text
[Výkon] [Poptávka & Fill] [Tržní podíl] [Supply Chain] [Trade Systems]
```

- **Výkon**: MarketPerformancePanel
- **Poptávka & Fill**: DemandFulfillmentPanel + NeutralNodeContributionPanel
- **Tržní podíl**: MarketSharePanel + TradePanel
- **Supply Chain**: SupplyChainPanel (přesun z vlastního tabu)
- **Trade Systems**: TradeSystemsSubTab (přesun z vlastního tabu) + StrategicResourcesDetail (přesun z Overview — suroviny patří k obchodu)

### 3. 🏛️ Pokladnice (sjednocený fiskál — jediný totál v aplikaci)

Vnitřně sub-taby:

```text
[Přehled] [Daňová politika] [Detail příjmů] [Výdaje]
```

- **Přehled**: TreasuryPanel jako master view — HDP per pilíř → laffer → govMod → realizovaný příjem. Pod tím **bilance**: příjem − výdaje = čistá změna pokladny. Jedno číslo totálu pro celou aplikaci.
- **Daňová politika**: TaxPolicySubTab (slidery, beze změny logiky; přidá se nahoře odkaz „efekt vidíš v Přehledu").
- **Detail příjmů**: FiscalSubTab pillar breakdown — explicitně označený jako *informativní rozklad TÉHOŽ příjmu*, ne druhá agregace. Karta v hlavičce: „Tyto čtyři pilíře sčítají na +X.X — totožné s Přehledem."
- **Výdaje**: MilitaryUpkeepPanel (přesun z Overview) + expenses sekce z FiscalSubTab (army upkeep, tolls, sport funding).

### 4. 🏙️ Sídla

Beze změny.

### Mimo taby (zůstává v EconomyTab kořeni)

- Header s tlačítkem Přepočítat.
- Alerts blok.
- Macro summary row (3 KPI nahoře).
- Dev panely (gated, beze změny).
- Admin debug, v4.2 badge.

### Co se smaže / vyhodí z Přehledu

- Workforce block → přesun do Produkce (jako WorkforcePanel).
- Grain Reserve karta → smazat (info je v top KPI „Zásoby" + alerty).
- Wealth Reserve karta → smazat (info je v top KPI „Bohatství").
- PrestigeBreakdown → **přesun na HomeTab** (státní signál, ne ekonomika).
- StrategicResourcesDetail → přesun do Trhy/Trade Systems.
- FaithPanel → **přesun na HomeTab** (státní signál).
- PopulationPanel → přesun do Produkce.
- MilitaryUpkeepPanel → přesun do Pokladnice/Výdaje.
- Celý `<TabsContent value="overview">` smazat.
- TabsTrigger „📊 Přehled" smazat.

---

## Implementační kroky (pořadí)

1. **Extrakce panelů** (čisté řezy, žádná logika nemění chování):
   - Vyříznout Workforce JSX z `EconomyTab.tsx` → nový `src/components/economy/WorkforcePanel.tsx`.
   - Vytvořit `src/components/economy/ProductionOverviewCard.tsx` (two-layer KPI + bottlenecks shortlist).
2. **HomeTab přesun**: přidat `PrestigeBreakdown` + `FaithPanel` do `HomeTab.tsx` (sekce „Stát říše").
3. **Sjednocené Trhy**: nový wrapper `src/components/economy/MarketsHub.tsx` s vnitřním `<Tabs>` (Výkon/Poptávka/Tržní podíl/Supply/Systémy). Smaže potřebu 3 root-tabů.
4. **Sjednocená Pokladnice**: nový wrapper `src/components/economy/TreasuryHub.tsx` s vnitřním `<Tabs>` (Přehled/Daně/Detail/Výdaje). Přesune TaxPolicy + Fiscal + MilitaryUpkeep dovnitř. **TreasuryPanel** doplnit o bilanci (příjem − výdaje) a `expenses` zdroj z `getFiscalIncome(realm)`.
5. **Sjednotit fiskální totál**: v `FiscalSubTab` přidat hlavičkový infobox „Totál +X.X je totožný s Přehledem Pokladnice" + ujistit, že totál `fi.totalIncome` přesně rovná součtu TreasuryPanel `pillars.realizedRevenue + popTax` (audit, případně sladit).
6. **Refactor `EconomyTab.tsx`**: smazat Overview tab + 2 root taby (Supply, Trade systems, Tax Policy, Fiscal jako samostatné — všechny jdou pryč). Zůstanou 4 taby: Produkce / Trhy / Pokladnice / Sídla.
7. **Cleanup importů**: vyhodit nepoužité importy (`Gauge`, `Users` pokud zmigrovány, atd.). Build check.
8. **Memory update**: zapsat do `mem://ui/economy-tab-structure` finální 4-tab strukturu jako kanonický referenční bod.

## Acceptance

- `EconomyTab.tsx` má **přesně 4** root taby (Produkce, Trhy & Obchod, Pokladnice, Sídla).
- V celé aplikaci je **jeden** fiskální totál — v Pokladnici/Přehledu. FiscalSubTab přiznává, že jeho součet je tentýž.
- Žádný panel neukazuje 100 % využití potenciálu.
- TaxPolicy slidery dávají live preview; uložení dispatchne SET_TAX_RATES; efekt vidí v Pokladnici/Přehledu příští kolo.
- MilitaryUpkeep je vedle pilířů příjmu na fiskálním tabu.
- HomeTab nově obsahuje Prestige + Faith (státní signály).
- Build prochází, žádné dead importy ani nepoužité komponenty.

## Mimo scope

- Engine (`process-turn`, `compute-trade-flows`, `refresh-economy`) se nemění.
- DB schéma se nemění, žádné migrace.
- Žádné nové fiskální mechaniky ani sazby.
- Dev panely se nestěhují (jen Overview cleanup).
- GapAdvisor / CapacityPanel review — Phase 2.

## Technické poznámky

- Vnořené `<Tabs>` uvnitř Trhů a Pokladnice použijí stejný styling jako root `TabsList` (h-10, rounded-xl, font-display), ale o stupeň menší (h-9, text-[11px]) pro vizuální hierarchii.
- ScrollArea + ScrollBar wrapper zůstává jen na root úrovni; sub-taby budou compact.
- Žádné nové edge funkce, žádné nové DB volání. Všechny komponenty čtou existující props (`realm`, `cities`, `sessionId`, `currentPlayerName`).
