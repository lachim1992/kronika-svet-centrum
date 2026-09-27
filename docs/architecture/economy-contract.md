# Chronicle Economy Contract

Aktuální kontrakt ekonomiky, 27. 9. 2026. Historické stavy roadmapy nejsou alternativní definice veličin.

## Autority

- `goodsEconomy.ts` je jediný fyzický solver: obsazená kapacita, vstupy → výstupy, spotřeba, doprava, zásoby a hmotnostní bilance. `householdProduction=false`; populace vytváří pracovní sílu a potřeby, nikoli tržní zboží.
- `productMarket.ts` vlastní produktové preference, podkoše, funkční hodnotu, rozmanitost, marže, městské účty a ocenění obchodních služeb. UI čte ledger, nepřepočítává vzorce.
- `demandModel.ts` vlastní třináct košů a provenienci poptávky. Kritické potřeby, provozní vstupy a luxus nejsou zaměnitelné.
- `process-turn` vlastní fiskální uzávěrku, ekonomické následky nedostatků a městský kapitál. Plánované zápisy se aplikují společně s fiskálním guardem přes `apply_goods_fiscal_plan`.
- `command-dispatch` vlastní explicitní jednorázové náklady hráče. Stavba se neúčtuje znovu při uzávěrce.
- `aggregate-realm-totals` pouze agreguje odvozené veličiny; netvoří další příjem ani produkci.

## Fyzická a peněžní bilance

Pro každé město a zboží platí:

```
opening + production + imports
 = household consumption + state consumption + intermediate inputs
 + exports + storage + spoilage + CAPEX
```

Výroba, kapacita, tržby, daně a pokladna jsou rozdílné veličiny. `province_nodes.production_output` je jmenovitá kapacita; skutečná výroba je v Goods ledgeru. `production_reserve` narůstá pouze o fyzické `capex` zůstatky způsobilého stavebního zboží, nejvýše jednou za tah. Kapacita ani populace se přímo na CAPEX nepřevádějí.

```
goods value added = gross output value − intermediate value
city_gdp = goods value added + trade-service value added
realm value_added_gdp = sum(city_gdp)
```

Zboží používá katalogové základní ceny a definované ocenění kvality; provozní marže používají místní/landed ceny. Obchodní služby oceňují skutečně dodané množství katalogovou cenou, následně sazbou služby, infrastrukturou a obsazením. `flow.gross_value` je nominální obchodní metrika a nesmí vstupovat do stálocenového HDP služeb. Sláva a místní scarcity premium samy HDP nezvyšují. Vyšší reálný objem obslouženého obchodu ano.

Export není druhá produkce: `export_gross_value` se vykazuje odděleně a nepřičítá se do HDP. `fiscal_capture` na obchodním toku je pouze telemetrie, nikoli další příjem koruny. `total_wealth` zůstává kompatibilním aliasem fiskálního příjmu.

## Pokladna

```
fiscal_revenue = wealth_pop_tax + wealth_domestic_market + goods_wealth_fiscal
turn_fiscal_delta = treasury_closing − treasury_opening
 = fiscal_revenue + legacy_trade_gross + prestige_bonus
 − army_upkeep − sport_funding − route_upkeep − tolls
 + insolvency_relief + rounding_adjustment
```

`legacy_trade_net` již obsahuje odečtené mýtné. Nesmí se od něj mýtné odečíst podruhé. Rozpis zachovává obě zaokrouhlení a explicitně vykazuje nulovou spodní hranici pokladny jako `insolvency_relief`, nikoli daň. `treasury.ts` kontroluje úplnost rozpisu; klient pouze zobrazuje uložená čísla.

Legacy `trade_routes` nadále představují smluvní abstraktní vypořádání. Neodebírají ani nedodávají kanonické fyzické zboží a nevytvářejí další Goods GDP. Jejich peněžní efekt je explicitně oddělen. Převod těchto smluv na fyzicky kryté objednávky je další samostatná migrace. Prestižní bonus je pro kompatibilitu zachován jako explicitní příjmová položka; nejde o výrobu zboží.

## Uzavření a obnova tahu

`game_sessions.current_turn` je zveřejněný kalendář. Během uzávěrky je `resolving_turn=current_turn+1` interním cílem ekonomických projekcí. Kalendář a příznaky hráčů mění až `finish_turn_resolution`, po potvrzení všech povinných fází a committed Goods ledgeru.

