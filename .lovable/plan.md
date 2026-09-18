# Economy Integrity Pass (bez nových feature)

Cíl: jedna konzistentní ekonomika. Žádný nový subsystém, žádné ladění čísel.

Dva invarianty, které platí nad všemi kroky:

**INVARIANT 1** — `process-turn` je jediným vlastníkem **turn-resolution** fiskálu: daňové základy, daňový příjem, periodické výdaje, `wealth_*` komponenty, fiskální breakdown a legitimita vznikající z ekonomického vyhodnocení. `command-dispatch` smí měnit `gold_reserve` **pouze** kvůli explicitní jednorázové transakci hráče (stavba, silnice, nákup, transfer) — cena stavby ani silnice se do `process-turn` nepřesouvá.

**INVARIANT 2** — `refresh-economy` = PURE DERIVED RECOMPUTE. Smí přepočítat routes, produkci, poptávku, markets, trade flows a derived agregáty. Nesmí vybírat daně, platit upkeep, měnit `gold_reserve` ani legitimitu, aplikovat transfery, spouštět transakci hráče ani appendovat historii.

```text
                     GOLD RESERVE
              ┌───────────┴───────────┐
     explicit player action      turn resolution
       command-dispatch           process-turn
       −road/building/purchase   +taxes −upkeep −recurring
              └───────────┬───────────┘
                     realm state
refresh-economy ───────── READ ONLY
```


## Ověřený stav (přečteno v kódu)

- `compute-basket-trade-flows/index.ts:310–322` čte `goods_wealth_fiscal` a zapisuje `prev + amount` → opakovaný přepočet kumuluje.
- `compute-economy-flow/index.ts:908–961` agreguje `total_wealth` z fiskálních pilířů; v `commit-turn/index.ts:757` běží **před** `process-turn`, který pilíře přepisuje (`process-turn/index.ts:1544`) a `total_wealth` už znovu neagreguje.
- `compute-trade-flows/index.ts:378–380`: bez `node_production_orders` dostane každá recepta share = 1, bez capacity capu.
- `compute-trade-flows/index.ts:486–490`: `node_inventory` se maže jen pro nody z nového výpočtu → ghost inventory u nodů, které přestaly vyrábět.
- `compute-trade-flows/index.ts:1480`: `wealth_domestic_component` / `wealth_market_share` se už nezapisují, ale `src/lib/economyFlow.ts:431–439, 514–515` a navazující panely je stále čtou.
- `trade_ideology` se zapisuje (`command-dispatch/index.ts:3693`) a zobrazuje (`FiscalSubTab.tsx:24`), ale žádný solver ji nečte.

## Krok 0 — kanonický slovník veličin

Zapsat do `docs/architecture/economy-contract.md` a dodržet v kódu i UI:

```text
FYZICKÁ EKONOMIKA   goods_production_value, goods_supply_volume,
                    trade_turnover, commercial_retention
GDP                 total_gdp = hodnota finální produkce za tah
                    total_gdp ≠ trade turnover, ≠ tax revenue, ≠ treasury,
                    ≠ domácí produkce + export, ≠ součet node outputu
                    total_gdp NESMÍ dvojitě započítat intermediate goods
                    (obilí → mouka → chléb se počítá jednou: final output
                     nebo value added)
DAŇOVÉ ZÁKLADY      domestic_tax_base, market_tax_base, transit_tax_base,
                    extraction_tax_base, poll_tax_base   (pět samostatných základů)
FISKÁLNÍ PŘÍJEM     fiscal_revenue = wealth_pop_tax + wealth_domestic_market
                                     + goods_wealth_fiscal
VÝDAJE              recurring_expenses = army_upkeep + sport_funding + ...
TURN RESOLUTION     turn_fiscal_delta = fiscal_revenue − recurring_expenses
                                        ± turn transfers
                    gold_after_turn = gold_before_turn + turn_fiscal_delta
TRANSAKCE HRÁČE     transaction_delta = road / building / purchase / ...
                    gold_reserve += transaction_delta   (command-dispatch)
```

Žádný univerzální `tax_base`. Žádný obecný `net_treasury_change` — turnový fiskální delta a účetnictví hráčových akcí jsou oddělené koncepty. `total_wealth` se přestává používat jako ekonomický koncept; v DB zůstává jen jako dočasný alias `fiscal_revenue`, dokud se nepřepíšou čtenáři, a v UI se popisuje výhradně jako fiskální příjem.


## Krok 1 — P0: jediný vlastník fiskálu

