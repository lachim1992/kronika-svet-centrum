# Chronicle — třetí sada: množství v obchodu a aktuální přehledy

Výchozí commit: `82af963832e29c73ee0c24f6c2da09a9f56fa822`, datum 13. září 2026. Navazuje na první dvě sady stabilizace. Změny byly provedeny v oddělené pracovní větvi; souběžné úpravy v původním adresáři nejsou součástí této revize.

## Opravené chování

### Přebytek se nemůže prodat opakovaně více kupujícím

`compute-trade-flows` dříve každému odběrateli nabízel původní přebytek zdrojového města. Jeden výrobce s výstupem 10 tak mohl třem kupujícím vykázat po 5 jednotkách, celkem 15. Nově má každá dvojice zdrojové město/zboží společný zůstatek. Každá dodávka jej sníží.

Původní omezení jedné dodávky na polovinu původního přebytku zůstává. Mění se kontrola součtu všech dodávek: nesmí překročit skutečný přebytek. Výběr nadále používá jednoduché postupné přidělování, nikoli nový model cen či férového rozdělení.

### Jedna poptávka se neplní opakovaně od každého souseda

Po každé přidělené dodávce se sníží zbývající potřeba kupujícího. Započítává se také již dostupná produkce dokončených budov; město, jehož potřebu budova pokrývá, neobjednává stejné množství znovu.

Publikované množství i odečet používají stejné desetiny jednotky. Zaokrouhlení směrem nahoru již nemůže překročit malý zbytek poptávky ani vytvářet zboží. Zbytek menší než desetina se v tomto solveru nepřevádí. Odběratelé, sousedé a zboží mají stabilní pořadí, takže změna pořadí databázových řádků sama nezmění přidělení.

### Tržní podíl a uspokojení poptávky neobnovují minulý tah

`MarketSharePanel` a `DemandFulfillmentPanel` nyní dostávají `currentTurn` z `MarketsHub` a načítají přesně tento tah. Předchozí postup hledal nejvyšší dostupný tah mezi omezeným počtem řádků. Když byl současný výsledek prázdný, zobrazil stará data.

Společná čtečka `src/lib/economySnapshots.ts` filtruje hru, tah a případně hráče přímo v dotazu, řadí podle ID a načítá stránky po 500 záznamech až do konce. Chyba pozdější stránky nezpůsobí zobrazení částečného výsledku jako úplného. Panely reagují na změnu tahu, ignorují pozdě doběhnuvší požadavek starého tahu a zobrazují selhání načtení odděleně od prázdného výsledku.

## Testy a ověření

- Pět nových testů skutečného goods handleru nejprve selhalo nad předchozí implementací. Po opravě prochází: více odběratelů, více dodavatelů, výroba budov, malé množství a opakovatelnost při změně pořadí vstupů.
- Šest testů čtečky ověřuje historii, filtry, 1 201 řádků přes tři stránky, chybu pozdější stránky a neplatný tah.
- Tři testy skutečného React panelu ověřují změnu tahu, chybovou odpověď a pozdní odpověď starého požadavku.
- Celkem **110 testů ve 13 souborech prošlo**, o 14 více než ve druhé sadě. Prošel TypeScript aplikace, cílený ESLint nového kódu a produkční sestavení.
- Lokální testy/build používají stejně jako dříve esbuild 0.21.5 ve WebAssembly kvůli omezení Windows sandboxu. Backendové testy mají falešnou databázovou hranici; neproběhlo nasazení Deno ani test živé databáze. Sestavení nadále upozorňuje na velký hlavní JS balík (přibližně 2,98 MB před gzipem).

## Co tato sada ještě neřeší

Goods a basketový solver nadále existují vedle sebe. Tato oprava omezuje množství uvnitř `trade_flows`; nedělá z něj automaticky jediný účetní zdroj pro celou ekonomiku. Systémové přidávání nabídky, mapování na basketové toky a převod zbývajících konzumentů stále potřebují konsolidaci. Daňové příjmy ani rezervy tato změna přímo nepřepisuje.

Přidělování zůstává závislé na pevném pořadí kupujících, takže nejde o férovou aukci ani proporcionální rozdělení. Domácí rezervace podle zboží zůstává konzervativní jako dříve; úplná substituce více druhů zboží v jednom koši není přepracována.

Čtečka snapshotů řeší stránkování a výběr tahu, nikoli transakční publikaci. Souběžný refresh ve stejném tahu může stále měnit data mezi stránkami. K odstranění tohoto problému jsou potřebné verzované, atomicky publikované snapshoty. Ruční refresh ve stejném tahu také zatím nemá společný invalidátor všech panelů.

Starší čtečky v `GapAdvisorPanel`, `economy-advisor` a dalších dev přehledech nebyly touto sadou převedeny. Platí i zbývající zásadní problémy předchozích auditů: autorizace serverových akcí, bezpečná obnova přerušeného tahu a duplicitní účinky růstu obyvatelstva.

Opravy jsou lokální návrh k začlenění. GitHub při předchozím pokusu odmítl zápis chybou 403; tato sada nevytvořila vzdálený PR a nebyla nasazena. Před nasazením musí projít kontrolou společně se souběžnými změnami a ověřením v odděleném testovacím světě.
