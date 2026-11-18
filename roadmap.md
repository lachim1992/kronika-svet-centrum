# Map-first square-grid roadmap

## JV72O7 — regionální substituce, armádní projekce a hladomor (2026-11-18)
- [x] Read-only audit turnu 21 potvrdil fuel 59,1 %, tři neaktivní stacky a pět měst `food_status=ok`; bez process-turn a refresh-economy.
- [x] Cross-city substituce nově pokrývá `critical_need` i `basic_need`; `nutritionOnly` zůstává jen pro kritické potřeby. Testy dvou měst kontrolují fyzický tok, odpojení, ztrátu, rezervy, kvalitu, demand channels, determinismus a double-count; JV72O7 fixture požaduje fuel >59,1 % a jídlo/vodu 100 %.
- [x] Sdílený disband přepočet všech manpower/upkeep polí už existoval z předchozího balíku; přidána regrese posledního stacku a fiskální bezezměny. V JV72O7 byl pouze jeden historický neaktivní řádek normalizován na `is_deployed=false`; všechny tři stacky zůstaly.
- [x] Armádní readiness používá aktuální subsistence report, nikoli stale `famine_city_count`; process-turn a fiskální writer nebyly změněny.
- [x] Testy přidány, ale záměrně nespuštěny; vlastní diff a `git diff --check` zkontrolovány, ekonomický progress aktualizován, jediný výsledný commit bez mezilehlých commitů.
- [ ] GitHub Actions CI musí nezávisle ověřit typecheck, edge typecheck, testy a build; přesné výsledky zatím nejsou k dispozici. Deploy/publikace nebyly provedeny a committed ledger turnu 21 zůstal beze změny.

## Konsolidovaný opravný balík — demobilizace, pohyb, manpower a autorita (2026-11-18)
- [x] DEMOBILIZE_STACK a DISBAND_STACK sdílí serverovou aktivní-only demobilizaci; počet mužů jen z DB, kompletní HUD/upkeep přepočet z aktivních stacků a měst.
- [x] Hexový pohyb odmítne stack deaktivovaný mezi načtením a zápisem; race test prokázal RACE_LOST a beze změny souřadnic.
- [x] Interní actor typy pouze po service-role ověření před turn gate; parcel režim 0/1/2/preview, legacy production a food fail-closed, staré obilí není upgrade prerequisite.
- [x] Jediná kapacitní trigger cesta prokázána PGlite souběhy building↔building i building↔subnode; read-only JV72O7 audit stále 7/6/5 vazeb, 0 session mismatch a 0 orphan content.
- [x] Migrační fakta zdokumentována: 0016 mimo journal, 0023/0024 bajtově shodné, chybí 0025 snapshot. Kandidátská 0038 zůstává nepoužitá; žádný rewrite historie ani produkční migrace.
- [x] Cílené ověření 78/78; celá sada **1219 passed / 3 skipped** (148 souborů passed, 1 skipped), `oj typecheck -b --noEmit`, Deno check command-dispatch/process-turn a build OK. Bez deploye, publikace, herního zápisu, refresh/commit-turn a posunu tahu (JV72O7 stále 21).
- [ ] Blokováno samostatným povolením: bezpečně zrekonsiliovat 0025 snapshot a forward-only 0038/0016 platformním workflow, potom nasadit command-dispatch/process-turn a ověřit demobilizaci v izolované hře.

## Druhý opravný balík — sklady, vazby parcel a migrace (2026-11-18)
- [x] Legacy potraviny: příděly přes serverový SET_RATION_POLICY; open_stores a nové L3 food převody fail-closed; sváteční/kolapsové fiktivní zápisy odstraněny, staré food trasy už negenerují zlato. Historické řádky zachovány.
- [x] Read-only audit našel 7 budov bez content, 6 rozporů parcel_id a 19 legacy ukazatelů (všech 13 vazeb JV72O7), 0 přeplněných parcel. Kandidátská SQL invariantů a atomická RPC obsazení jsou v `supabase/reconciliation/`; živé řádky nebyly opraveny.
- [x] PostgreSQL test dvou souběžných staveb na kapacitě 1 vytvořil jednu vazbu a jedno obsazení; BUILD_SUBNODE nadále používá vlastní atomickou platbu/kapacitu z 0037.
- [ ] Blokováno samostatným migračním povolením a chybějícím snapshotem 0025: zaregistrovat připravenou forward-only 0038 a rekonsiliovat 0016/0023/0024 platformním workflow. Inspekce nenabídla bezpečný repair plán; žurnál ani historické migrace nebyly ručně přepsány a produkční migrace neproběhla.
- [x] Cílená sada **20/20**, finální celá sada **1189 passed / 3 skipped** (147 souborů passed, 1 skipped), typecheck, Deno check 6 funkcí a automatický build OK. Bez deploye, publikace, tahu, refresh/commit-turn a herních zápisů. Další přesný krok: po samostatném povolení aplikovat rekonsiliaci a teprve potom nasadit command-dispatch.

## Opravný balík autority příkazů a parcelových čtvrtí (2026-11-18)
- [x] BUILD_DISTRICT / SET_DISTRICT_PRODUCTION: kanonický serverový katalog, vlastnictví a session, produkce fail-closed v parcel režimu; UI nabízí jen skutečně podporované typy.
- [x] APPLY_DECREE_EFFECTS: žádné klientské surovinové přírůstky; bez serverem ověřitelného dekretu fail-closed. CouncilTab okamžité odměny neodesílá a oznámí, že nebyly uplatněny.
- [x] UPGRADE_SETTLEMENT / UPGRADE_INFRASTRUCTURE: serverové ceny a úrovně, vlastnictví, CAS platby a odolnost proti záporným nákladům.
- [x] BUILD_SUBNODE: `0037_atomic_build_subnode.sql` atomicky ověří vlastnictví, rezervy, kapacitu, uzel a obsazení parcely; PostgreSQL test dvou souběžných pokusů skončil jedním uzlem a jednou platbou.
- [x] economyAdapter: produkční čtvrti jen v záměrném legacy režimu; obytná kapacita a stabilita beze změny, staré záznamy zachovány.
- [x] Cílené testy 60/60 před posledním zobrazením; finální celá sada `bunx vitest run --maxWorkers=4` = **1180 passed / 3 skipped** (145 souborů passed, 1 skipped). `oj typecheck -b --noEmit`, `deno check supabase/functions/command-dispatch/index.ts` a automatický build prošly.
- [ ] Edge deploy a živá herní akce záměrně nebyly provedeny. Migrace schématu 0037 byla aplikována bez změny herních řádků; frontend nebyl publikován. Další krok vyžaduje samostatné povolení nasazení command-dispatch. Okamžité efekty dekretů zůstávají fail-closed, dokud neexistuje serverem vlastněný uložený efekt dekretu.

## Taktické bitvy — dokončení a korekce CP (2026-11-18)
- [x] Kód z `9e29c22e`: schválené efekty 7 forem a typový pohyb, skutečné vážené hodnocení AI, vysvětlení doktríny/rozkazů a volba formace při rozmístění; bez nového paralelního enginu.
- [x] Korekce v `b583e823`: 4 CP bez generála a při skill 0–39, 5 CP při 40–55, 6 CP při 56–62, 7 CP při 63–100; referenční body 40/56/63 → 5/6/7. Sdílený server i UI používají stejný převod a oba panely mají nápovědu prahů.
- [x] Skutečně spuštěno: cílené `bunx vitest run src/test/general-command.test.ts src/test/field-battle.test.ts src/test/tactical-contract.test.ts --maxWorkers=4` = **78/78**; celá sada `bunx vitest run --maxWorkers=4` = **1158 passed / 3 skipped** (142 souborů passed, 1 skipped); `oj typecheck -b --noEmit` a `deno check` command-dispatch/scenario-simulate čisté; harness build OK.
- [x] Nasazeno z commitu `b583e823`: command-dispatch SHA-256 `47a782dafdeed26dc53fee7560162ffb77b59a9f89066ff9ac99f0b350eefcc3`, scenario-simulate SHA-256 `472ff01c36ca633a80192ffec043e55082915bcab86dfb13e7f2a6a007df6631`. Prázdný command-dispatch požadavek vrátil kontrolované 400, scenario-simulate 401; žádný herní příkaz se neprovedl. Publikace `https://kronikaruv-stul.lovable.app` byla naplánována po zelených testech.
- [ ] Živá bitva a mapa stále nejsou end-to-end ověřené: v JV72O7 se záměrně nespustila bitva ani tah a nezměnila se žádná herní data. Pro akceptaci je potřeba samostatná autorizovaná testovací bitva; není to blokér této CP korekce.

## JV72O7 — ekonomická pohoda a oprava editoru (2026-11-18)
- [x] Opravit a v přihlášeném náhledu ověřit výběr a úpravy objektů v admin editoru na mapě. Tlačítko je portálem mimo překrývající pracovní plochu; město i dlaždice prokliknuty, dlaždice má viditelný výběr.
- [x] Přes auditovaný admin zápis odstranit obě obří armády Player a Frakce 1; Player garda byla smazána, AI horda vyřazena kvůli historické FK, malý 101členný oddíl zůstal. Žádný generál nebyl změněn.
- [x] Nastavit pouze JV72O7 klidný scénář: všech 7 měst stabilita 100 a historický hladomor vynulován; specializovaná jídlo/voda/obilí/mlýny/pekárny, 7 lesních táborů, 4 uhlírny a 10 cest kapacita 20. Bez posunu tahu (stále 18).
- [x] Finální derived refresh: 10 canonical toků (3,879 raw_grain, 2,402 flour, 0,741 raw_timber, 4,964 charcoal), jídlo i voda 100 % ve všech městech, fiskální stav beze změny. Palivo zůstává nedostatkové v Kwaku/Qweu/Lambadagradu; jiné koše a ceny stále generují analytická varování.
- [x] Ověřeno Ekonomika → Trhy & Obchod bez varování o hladomoru a bez page errors. Celá sada 1123 passed / 3 skipped, TypeScript, Deno check admin-dev-write a produkční build prošly.