- Nejprve **zjistit**, zda lze `fiscal_capture` deterministicky dopočítat z existujících řádků `basket_trade_flows` (quantity, value, tarif, access). Pokud ano, žádná migrace — `process-turn` si ho spočítá při čtení flow řádků. Migraci přidávat jen pokud se ukáže, že vstup pro dopočet v řádcích chybí.
- `compute-basket-trade-flows`: odstranit blok 9 (fold do `goods_wealth_fiscal`) a vůbec nezapisovat do `realm_resources` fiskální pole. Vrací pouze flows.
- `process-turn` zůstává jediným writerem `wealth_*`, `goods_wealth_fiscal`, `wealth_breakdown`, daňových základů, periodických výdajů a ekonomické legitimity; `gold_reserve` mění jen o `turn_fiscal_delta`. Jednorázové transakce hráče (stavba, silnice, nákup) zůstávají v `command-dispatch` — nepřesouvat je.
- Do hlaviček obou funkcí přidat writer/reader kontrakt.

## Krok 2 — P0: pořadí pipeline

- Vyčlenit finální agregaci (`total_gdp`, `fiscal_revenue`, kapacita, produkce) z `compute-economy-flow` do samostatné fáze „aggregate-realm-totals“, která **nic fiskálního nepočítá**, jen sčítá.
- `commit-turn`: world state → routes/hex → trade systems → produkce/poptávka → basket flows → `process-turn` (daňové základy × sazby × Laffer × governance → příjem, výdaje, treasury) → agregace → snapshot.
- `refresh-economy`: routes → produkce → markets → trade → agregace derived metrik. Bez `process-turn`, bez daní, příjmů, výdajů, treasury a legitimity. Fiskální pilíře pouze čte.
- UI: ve fiskálních panelech a treasury označit hodnoty jako „z posledního vyhodnocení tahu“, aby refresh nepředstíral přepočet pokladny.

## Krok 3 — P0: idempotence jako acceptance criterion

- Replace/delete platí **jen pro derived current-turn state** (node_inventory, city_market_baskets, trade flows, basket flows, derived realm agregáty). Historické tabulky a snapshoty (`*_snapshots`, `*_history`, `world_action_log`, event log) se nikdy nemažou ani znovu neappendují při refreshi.
- Nikde v refresh cestě žádné `+=` nad perzistentním polem.
- `node_inventory`: mazat podle celé session (všech relevantních nodů), ne jen podle nodů s novou produkcí.
- Zámek z in-memory Setu do DB (`economy_recompute_locks`, PK `session_id`, TTL).
- Každý krok loguje `{step, rows_written, duration}`; při chybě kroku hlásit UI „stale“, ne částečný úspěch.

Acceptance testy:

```text
S0 --refresh--> S1 --refresh--> S2      S1 === S2 pro všechny derived current-turn hodnoty
S0 --commit--> A                        ===  S0 --commit--> refresh --> refresh
                                        (stejné treasury, daně, legitimita)

GUARD TEST: before = { gold_reserve, legitimacy, wealth_pop_tax,
                       wealth_domestic_market, goods_wealth_fiscal }
            refresh-economy()
            after === before
            (agregovaný alias fiscal_revenue se smí přepočítat na tutéž
             hodnotu, jeho fiskální pilíře se měnit nesmí)
```


## Krok 4 — P1: přesné metriky

- Pět oddělených daňových základů podle Kroku 0; každý má jeden writer a jeden vzorec v `process-turn`.
- Test konzistence: `fiscal_revenue === wealth_pop_tax + wealth_domestic_market + goods_wealth_fiscal` (jen income komponenty, výdaje se do součtu nepočítají).
- Historické grafy „HDP“ přepnout na `total_gdp` ze snapshotů; proxy vzorec (`local_supply × quality_weight`) přeznačit na „objem nabídky“.

## Krok 5 — P1: panely čtou jen živá data

- `MarketPerformancePanel` + `src/lib/economyFlow.ts`: odstranit `wealth_domestic_component` a `wealth_market_share`; panel postavit na `commercial_retention`, `goods_production_value`, `goods_supply_volume` a basket market share.
- `FiscalSubTab`: přepsat na dnešní model (základ × Laffer × sazba × governance), zrušit rozpad `goodsFiscal` na čtyři nuly a nahradit jej skutečným rozpadem z `wealth_breakdown`.
- Tax UI: opravit tooltip optima na `r_max / √3 ≈ 57.7 %`; preview označit jako odhad bez governance modifikátorů.
- Treasury UI: u přetížení nechat jen legitimitu (to engine dělá); nepokoje, migraci a šedou ekonomiku označit jako plánované nebo odstranit.

## Krok 6 — P1: capacity i bez production order

- `compute-trade-flows:378`: `!order` znamená implicitní `auto` → stejný production budget a cap 1–6 slotů jako u explicitního auto orderu.
- Test: node s 8 recepty bez orderu nepřekročí svůj budget.

## Následně (mimo tento pass)

- P2: production orders do hráčského UI; `trade_ideology` do solveru nebo skrýt z UI; OPEX silnic (maintenance, degradace, repair).
- P3: greedy basket routing → min-cost-flow.

Balancování čísel až po dokončení kroků 0–6.

## Verifikace

`tsgo --noEmit`, `bunx vitest run`, build, nové testy: idempotence refreshe, commit+refresh×2 nemění treasury, ghost inventory, node capacity bez orderu, součet income komponent.
