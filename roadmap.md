# Map-first square-grid roadmap

- [ ] Restore reliable Test01 turn closure after stale prior-turn execution guard
- [ ] Verify canonical Test01 economy twice without fiscal or history drift
- [ ] Make module tabs close map details and use the full workspace width
- [ ] Compact the world header, resource strip, and module navigation

- [x] Introduce shared grid geometry contract
- [x] Add grid geometry regression tests
- [x] Add per-world grid version and additive square coordinates
- [x] Support square-grid generation, discovery, movement, and pathfinding server-side
  - [x] New worlds persist square-grid identity and generated terrain coordinates
  - [x] Player and AI short-hop movement enforce four-direction adjacency
  - [x] Convert discovery, province growth, battles, and flow A* to topology-aware operations
- [x] Add dual isometric square renderer preserving core map interactions and authoritative flow paths
- [x] Convert desktop shell to persistent map with top tabs and collapsible workspace
- [x] Open desktop modules in a right-side 40% command panel
- [x] Make the isometric renderer visible for legacy worlds through a read-only coordinate adapter
- [x] Make top modules collapsible back to the map and constrain workspace coverage
- [x] Render cities, nodes, routes, and deployed armies in the shared isometric view
- [x] Adapt remaining mobile map controls and panel behavior
- [x] Apply tactical map tokens and chosen typography
- [x] Verify square-grid mechanics, desktop, and mobile
- [x] Add guarded admin migration workflow for existing worlds
- [x] Add living city parcels and map growth
  - [x] Persist urban cells and 4×4 parcels without duplicating building effects
  - [x] Add command-dispatch expansion and parcel assignment guards
  - [x] Advance developing city cells during committed turns
  - [x] Render static recognizable city clusters, parcel zoom, field detail, and growth controls
  - [x] Verify parcel rendering, field selection, and deployed expansion command end to end
  - [x] Add 32 deterministic sub-parcels per cell with terrain-driven cost and housing slots
  - [x] Add CLAIM_TILE_PARCEL command and city founding seat selection
  - [x] Render sub-parcel layer on the selected cell with claim actions in the field detail
- [x] Make 6×6 sub-parcels directly manageable from a right-side detail panel
- [x] Support multiple structures per parcel with capacity enforcement
- [x] Add player-built production, military, and trade subnodes
- [x] Add three-level automatic local infrastructure per macro cell
- [x] Render subnodes on their assigned sub-parcels and make them selectable
- [x] Keep camera, city layer, and parcel selection stable after map actions
- [x] Animate building and local-road construction in the city parcel style
- [ ] Verify parcel management and local roads end to end
- [ ] Repair sub-parcel road drawing, confirmation, and infrastructure integration
- [ ] Unify roads, rivers, and economic flows
  - [x] Add authoritative road projects and cardinal road segments
  - [x] Add map route drawing with tier, cost, bridge preview, undo, and confirmation
  - [x] Advance road projects during committed turns
  - [x] Route trade systems and goods/basket flows through completed roads and rivers with capacity limits
  - [x] Migrate player-built legacy roads and exclude generated shortcuts
  - [ ] Verify drawing, construction, routing, interruption, and three visual tiers end to end
- [x] Resolve six confirmed production monitoring findings
  - [x] Align turn processing with current basket and military fields
  - [x] Restore rumor, annotation, crisis, victory, and briefing queries
  - [x] Restrict persistent test-mode effects to administrators

