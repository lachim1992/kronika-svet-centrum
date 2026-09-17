# Sjednocení cest, řek a ekonomických toků

## Cíl
Hráč v detailu pole zvolí **Postavit cestu**, tažením myší nakreslí souvislou trasu přes sousední makropole, uvidí průběžnou cenu a mosty a trasu potvrdí jako stavební projekt. Veškerý pozemní obchod následně používá výhradně dokončené cesty; propojené řeky fungují automaticky jako vodní dopravní síť.

## Herní tok
1. V panelu infrastruktury přidat režim kreslení cesty.
2. Tažení začne na vlastním městě, parcele, subuzlu nebo existující vlastní cestě a pokračuje pouze přes sousední průchodná pole.
3. Během tahu mapa zobrazí náhled celé trasy, neplatné úseky, délku, čas, cenu a počet mostů.
4. Puštění myši trasu uzavře; hráč ji může potvrdit, zrušit nebo překreslit.
5. Nová trasa začíná jako **Stezka**. Existující souvislou trasu lze stejným způsobem vybrat a povýšit na **Cestu** a **Dlážděnou cestu**.
6. Stavba nezabírá stavební sloty podčtverců. Most vzniká automaticky tam, kde nakreslená trasa protne uložené koryto řeky, a zvýší cenu.

## Jeden autoritativní model infrastruktury
- Rozšířit dnešní infrastrukturu pole o explicitní propojení mezi sousedními poli a uložený průběh přes podčtverce; přestat odvozovat spojení jen z toho, že vedle sebe leží dvě silniční buňky.
- Každý úsek ponese úroveň 1–3, stav výstavby, vlastníka, postup, kapacitu, rychlost, náklady na údržbu a případné mosty.
- Vstupní body na hranách sousedních polí budou sdílené, takže cesta bude geometricky navazovat bez skoků. Uvnitř pole se stopa přizpůsobí subbiomu, překážkám, městu a řece.
- Stávající `tile_infrastructure` převést na nové explicitní úseky. Současné automaticky generované obchodní trasy nebudou ekonomickou zkratkou; dvě hráčské dlážděné trasy v aktuální hře se převedou, pokud jejich uložená cesta odpovídá mapě.
- Zachovat příkazový/event-sourcing model: klient odešle jednu validovanou trasu, server znovu ověří návaznost, vlastnictví kotvy, terén, zdroje, mosty a idempotenci a teprve poté zapíše projekt a událost.

## Tři úrovně
- **Stezka**: nejlevnější, malá kapacita, vysoké tření a pomalejší pohyb.
- **Cesta**: střední kapacita, nižší ztráty a rychlejší přeprava.
- **Dlážděná cesta**: nejvyšší kapacita, nejnižší tření, nejrychlejší pohyb a nejvyšší pořizovací i udržovací cena.
- Zachovat dnešní základní ceny a časy jako výchozí hodnoty; výsledná cena se násobí délkou a terénem a přičítá mosty. Hodnoty budou sdílené mezi náhledem a serverovým výpočtem.

## Řeky
- Z uložených říčních buněk sestavit automatickou směrově propojenou síť bez nutnosti přístaviště.
- Říční hrany dostanou vlastní kapacitu, rychlost a tření. Napojení města nebo subuzlu ležícího na říčním poli bude automatické.
- Přechod mezi řekou a cestou bude možný v jejich společném poli; most bude řešit pozemní překročení řeky, nikoli blokovat plavbu.
- Moře a staré automatické `sea_lane` nebudou součástí tohoto základního systému.

## Ekonomika jako skutečný tok po síti
- Nahradit dnešní obchodování „v rámci stejné obchodní oblasti“ skutečným hledáním trasy po grafu dokončených, otevřených cest a řek.
- Pro každou nabídku/poptávku najít nejlevnější dostupnou cestu, rezervovat kapacitu na každém jejím úseku a snížit přepravený objem podle nejužšího místa.
- Do ceny a výsledku započítat délku, úroveň cesty, terén, mosty, stav/poškození, kontrolu území a přechody cesta–řeka.
- Uložit použitou sekvenci polí k ekonomickému toku, aby animace na mapě přesně kopírovala trasu, která skutečně přepravila zboží.
- Odvodit z téže sítě přístup na trh, zásobování subuzlů, tranzitní výnosy, obchodní kapacitu a logistické bonusy. Bez spojení nebude vzdálený export ani import; místní produkce a spotřeba zůstanou funkční.
- Zachovat oddělení diplomatických obchodních dohod: dohoda může obchod povolit nebo upravit, ale sama nevytvoří fyzickou cestu.

## Mapa a grafika
- Kreslicí režim potlačí běžné klikání mapy, funguje tažením myší i tažením prstu a dovolí vrátit poslední úsek.
- Náhled bude barevně rozlišovat platnou trasu, zakázané pole, most a napojení na existující síť.
- Hotové úrovně dostanou odlišnou stopu: nepravidelná úzká stezka, pevná zemní cesta s okraji a široká dlážděná cesta s kamenným rytmem. Vše zůstane ukotvené v izometrické krajině a správně se překryje budovami.
- Toky zůstanou samostatně vypínatelnou vrstvou, ale budou animované pouze nad skutečně využitými cestami a řekami.
- Panel vybraného úseku ukáže úroveň, postup, kapacitu, vytížení, údržbu, mosty a ekonomický přínos; nabídne povýšení celé označené trasy.

## Technické provedení
- Přidat tabulky pro silniční projekty a explicitní úseky/hranové vazby, včetně RLS a oprávnění; navázat je na relaci hry a herní události.
- Vytvořit sdílený kontrakt geometrie, cen a kapacit pro klienta a server, aby náhled odpovídal výsledku.
- Upravit zpracování kola pro postup výstavby, údržbu, degradaci a označení ekonomické sítě k přepočtu.
- Upravit výpočet obchodních systémů, košových toků a ekonomiky tak, aby používaly jeden kapacitní graf; staré generované `province_routes` vyřadit z ekonomického routingu.
- Migraci provést kompatibilně: nejprve nové struktury a převod použitelných hráčských cest, potom přepnutí výpočtů a nakonec odstranění závislosti na automatických trasách.

## Ověření
- Jednotkové testy návaznosti tažené trasy, ceny terénu a mostů, tří úrovní, říční konektivity a kapacitního routingu.
- Integrační test: nakreslit cestu mezi dvěma městy, dokončit kola, ověřit vznik toku a jeho přesnou trasu; přerušit jediný úsek a ověřit zastavení nebo přesměrování obchodu.
- Ověřit myš i dotyk, makro i detailní pohled, překryvy budov, tři grafické úrovně a přepínače vrstev.
- Na aktuální hře zkontrolovat převod 1 lokální stezky, 2 hráčských dlážděných tras a vyřazení 7 automaticky generovaných tras z ekonomiky.
