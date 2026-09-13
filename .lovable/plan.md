# Spravovatelné podčtverce, subuzly a místní infrastruktura

## Cíl
Po kliknutí na velké mapové pole se otevře jeho 6×6 vrstva. Kliknutí na konkrétní podčtverec jej vybere a pravý panel nabídne pouze akce, které jsou na daném místě skutečně povolené. Parcely se stanou společným fyzickým podkladem pro městské stavby, čtvrti, výrobní/vojenské/obchodní subuzly a místní cestní síť.

## Hráčský průběh
1. Hráč klikne na velké pole a vstoupí do vrstvy 36 podčtverců.
2. Klikne na podčtverec; ten se zvýrazní a pravý panel ukáže terén, vlastníka, kapacitu, současné objekty a cenu.
3. Podle situace může:
   - zabrat volnou parcelu pro sousední vlastní město,
   - rozšířit město na sousední velké pole,
   - postavit městskou budovu nebo čtvrť,
   - založit výrobní, vojenský nebo obchodní subuzel,
   - spravovat již umístěné objekty.
4. Na úrovni celého velkého pole může zahájit infrastrukturu: **stezka → cesta → dlážděná cesta**.
5. Po dokončení infrastruktury se automaticky vykreslí propojená místní síť mezi všemi využívanými podčtverci; hráč nekreslí jednotlivé úseky ručně.

## Datový model
- Nahradit současné jediné `building_id` / `district_id` na parcele vazební tabulkou obsahu parcely. Jeden podčtverec tak může držet více objektů až do své `capacity_slots`.
- Každý záznam obsahu ponese typ objektu, jeho ID a spotřebovanou kapacitu. Unikátní vazba zabrání vložení stejného objektu dvakrát.
- Stávající `city_buildings.parcel_id` a `city_districts.parcel_id` zůstanou během přechodu čitelné, ale nové zápisy budou používat vazební tabulku. Existující umístění se jednorázově převedou.
- Přidat stav místní infrastruktury na velkém poli: úroveň 0–3, stav výstavby, začátek/dokončení, vlastník a náklady.
- `province_nodes.parcel_index` zůstane fyzickou polohou subuzlu. Subuzly budou vázány na konkrétní velké pole, parcelu a ovládajícího hráče.
- Všechny nové tabulky budou pouze čitelné pro členy hry; zápisy provede výhradně serverový command gateway.

## Příkazy a pravidla
- Rozšířit `BUILD_BUILDING`, `BUILD_DISTRICT` a `ASSIGN_CITY_PARCEL` o kapacitní kontrolu místo požadavku na úplně prázdnou parcelu.
- Přidat `BUILD_SUBNODE`:
  - validace členství, vlastnictví pole/města, souřadnic, průchodnosti, kapacity a zdrojů,
  - povolené skupiny: výrobní, vojenské, obchodní,
  - nabídka konkrétních typů se filtruje podle biomu, řeky, pobřeží a existujících capability pravidel,
  - vytvoření uzlu a události proběhne idempotentně přes `command-dispatch`.
- Přidat `UPGRADE_TILE_INFRASTRUCTURE`:
  - pouze postup 0→1→2→3,
  - server ověří vlastnictví, cenu a předchozí úroveň,
  - výstavba se dokončuje v tahu stejným způsobem jako ostatní projekty,
  - vyšší úroveň zvyšuje místní propustnost; konkrétní koeficienty budou v jednom sdíleném souboru, ne rozptýlené v UI.
- Zachovat `flow_paths.path_cells` jako jediný zdroj pravdy pro meziměstské a meziregionální trasy. Místní síť uvnitř pole ji nenahrazuje ani nevytváří nové obchodní toky.
- Nové budovy a subuzly používají existující ekonomické efekty. Umístění na mapu nesmí jejich bonus započítat podruhé.

## Pravý panel parcely
- Záhlaví: číslo podčtverce, subbiom, výška, zastavitelnost, vlastník a využitá/volná kapacita.
- Sekce „Na parcele“: seznam všech staveb, čtvrtí a subuzlů s jejich stavem.
- Sekce „Postavit“: karty dostupných městských budov/čtvrtí a tři skupiny subuzlů; nedostupné položky vysvětlí důvod.
- Akce zabrání dvojkliku během zápisu, zobrazí cenu před potvrzením a po úspěchu obnoví parcelu, mapu i zdroje.
- Kliknutí na vodní nebo nezastavitelný podčtverec zobrazí detail, ale nenabídne neplatnou výstavbu.

## Automatická místní silniční síť
- Pro každé pole se deterministicky vybere vstupní bod a propojí se středy všech využívaných podčtverců minimálním stromem nad 6×6 mřížkou.
- Vykreslení respektuje řeku a nezastavitelné parcely; pokud je nutný přechod přes řeku, cesta použije označený mostní úsek.
- Stezka, cesta a dlážděná cesta mají odlišnou šířku/styl, ale stejnou topologii, takže upgrade nic nepřesouvá.
- Síť se přepočítá deterministicky při přidání nebo odebrání objektu; není potřeba ukládat jednotlivé segmenty.

## Pořadí implementace
1. Migrace vazební tabulky obsahu parcely a stavu místní infrastruktury, včetně grantů, RLS, indexů a převodu existujících vazeb.
2. Serverové validace kapacity a nové příkazy pro subuzel a infrastrukturu.
3. Klikatelný výběr podčtverce a pravý správcovský panel.
4. Napojení existujících katalogů budov/čtvrtí a nabídky subuzlů podle terénu.
5. Deterministické vykreslení třístupňové místní silniční sítě.
6. Testy kapacity, vlastnictví, idempotence, zakázaného terénu, nákladů a přechodu úrovní; ověření na desktopu i mobilu.

## Technické pojistky
- Žádný přímý zápis z klienta do parcel, uzlů, budov ani infrastruktury.
- Odečtení zdrojů a vytvoření objektu proběhne atomicky nebo se celé vrátí; nevznikne zaplacený, ale nevytvořený objekt.
- Řeky a subbiomy zůstanou deterministické a shodné na klientu i serveru.
- Staré světy a existující objekty zůstanou čitelné po převodu; ekonomické, obchodní a fiskální výpočty se touto etapou nemění.