## JV72O7 turn 18 — read-only counterfactual economy audit
- [x] Loaded only committed turn-18 snapshot (SHA-256 `2d42f319…a39980447f`) and ran four isolated in-memory resolveGoodsEconomy scenarios; no turn/refresh/command or game-data write. Baseline control totals match the committed ledger.
- [x] Documented workforce, lines, goods, food/water/fuel, chains, flows, prices/wages, storage and conservation in `docs/economy/JV72O7-turn18-counterfactual-audit.md`; canonical physical food is 0.0021766188 versus legacy grain_reserve 1,000,000. Actual zero trade = 94 source_empty blockers; peacetime creates one 0.459 raw_timber input flow.
- [x] Added five mobilization/cloning/rural/cap/conservation invariants; no production model change was justified. Relevant suite 71/71, TypeScript and production build passed. Extreme mobilization explains the collapse; input-unaware downstream staffing remains a separately documented limitation.
- [ ] Next safe slice: synthetic grain→flour→bread contract for input-aware subsistence staffing, before any production-formula change or live-game cleanup.

## Legacy battle retirement + general command + Battle AI v2 — 2026-11-18
- [x] Removed the abstract engine's UI, commands, functions and source/test/documentation references; preserved field battles, sieges, generals, recruitment and map/economy state. Deployed replacements; all three retired endpoints verified absent (404).
- [x] Removed all obsolete pending decisions (live count 0) and applied `0035_general_command_atomic_field_settlement.sql`: unique general assignment, ownership/capacity RPC and strict atomic settlement; retired lobby removed from the turn-write allowlist.
- [ ] Drop the two retired abstract tables and regenerate their remaining generated types. Blocker: workspace Agent permissions currently reject table drops; user must allow them. Live rows remain untouched (6 lobbies / 58 abstract battle rows).
- [x] Shared 0–100 general command helpers, server-side stack capacity/ownership/uniqueness checks, recruitment-time general selection, morale leadership and composition/morale-only stack power.
- [x] Canonical `field_battles.meta` on every write/read, real 0–100 composition quality mapped to 0.75–1.25, exact soldier validation and RPC-only/fail-closed final settlement.
- [x] Deterministic server-side Battle AI v2 with seven doctrines, tactical roles, legal group/CP accounting, adaptive canonical plan state and representative AI-vs-AI tests.
- [x] Full suite 1115 passed / 3 skipped (136 files passed, 1 skipped); TypeScript and changed-function Deno checks clean; production build passed. Updated command-dispatch, commit-turn, AI turn, process-turn, reporting and scenario functions deployed; command-dispatch/commit-turn verified reachable. No live turn, recruitment, battle, economy refresh or saved-game command was run.

## Editor mapy a izolované scénáře — 2026-11-18
- [x] Samostatný editor s 2D izometrickou čtvercovou mapou a 6×6 mikropolíčky; terén, města, armády, cesty, suroviny a těžební stavby bez poplatků.
- [x] Pravděpodobnostní vrstva surovin z kanonických biome/deposit pravidel; lokální uložení, import/export a historie úprav.
- [x] Izolovaná simulace boje přes sdílený `fieldBattle` resolver a fyzická kapacita těžby přes sdílená parcel/transport pravidla; žádné zápisy do živých her. Funkce `scenario-simulate` nasazena (zdroj SHA-256 `2f8f60344ec66ad7e21f248f3ab7d9ef393bec6f863905a1ffdfa92a727e7e2e`), bez DB migrace a přístupu k herním tabulkám.
- [x] Regrese 74/74 ve 4 souborech, `oj typecheck -b --noEmit` a produkční build prošly (jen stávající varování o chunkách/PostCSS/Browserslist). Preview ověřilo malování lesa, přidání armády, 36 mikropolíček, potvrzení železné rudy, barevný terén, lokální uložení i živé simulace: bitva 37 kol s vítězem `army-west`, farma `raw_grain` 6,6/tah; nula page errors, nula neúspěšných requestů a nula zápisů do herních tabulek.
- [x] Druhý uživatelův bod byl odvolán („to už jsem zapomněl, neřeš“). Omezení: simulace těžby uvádí fyzickou kapacitu při plném obsazení, nikoli kompletní ekonomický tah; editor zatím neexportuje scénář do živé hry.

## Město a bitevní vizuály — 2026-11-18
- [x] Menší kruhy, poloviční figurky, 18 vojáků + 2 velitelé a výrazná pohybová políčka.
- [x] Budovy na 75 %, kamenná dlažba, drobné uličky a městský život bez změn herních dat.
- [x] Animace nových vyhodnocených polních útoků: úder, luk, let šípů/salva, zásah; reduced-motion vypíná pohyb. Kosmetické přehrání, bez druhého resolveru.
- [x] Útoky se přehrávají jeden po druhém až po dokončení předchozího zásahu; delší rozmach, oblouk letu, stopa šípu a ozvěna zásahu. Rozmach střelby má samostatnou 0,15 s pauzu před letem, salva počká na poslední šíp a další scéna začne až po 0,55 s mezeře.
- [x] Hradby ve světě i v 6×6 detailu obklopují jen koupené městské parcely (`claimed/occupied` + `claim_kind` urban/prázdné pro legacy); nárokovaná využívaná půda (`worked`) zůstává mimo obvod.
- [x] Dokončovací oprava: světové načtení parcel nově čte i `claim_kind` (původně sloupec chyběl, takže `worked` mohl projít jako neznámý/městský stav); samotný filtr zároveň vyžaduje kanonické `claimed/occupied`.
- [x] Finální cílená sada 15/15 včetně oddělených testů koupených vs. `worked` parcel, pouhých makro/provincních nároků, světového čtení `claim_kind` a časování příprava→akce→dopad→pauza. `oj typecheck -b --noEmit` i ruční `bun run build` prošly (jen existující varování o velikosti chunků/PostCSS/Browserslist).
- [x] Přihlášený read-only náhled JV72O7: světové čtení obsahuje `claim_kind`, 51 držení = 50 městských + 1 `worked`; Kwak detail otevřen, žádné page errors, žádný neblokovaný herní zápis. Žádné herní příkazy, tahy, refresh, migrace, nasazení ani publikace.
- [ ] Ostrý útok a poslední vítězný zásah nejsou ověřené, protože tento průchod zakazuje herní příkazy; sekvenční časování je ověřené testy, nikoli živým bojem. Animace obléhání není součástí tohoto průchodu.

## Taktické polní bitvy (2026-11-15)
- [x] Vytvořena Lambadagradská garda (Player, 8000, -8,1)
- [x] Vyvolání bitvy a výběr makropolí (všechny hry)
- [x] Rozmístění, bitevní kola, rozkazy, terén/typy/boky/morálka (v1)
- [x] Battle System v1 v kódu: 11 typů, 7 formací, terén, CP, skupinové rozkazy, zálohy, AI, typové ztráty, nábor
- [x] Nasazeno 2026-11-18: obsah připravené battle_system_v1 migrace aplikován jako `drizzle/migrations/0034_battle_system_v1_formations_settlement.sql`; živé omezení přijímá všech 7 forem + legacy column, field_battles.meta existuje a settle_field_battle smí volat jen service_role. command-dispatch nasazen (zdroj SHA-256 a6d56b325b2ebdcf4ba4fc631e7fdc935328ced5a800db59ef2b3ebf5b90a0a0); SET_BATTLE_FORMATION odmítnutí vrací HTTP 200 ok:false.
- [x] Regrese 57/57, tsgo + deno check čisté; živé přihlášení neplatné formace vrátilo `{ok:false,error:"Neplatná formace"}` bez FunctionsHttpError a bez herního zápisu. Původní constraint pád je odstraněn u všech nových forem.
- [ ] Ověřit celou bitvu ve hře po nasazení; ladění síly

## Přesun — neúplný terén náhledu (2026-11-15)
- [x] Náhled již nespoléhá na potenciálně zkrácený celosvětový read 40 000 parcel: před potvrzením načte okolí armády (±5 velkých polí, maximální silniční dosah) po stabilních stránkách. Chyba načtení zastaví plánování; chyba přihlášené relace se vrací jako odmítnutí, ne nezachycený pád.
- [x] command-errors + micro-movement 11/11, build OK; přihlášená JV72O7 Mapa → Železná horda → Přesunout armádu bez page errors. Žádný přesun, tah či zápis proveden. Historické odmítnutí se z dostupné telemetry nepodařilo reprodukovat; přesná původní trasa není k dispozici.

## Obléhání — vstup do hlavní budovy a vlaječky (2026-11-15)
- [x] Prostřední terč odstraněn; dobytí pouze při vstupu útočníka na jedno ze stávajících polí hlavní budovy (14/15/20/21), postup 1 pole/kolo, obsazené pole blokuje vstup. Starší keep příkazy používají stejný pohyb, nikoli dobytí ze sousedství.
- [x] Miniaturní vlaječky vlastníka na věžičkách v běžné i detailní mapě, stávající vlastní/cizí barvy. Testy siege.test.ts 12/12, automatický build OK. Přihlášená JV72O7 mapa: 62 vlaječek, otevření armády bez page errors. Nasazen commit-turn; žádný herní zápis, obléhání ani posun tahu.
- [ ] Živý vstup na hlavní budovu neověřen: JV72O7 aktuálně nemá aktivní obléhání; další kontrola vyžaduje autorizovanou testovací bitvu.

