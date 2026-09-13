# Živá města, parcely a růst na čtvercové mapě

## Cíl
Každé mapové pole půjde vybrat a přiblížit. Městská pole se rozdělí na malé parcely, na kterých budou vidět skutečné čtvrti a budovy. Populace vytváří tlak na růst, ale rozšíření do sousedního pole potvrzuje a financuje hráč.

## Herní průběh
1. Kliknutí na pole mapu plynule přiblíží a otevře pravý detail pole.
2. Detail ukáže terén, vlastníka, zdroje, cesty, město a parcelní síť.
3. Město má ukazatel `obsazeno / kapacita`, růst populace za kolo a tlak na rozšíření.
4. Dokončené budovy a čtvrti fyzicky obsadí parcely; jejich stav a úroveň se projeví na vzhledu.
5. Při nedostatku místa se zvýší tlak na růst. Hráč vybere vhodné sousední pole a potvrdí rozšíření za vypočtenou cenu.
6. Po potvrzení se pole začne urbanizovat; další kola odemykají parcely podle postupu výstavby.

## Implementace

### 1. Datový model
- Přidat `city_urban_cells`: vazba města na skutečné mapové pole, stav `core / developing / urbanized`, pořadí zabrání, cena a postup urbanizace.
- Přidat `city_parcels`: stabilní 4×4 parcelní síť uvnitř městského pole, typ využití, stav a volitelná vazba na budovu nebo čtvrť.
- Přidat volitelné `parcel_id` do `city_buildings` a `city_districts`, aby stávající ekonomické objekty byly jediným zdrojem jejich efektů a parcela pouze určovala umístění.
- Všechny tabulky dostanou explicitní oprávnění, RLS a indexy; klient nebude zapisovat přímo.
- Stávajícím městům deterministicky vytvořit centrální urbanizované pole a parcely bez změny jejich ekonomiky.

### 2. Bezpečné hráčské příkazy
- Rozšířit `command-dispatch` o `EXPAND_CITY_CELL` a `ASSIGN_CITY_PARCEL`.
- Server ověří vlastnictví města, `square4`, čtyřsměrné sousedství, průchodnost, konflikt s jiným městem, tlak na růst, volnou kapacitu a cenu.
- Rozšíření odečte náklady z autoritativního `realm_resources` a zapíše kanonickou událost do `game_events` se stejným `command_id` idempotency pravidlem.
- Stávající `BUILD_BUILDING` přijme volitelnou parcelu; bez ní server deterministicky vybere první vhodnou volnou parcelu, aby staré obrazovky dál fungovaly.

### 3. Růst v tahu
- `commit-turn` vypočte tlak z populace, bytové kapacity, přeplnění, přírůstku a volných parcel.
- Rozestavěná městská pole postupují po kolech; po dokončení odemknou svou parcelní síť.
- Růst nebude automaticky zabírat cizí pole ani obcházet hráčské potvrzení.
- Výsledek se zapíše jako kanonická událost; ekonomické efekty nadále pocházejí ze stávajících měst, čtvrtí a budov.

### 4. Mapa a detail pole
- Vybrané pole dostane jasný obrys; kamera na něj plynule přejede a přiblíží se.
- Nad městskými poli se při přiblížení vykreslí 4×4 parcely, ulice, domy, tržiště, dílny a významné budovy podle skutečných dat.
- Pravý detail nabídne přehled pole, městský růst, kapacitu parcel, obsazené objekty a tlačítko pro rozšíření, pokud je akce platná.
- Kandidátní sousední pole se zvýrazní; neplatná pole vysvětlí důvod blokace.

### 5. Animace a čitelnost
- Nahradit statické městské značky malými izometrickými shluky budov odstupňovanými populací a úrovní sídla.
- Přidat střídmý kouř z komínů, vlající prapory, světla, pohyb na aktivních cestách a pulz růstu; respektovat omezení animací systému.
- Animovat přejezd kamery a otevření detailu bez zakrytí mapy; objekty se nebudou překrývat se štítky ani armádami.

## Technické pojistky
- `game_events` + `command-dispatch` zůstávají jedinou zapisovací cestou.
- `realm_resources` zůstává jedinou pokladnou.
- Parcely nemění ekonomické bonusy samy o sobě a neduplikuji efekty budov.
- Staré `hex6` světy zůstanou funkční a dostanou pouze čtecí detail pole; skutečné rozšiřování parcel bude povoleno pro `square4`.
- Prostorové kontroly používají společnou topologii a u `square4` výhradně čtyři kardinální sousedy.

## Ověření
- Testy sousedství, ceny, konfliktu měst, kapacity, idempotence a automatického výběru parcely.
- Test růstu přes několik kol a dokončení rozšiřovaného pole.
- Vizuální kontrola běžného města, velkého města, výběru pole a sousedního rozšíření na desktopu i mobilu.
- Kontrola, že existující stavba, ekonomika a staré světy fungují beze změny.
