# Map-first square-grid roadmap

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
