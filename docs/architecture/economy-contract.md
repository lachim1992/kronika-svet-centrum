# Chronicle Economy Contract (Economy Integrity Pass)

Kanonický slovník veličin a vlastnictví dat. Kód i UI se musí držet těchto pojmů.

## Invarianty

**INVARIANT 1 — `process-turn` je jediným vlastníkem turn-resolution fiskálu:**
daňové základy, daňový příjem, periodické výdaje, `wealth_*` komponenty,
fiskální breakdown a legitimita z ekonomického vyhodnocení.
`command-dispatch` smí měnit `gold_reserve` pouze kvůli explicitní jednorázové
transakci hráče (stavba, silnice, nákup, transfer). Cena stavby ani silnice se
do `process-turn` nepřesouvá.

**INVARIANT 2 — `refresh-economy` = PURE DERIVED RECOMPUTE.**
Smí: routes, produkce, poptávka, markets, trade flows, derived agregáty.
Nesmí: vybírat daně, platit upkeep, měnit `gold_reserve` nebo legitimitu,
aplikovat transfery, spouštět transakci hráče, a nesmí zapisovat do žádné
`*_history`, `*_snapshot` ani event/action log tabulky (včetně
`node_economy_history`). Historie vzniká jen při úspěšném `commit-turn`,
nejvýše jednou pro (session, turn).

**INVARIANT 3 — snapshot jen po úspěchu celé pipeline:**
derived physical state → fiscal resolution → final aggregation → validace →
snapshot → DONE. Při selhání se tah neoznačí jako ekonomicky dokončený,
snapshot se nevytvoří a stav je `stale`/`error`.

## Slovník

```text
FYZICKÁ EKONOMIKA   goods_production_value, goods_supply_volume,
                    trade_turnover, commercial_retention
GDP                 total_gdp = hodnota finální produkce za tah
                    total_gdp ≠ trade turnover, ≠ tax revenue, ≠ treasury,
                    ≠ domácí produkce + export jako fiskální veličina,
                    ≠ součet node outputu bez eliminace meziproduktů
                    total_gdp NESMÍ dvojitě započítat intermediate goods
                    (obilí → mouka → chléb se počítá jednou)
                    ROZSAH PASSU: současný datový model neodděluje intermediate
                    a final goods, proto je total_gdp dočasný PROXY
                    (production_output + export gross_value) s TODO v
                    aggregate-realm-totals. Value-added reforma = samostatný pass.
                    Konkurenční definice GDP se odstraňují.
DAŇOVÉ ZÁKLADY      domestic_tax_base, market_tax_base, transit_tax_base,
                    extraction_tax_base, poll_tax_base (pět samostatných základů,
                    každý má jeden writer a jeden vzorec v process-turn)
FISKÁLNÍ PŘÍJEM     fiscal_revenue = wealth_pop_tax + wealth_domestic_market
                                     + goods_wealth_fiscal
VÝDAJE              recurring_expenses = army_upkeep + sport_funding + ...
TURN RESOLUTION     turn_fiscal_delta = fiscal_revenue − recurring_expenses
                                        ± turn transfers
                    gold_after_turn = gold_before_turn + turn_fiscal_delta
TRANSAKCE HRÁČE     transaction_delta = road / building / purchase / ...
                    gold_reserve += transaction_delta   (command-dispatch)
```

Žádný univerzální `tax_base`. Žádný obecný `net_treasury_change`.
`total_wealth` se nepoužívá jako ekonomický koncept — v DB zůstává pouze jako
alias `fiscal_revenue` a v UI se popisuje výhradně jako fiskální příjem.

## Ownership dat

| Vrstva | Writer | Co zapisuje |
| --- | --- | --- |
| Physical / derived state | `compute-*` funkce | province_nodes, trade_flows, basket_trade_flows, city_market_baskets, node_inventory |
| Turn fiscal state | `process-turn` | wealth_*, daňové základy, výdaje, gold_reserve (turn_fiscal_delta), legitimacy |
| Jednorázové transakce | `command-dispatch` | gold_reserve, production_reserve (CAPEX) |
| Final aggregation | `aggregate-realm-totals` | total_gdp, total_wealth (alias fiscal_revenue), total_production, total_capacity, total_importance, strategic tiers — read + sum only |
| Immutable history | `commit-turn` snapshot phase / `world-tick` | node_economy_history a ostatní `*_history` |

## Pipeline

```text
WORLD STATE → ROUTES/HEX → TRADE SYSTEMS → PRODUCTION → PHYSICAL TRADE
  → PROCESS-TURN (sole fiscal writer) → AGGREGATE-REALM-TOTALS
  → VALIDATION → SNAPSHOT → DONE

refresh-economy: ROUTES → PRODUCTION → MARKETS → TRADE → AGGREGATE
                 (read-only vůči fiskálu a historii)
```

## Acceptance kritéria

```text
S0 --refresh--> S1 --refresh--> S2      S1 === S2 (derived current-turn state)
GUARD TEST:  gold_reserve, legitimacy, wealth_pop_tax, wealth_domestic_market,
             goods_wealth_fiscal se refreshem nemění
HISTORY GUARD: count(history) = N → refresh ×2 → count(history) = N
COMMIT HISTORY: commit-turn() → count(history for session+turn) = 1
INCOME SUM: fiscal_revenue === wealth_pop_tax + wealth_domestic_market
                             + goods_wealth_fiscal   (jen income komponenty)
```

## Poznámka k „snapshot" tabulkám

`trade_system_node_snapshot` není historie — je to derived current-turn projekce,
kterou refresh přepisuje celou (delete + insert) a je proto idempotentní.
Historií se rozumí append-only řady jako `node_economy_history`; ty vznikají jen
při `commit-turn` (resp. při world-tick resolution v časovém režimu).