`turn_phase_journal` uchovává potvrzené výsledky. Světová projekce, diplomatické projekce a pohyb/projekty zapisují efekty a potvrzení fáze jednou DB transakcí. Fiskální fáze v jedné transakci zapisuje také stabilitu, ztráty z nedostatků, morálku, sportovní výdaje, městský kapitál a audit; její retry nic neúčtuje podruhé. Obdobně je transakční údržba světových cest.

Po potvrzení fyzické fáze ekonomický retry neopakuje demografii, pohyb, AI ani hotovou výrobu. Pokračuje fiskálem či uložením historie. Selhání uvnitř atomické fáze nezanechá částečné zápisy této fáze. To není jedna dlouhá transakce přes HTTP: již dokončené fáze mohou být viditelné, ale tah zůstává rozehraný a hráčské příkazy i refresh jsou blokované.

**Hranice automatické obnovy:** externí bojové a AI operace před fyzickým checkpointem stále mají vlastní write paths. Při nejasném přerušení v této části je `resumable=false`; automatický replay se odmítne. Deník tedy neznamená plnou automatickou obnovu každého vojenského/AI scénáře. `reconcile-turn` již nesmí označit neúplný historický world tick za dokončený. Takový případ vyžaduje kontrolu konkrétních účinků, nikoli přeskočení fiskálu.

## Přepočet a historie

`refresh-economy` mění pouze odvozené trasy, produkci, poptávku, trhy, obchod a agregáty. Nemění zlato, kapitálové zásoby, populaci, legitimitu ani historii. Jeho zámek se získává pod stejným session lockem jako zahájení tahu; během `resolving_turn` se refresh odmítne.

`derivedChain.ts` je jediná definice pořadí routes → hex flows → trade systems → goods → basket projection → economy flow → aggregation. Event emission je v refreshi vypnutá. `trade_system_node_snapshot` je přepisovaná aktuální projekce, nikoli historický záznam. `committed_result` je zmrazený ekonomický výsledek tahu; retry jeho management report nepřepisuje.

## Práce, potřeby a účty

Práce se přiděluje jedním dvouprůchodovým algoritmem v `goodsEconomy.ts`: nejdřív sektorově, poté omezenou mobilitou. Základ běžné budovy je 100/200/400 míst podle úrovně, startovní provozy mají vlastní posádky. Aktuální `workersPerLaborUnit=40` je herní kalibrace, nikoli empirická konstanta.

Preference používají ceny a spotřebu z minulého committed tahu. Podkoše normalizují průměrnou atraktivitu, takže přidání dvaceti variant automaticky nezvětší potřebu koše dvacetkrát. `functional_value` převádí funkční potřebu na množství. Úplná metadata a jemná kalibrace celého katalogu zůstávají obsahovou prací.

Příjem domácností používá jediný globální `PRODUCT_MARKET.incomeUnitFactor`; nikdy se nenásobí místním CPI. Kupní síla, náklady základního koše, affordability a reálná kupní síla jsou samostatné toky. Faktor je normalizační konvence, kterou musí ověřit dlouhodobé simulace.

Rozmanitost je diagnostická utilita, nemění přežití. Prosperita je převážně analytický index. `city_capital_stock` je historická městská zásoba, nikoli soukromý majetek domácností; akumuluje se pouze v `process-turn`. Soukromé wealth zatím neexistuje.

Přirozený růst a migraci vlastní `commit-turn`. Fiskální fáze smí aplikovat konkrétní ztráty z hladu a vody přes `applyPopulationLoss`; refresh ne. Vždy platí součet populačních tříd = population_total. Test02 po ručních zásazích a historických dírách není čistý balancing benchmark; pro kalibraci slouží kontrolované scénáře EconomyLab.

## Kontroly

- Dva refreshe mají stejné fyzické bilance, nemění finance ani historii.
- Rozpis pokladny odpovídá přesnému skutečnému rozdílu, včetně obchodu, prestiže, mýtného a zaokrouhlení.
- Změna nominální obchodní ceny při stejném množství nemění službové HDP.
- Injektovaná chyba uvnitř world/fiscal transakce nezanechá část jejích účinků.
- Ekonomický retry nepostoupí kalendář před úspěšnou uzávěrkou a neúčtuje již potvrzený fiskál.
