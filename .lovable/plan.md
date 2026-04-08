
# Přestavba záložky Ekonomika — 5 sub-záložek

## Současný stav
Záložka Ekonomika má 4 sub-taby: Přehled (mix všeho), Goods (GoodsDemandSubTab + TradePanel + SupplyChain), Fiskál, Sídla. Problém: poptávka, mezery a supply chain jsou rozházené, žádná gap analýza, žádné doporučení.

## Nová struktura (5 sub-záložek)

### 1. 📊 Přehled (zachovat, zjednodušit)
- Macro summary row (produkce, wealth, zásoby, kapacita)
- Alerts (hladomor, izolace, mobilizace)
- Workforce panel
- Grain reserve + Treasury (existující)
- Tok dle rolí (node flow breakdown — zkrácený)

### 2. 📦 Poptávka & Nasycení (NOVÉ — přesun + rozšíření)
Hlavní panel říšní poptávky:
- **Pyramida nasycení**: 3 vrstvy (NEED / UPGRADE / PRESTIGE) s celkovým % nasycení
- **Seznam zboží**: každé zboží v demand_baskets — supply vs demand, % satisfaction, které město potřebuje
- **Goods katalog**: existující GoodsDemandSubTab (tabulka goods by tier, recepty) — zachovat jako collapsible sub-sekci
- Data: `demand_baskets`, `city_market_summary`, `goods` tabulky (už se načítají v GoodsDemandSubTab)

### 3. 🔗 Supply Chain (přesun + rozšíření)
Plný supply chain od hex po finální produkt:
- **SupplyChainPanel** (existující) — zásobování, izolované uzly, trasy
- **NodeFlowBreakdown** (existující) — rozpad dle uzlů s trasami
- **Produkční řetězce**: recepty aktivní v říši — co vyrábíš, kde, kolik, bottlenecky (z `production_recipes` + `city_market_summary`)
- **Nevyužité kapacity**: uzly s capability_tags ale bez aktivního receptu

### 4. 🎯 Mezery & Poradce (NOVÉ)
Gap analýza + AI doporučení:
- **Top chybějící zboží**: seřazeno dle urgence (demand - supply), s dopadem na stabilitu
  - Červená: NEED vrstva nesaturovaná → destabilizace
  - Žlutá: UPGRADE chybí → stagnace růstu
  - Modrá: PRESTIGE chybí → ztráta prestiže
- **AI Advisor**: tlačítko "Zeptej se poradce" → volá edge function `economy-advisor` (nová)
  - Vstup: demand_baskets, city_market_summary, production_recipes, province_nodes (capability_tags), cities
  - Výstup: 3-5 konkrétních doporučení ("Postav mlýn v městě X — pokryješ 80% poptávky po mouce")
  - Zobrazí se jako karty s ikonou, popisem a odkazem na město/budovu
- **Obchodní příležitosti**: zboží které exportuješ vs. co importuješ — identifikace obchodních výhod

### 5. 🏛️ Fiskál (existující — beze změny)
FiscalSubTab + Trade ideology — zachovat jak je.

### 6. 🏙️ Sídla (existující — beze změny)
Tabulka měst — zachovat jak je.

## Implementace

### A. Nová edge function: `economy-advisor`
- Načte demand_baskets, city_market_summary, goods, production_recipes, province_nodes, cities pro danou session+player
- Zavolá Lovable AI (gemini-3-flash-preview) se strukturovaným promptem
- Vrátí JSON s doporučeními (tool calling pro structured output)
- Žádná DB migrace potřeba — jen čtení existujících dat

### B. Nový komponent: `DemandFulfillmentPanel.tsx`
- Pyramida nasycení (NEED/UPGRADE/PRESTIGE) z demand_baskets
- Seznam zboží s satisfaction bars
- Integruje existující GoodsDemandSubTab jako sub-sekci

### C. Nový komponent: `GapAdvisorPanel.tsx`
- Gap analýza z demand_baskets + city_market_summary
- AI advisor button + výsledky
- Obchodní příležitosti

### D. Refaktor EconomyTab.tsx
- Rozšířit TabsList na 5 záložek (responsive: scroll na mobilu)
- Přesunout komponenty do správných záložek
- Přehled: zjednodušit (odebrat PrestigeBreakdown, StrategicResources, FormulasReference → ty patří do Supply Chain nebo jinam)

## Soubory

| Soubor | Změna |
|--------|-------|
| `src/pages/game/EconomyTab.tsx` | Refaktor na 5 záložek |
| `src/components/economy/DemandFulfillmentPanel.tsx` | NOVÝ — pyramida + seznam |
| `src/components/economy/GapAdvisorPanel.tsx` | NOVÝ — mezery + AI |
| `supabase/functions/economy-advisor/index.ts` | NOVÝ — AI doporučení |
| `src/components/economy/GoodsDemandSubTab.tsx` | Zachovat, použít jako sub-komponentu |

## Pořadí
1. DemandFulfillmentPanel
2. Edge function economy-advisor
3. GapAdvisorPanel
4. Refaktor EconomyTab (5 záložek)
5. Build check