## Layer A/B/C pass (otevřeno)
- [x] total_gdp = realized_goods_value (bez exportu), export jako samostatná obchodní metrika
- [x] jednotná basketová valuace auto/recipe/buildings + goods_value_detail
- [x] nodeProductionFactor pryč z recipe quantity, jen throughput budget
- [x] wealth_output deprecated + allowlist guard
- [x] ProductionOverviewCard jako řetězec, obchod vedle
- [x] Krok 4b: zrušit paralelní produkci v process-turn (totalCityProduction odstraněn)
- [x] hlad/obilí ze staple_food, ne z goods_supply_volume
- [x] goods_value_detail.structures (budovy + čtvrti), nikdy z post-trade local_supply
- [x] Krok 4c: domestic/extraction tax base z Layer B, famine + grain metriky ze staple_food, faction satisfaction z food balance, production_reserve akumulace deprecated, labor multiplikátory nevytvářejí produkci
- [x] domestic consumption = Σ (local_demand - unmet_demand) × basketValue (publikuje compute-basket-trade-flows)
- [x] extraction provenience počítat při recipe produkci (production_role=source)
- [ ] BLOCKER: production_reserve — akumulace zrušena, existující zásoba se spotřebovává; construction-goods → CAPEX pass MUSÍ přijít před release
- [ ] Opravit nulovou Layer A kapacitu, která dnes přes fallback stále vyrábí recepty
- [ ] Dokončit budovy a produkční čtvrti před ekonomickým přepočtem stejného tahu
- [ ] Zajistit, že hráčské produkční subuzly mají městský/rodičovský tržní kotvící bod
- [ ] Napojit obnovu production_reserve výhradně na post-trade koš construction
- [ ] Ověřit živý svět: specializovaný dvůr změní structures/recipe a opakovaný refresh je idempotentní


## Layer B post-trade opravy (audit aaa4be27)
- [x] P0: post-trade fold nesmí dvakrát počítat auto+bonus (local_supply + import)
- [x] P0: production_reserve se obnovuje jen z construction_available_for_capex (po poptávce a exportu)
- [x] Layer A kapacita 0 nesmí vyrábět recepty (capacityFor bez fallbacku z nuly)
- [x] Dokončení budov/čtvrtí přesunout do commit-turn PO advance tahu, PŘED economy pipeline; odstranit druhého writera v process-turn
- [x] BUILD_SUBNODE: bez platného města/rodiče stavbu odmítnout
- [x] Akruál stavební zásoby jen při plně úspěšné economy pipeline (commit-turn předá flag)
- [x] ProductionOverviewCard: neporovnávat peněžní hodnotu s throughput slotem procentem
- [x] aggregate-realm-totals: hráči bez uzlů musí dostat explicitní 0, ne stale hodnotu
- [ ] Live test rozšířit na node_inventory, city_market_baskets, basket_trade_flows a goods_* metriky; akceptovat jen čistý úspěch

## Economy analytics pass
- [ ] Vyčistit hlavní ekonomické metriky a odstranit staré GDP/wealth popisky
- [x] Přidat městský rozbor produkce, poptávky, staveb a přebytků
- [ ] Přidat přehled obchodních toků mezi městy pro aktuální tah
- [ ] Sloučit duplicitní ekonomické podpanely do jednoho analytického toku

## Release 46f0cc9+ — produkční nasazení
- [x] Ověřit, že aktuální main obsahuje commit 46f0cc9 a načíst deployment manifest
- [x] Aplikovat obě požadované migrace bez změny existujících her
- [x] Nasadit všech 13 serverových funkcí z deployment manifestu
- [x] Publikovat frontend na kronika-svet-centrum.lovable.app
- [x] Ověřit Test01 / eba99766-9046-4daf-a367-9f31380cbba1 bez posunu tahu

## Sphaera reset + ekonomická regrese (Test01)
- [ ] Reset Sphaery v Test01: smazat sezóny, zápasy, tabulky; zachovat týmy, hráče, akademie
- [ ] Snížit strop 1. ligy a rozdělit týmy mezi ligy (20 týmů = 38 kol se nikdy nedohraje)
- [ ] P0: backfill canonical production_output z production_base/resource_output (idempotentní, bez fallbacku)
- [ ] P0: trade_flows — city ID do *_city_id, node ID do *_node_id + regresní test
- [ ] P0: current-turn demand_baskets jako atomická kompatibilní projekce canonical ledgeru
- [ ] Živý akceptační test Test01: kapacity, toky, idempotence, nezměněný fiskál a tah