## Přehledné okno města a mikroparcely — 2026-11-14
- [x] Nové `MapDetailWindow.tsx` nahrazuje současnou dlouhou pravou lištu nemodálním portálovým oknem: desktop lze přesouvat za záhlaví a drží se uvnitř viewportu, mobil používá dolní panel. Mapa zůstává aktivní; sekce Přehled / Parcely / Rozrůst / Území oddělují dosud smíšený obsah. Existující nákup, výstavba, průzkum, provincie i správa sídel nadále používají původní command-dispatch toky.
- [x] `IsometricSquareMap.tsx` výrazně zvýrazňuje městem držené parcely trvalým šrafováním, barvou vlastníka a silnějším obrysem; neaktivní průzkumná mřížka zůstává slabá. Všechny akce a hitboxy jsou beze změny.
- [x] Nové `parcelDisplay.ts` uvádí na každém políčku skutečný přínos: městská parcela kapacitu bydlení (`capacity_slots × 90`), obdělávaná hlavní skutečný výnos jednoho zboží z posledního uzavřeného tahu. Různé statky se nesčítají a chybějící výnos se nevymýšlí. Rozrůst má vlastní souhrn kapacity a následujícího růstu; upřesněná zpráva „ještě nebylo co počítat“ zůstává v Přehledu, dokud nejsou k dispozici data.
- [x] Výběr parcely v mřížce i na mapě přepne do Parcel a automaticky odhalí její detail pod mřížkou; tím je na mobilu okamžitě vidět cena, využití i skutečný výnos. Neověřená dílčí data jsou dál označena jako potenciál, nikoli jako skutečná produkce.
- [x] Regresní pokrytí: nové `map-detail-window.test.tsx` (pozice, přesun, sekce, nemodální chování) a `parcel-display.test.ts` (90 obyvatel/slot, hlavní výnos, žádná smyšlená produkce). Finální celá sada: 119 souborů passed + 1 skipped; 943 testů passed + 3 skipped. Cílená mapová sada po poslední úpravě 13/13. Automatický preview build OK.
- [x] Přihlášená read-only akceptace JV72O7 na `/game/d379caff-8992-48e2-9084-7c9d74acceb1`: Lambadagrad, 36 parcel, Přehled/Parcely/Rozrůst/Území, výběr parcely, drag okna z 676/76 na 406/196 a funkční zoom. Mobilní Chromium 390×844: celá mřížka i navigace bez horizontálního přetečení, klik na parcelu odhalí její detail. V obou bězích nula page errors, nula zachycených pokusů o zápis a nula opakovaných idle požadavků.
- [x] Žádný tah, refresh-economy, seed, claim, command, backend/schema zápis ani publikace. Důkazy: `/tmp/browser/city-detail-window/{result.json,run.log,screenshots/}` a `/tmp/browser/city-detail-mobile/{run.log,mobile-parcels.png,mobile-parcel-detail.png}`.

## Province assignment runtime errors — 2026-11-14
- [x] Canonical SQL rules remain unchanged: target province must be 4-adjacent, city tiles cannot move, and removing a tile must not split the source province. The map select previously offered every owned province without those preconditions.
- [x] `MacroTerritoryPanel` now receives actual adjacent province IDs and city presence from `IsometricSquareMap`; it offers only the current or eligible adjacent province, disables impossible moves and defensively rejects stale invalid selections. Command/refetch failures are caught and shown as toast errors with busy state always cleared; server remains authoritative.
- [x] New `macro-territory-province.test.tsx` covers city tiles, nonadjacent targets and a late source-contiguity rejection. Full suite 117 files passed + 1 skipped; 937 tests passed + 3 skipped.
- [x] Signed-in read-only JV72O7 browser: Lambadagrad select disabled with only its current province, map remains visible after closing detail, zero page errors and zero blocked write attempts. No backend/schema/saved-game changes or publication.

## Map polish + performance — verified vertical slice, 2026-11-14
- [x] Profiled the real JV72O7 renderer before editing: 6,641 SVG descendants, 9×2048² raster chunks (6.79 MB), per-pointer React pan updates and per-coordinate pan offsets. Baseline headless drag sampling averaged 56.6 ms between frames with 47 intervals over 34 ms; this is a local measurement, not a device-independent FPS claim.
- [x] `IsometricSquareMap.tsx` + new `mapCamera.ts`: one stable world-coordinate SVG parent, direct rAF-throttled camera transforms during drag/pinch, settled React state after the gesture, anchored wheel/pinch math and midpoint movement. Roads, rivers, routes, cities, armies and 6×6 hit areas retain world geometry and handlers; route drafting keeps its existing input rules. Live MutationObserver during the same 45-step drag: 47 camera writes, zero SVG child-list mutations and zero non-camera coordinate mutations; mean sampled frame interval 16.785 ms, max 33.4 ms, no interval over 34 ms in this run.
- [x] `terrainRaster.ts`: spatial chunk buckets replace full quad/sprite scans per chunk; 1024² chunks at unchanged scale 3, high-quality image smoothing, WebP .94, opaque terrain base, AbortSignal cancellation and Blob URL cleanup on replacement/unmount. Road drafts use only the light SVG surface and no longer rebake static terrain. Initial raster remains substantial: 26 chunks / 6.40 MB and measured toBlob promise timings 54–223 ms in the final run; no claim that initial baking is now cheap.
- [x] Visual-only grass/water/rock filtering is quieter, tree silhouettes slightly larger/sparser and inactive microgrid softer. Existing assets, square projection, rivers, roads, biome assignments and game rules are unchanged.
- [x] Black Lambadagrad artifact root-caused with live geometry and RGBA reads: the 40,000-row parcel read can truncate a tile mid-grid; a partial stored array was accepted as complete, leaving transparent microparcels. New `parcelTerrainFallback.ts` overlays available canonical rows on the deterministic 36-parcel survey and fills only missing indices. Previously transparent pixels changed from alpha 0 to [105,120,69,255], [80,96,52,255], [107,130,63,255]; final same-view screenshot has no black cutout.
- [x] Regression coverage: `map-camera.test.ts`, `terrain-raster.test.ts`, `parcel-terrain-fallback.test.ts`, existing visual/topology/read-only tests. Full suite 116 files passed + 1 skipped; 934 tests passed + 3 skipped. Automatic preview build OK. Final signed-in read-only browser acceptance: city opens, all 36 parcel buttons exist, first/last selection works, zoom transform updates, map is nonblank, zero idle requests after five seconds, zero page errors and zero blocked write attempts.
- [x] No backend/schema/economy edits, no turn/refresh/seed/claim/command, no saved-game mutation and no publication. Browser evidence: `/tmp/browser/map-performance/{baseline.log,after-final.log}` and `screenshots/{before-world.png,after-world.png,after-lambadagrad.png}`.
- [ ] Remaining performance risk: city detail is still heavy (~19,980 SVG descendants) and post-interaction headless heap was ~278 MB; initial raster baking and general viewport culling need a separate measured slice. No claim of universal 60 FPS.

## Repeated game updates — 2026-11-14
- [x] Signed-in read-only reproduction found map mount invokes seed-city-parcels (writes) and reloads the entire map after success; metadata effect also depends on replaced player/user objects.
- [x] Removed map auto-seeding; metadata now depends on stable user ID/fallback name rather than replaced objects. Component regression and visual tests 4/4 passed; automatic build OK.
- [x] Signed-in JV72O7 at turn 7: zero idle requests during 15-second observation, zero seed/turn/refresh invocations, zero page errors; Map→Realm→Map retains visible terrain. All verification writes intercepted; no saved-game changes or publication.

## Parcel placement array error — 2026-11-14
- [x] Live trigger still assigns JSON recipe arrays directly to text[]; existing repair SQL is absent from the migration journal.
- [x] Reproduced weave_basic failure with the old trigger in isolated PostgreSQL; identical placement passes after repair. Related tests 11/11 passed twice.
- [x] Registered/applied existing repair verbatim as migration 0024; live explicit array conversion, session guards and all-recipes check verified. Preview build OK. No saved-game writes, turn/refresh or publication; gameplay retry not executed to preserve protected worlds.
- [x] Follow-up verifies both weave_basic and build_granary against registered migration 0024 (11/11 tests); live trigger still fixed, public auth preview nonblank with zero page errors. Protected gameplay not mutated.

## Production/trade flow diagnosis — 2026-11-14
- [x] Traced canonical production → stocks/reserves → demand → physical trade gates → freight paths → projections; basket endpoint is compatibility-only, not a second solver. No turn/refresh/command or game-data write.
- [x] JV72O7 turn 7: 85.428 output but only 0.2286 exported (one raw-timber shipment); 54.429 unmet = 35.634 source_empty + 18.785 route_unreachable. Ledger/committed/current projections agree at one flow.
- [x] All five player cities are connected by ten completed road segments. All five lack the same charcoal/peat/textile/tools/storage; none produces textile/tools/storage, while AI fuel stocks are disconnected. Fish use ~60% of recorded labour and ~30% spoils; uniform production/demand multipliers would preserve city symmetry and worsen waste or shortages.
- [x] User chose both sequentially: real specialization/missing producers first, then bounded volume calibration.
- [x] Implemented demand-aware urban labour caps for non-storable subsistence sources above local household need + existing reserveTurns; preserved declared jobs/capacity, output per worker, physical conservation, subsistence priority and protected saves.
- [x] Frozen JV72O7 turn-7 memory-only simulation: fish discard 12.550→7.459, water discard 6.469→2.468, flour/bread 0.068→0.110, unmet 54.429→53.768, conservation errors 0; export stays 0.2286, so no new trade is claimed.
- [x] Added canonical `perishable_demand_limited_jobs` to shared Economy/Dev labour diagnostics; full suite 926 passed / 3 skipped, automatic build OK; six affected functions deployed without running refresh/turn/gameplay.
- [ ] Next: specialize the existing mill city and grain neighbours in an isolated JV72O7 snapshot until a canonical raw_grain production_input shipment uses completed roads without reducing food coverage; only then test bounded volume coefficients.

## Visual Map Polish 2.0 — first verified slice, 2026-11-14
- [x] Audited Dashboard → WorldMapTab → IsometricSquareMap: raster terrain/vegetation plus SVG interaction and infrastructure; preserved square coordinates, 6×6 parcels, hitboxes and game data.
- [x] Reused existing painted assets with deterministic tree/hill/mountain scale and anchor variation, sparse forest variation and baked contact shadows; softened parcel tint contrast and deeply muted water through a cached filtered texture.
- [x] Narrowed road rendering, softened city/node foundations, subdued inactive province/ownership borders and idle microgrid; selected/active overlays remain prominent.
- [x] Same-session before/after capture at the same zoom; city selection, all 36 survey parcels, parcel selection and zoom verified with zero page errors and zero command dispatches. Targeted 39/39 and full suite 924 passed / 3 skipped; automatic preview build OK. No backend/schema/game-data changes or publish.
- [ ] Next visual slice: neighbour-aware coast/biome transition masks and additional hand-painted vegetation variants only if existing assets prove insufficient; no invented rivers, routes or geography.

## Phase C rural gameplay — 2026-11-14
- [ ] Activate one-step rural growth + conservative local city migration in atomic world phase; preserve all existing baselines.
- [ ] Separate cell-local rural workforce from urban workforce, and show canonical rural totals.
- [ ] Verify migration in isolated PostgreSQL, regressions and deploy safe functions; fingerprint TEST02 before/after.
- [ ] Deferred if budget exhausted: atomic founding + complete rural household purchasing-power integration.

