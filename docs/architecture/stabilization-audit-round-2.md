# Chronicle — druhý audit a opravy ekonomických projekcí

Datum: 13. září 2026. Výchozí lokální commit: `2811cd3f5dd8a45bfa0a890e1174c6afb8a842ab` (první sada stabilizace nad `ee0c15cbd1d5e8618ac885f08a8472c0af5e2c01`).

## Výsledek

Druhá revize prošla celý řetězec projekcí od generování tras po výrobu a obchodní systémy, dále spotřebitele poptávky v tahu, poradci a UI. Hlavní zjištění: selhání databáze se opakovaně zaměňovalo za prázdný svět a několik prázdných výstupů vůbec neodstraňovalo předchozí výsledek. Část problémů označovaných jako „nefunkční ekonomika“ navíc vzniká už v dopravní síti.

Opravy jsou ve vlastní větvi `codex/audit-goods-publication` a odděleném pracovním adresáři. Původní pracovní adresář byl během auditu souběžně měněn v mnoha souborech UI a backendu. Tyto cizí rozpracované změny nejsou součástí této sady ani výsledků jejího ověření. Před společným začleněním bude nutná kontrola konfliktů a opakované testy.

## Opravené problémy

| Priorita | Spouštěč a předchozí chování | Nové chování |
| --- | --- | --- |
| P1 | Uzel ztratí recept, roli nebo možnost výroby. `compute-trade-flows` čistil inventář pouze uzlům s kladným novým výstupem a ignoroval `is_active`. | Čistí projekci všech načtených uzlů dané hry, poté uloží nové výstupy. Neaktivní uzel již nespouští recepty. Inventář jiného světa se nemaže. |
| P1 | Zmizí poslední město či poslední výrobní výstup. Prázdné tržní přehledy nebyly publikovány. | Čistí se i prázdné aktuální snapshoty `city_market_summary`, `city_market_baskets`, `market_shares`; minulá kola těchto tabulek zůstávají. |
| P1 | Říše přijde o poslední město. Smyčka aktualizovala jen vlastníky existujících měst. | Nulová produkce a objem zásob se publikují také existujícím říším bez měst. Daňové příjmy a rezervy se refreshováním nemění. |
| P1 | Selže čtení receptů, uzlů, měst nebo výrobních příkazů. `null` se bralo jako prázdný seznam, případně se příkaz ignoroval. | Požadované vstupy se ověří před prvním zápisem. Selhání zastaví projekci. |
| P1 | Selže mazání/vložení inventáře, tržních dat, přístupových práv nebo aktualizace říše. Mnohé chyby se ignorovaly či jen logovaly. | Kontrola výsledku dotazu vyvolá chybu a společný orchestrátor zastaví navazující kroky. Kontroly zahrnují i doplňkové neutrální zdroje a agregace obchodních systémů. |
| P1 | Klient dodá historické číslo tahu nebo se nepodaří načíst aktuální tah. Solver mohl zapsat dnešní data do jiné historie. | Goods projekce vyžaduje platný aktuální tah ze serveru. Odlišný požadovaný tah vrací 409, neplatný formát 400. Chyba čtení nevede k náhradnímu tahu 1. |
| P1 | Selže uložení vypočtené cesty, ale trasa se přesto označí jako čistá. | Aktualizace agregátu trasy následuje až po úspěšném uložení cesty. Chyby čtení tras/uzlů se nepovažují za „žádné špinavé trasy“. |
| P1 | `compute-trade-systems` sčítá `capacity_value`, ale sloupec chyběl v SELECT. | Kapacita se skutečně načítá a promítá do `total_capacity`. Test kontroluje výsledek 17 pro trasu s kapacitou 17, při respektování vybraných sloupců. |
| P1 | Čtvercový svět používá generátor s hexovou metrikou. | Výběr nejbližších uzlů, vzdálenosti, metriky tras i dosah přístavů používají topologii daného světa. Hexové světy zůstávají podporované. |
| P1 | Provincie má právě jeden hlavní uzel; časné `continue` přeskočilo připojování menších uzlů bez rodiče. | Jediný hlavní uzel může připojit osiřelé menší uzly. |
| P1 | Zmizí všechny aktivní uzly, ale vygenerované trasy zůstanou. | Prázdný výsledek odstraní pouze generované trasy; hráčské trasy zachová. |
| P1 | Serverový krok vrátí prázdnou či chybnou odpověď bez explicitního `ok: false`. | Orchestrátor přijme pouze `ok: true`; ostatní odpovědi zastaví navazující výpočty. |

Změny jsou v `supabase/functions/compute-trade-flows/index.ts`, `compute-province-routes/index.ts`, `compute-hex-flows/index.ts`, `compute-trade-systems/index.ts` a společných modulech `database-result.ts`, `economy-refresh.ts`, `topology.ts`.

## Další potvrzené nebo přesně ohraničené problémy

### P0 — oprávnění a obnova tahu zůstávají otevřené

Platí zjištění prvního auditu: neověřené servisní vstupy a neatomické provedení tahu jsou zásadní blokátory. Tato sada neřeší autorizaci ani celoserverový zámek. Zastavení po chybě není rollback: předchozí úspěšné zápisy mohou zůstat. Přepočet je proto nutné provozně odlišit od opakování účinků tahu.

