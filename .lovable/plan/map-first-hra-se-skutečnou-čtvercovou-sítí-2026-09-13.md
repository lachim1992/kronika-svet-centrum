# Map-first hra se skutečnou čtvercovou sítí

## Cíl
Přestavět herní obrazovku na živou isometrickou čtvercovou mapu jako hlavní pracovní plochu. Města, cesty, uzly, armády, obchod a průzkum zůstanou napojené na stávající mechaniky. Diplomacie, ekonomika, kroniky, ChroWiki, Dev a další části se budou otevírat z horních záložek ve skládacím pracovním panelu, pod kterým zůstane část mapy viditelná.

## Uzamčený vizuální směr
- Směr: **Isometric Tactical Command**.
- Paleta: taktický kontrast — tyrkysová voda, zelená krajina, zlaté zvýraznění, cihlové hrozby, tmavý herní rám.
- Písmo: **Libre Baskerville** pro názvy a titulky, **IBM Plex Sans** pro údaje a ovládání.
- Mapa je trvale pod herním rozhraním; levé hlavní menu nahradí kompaktní horní záložky.
- Animace budou střídmé: voda, kouř, vlajky a pulzy aktivních cest; při omezení pohybu se vypnou.

## Etapa 1 — Čtvercový prostorový základ
- Zavést verzovaný typ mapové geometrie, aby nové světy používaly skutečnou čtvercovou síť a existující světy nebyly potichu poškozeny.
- Definovat kartézské souřadnice, čtyři základní sousedy a případně povolené diagonály jako jedno sdílené pravidlo.
- Přepsat vzdálenost, průzkum, pohyb, umisťování, kontrolu území a A* nad společné rozhraní mřížky.
- Zachovat serverové `flow_paths` jako jediný zdroj pravdy pro cesty a ekonomické toky; renderer nebude vytvářet náhradní spojnice.
- Přidat převod existujících hexových světů do nové verze jako explicitní admin akci s validací kolizí měst, uzlů, armád a cest. Bez úspěšné validace se svět nepřepne.
- Doplnit testy sousednosti, vzdálenosti, průchodnosti, cest, hranic mapy a deterministického převodu.

## Etapa 2 — Isometrický renderer
- Vytvořit nový renderer čtvercových dlaždic oddělený od herních dat; starý renderer zůstane dočasně dostupný pro nepřevedené světy.
- Zobrazit biomy, výšku, pobřeží, řeky, lesy a mlhu války pomocí isometrické projekce se stabilním pořadím vrstev.
- Převést města, uzly, armády, hranice provincií, cesty, stavby ve výstavbě a ekonomické/trade vrstvy na společnou projekční funkci.
- Zachovat výběr dlaždice, průzkum, stavbu, přesun armády, detail města/uzlu/cesty, vrstvy a minimapu.
- Implementovat plynulý pan, zoom ukotvený pod kurzorem, dotykový pinch a návrat na hlavní město.
- Použít zřetelné, ale ne přehnané animace a stabilní velikosti popisků bez překrývání.

## Etapa 3 — Mapa jako hlavní herní plocha
- Přesunout mapu do trvalého herního pozadí a odstranit desktopové levé hlavní menu.
- Nad mapu umístit kompaktní stav světa, zdroje, tah a horní záložky stávajících modulů.
- Kliknutí na modul otevře široký panel shora; opětovné kliknutí nebo zavření panel stáhne a odhalí celou mapu.
- Obsah stávajících modulů zůstane funkčně stejný, pouze dostane výšku, vlastní scroll a mapově kompatibilní obal.
- Kontextové akce města, uzlu, armády a cesty zůstanou ukotvené k mapě; běžné modály a dialogy zůstanou nad pracovním panelem.
- Na mobilu použít spodní navigaci a téměř celoplošný vysouvací panel; mapa musí zůstat snadno obnovitelná jedním gestem/tlačítkem.

## Etapa 4 — Herní čitelnost a vizuální obsah
- Pro každou dlaždici skládat terén, vegetaci, infrastrukturu a entity z opakovatelných vizuálních vrstev, aby obraz odpovídal skutečnému stavu hry.
- Města odstupňovat podle úrovně a populace; budovy zobrazovat jako vizuální důsledek existujících staveb, ne jako dekoraci bez dat.
- Cesty rozlišit podle tieru a stavu, obchodní tok animovat pouze po uložené trase a vojenský pohyb po vypočtené cestě.
- Přidat režimy čitelnosti pro provincie, ekonomiku, obchodní systémy, vliv a výstavbu bez změny jejich pravidel.

## Ověření před přepnutím
- Automatické testy prostorových pravidel a převodu starého světa.
- Porovnání cest a toků před/po migraci na vybrané kopii světa; žádné osiřelé město, uzel, armáda nebo cesta.
- Ruční průchod: průzkum → stavba uzlu/cesty → přesun armády → otevření města → ekonomická vrstva → přepočet tahu.
- Kontrola desktopu 1440×900 a mobilu; žádné překrytí horního panelu, mapových ovladačů, dialogů a FAB prvků.
- Starý hexový renderer odstranit až po úspěšném převodu aktivních světů a ověření parity.

## Technické zásady
- Autoritativní geografie, A* a `flow_paths` zůstávají serverové; klient pouze promítá a ovládá.
- Nové prostorové zápisy půjdou přes stávající command/event cestu, ne přímým zápisem z UI.
- Migrace databáze zachová RLS a explicitní oprávnění; role zůstávají v oddělené tabulce.
- Vizuální tokeny budou v globálním design systému; komponenty nebudou obsahovat nahodilé barvy.
- Jde o víceetapovou migraci. První nasaditelný milník je Etapa 1 + paralelní renderer z Etapy 2; teprve potom se přepne hlavní rozhraní.

## Mimo rozsah
- Žádná změna ekonomických vzorců, bojových pravidel, diplomacie ani vyprávění.
- Žádné přímé ruční kreslení cest, které by obcházelo A* a uložené `flow_paths`.
- Žádné automatické převedení existujících světů bez kontroly a možnosti návratu.