## Integrační dokončovací průchod map-first — 2026-11-13
- [ ] Audit aktivní mapy → command-dispatch → fyzická produkce/doprava; zachovat existující systémy a data TEST02/JV72O7.
- [ ] Opravit prokázané chybějící články UI/server/DB bez nové paralelní ekonomiky a bez herního tahu.
- [ ] Doplnit cílené testy invariantů, spustit regresi a kontrolu typů; bezpečně nasadit dotčené funkce a UI.
- [ ] Zdokumentovat skutečné výsledky, nasazení a zbývající defekty; poměr 1 urban : 1 worked neměnit bez samostatného návrhu.

## HexNode audit + guild specialization continuation — 2026-11-10
- [x] Versioned code evidence in hexNodeAudit.ts (2026-11-10.2), 28 items: 17 implemented / 5 partial / 2 missing / 2 planned / 2 unverified. LIVE catalogue/session counts separate and unavailable errors explicit. Corrected causal links, planned grouping and Layer A capacity vs physical Layer B/fiscal aliases. No claim that reviewed items are live validated.
- [x] guildSpecialization.ts accrues actual canonical node producer diagnostics by good, owner/guild-role validated, max +2 experience/turn, 1% decay, per-node cap 100; existing progression thresholds 10/30/60/100. process-turn buffers scores, level and last-turn marker in existing apply_goods_fiscal_plan. Additive migration 0014 applied and column verified; no seeded scores or existing game row changes.
- [x] Tests include foreign/non-guild/generic/zero output, produced variant, cap/decay/thresholds/retry. PGlite integration runs real goods solver + actual SQL fiscal batch, verifies buffer has no writes before commit, rollback on failed batch, exactly-once score update and unchanged money/reserve.
- [x] Authoritative upgrade trace: no gameplay node upgrade_level command exists; initialized max_upgrade_level is not evidence of an active upgrade path. START_PROJECT now requires owned node/route targets and an existing realm before charging. UPGRADE_BUILDING now checks saved city owner, completed status, exact +1 progression, authoritative template maximum. No invented infrastructure ceiling or free bonusEffect buildings.
- [x] Strategic trace: turn faith/supply/tax/prestige consumers exist, but battle iron/obsidian and marble build deductions are absent; UI and turn-table percentages disagree. Documented missing rather than invented new balance. commercial_retention affects goods prestige; commercial_capture presence alone not extra income.
- [x] Final full vitest 826 passed / 3 skipped (829 total; 91 files passed / 1 skipped); targeted 10/10. Deno check process-turn and command-dispatch passed. Latest harness frontend build/typecheck build OK. Signed-in JV72O7 Dev → Infrastructure → Audit verified in browser; LIVE 40 goods/53 recipes/78 session baskets/0 session trade flows/0 guild nodes/0 accrual markers at time checked. User independently advanced this game to turn 2 during this slice; agent did not advance it or run any game mutation.
- [x] Deployed process-turn (source SHA256 e705ca4491cb099443909e51c9fec605e3626aa2f44fdb91b9be32f4c17e6498) and command-dispatch (3a9d4ca29f946e35359050ba0ce0d85687f0ec35a876d061862753ef85d1fe28). Safe empty-body requests reach both deployed functions and fail closed HTTP 400; no live producing guild exists, so hosted committed guild progression remains unverified. Frontend preview updated, not published.
- [x] Changed: AGENTS.md, roadmap.md, HexNodeMechanicsPanel.tsx, new AuditLiveEvidence.tsx + hexNodeAudit.ts, process-turn/index.ts, command-dispatch/index.ts, new guildSpecialization.ts + upgradeValidation.ts, migration 0014, regenerated types, four new test files. Observed implementation SHA 747abee28da985b8914670c7ac282df16f516a91; final docs automatically committed separately.
- [ ] Next precise verified slice: canonicalize UPGRADE_BUILDING costs/effects from saved/template level_data (still client supplied), isolate START_PROJECT completion ownership revalidation/concurrency, then test hosted guild creation→production→commit in a separate authorized scratch world. No node-role rewrite or forced guild creation in JV72O7.
- [ ] Guild diagnostics expansion in both secure Economy reports and full 20/200-turn chain remain deferred; node state is currently visible through read-only audit/editor, not a new canonical economy output.

## JV72O7 live rollout follow-up — 2026-11-10
- [x] Re-read actual Cloud state: session d379caff… is already version 1, turn 1, with 108 parcels and 24 owned; no reset or replay of founding claims required.
- [x] Fixed genuine diagnostic omission: already-applied dryRun returned empty success without checking anything. It now replays actual saved parcels and adapter opening; first step preserves adapter source depletion. Authenticated deployed dry-run: 108 parcels, unsafe=[], all 45 city/basket/step samples at 100% (five steps).
- [x] Authenticated dryRun=false returned already_applied=true (no migration/claims replay). Two complete refreshes returned ok=true, fiscal_unchanged=true, no warnings. All-session calendar, gold/reserve and parcel ownership/status hashes unchanged before/after (calendar 3f847107d2db374bea152a069bb5d87d; money 8381a6ff36a72dcfc53288ff57200d7e; parcels 58338a9ae2886fbd6844a8eee79f6637).
- [x] Actual persisted parcel production in Lambadagrad: timber 1.1834376824, wild seeds→raw_grain 1.5164016620, river water 1.4932373324, game 0.4182437111. Seven bounded river producers employ 9.7830738451 workers; total employment 48.56875 <= 50 in each city. AI2 produces stone 0.3980827419; Lambadagrad owns no rocky extraction parcels and correctly produces no stone (no invented supply).
- [x] Live food/water/fuel coverage 100% in all three cities, turn 1/version 1 retained; Player gold 100/reserve 50 unchanged (two other obsolete realm rows retain gold 375, not the active Player balance). Derived Player construction incoming 0.2115050949 points, not credited by refresh. Signed-in Economy browser shows wood stock 0.39, construction withdrawal 0.13, raw efficiency 0.20/raw points 0.03 and lumber points 0.19; screenshot inspected.
- [x] Tests: targeted 15/15; full suite 816 passed/3 skipped (819 total, 87 files passed/1 skipped); deno check backfill entrypoint passed after narrowing the adapter result. Automatic preview build/typecheck reports build OK. No manual frontend build/typecheck run (harness owns it).
- [x] Changed files: AGENTS.md, roadmap.md, supabase/functions/backfill-parcel-economy/index.ts, new supabase/functions/_shared/parcelPreflight.ts, new src/test/parcel-preflight.test.ts. Only changed edge entrypoint deployed successfully; submitted source SHA256 2c4fb5a123d34f532f47058360911c5f437545430aac4305c3282104e34686ed. Engine/parcel rules untouched; no new migration required; project code SHA observed after implementation: 7a3018156516e8bdd364c6dcc3120c36566a72db (final documentation may be auto-committed separately).
- [ ] Full process-turn/demographic 20/200-turn isolated acceptance remains outside this five-step dry-run; no live human turn authorized or executed. Next exact economy task: isolated full-chain 20-turn replay, not another rollout on JV72O7.
- [ ] Previous HexNode audit/guild slice remains deferred by this follow-up, not implemented or verified here.

## Parcel economy rollout — 2026-11-10 (current request)
- [x] Final addendum: raw timber 0.20 / stone 0.15 points per consumed unit; 25% residual, max 1 unit per 100 residents. goodsEconomy physical capex sink separate from construction_points; adapter + management aggregate points; migration 0012 validates points with legacy fallback. Projects/industry/trade settle before residual.
- [x] Code: canonical owned-parcel sources, bounded committed-ledger ecology and ordinary solver labour/physical ledgers (`parcelEconomy.ts`, economyAdapter).
- [x] Migration 0011: versioned rollout RPC snapshots cities/claims/resources/buildings and applies seats transactionally; admin-only endpoint, anonymous live request 401.
- [x] LIVE JV72O7 applied: root cause was lazy citySeat plots land_use=open (previously excluded), and four-plot footprints instead of preview's eight. Open plots now recognized; migration 0013 snapshots and completes eight founding plots on unowned home land only, preserving original paid claims. 108 physical parcels, 24 owned plots, version 1, calendar still turn 1. Actual five-turn preflight all three cities food/water/fuel 100%.
- [x] Construction hand processing uses real saw_timber/cut_stone/burn_charcoal BOM and staff. Limited raw construction is a separate physical sink with lower point efficiency, not an extra copy of material. Legacy source nodes and synthetic starter extraction suppressed only in versioned mode; real buildings retained.
- [x] Shared Economy/Dev parcel provenance table through PARCEL_FIELDS; map potential readout added. Actual map collection drilldown not yet verified; no frontend publish.
- [x] Tests actually run: 814 passed / 3 skipped with maxWorkers=2 (817 total). New raw-construction tests cover no processors, lower efficiency, project priority, physical/lot conservation and both reports. raw-construction-commit runs real SQL fiscal function in isolated PGlite PostgreSQL: mismatch rejected, positive accrual once, committed retry false, gold unchanged. Actual-geography 20-turn frozen solver fixture included, NOT full process-turn/demographic replay.
- [x] Deployed backfill-parcel-economy, refresh-economy, process-turn, commit-turn, compute-trade-flows, economy-dev-snapshot, create-world-bootstrap, world-generate-init; preview-economy deployed earlier. Latest automatic preview check build OK. No independent manual typecheck/build run.
- [x] Live acceptance: snapshot-backed rollout succeeded, two complete refresh-economy calls ok/fiscal_unchanged=true. DB snapshot comparisons: every realm gold and production reserve unchanged. Lambadagrad derived incoming 0.211505 points, stock 50; signed-in browser Economy table shows raw wood stock 0.39 / physical construction withdrawal 0.13 / efficiency 0.20 / raw points 0.03 plus processed lumber points 0.19. Screenshot inspected. Automatic build/typecheck build OK after fixing test snapshot optional-node typing.
- [ ] Next exact task: full isolated 20/200-turn world+fiscal+demographic replay for versioned parcels; not executed on JV72O7 (no human turn authorized). Map actual collection drilldown and Dev browser screen remain to verify. Frontend not published.
- [ ] Rural workers remain P2; no reset, human turn or automatic foreign routes.