## Populace, migrace a prosperita tras (master)
- [x] Fáze A: jediný kanonický writer populace, třídní invariant, mrtvý kód
- [x] Fáze A residue: world-tick ztráty i migrace přes shared helpery
- [x] Fáze A residue: resolve-battle ztráty drží total == součet vrstev
- [x] Fáze A residue: command-dispatch destruktivní ztráty přes shared helper
- [x] Fáze A residue: zakládání města — TODO + testovací pojistka (převod až ve Fázi C)
- [x] Fáze A residue: zrušit klientské volání process-turn mimo commit-turn
- [x] Fáze B: deterministická venkovská populace a únosná kapacita na buňkách (shadow)
- [x] UI: populace každého pole v mapovém detailu + vývoj, příčiny a migrace v Říši
- [ ] Fáze C: zakládání a místní migrace jako atomický převod lidí
- [ ] Fáze D: jeden model narozených/zemřelých + pracovní příležitost za feature flagem
- [ ] Fáze E: dálková migrace po stejném fyzickém grafu tras
- [ ] Fáze F: derived transit_service_value → daňový základ (nikdy přímo zlato)
- [ ] Fáze G: deterministická základní AI neutrálních sídel (bez LLM v kanonu)
- [ ] Fáze H: finální demografické UI + odstranění legacy kódu

## Celoherní audit — uzavírací práce (Fáze 1–6)
- [x] Fáze 1a: nový svět dostane startovní ekonomiku, hlavní město a jeden derived průchod
- [x] Fáze 1b: právě jedno hlavní město na říši (vznik, zakládání, dobytí, oprava starých her)
- [x] Fáze 1c: údržba cest účtovaná v kanonické fiskální uzávěrce + pojistka proti dvojímu účtování
- [x] Fáze 1d: akceptační test nové hry (vytvoření → stavba → uzávěrka → čtení)
- [ ] Fáze 2: kanonické zápisy jen přes command-dispatch + RLS podle vlastnictví
- [x] Fáze 3: migrace město↔město (computeIntercityMigration, ledger v úspěšné uzávěrce; venkovský převod zůstává Fáze C)
- [x] Fáze 4: odstraněn druhý herní cyklus (world-tick, process-tick), PersistentTab/ActionQueue/TimePool, mrtvé CitiesTab a EmpireManagement;
      turnová část tiku (pohyb armád, léčky, obléhání, projekty uzlů) extrahována do _shared/turnProgress.ts a volána z commit-turn;
      legacy wealth_output už není vidět hráči (zůstává jen v dev panelech)
- [ ] Fáze 4 zbytek: povýšení/stavby platit kanonickými fyzickými zbožími místo production_reserve (souvisí s parkovaným ekonomickým zadáním)
- [x] Fáze 5: jeden společný derived chain pro commit-turn i refresh-economy, jeden model cest
  - `_shared/derivedChain.ts` = jediná definice pořadí kroků; refresh-economy = current turn + plain aggregation, commit-turn = goodsTurn+1, emitEvents, aggregatePhase physical
  - commit-turn si drží jediné cílené `compute-hex-flows` ve fázi 5b (dirty routes po dokončení projektů) — není to druhý řetězec
  - smazány duplicitní UI stavby cest: WorldMapBuildPanel, RouteDetailSheet, RoadNetworkOverlay; cesty se staví jen na fyzické vrstvě (road_projects/road_segments), province_routes = interní vojenská topologie
  - testy: src/test/phase5-unification.test.ts
- [x] Fáze 6: aliance blokují válku, open borders řídí mírový pohyb, AI fallback, serverová náhoda
  - `_shared/diplomacyEnforcement.ts` = jediné místo pravidel (WAR_BLOCKING_PACTS, PASSAGE_PACTS, checkWarDeclaration, checkTerritoryAccess, deterministicSeed)
  - command-dispatch: DECLARE_WAR blokován platným spojenectvím/paktem o obraně/vazalstvím; pohyb (hexový i po cestě) blokován v míru bez otevřených hranic
  - ai-faction-turn: retry při 429/5xx + čestný fallback (frakce drží pozici, důvod zapsán do summary i world_action_log) místo pádu
  - resolve-battle: seed bitvy deterministicky ze session/tahu/stacků, klientský seed ignorován; DiplomacyPanel a BattleLobbyPanel už negenerují náhodu
  - pracovní místa přeškálována na hlavy (ECONOMY.workersPerLaborUnit = 20), Test01 populace srovnána s bytovou kapacitou
  - testy: src/test/phase6-systems-depth.test.ts
