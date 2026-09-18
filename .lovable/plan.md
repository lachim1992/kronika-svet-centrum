# Economy Integrity Pass (bez nových feature)

Cíl: jedna konzistentní ekonomika. Žádný nový subsystém, žádné ladění čísel. Po tomto průchodu musí platit: dvakrát přepočítat ekonomiku = stejný výsledek, a každé číslo v UI má jediný kanonický zdroj.

## Ověřený stav (přečteno v kódu)

- `compute-basket-trade-flows/index.ts:310–322` čte `goods_wealth_fiscal` a zapisuje `prev + amount` → opakovaný přepočet kumuluje.
- `compute-economy-flow/index.ts:908–961` agreguje `total_wealth` z fiskálních pilířů; v `commit-turn/index.ts:757` běží **před** `process-turn`, který pilíře přepisuje (`process-turn/index.ts:1544`) a `total_wealth` už znovu neagreguje.
- `compute-trade-flows/index.ts:378–380`: bez `node_production_orders` dostane každá recepta share = 1, bez capacity capu.
- `compute-trade-flows/index.ts:486–490`: `node_inventory` se maže jen pro nody z nového výpočtu → ghost inventory u nodů, které přestaly vyrábět.
- `compute-trade-flows/index.ts:1480`: `wealth_domestic_component` / `wealth_market_share` se už nezapisují, ale `src/lib/economyFlow.ts:431–439, 514–515` a navazující panely je stále čtou.
- `trade_ideology` se zapisuje (`command-dispatch/index.ts:3693`) a zobrazuje (`FiscalSubTab.tsx:24`), ale žádný solver ji nečte.

## Krok 1 — P0: jediný vlastník fiskálního ledgeru

- `compute-basket-trade-flows`: odstranit blok 9 (fold do `goods_wealth_fiscal`). Místo zápisu do realmu uložit `fiscal_capture` per hráč do výstupu funkce a do `basket_trade_flows` (řádkový sloupec `fiscal_capture`, pokud chybí → migrace), odkud si to `process-turn` přečte jako bázi.
- `process-turn` zůstává jediným writerem `wealth_*`, `goods_wealth_fiscal`, `wealth_breakdown`.
- Doplnit do obou funkcí hlavičkový kontrakt „writer/reader“ ať to nikdo nevrátí.

## Krok 2 — P0: pořadí pipeline a finální agregace

- Vyčlenit finální agregaci (`total_wealth`, `total_capacity`, `total_gdp`) z `compute-economy-flow` do samostatného kroku „aggregate-realm-totals“ (nová funkce nebo jasně oddělená fáze volaná s `phase: "aggregate"`).
- `commit-turn`: fyzická ekonomika → markets → trade → `process-turn` (fiskál) → agregace → snapshot.
- `refresh-economy`: stejný řetěz, ale bez `process-turn` — agregace čte existující pilíře, nikdy je nemění.

## Krok 3 — P0: idempotentní přepočet

- Všechny kroky přepočtu přepsat na „delete/replace pro danou session+turn“, žádné `+=`.
- `node_inventory`: mazat podle všech nodů session (nebo podle `session_id`), ne jen podle nodů s novou produkcí.
- Zámek přesunout z in-memory do DB (`economy_recompute_locks` s `session_id` PK a TTL), aby dvě instance nepočítaly totéž.
- Každý krok loguje `{step, rows_written, duration}`; při chybě kroku vrátit stav „stale“ do UI, ne částečný úspěch.
- Test: dva po sobě jdoucí `refresh-economy` na stejném tahu → diff relevantních polí `realm_resources` je prázdný.

## Krok 4 — P1: jedna definice HDP

Kanonické pojmy, každý s jedním zdrojem:

```text
total_gdp        = hodnota finální domácí produkce realizované v kole
trade_turnover   = objem obchodu (domácí + import/export)
tax_base         = zdanitelná část GDP a obratu
fiscal_revenue   = skutečný příjem koruny (wealth_breakdown.total_income)
node_output      = fyzický výstup nodů (nezdaňuje se přímo)
```

- `total_wealth` přejmenovat v UI popiscích jednoznačně na „fiskální příjem“, ať HUD a Economy neslibují HDP.
- Historické grafy „HDP“ přepnout na `total_gdp` ze snapshotů; proxy vzorec (`local_supply × quality_weight`) přeznačit na „objem nabídky“.

## Krok 5 — P1: panely čtou jen živá data

- `MarketPerformancePanel` + `src/lib/economyFlow.ts`: odstranit `wealth_domestic_component` a `wealth_market_share`; panel postavit na `commercial_retention`, `goods_production_value`, `goods_supply_volume` a basket market share.
- `FiscalSubTab`: přepsat vysvětlení na dnešní model (`gdp_domestic × laffer(r) × r × governance`), zrušit rozpad `goodsFiscal` na čtyři nuly (tržní/tranzitní/extrakční/export) a nahradit jej skutečným rozpadem z `wealth_breakdown`.
- Tax UI: opravit tooltip optima na `r_max / √3 ≈ 57.7 %` a preview označit jako odhad bez governance modifikátorů.
- Treasury UI: u přetížení nechat jen legitimitu (to engine dělá); nepokoje, migraci a šedou ekonomiku označit jako „plánované“ nebo odstranit.

## Krok 6 — P1: capacity i bez production order

- `compute-trade-flows:378`: `!order` = implicitní `auto` → stejný production budget a stejný cap 1–6 slotů jako u explicitního auto orderu.
- Doplnit test, že node s 8 recepty bez orderu nevyrobí víc než se svým budgetem.

## Následně (mimo tento pass)

- P2: production orders do hráčského UI (backend hotový).
- P2: `trade_ideology` zapojit do solveru, nebo dočasně skrýt z UI.
- P2: OPEX silnic (maintenance, degradace, repair budget).
- P3: greedy basket routing → min-cost-flow.

Balancování čísel až po dokončení kroků 1–6.

## Verifikace

`tsgo --noEmit`, `bunx vitest run`, build, nové testy: idempotence přepočtu, ghost inventory, node capacity bez orderu, konzistence `total_wealth = Σ wealth_breakdown` po commit-turn.