## Economy 2.0 completion phases (ordered; each depends on the previous)
1. Producer cash & wages — [x] settlement, arrears, retained, persistent cash stock; [x] household ownership income settled from producer cash (settled_ownership_income; spent via capital_income since 2026-10-16); [x] (2026-10-16) capital_income uses settled ownership_income_paid when recorded (basis capital_income_basis, proxy fallback for legacy settlements; due = ownership_income_claim to avoid feedback) — was: replace GDP-proxy capital_income in purchasing power (needs balancing); [x] (2026-10-16) calibration: ownership due = localCapitalShare × real after-wage profit in cash units (fixed double incomeUnitFactor), settled_income_coverage reported in both views; [ ] tune wage.base so typical coverage ≈ 1 (needs TEST02 turn data); [x] (2026-10-16) household_income_basis 'settled_when_available' (wages + ownership settled, per-city proxy fallback) — was: switch household_income_basis to settled
2. [x] (2026-10-16) micro wood/peat sites join parent spurs (economyAdapter attach adds spur cells to transport, larger catchments first) — fixes missing_local_delivery_route for 4/6 TEST02 timber/peat nodes; burn_charcoal still needs an Uhlířství built (none on TEST02). [x] (2026-10-16) bake_staples staged fuel: peat OR charcoal (C operating, fallback 0.8 open hearth; only physical stock consumed; diagnostics[].fuel → margin.fuel_coverage/fuel_lost_output in both views; DB row + migration 20261016201500). [ ] raise fallback strictness once ≥50 % of bakery cities have fuel; [x] (2026-10-16) fuel guidance: _shared/fuelGuidance.ts (read-only from diagnostics[].fuel) → ledger.fuelGuidance → owner report fuel_guidance + alert, Dev snapshot fuel_guidance, shared FuelGuidancePanel; AI chooseFuelBuild queues a validated BUILD_BUILDING (charcoal if own timber else peat), 'rejected:' outcomes now count as failures. Reachable A/B/C BOM chains — [ ] fuel sources (peat/charcoal) before fuel-gating bread; [x] class-B durable tools import across canonical routes, retain unworn capital stock between turns; test factor-imports.test.ts (GitHub PR #7), pending live deployment/TEST02; [ ] typed ores/clay/water + stocks
3. Prices & trade — [x] FIFO lots/origin, eligible-lot landed ranking; [ ] input-cost pass-through; [ ] quality 0–100 migration; [ ] competitive trade
4. GDP & capital — [ ] nominal/real value added reconciliation, depreciation, producer taxes, household wealth (no legacy ledgers)
5. AI & map — [x] AI builds validated + refusal reported; [x] construction retry idempotent; [ ] deterministic AI trade/construction planning
6. UI & acceptance — [ ] canonical Economy/Dev cleanup of dead layers; [ ] 20/200-turn simulations; [ ] TEST02 acceptance

## Starter collapse fix (JV72O7, 2026-11-10)
- [x] Labour pass: food+water then fuel minimum staffed first inside each sector, up to household need; mobility kept; diagnostics critical_priority_employed (test subsistence-labor-priority.test.ts)
- [x] AUTO: essential lines keep a bounded floor even when a profitable rival exists; still 0 without inputs
- [x] Food: 5–15 % deficit = rationing (-1 stability, no deaths); famine from 15 %
- [x] Starter: Osadní sklad = storage_capacity service (no lumber recipe); new Osadní sběr paliva (cut_peat) except desert; opt-in upgradeStorage in backfill-starter-economy
- [x] JV72O7 t3 repaired + derived refresh: Lambadagrad food 100 %, water 100 %, fuel 51 %; turn/gold/pop/t2 ledger unchanged
- [ ] One-time storable bootstrap stock (raw_grain/peat) at founding — not started
- [ ] Start-site suitability check (water+food) in findStartPositions — not started
- [ ] Start connectivity: JV72O7 trade systems link 1/3 cities, routes_used 0 (P1)
- [ ] Node jobs vs real rural workforce (P2; node jobs kept as declared)
- [ ] Clothing/fuel slow modifiers, tools as operational-only audit; Economy/Dev UI field for priority staffing
- [ ] 5/20/200-turn full-world starter simulations per biome
- [ ] backfill-starter-economy has no caller authorization — add admin check

## Current Economy 2.0 slice
- [x] Expose existing producer A/B/C costs and imputed labour in both views through the shared field contract
- [x] Verify canonical projection regressions, tests/typecheck (589 total, 586 passed / 3 skipped)
- [x] Echo committed wage arrears and producer retained cash into city accounts (both views)
- [ ] Live TEST02 verification of Economy + Dev views (needs signed-in session)
- [x] Persistent producer cash stock per city (wage_settlement producer_cash_opening/closing; arrears payable from stock; shown as "Hotovost výrobců (zásoba)" in both views)
- [x] Ownership income payout at turn close: paid from producer cash AFTER wages, unpaid profit stays in cash (not arrears); surfaced as "Vyplacený podíl na zisku (uzávěrka)" in both views; treasury untouched; basis settled_reported
- [ ] Capital income from producer_retained instead of GDP proxy (needs balancing)
- [ ] C fuel for bakery once peat/charcoal supply exists
- [x] Road/local infrastructure progress idempotent on turn retry (last_progress_turn guard, migration 0005, test construction-retry.test.ts)
- [x] AI build result reflects command-dispatch refusal ("rejected: …"), test ai-build-outcome.test.ts

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

## Ekonomika: kalibrace příjmů a cen (hotovo, Test02 tah 10)
- Příjem domácností používá globální incomeUnitFactor, nikoli místní CPI; inflace proto snižuje reálnou kupní sílu.
- Kalibrované rozdělení: podíl práce 0.65, místní kapitál 0.6, spotřeba 0.95 (jediný zdroj: PRODUCT_MARKET).
- Nové výstupy: nominal_gdp, price_level; UI Městské účty ukazuje rozpad.
- AUTO podle minulých committed cen a landed marže je zapojené. Odloženo: soukromé bohatství a rozšíření katalogu.

## Layer A/B/C pass (otevřeno)
- [x] total_gdp = goods value added + trade-service value added (bez dvojího exportu), export jako samostatná obchodní metrika
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
- [x] Fáze A residue: bojové ztráty drží total == součet vrstev
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
  - fieldBattle: taktické kolo je deterministické z ID bitvy a kola, klientský seed ignorován
  - pracovní místa přeškálována na hlavy (ECONOMY.workersPerLaborUnit = 40), Test01 populace srovnána s bytovou kapacitou
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


## Testovací hra Test02 (hotovo, tah 1)
- [x] Nová session TEST02 (31×31, 13 osad, 76 uzlů, 3 AI frakce) s kompletním bootstrapem
- [x] `world-generate-init` na konci volá `ensureStarterEconomy` — osady z narativní fáze už nevznikají bez ekonomiky
- [x] Startovní ekonomika se dimenzuje podle populace (výroba ~1 jednotka na 150 lidí, posádka uvnitř vlastní pracovní síly)
- [x] `backfill-starter-economy` dorovná velikost jen u staveb, které sám vytvořil (hráčovy stavby nikdy nemění)
- [x] Test02: pitná voda 87 %, základní potraviny 63 % (zbytek se řeší stavěním, ne přepočtem)

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


## Economy pass: produkty, kupní síla (hotovo – základ, tah 10)
- [x] Koš → podkoš → produkt, volba produktu, rozmanitost, městské účty, marže výrobce
- [x] Automatické rozdělení výroby podle marže (AUTO objednávky) — zapojené, používá minulý committed tah
- [ ] Soukromé bohatství domácností (zásoba) — odloženo, chybí rozumná startovní kalibrace
- [ ] Kalibrace příjmů vs. cen základního koše (dnes všude mezera dostupnosti)
- [ ] Nové produkty (další druhy chleba atd.) — vyžadují řádky zboží a receptů

## Economy closure pass (hotovo)
- [x] Landed input cost sourcing, AUTO podle marže, marže/ztráta v přehledu výroby
- [x] Obchodní služby v HDP, prosperita, Bohatství města (city_capital_stock), nový TRADE_BOOM
- [x] Rýže, nástroje, zdrojové recepty, řemeslná kvalita, serverová validace staveb
- [ ] Odloženo: režie práce v marži. Landed vstupy již ovlivňují marži; intermediate_value pro HDP zůstává v základních cenách.


## Účetní a provozní uzavření (27. 9. 2026)
- [x] Pokladna: úplný rozpis smluvního obchodu, prestiže, nákladů cest, mýtného, insolvency floor a zaokrouhlení.
- [x] HDP služeb: fyzické množství v katalogových cenách; nominální turnover zůstává obchodní metrikou.
- [x] Deník potvrzených fází; kalendář až po committed ledgeru; atomické world projekce, fiskální efekty a údržba cest.
- [x] Bezpečný ekonomický retry bez opakování fyzických/AI účinků, vzájemné vyloučení refresh/turn.
- [ ] Plně automatická obnova nejasně přerušených externích bojových a AI operací před fyzickým checkpointem. Dosud fail-closed, nikoli automatické přeskočení.
- [ ] Content pass: úplná taxonomie podkošů, kalibrace functional_value, regionální preference, více produktů.
- [ ] Převod legacy smluv na fyzicky krytý obchod; nyní oddělená peněžní položka.
- [ ] Soukromý majetek domácností až po ověření účetních invariantů a dlouhodobé kalibraci.

Aktuální autorita: docs/architecture/economy-contract.md. Údaje o konkrétních tazích výše jsou historické milníky, nikoli současná diagnostika Test02.

## P0 jídlo/farma/kalibrace (řez z tohoto kola; TEST02 netknut, tah 25)
- [x] `scaledBasketOutputs` (UI) používá kanonický `[1,2,4,8,16]` místo lineárního násobku úrovně — žádné dvojí násobení
- [x] Výživová ekvivalence: `foodReserve` v goodsEconomy počítá ve functional-value jednotkách; kritická potřeba se substituuje nutrition-only — preference nekrade kalorie (test economy-chain-closure přepsán na nové pravidlo)
- [x] Startovní ekonomika zmrazena při založení: `ensureStarterEconomy` existující startovní stavby nikdy nezvětšuje (růst = investice, ne free produkce)
- [x] Posádky startovních staveb per kontrakt (farma/rybolov 100/unit, studna/sklad 25/unit, strop 30 % pop); studna 3 jednotky vody/unit — nová osada se uživí a napojí vlastní silou (měřeno 100–4000 obyv.)
- [x] BuildingDetailSheet: reálná výroba per good z management reportu, food-equivalent, odhad uživených lidí z lokální poptávky, faktory obsazenost/stabilita/nástroje/logistika; legacy +8 obilí / food_income skryto
- [x] Testy: src/test/food-security-calibration.test.ts (level scale, 7/14/28, AUTO/LOCK budget, grain-only dieta, foodReserve, starter freeze); celá suite 631 passed / 3 skipped; tsgo čistý
- [x] DB kalibrace farmy 5→7 APLIKOVÁNA (uživatel schválil): template `784256c5` (effects + level_data L1–3) a 10 instancí v TEST02 (5× Farma L1, 5× Královské panství L3); guarded update (basket=5 ∧ recipe harvest_wheat ∧ ¬starter_economy ∧ jméno ve farmní rodině) — pekárny/mlýny/kuchyně a startovní stavby nedotčeny, idempotentní (opakovaný běh = 0 řádků)
- [x] TEST02 refresh po kalibraci (tah 25, resolving_turn NULL, fiskál byte-identický): Lachimská Pole raw_grain produkce 77.7→80.2, pokrytí 100 %; NOVĚ reálný tok raw_grain 1.53 Pole→Háj po silnici (transport cost 1.60, trade_flows i basket_trade_flows > 0) — obchod na kladném přebytku prokázán
- [x] Královské panství L3 kapacita 28 = 7×4 ([1,2,4,8,16], bez dvojího násobení) — ověřeno v management reportu
- [ ] Startovní hospodářství 140→~63 ZÁMĚRNĚ ponechána (dry-run: při demand ~76 by přepis způsobil hladomor; nové hodnoty rybářství 42→56–133 by byly zdarma vyšší produkce) — sjednocení až s funkčním obchodem; legacy označeno
- [ ] P0 zbytek: baked_staples produkce 0 všude (pekárny bez mouky — palivo/nástroje), unmet raw_meat v Háji/Brodu/gradu

- [ ] Operational deploy PR #5 (3 migrations + 13 functions)
- [ ] AI cost & architecture optimization pass

## P0 trade/loss diagnostics (2026-10-20)
- [ ] LIVE t26 follow-up (2026-10-20 22:22 UTC): current source HEAD `704dbdd71a687dbb8e9afe5759c0c335f27fcb21`; SELECT independently confirmed TEST02 current_turn=26, resolving_turn=NULL. Subsequent baseline SELECT timed out and own-account auth mint failed with pooler unavailable. Stopped after these two failed operations: no refresh, mutations, migration, turn call, deployment or publishing. Baseline hashes/committed status, mill B-input blocker and numeric before/after could not be verified; user-supplied production figures are not independently confirmed. Latest report RPC migration `20260920212601` allows republishing derived reports at committed turns while preserving committed history; this source inspection does not establish the live installed definition. Full Vitest actually rerun: 655 PASS / 3 skipped / 0 FAIL (61 files passed, 1 skipped); automatic preview check 22:25:12 UTC build OK, no manual typecheck/build. Only roadmap changed. Next exact task: obtain a small invariant snapshot plus installed RPC definitions and mill diagnostics, then one authorized derived refresh only if safe; compare t26 food baskets and industrial input flows. Starters stay 140.
- [x] Industrial input slice: adapter E2E raw_grain → remote mill → remote bakery in AUTO/LOCK; active A-BOM planned/local/imported/received/used/unmet + supplier/landed cost/blocker in goodsEconomy.industrialInputs, mapped contract and shared IndustrialInputsPanel. No extra physical demand channel or fiscal write.
- [x] AUTO recognizes frozen opening stock as expected local supply; staged C fallback is not a mandatory availability gate. Existing remote A/B sourcing preserved. Files: goodsEconomy.ts, economyAdapter.ts, management.ts, economy-dev-snapshot/build.ts + index.ts, economyFieldContract.ts, economyDevSnapshot.ts, PhysicalEconomyPanel.tsx, EconomyDevPanel.tsx, new IndustrialInputsPanel.tsx and industrial-input-trade.test.ts, economy-field-contract.test.ts, AGENTS.md.
- [x] Tests actually run: 11 adapter acceptance scenarios + field contract; full suite 655 passed / 3 skipped / 0 failed; automated preview TypeScript/build check latest entry 2026-10-20T19:23:09Z = build OK (no manual typecheck/build). Repeated projections and carried B stock covered. No stateful git command used; latest inspected code SHA 5ff4e6e3da4163f22903c4e912bd4bb3469af633 (roadmap update subsequently auto-versioned).
- [x] Deployed refresh-economy, compute-trade-flows, process-turn, commit-turn, economy-dev-snapshot. UI publish requested (scheduled, not confirmed live); publisher reports 126 existing unresolved critical findings, not changed by this slice.
- Acceptance simulation (NOT TEST02): AUTO and LOCK each A grain produced=60/exported=44.7; B planned=30/local≈0/imported=39.2/received=30/used=30/unmet=0/flour=20; landed grain unit cost=1.3486; mill material margin_ratio=0.52973; road ab total load=52.7/100; B derived grain price=1.99929. Acquisition includes 9.2 grain retained for B subsistence, so imported deliberately exceeds mill use. Road capacity 4 limits production; absent supplier/disconnection/expensive route/war/reserve yield no phantom output and unmet diagnostics.
- [ ] BLOCKED live TEST02: two database health/read attempts total this task (including pre-compaction check), unavailable. No third check, no refresh, no process-turn, no migration or starter edit. Turn 25 is LAST VERIFIED, not freshly verified. Authenticated UI not verified: browser only reached /auth identity-loading screen. Next exact task: when database recovers, capture TEST02 invariant snapshot and mill/bakery reports, invoke derived-only refresh once, compare real production_input flows and basket coverage without advancing calendar.
- [ ] Remaining limits: zero-allocation AUTO recipes omitted from active-demand diagnostics; provisional dependency availability cycles need separate hardening. Refusal fallback groups landed cost/partial supply rather than proving a unique cause. Local availability is per-producer observational (not a summable city inventory); live price/bakery/famine acceptance, multi-origin acquisition drilldown and 200-turn balancing remain unverified.
- DONE: goodsEconomy loss decomposition (lost_decay/lost_transport/lost_discard, sum = lost_spoilage) + importBlockers (trade refusal reasons) + deterministic test src/test/goods-trade-diagnostics.test.ts (8/8).
- DONE: management.ts exposes import_blockers; economy-dev-snapshot build.ts aggregates decomposition; both views (PhysicalEconomyPanel, EconomyDevPanel) render decomposition + blockers; contract exemption documented.
- DONE: suite 639 passed / 3 skipped; tsgo clean; build OK; deployed refresh-economy, process-turn, economy-dev-snapshot, commit-turn.
- OPEN (blocker): TEST02 refresh NOT applied — compute-trade-flows step times out with DB statement timeout (57014) twice; afterwards the DB pooler became unavailable (project paused/waking). Turn 25 untouched, fiscal_unchanged=true. Next: retry refresh when DB is healthy; if timeout persists, profile computeCanonicalEconomy queries.
- NOT DONE: baked_staples=0 root-cause fix (documented: no fuel coverage/mills), starter farm 140→frozen migration (deferred until trade robust).

## P0 — Comercio subsistencia por sustitutos (2026-10)
- [x] goodsEconomy: importación de sustitutos nutritivos para bienes critical_need (staple_food) con asiento inmediato por ciudad (evita re-exportación del grano importado).
- [x] Tests: 4 escenarios nuevos en goods-trade-diagnostics.test.ts (conectado, desconectado, reserva, determinismo). Suite 643 pass / 3 skip, tsgo OK.
- [x] Deploy: refresh-economy, process-turn, compute-trade-flows, economy-dev-snapshot, commit-turn.
- [ ] BLOQUEADO: refresh de TEST02 no ejecutado — auth gateway responde 522/expired session y `lovable auth-session` falla con pooler no disponible (cloud_status reporta healthy). Reintentar refresh-economy en cuanto el gateway responda; turno 25 intacto, ledgers committed sin tocar.
- [ ] Pendiente P0: diagnóstico baked_staples=0 en TEST02 (mlín/herramientas/combustible), migración starter 140→frozen (diferida hasta comercio robusto).

## FÁZE 0 — dokončení existující ekonomiky (2026-11-10)
- DONE/TESTED: všechny-receptury test (catalog-chains) — příčina selhání: (a) fixture: dodavatel s_<good> dimenzovaný podle prvního odběratele, lineární řetěz 50+ měst (raw_stone 18 skoků), plánovaná poptávka bez B faktoru → globální nedostatek flour/iron_ingot/leather/stone_blocks/wine/textile; (b) DEFEKT diagnostiky: mlýn označen „landed_cost“ i když ho omezovaly nástroje (B); vyprodaný dodavatel hlášen jako missing_supplier; importBlockers uváděly prázdný zdroj (s_yarn). Opraveno: b_factor_limited, supply_exhausted, landed_cost_cap, beyond_reach pro tovární vstupy; test nyní vyžaduje konkrétní důvod u každého nedostatku.
- DONE/TESTED: DEFEKT strážce fyzického deníku — ztráta při dopravě z odloučeného místa výroby (ne obchodní tok) blokovala refresh TEST02 (raw_grain 0.00827). Nové pole lost_site_delivery (podmnožina lost_transport) + regresní test.
- DONE (LIVE): TEST02 t26 derived refresh OK, fiscal_unchanged, tah 26/NULL, zlato, populace 84002, committed hashe t24–26 a 90 budov beze změny. Brod pekárna reálně dováží mouku 1.92.
- OPEN P0: Lachimgrad Vodní mlýn — raw_grain landed_cost_cap (dovoz > 4× zákl. ceny); Háj Velké mlýny planned 0 (nulový potenciál – pravděpodobně bez pracovníků, neověřeno); Pole pekárny bez mouky (vlastní mlýny ji spotřebují/vyvezou).
- OPEN P1 (neprovedeno tento běh): audit mzdy→výplata→příjem domácností, rozpočet/cla/HDP — jen existující testy (wage-settlement, treasury-reconciliation, ownership), žádná nová kontrola.
- TESTED (rozsah!): 20/200 tahů pouze fyzická konzervace (economy-long-horizon-ledger), NE ekonomická uzávěrka cen/mezd.
- DEFERRED (mikroekonomie): cenotvorba z marží, identita firem, konkurence, monopoly, férové dělení vzácného vstupu mezi odběratele (dnes greedy pořadí).

## 2026-11-10 — P0 local mill→bakery priority (done)
- Defect (live TEST02 t26 proof): Lachimská Pole flour produced 2.76, all exported to Lachimův Brod (production_input), Pole's 3 bakeries used 0 and were labelled missing_supplier. Cause: goodsEconomy sourcing reserve ignored the source city's own pending processors; producers ordered by id, so Brod's bakeries drew first.
- Fix: goodsEconomy.ts reserves source's pending local industrial need (planned−used) before production_input export; supply_exhausted now also counts own-city output.
- Tests: industrial-input-trade.test.ts +3 (1-city, 2-city local priority — failed on 22e40cbe, pass now; scarcity). Suite 733 pass / 3 skip; tsgo clean.
- Live TEST02 (t27, derived refresh, invariants identical): Pole bakeries use 3.47+0.16+0.99 flour, baked_staples 3.56 (was 0).
- Open P0 (diagnosed only): Háj Velké mlýny + Lachimgrad Vodní mlýn → blocked landed_cost_cap, but code path also fires when haul value ≤ transport (label conflates two reasons; t26 Háj planned 0 was stability factor 0 in snapshot). Jewelry ore: the only mine is in Háj; ore used by Háj smelter → supply_exhausted. Brod bakeries now flour-starved (Pole keeps its flour).
- Next: split landed_cost_cap into haul_exceeds_value vs landed_cap with test.

## Slice 2026-11-10 — split factory-import refusal reasons
- DONE/TESTED: `goodsEconomy.transfer` production_input guard emitted `landed_cost_cap` for two different formulas. Now `haul_exceeds_value` (delivered value after loss/tolls/tariff ≤ freight) vs `landed_cost_cap` (landed > 4× base). Formulas unchanged. Test `src/test/input-refusal-split.test.ts` (cheap haul imports, friction 12 → haul_exceeds_value + 0 shipped + conservation, deterministic rerun); on old code it would report landed_cost_cap. Label added to IndustrialInputsPanel.
- Verified: vitest 736 passed / 3 skipped; tsgo clean; deno check refresh-economy + process-turn clean; vite build OK. Deployed refresh-economy, process-turn, commit-turn, economy-dev-snapshot.
- TEST02 t27 (read-only, stored ledger computed by old code): flour planned Brod 5.43, Háj 2.86, Pole 4.79, Grad 0.54 ≈ 13.6; only Pole mills produce flour (grain used 2×1.11 of planned 1.85). Brod = supply_exhausted → legitimate regional flour shortage, not reservation/ordering bug. Háj 2×6.10 + Grad 3.49 grain blocked under the conflated label; true reason visible after next derived refresh.
- BLOCKED: derived refresh not run — refresh-economy needs a signed-in member (401); no snapshot changes made. Invariants t27: turn 27, resolving NULL, gold 1,005,472, pop 85,098, buildings 94, history hash 2546a8f1….
- OPEN (gameplay/balance, not bug): more flour needs grain reaching Háj/Grad mills (cheaper road/closer farms) or more Pole mills/farms. Unverified: why Pole mills used only 60 % of planned grain.
- NEXT: P1 money audit (wage rates → payroll → settlement → household income; producer cash/ownership vs treasury/GDP/tariffs).

## World creation settings (2026-11-10)
- DONE/TESTED: wizard box "Nastavení světa" (opponents, AI difficulty, starting cities, starting wealth; advanced: river amount/length, neutral towns, realm distance) → create-world-bootstrap → map/neutral/init; preview draws rivers. Test src/test/world-game-settings.test.ts. Not yet verified by creating a real world.

## Starter-economy collapse (JV72O7) — status 2026-11-10
- DONE/TESTED/DEPLOYED: subsistence labour priority, AUTO essential floor, storage service, starter peat, rationing vs famine.
- DONE/TESTED/DEPLOYED: backfill-starter-economy is admin/service-only (anon 401, member/outsider 403, dry-run included); live anon call returns 401.
- DONE/TESTED/DEPLOYED: one-time storable starter reserve (raw_grain + peat ≈2.5 turns) on NEW founding storehouses, read once in the adapter first-adoption opening (provenance starter_reserve). Existing saves (JV72O7) never get it.
- DONE/TESTED/DEPLOYED: start positions require water (river/lake neighbour or coast) and food land; unsuitable candidates replaced by habitable ones.
- FINDING: JV72O7 has 0 road_segments and province_routes only inside each realm → capitals legitimately unconnected (route_unreachable). No teleport fix.
- OPEN: starter inter-capital connectivity for NEW worlds (bootstrap trail/road between neighbouring capitals, physical path + capacity) — design decision needed.
- OPEN: Lambadagrad fuel 51 % caused by stability 43 — trace stability drivers (water band penalty history, rationing) before tuning.
- OPEN: clothing/fuel slow modifiers; tools as operational need only.
- OPEN: Economy/Dev UI for critical_priority_employed, rationing, starter_reserve provenance (+ economyFieldContract mapping).
- OPEN: full-world bootstrap fixture across biomes, player+AI, 5/20/200-turn simulations.
- OPEN: rural workforce model for nodes (declared jobs unchanged until then).
- DONE/TESTED/DEPLOYED (slice 4): fuel/clothing shortage is slow (needStabilityDrift: max −1/turn, floor 40); food/water keep hard bands; tools never move stability.
- DONE/TESTED/DEPLOYED (slice 4): shared SubsistencePanel in Economy tab + Dev Mode: LABOR_FIELDS (incl. critical_priority_employed), food status ok/rationing/famine from the process-turn helper, per-producer limiting cause from diagnostics.
- DONE/TESTED (slice 4): acceptance sims — 5 biomes × player+AI × 20 turns, idempotence, crop-failure famine, timber→lumber→granary connected vs disconnected.
- NOTE: slice-3 commits (reserve, habitable start, auth policy/tests, roadmap) were missing from the branch after a parallel push and were restored in slice 4.
- OPEN (P2, deliberately not started): rural-population labour for nodes — needs SSOT identity (hex_population vs cities) and workforce conservation proof first.
- OPEN: 200-turn deterministic sim of the starter fixture; starter inter-capital connectivity for new worlds (needs decision).

## Long-horizon slice (2026-11-10)
- [x] 200-turn harness `src/test/long-horizon-economy.test.ts` (real solver, growth, stocks, paid/staffed investment, KPIs at 5/20/67/200, no-investment stagnation, flood/crop shock famine + recovery).
- [x] Proven late-save cause (TEST01 t67, TEST02 t27, read-only): cities grew to 2–10k while jobs stayed 400–900 (thousands idle) and only 4/12 primary buildings existed; blockers mostly `source_empty`. Fix: `_shared/subsistenceBuild.ts` deterministic AI farm/well/peat build (deployed in ai-faction-turn).
- [x] commit-turn growth now gated by canonical post-trade staple_food/drinking_water satisfaction (`physics.subsistenceGrowthFactor`); starving cities do not attract migrants. TEST01 (food ≤46 %, water ≤26 %) → zero growth next turns.
- [x] Player guidance `build_guidance` in management report + SubsistencePanel (player builds manually).
- [ ] Panel guidance not yet visually checked in preview; production publish left to host action.
- [ ] Optional capital-to-capital footpath at world creation — not done (strategy-changing; needs user decision).
- [ ] P2 rural workers: not implemented. Harness shows no systemic starvation without it (idle urban labour is abundant); bottleneck is missing primary buildings, not workers.

## Security RLS slice (2026-11-10)
- [x] 48 tables: member FOR ALL → member SELECT + owner-scoped writes (drizzle 0007); server_config/economy_overrides admin-write (0008). Verified non-admin cannot update/delete foreign city/region/buildings/battle lobby; own city still writable.
- [ ] 20 tables still member-writable without owner column: game_events (canon log — highest residual risk), entity_traits, chronicle_entries, world_events, world_feed_items, world_memories, world_history_chapters, wiki_entries, city_states, diplomacy_rooms, flow_paths, import_sources, intelligence_reports, league_players, simulation_log, trade_log, city_rumors, encyclopedia_images, map_gen_feedback, world_foundations → move client writes to command-dispatch, then make SELECT-only.
- [ ] No new publish until game_events client writes are removed.

## Strict starter slice (2026-11-10)
- [x] Strict KPI test (food/water 100 %, fuel ≥80 %, 5 turns, player+5 nodes & AI, 3 biomes); desert/arid start now invalid (no biome-legal fuel).
- [x] Critical cross-sector retraining (goodsEconomy pass 2b); frozen JV72O7 t3 fixture: Lambadagrad fuel 0.51 → 0.80, food/water 100 %.
- [x] game_events owner-scoped writes + server-type guard trigger (0009).
- [ ] JV72O7 sees the fuel fix on its next refresh/turn; no stored data changed.
- [ ] Fuel above 80 % needs the tier share raised or more peat capacity — balancing decision.
- [ ] 18 low-risk narrative tables still member-writable (wiki, chronicle, feed, logs).

## JV72O7 reset (2026-11-10, archive-and-replace)
- [x] create-world-bootstrap now authorizes the caller (creator/member/admin/service); anon → 401
- [x] Old game kept intact under room code JV7OLD (id e62622b3…, turn 3); nothing deleted
- [x] New JV72O7 (id f6c240d0-bc30-49fc-aa28-526bfe7dd4f9) generated via create-world-bootstrap with the same spec seed/settings/identity/AI; turn 1, ready
- [x] Turn 1: all 3 capitals food/water/fuel 100 %, no famine, 50 workers/75 jobs, starter grain 2.5 + peat 1.5 once; double derived refresh idempotent
- [ ] Frontend publish blocked by remaining error-level security scan findings (e.g. league_teams)
- [x] River water + hunting: draw_river_water (river only, never sea) replaces the starter well; small non-scaling hunt_game in wild biomes; tests in starter-geography.test.ts; JV72O7 regenerated (id d379caff…), previous turn-1 copy kept as JV7OL2

## 2026-11-11 slice
- [x] B: JV72O7 reserve audit — Player 50→15.038 = Tkalcovna (20 wood+10 stone+5 iron=35) + 0.038 committed raw capex; AI1 50→0.041 = Kasárny (25+15+10=50) + 0.041. No accounting bug. Regression: src/test/jv72o7-reserve-audit.test.ts. total_production (37) is Layer A capacity, not physical output; wood_reserve/stone_reserve (10/5) are legacy, not canonical goods.
- [ ] A: isolated cloned-world 20/200-turn harness through real process-turn (not started; needs scratch session clone tooling).
- [ ] C: per-parcel map drilldown with realized producer output (parcel:uuid:recipe) vs potential.
- [ ] D: HUD check that legacy wood_reserve is not shown as canonical stock.
- [x] D/HUD: tiny gains shown (+0.038), tooltip lists raw timber 0.2 / raw stone 0.15, capacity labelled potential (src/lib/hudFormat.ts).
- [x] C (partial): map plot shows committed realized output per parcel producer, staff, remaining resource, reason for 0; square summary splits owned realized vs unclaimed potential (src/lib/parcelActual.ts). Visual check of plot panel pending.
- [x] AI capital trap: `_shared/aiBuildBudget.ts` defers non-essential builds (e.g. Kasárny 50) when no farm/well/sawmill is owned and real accrual cannot refund the cheapest essential within 10 turns; wired in ai-faction-turn before command-dispatch; deployed. Test ai-build-runway.test.ts (reserve-trajectory scenario, not full process-turn).
- [ ] Full cloned-world 20/200-turn harness through process-turn (PGlite) — still open.
- [x] Runway guard ignores starter_economy buildings; deferred non-essential build dispatches affordable Farma/Pila same turn (deployed). Limitation: reserve illustration holds accrual constant; full solver long-run still open.
- [x] UPGRADE_BUILDING authoritative quote (`quoteBuildingUpgrade`): template base × level cost_mult, template name/effects, legacy fail-closed, no client wonder flag, level CAS + funds CAS with rollback; deployed. Test upgrade-quote.test.ts.
- [x] Strategic iron/obsidian multipliers in tactical fieldBattleCommand + fieldBattle casualties (shared tier module).
- [ ] Marble build-cost discount in BUILD/UPGRADE — not started.
- [x] Stitched 20/200-turn parcel world simulator (src/test/parcel-world-longrun.test.ts): real parcel ecology, goods solver, growth, runway chooser, live catalogue. Excludes battles, LLM AI, wage/tax SQL, route rebuild.
- [ ] BALANCE BLOCKER (measured, not tuned): AI1 construction points fall to 0 by t20 (raw timber diverted to fuel, no stone parcel) → stuck at food 23 %/fuel 23 % from t50. Lambadagrad food 60 % at pop 673 even with one farm (capacity 7). Fuel falls below 50 % in all cities by t20. Needs owner decision: cheaper first farm / higher raw efficiency / fuel source — no constant changed without approval.
- [ ] Invested scenario stops after first farm: once a real farm is owned the chooser no longer proposes further essentials (needs a growth-driven next-investment rule).
- [x] Strategic iron/obsidian combat + marble build discount via _shared/strategicEffects.ts (unit-tested, not live battle tested)
- [ ] Client build/upgrade cost previews should show marble-discounted quote

## 2026-11-12 stabilization
- [x] package-lock.json regenerated (pglite, lovable vite plugins were missing) — `npm ci` passes.
- [x] Build/upgrade/district payments use `_shared/reserveLedger.ts` (delta CAS + retry); refunds add back cost instead of restoring a stale absolute balance (could erase concurrent turn credits); district build had no CAS at all. Test src/test/reserve-ledger.test.ts. NOT deployed (awaiting authorization).
- [x] dispatchCommand never throws (network/empty reply → error message).
- [ ] Deploy command-dispatch after authorization; verify a real build in a scratch world.
- [ ] Early-game viability decision (cheaper farm / raw construction efficiency / starter fuel) still awaits owner.

## JV72O7 testovací obchod (2026-11-14, se svolením hráče)
- [x] Zdarma vloženo 5 zpracovatelských budov (Lambadagrad: Mlýn, Pekárna; Kwak: Mlýn, Kamenictví; Hakka: Kamenictví), každá zapsána v admin_audit_log jako `insert_free_test_building`.
- [x] Oprava: `economyAdapter.rows()` řadil `macro_deposits` podle neexistujícího `id` → tah 7 selhal fail-closed v compute-trade-flows; nyní řadí podle grid_x, grid_y. Nasazeno compute-trade-flows, commit-turn, backfill-parcel-economy.
- [x] Tah 7→8 proběhl: zásilky 1 → 5 (dřevo Qweo/Hakka→Kwak, obilí Kwak→Lambadagrad), objem 0,23 → 0,70.
- [ ] Objemy jsou stále malé; další krok: kalibrace výroby/poptávky v izolované simulaci.

## Atlas — read-only encyklopedie (2026-11-14)
Plán: `.lovable/plan/atlas.md` (původní `.lovable/plan.md` obnoven z 166e9b1d beze změny).
- [x] Záložka „Atlas“ v horním menu (MapTopNav), AppSidebar, BottomNav; render v Dashboard. Codex/ChroWiki beze změn.
- [x] Sekce: Jak funguje svět, Suroviny a zboží, Spotřební koše (13 z BASKET_DEMAND, substitutionEfficiency, nutritionOnly), Výrobní řetězce (interaktivní strom z DB receptů + producersOfRecipe, nesoulad katalogu), Světové trhy (poslední snapshot city_market_summary, poptávkou vážená cena, stáří), Moje území (pole, biomy jako odvozeno, vlastní průzkumy, parcelPotential jako potenciál, skutečný výnos z hlášení, doložené příležitosti z import_blockers).
- Soubory: src/pages/game/AtlasTab.tsx; src/components/atlas/{ProvenanceBadge,AtlasOverview,AtlasGoods,AtlasBaskets,AtlasChains,AtlasMarkets,AtlasTerritory}.tsx; src/lib/atlas/{canon,provenance,paging,market,chains,opportunities}.ts; src/hooks/useAtlasData.ts; src/test/atlas.test.ts; upraveny BottomNav, AppSidebar, MapTopNav, Dashboard, AGENTS.md.
- Testy: atlas.test.ts 19/19; celá sada 968 passed / 3 skipped; tsgo bez chyb; build OK.
- Prohlížeč (JV72O7, přihlášen, jen čtení, desktop 1280 + mobil 390): všech 6 sekcí, 0 chyb stránky, 0 zápisů/volání funkcí. Žádný tah, refresh, seed ani claim.
- Limity: city_buildings se samostatně nečtou (budovy jen přes parcel building_id a hlášení); příležitosti jen z import_blockers; zisk jen z margin výrobce, jinak „nelze spolehlivě vyčíslit“; biomová nápověda je obecná; světová cena chybí u zboží bez poptávky.
- Další krok: přidat do Moje území vlastní budovy z city_buildings (jen select vybraných sloupců) s vazbou na recepty a jejich skutečný provoz.

## Vojenství na mikropolíčkách — etapa 1: pohyb (2026-11-14)
- Hotovo: `_shared/microMovement.ts` (silnice 1, rovina 1,5, les/kopce 2, hory/bažiny 3, voda a řeka bez mostu neprůchodné; 10 bodů/kolo; 500 mužů/mikropolíčko), `applyStackMicroMove` v `stackMovementCommand.ts`, MOVE_STACK s `microPath` v command-dispatch, tlačítko „Přesunout armádu“ + náhled trasy v `IsometricSquareMap.tsx`, tábor podle 500 mužů v `src/lib/tileParcels.ts`.
- Testy: `src/test/micro-movement.test.ts` 8/8; celá sada 976 passed / 3 skipped; typecheck a deno check čisté. Nasazeno: command-dispatch, ai-faction-turn.
- Neověřeno v prohlížeči: v aktuální hře nejsou nasazené armády a skutečný přesun by zapsal do hry.
- Omezení: AI se zatím pohybuje po velkých polích; srážky armád na trase nejsou.
- Další krok: etapa 2 — malované figurky vojáků s praporem rozložené po obsazených mikropolíčkách.

## Vojenství — etapa 2: vzhled (2026-11-14)
- Hotovo: `src/components/map/ArmySquad.tsx` — malované skupinky (pěchota/jízda/obléhací stroje) na každém obsazeném mikropolíčku (max 500 mužů, 1 figurka ≈ 125 mužů, max 4), prapor v barvě říše s morálkou; starý `ArmyMarker.tsx` odstraněn.
- Ověřeno: typecheck čistý, 976 testů prošlo; prohlížeč IJ8BQ5 jen čtením — 12 armád vykresleno, žádné chyby, žádné zápisy.
- Další krok: etapa 3 — tábor s palisádou podle počtu vojáků.

## Suroviny z mikropolíček — etapa 1: šance a průzkum (2026-11-14)
- Hotovo: `_shared/microResources.ts` (jisté suroviny podle podterénu: obilí na orné půdě, kámen v kopcích/horách, dřevo v lese, ryby u vody, rašelina v bažině; skryté šance pro réva, olivy, len, zvěř, pryskyřici, rudy, zlato — rudy a zlato jen tam, kde je skutečně má velké pole), tabulka `micro_surveys` + `record_micro_survey` (migrace 0026), příkaz SURVEY_MICRO (2 zlata = desetina plného průzkumu), panel „Suroviny políčka“ v okně parcely (`MicroResourcePanel.tsx`).
- Testy: `micro-resources.test.ts` 5/5; celá sada viz poslední běh. Nasazeno: command-dispatch.
- Neověřeno: placený průzkum v živé hře (zapsal by do hry).
- Zbývá: etapa 2 stavby jen na potvrzených surovinách; 3 pole u farmy (max 8, sousedící); 4 množení plodin (vinice 3 kola); 5 opatrný převod uložených her.