- [ ] Rozhodnuto: persistentní real-time režim opuštěn — world-tick/process-tick/action_queue/time_pools k odstranění
- [ ] Rozhodnuto: Sphaera/ligy zamrazit za beta flag

### Fáze 2 — autorita příkazů (hotovo)
- [x] RECRUIT_GENERAL: server vkládá generála, deterministická schopnost z command_id, atomické strhnutí zlata
- [x] SIGN_NEUTRAL_PACT: tribut odvozený ze stupně osady, kontrola zlata, pakt + event na serveru
- [x] RESOLVE_UPRISING: ústupky (zlato, sklady, odevzdání města, abdikace) řeší server, jedno hlavní město zachováno
- [x] APPLY_DECREE_EFFECTS: rozšířeno o reakce frakcí a penalizaci stability rady
- [x] Klient (ArmyTab, CouncilTab, UprisingDialog, CityActionsPopover) už nepíše do pokladnice ani kanonických tabulek
- [x] Statické kontrakty: src/test/phase2-command-authority.test.ts

### Nový požadavek (zaparkováno, po dokončení fází 3–6)
- [ ] Sjednotit městské bohatství / prosperitu / obchodní služby (CHRONICLE — UNIFY CITY WEALTH):
      zrušit populační wealth formuli v process-turn, kanonická city_value_added,
      obchod jako služební sektor s kapacitou a prací, city_capital_stock (jen process-turn),
      prosperita jako index, oprava záložky „Kde se hromadí bohatství", rework TRADE_BOOM,
      deprecate legacy node wealth fields, testy A–O, read-only diagnostika Test01 turn 64.


## Pracovní místa a přehled výroby (hotovo, tah 65)
- [x] Každá vyrábějící stavba zaměstnává 100 lidí na lvl 1 a zdvojnásobuje s úrovní (100/200/400)
- [x] Uzly dostávají stejný kanonický počet míst jako budovy a čtvrti
- [x] Budovy ve městě napojeném na dokončenou cestu dědí napojení celého města
- [x] Přehled výroby = jeden řádek na stavbu (součet receptur), ne zlomky na recepturu
- [x] `refresh-economy` znovu publikuje přehled výroby i po uzavření tahu (report je odvozený pohled)
- [x] Důvod zastavení rozlišuje "vstupní zboží nikde není" vs "chybí cesta"

## Rework poptávkových košů (hotovo, tah 65)
- [x] Kanonický solver poptávky v `_shared/demandModel.ts` (13 košů, 9 kanálů proveniencí, třídy potřeb)
- [x] Nástroje = provozní spotřeba obsazených kapacit; měkký strop produktivity (floor 0.75), nikdy nulová výroba
- [x] Pitná voda = kritická potřeba s pásmy (healthy / minor / meaningful / severe / critical)
- [x] Stavby, správa, logistika a vojsko generují poptávku jen z reálné aktivity
- [x] `variety` samostatný kanonický koš i na klientu (odstraněn legacy remap variety→feast)
- [x] `city_market_baskets.demand_detail` (jsonb) = provenience, krytí, pásmo, alert, důsledek
- [x] UI: skupinová matice košů + alerty P0–P3/INFO místo „chybí X jednotek"
- [x] Test01 přepočítán na novou ekonomiku (read-only jinak, tah 65)
- [x] Mortalita z nedostatku pitné vody se aplikuje (pásmo critical, max 2 % populace, přes applyPopulationLoss)
- [ ] Zbývá: production_reserve gating