### P1 — zpětná vazba potřeb na města používá neplatný datový kontrakt

`process-turn/index.ts` v části „Demand basket feedback“ čte z `demand_baskets` pole `basket_type`, `satisfaction`, `deficit_volume`. Migrace a generované typy ale definují `basket_key`, `satisfaction_score`, `quantity_needed`, `quantity_fulfilled`. Chyba čtení se ignoruje. Navíc `demand_baskets.city_id` odkazuje na `province_nodes.id`, zatímco konzument porovnává `cities.id`.

Samotné přejmenování sloupců nestačí. Zpětná vazba počítá růst populace a stabilitu, do kterých již zasahuje `world-tick`. Pro zprovoznění je potřeba vybrat vlastníka těchto účinků, použít aktuální městský snapshot po obchodu a ověřit přesně jedno provedení za tah. Automatické zapnutí starých efektů bez této kontroly by měnilo chování hry a mohlo zdvojit růst/pokles.

### P1 — některé čtečky sčítají historii nebo vydávají starý snapshot za aktuální

`GapAdvisorPanel` načítá `city_market_summary` bez omezení tahu. `economy-advisor` podobně čte více historických projekcí bez aktuálního tahu. `MarketSharePanel` a `DemandFulfillmentPanel` volí poslední existující snapshot; když je současný výsledek prázdný, mohou znovu zobrazit minulost. Pevné limity řádků mohou navíc oříznout větší světy.

Proto `demand_baskets` zatím zachovává existující režim „pouze současný stav“. Zavedení jeho historie musí proběhnout současně s převodem všech čteček. Tato sada jeho historii nezavádí ani neslibuje; u již historických tabulek stará kola nemaže.

### P1 — oba obchodní modely stále nemají jednotné účtování množství

Goods solver vytváří `trade_flows` a samostatný basketový solver vytváří `basket_trade_flows`. Ve smyčce goods solveru se po přiřazení dodávky nesnižuje potřeba cíle ani společný zůstatek zdroje. Více sousedů proto může vykazovat dodávku do stejné původní mezery; více odběratelů čerpá stejný přebytek. Systémová nabídka se navíc přidává k již agregované nabídce hráče. Výsledky nelze bez dalšího sčítat jako realizovaný obchod.

První sada oprav stabilizovala opakování basketového solveru. Další konsolidace má určit jediný realizovaný tok a oddělit od něj indikativní tlak a nabídku; až potom převést UI a odstranit nadbytečné výpočty. Současná sada nemění obchodní vyvážení.

### P1 — nedostupná cesta může ponechat starou projekci

`compute-hex-flows` nyní kontroluje zápisy, ale větve pro blokované trasy, chybějící endpointy a nenalezenou cestu stále přeskakují výstup. Je třeba zavést explicitní stav nedostupnosti a odstranit starou cestu bez záměny hráčského blokování s geometrickou nedostupností. Pouhé nastavení `control_state = blocked` by mohlo zablokovat pozdější automatickou obnovu.

### P1 — limity výsledků a publikace po dávkách

Načítání hexů je stránkované, jiné velké tabulky často nejsou. Částečné čtení se může tvářit jako kompletní svět. Ani nová kontrola `error` neodhalí úspěšnou odpověď oříznutou limitem. Publikace metodou delete/insert navíc nemá transakci napříč dávkami. Následný návrh má používat kompletní vstupy a atomické publikování verzovaného snapshotu.

## Ověření

- Prošlo **96 testů v 10 souborech**, tedy 58 nových případů navíc oproti první sadě.
- Nové testy spouštějí skutečné Edge handlery nad falešnou databázovou hranicí. Ověřují prázdný výsledek, zachování jiného světa, historii již historických tabulek, nulovou produkci, chyby čtení/zápisů, topologii, kapacitu a pořadí publikace cesty.
- Falešná DB respektuje projekci sloupců v SELECT, takže chybějící `capacity_value` test neobejde vracením všech polí.
- Kontrola TypeScriptu aplikace a produkční sestavení prošly. Cílený ESLint nových testů a společného helperu prošel. Celkový historický lint není čistý.
- Stejně jako v první sadě testy/build používají lokální WebAssembly esbuild 0.21.5 kvůli omezení rour ve Windows sandboxu. Pomocný runtime není součástí změn.
- Neproběhlo nasazení do Deno/Supabase, test živé DB, souběhu klientů ani 30 tahů. Aplikační TypeScript sám nekontroluje typy všech Edge Functions.
- GitHub připojení v předchozí sadě odmítlo zápis chybou 403. Tato sada je předávána lokálním commitem a patchi, bez tvrzení o vzdáleném PR či běhu CI.

## Následující integrační krok

Začlenit opravy do aktuální pracovní verze a ověřit souběžné změny, potom řešit autorizaci a bezpečné provedení tahu. Následuje jednotný aktuální snapshot pro UI, jedno účtování obchodních toků a teprve pak obnova vypnutých efektů obyvatelstva. Bez toho by mazání „starých enginů“ pouze přeneslo chyby do další vrstvy.
