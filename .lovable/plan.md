# Oprava stavby cest a sjednocení infrastruktury

## Cíl
Zprovoznit kreslení a potvrzení cest na úrovni podčtverců a udělat z něj jediný konzistentní systém, který používá stávající infrastruktura, výstavba po kolech, mosty, obchodní síť a ekonomické toky.

## Co upravím
1. **Kreslení a potvrzení**
   - Oddělím trasu po podčtvercích od makro souřadnic polí, aby každý klik skutečně vybíral konkrétní podčtverec.
   - Udržím potvrzovací lištu vždy dostupnou nad mapou a zobrazím konkrétní důvod, proč nelze stavbu potvrdit.
   - Sjednotím náhled ceny, úrovně, mostů a délky s kontrolou na serveru.

2. **Jeden model cest**
   - Propojím staré lokální záznamy infrastruktury s explicitními silničními úseky místo dvou nezávislých systémů.
   - Tři úrovně zůstanou: stezka, cesta, dlážděná cesta; upgrade bude navazovat jen na dokončenou nižší úroveň.
   - Cesta bude procházet podčtverci bez zabrání stavebního slotu.

3. **Výstavba a návaznosti**
   - Stavba vytvoří projekt a jednotlivé úseky atomicky, odečte správnou cenu a postupuje při uzavření tahu.
   - Dokončené úseky aktualizují infrastrukturní stav polí a budou ihned dostupné pro navazování dalších cest.
   - Mosty a terén budou počítány podle skutečné stopy přes podčtverce.

4. **Ekonomika a doprava**
   - Obchodní systémy i jednotlivé toky budou používat pouze dokončené silniční úseky nebo navazující říční síť.
   - Kapacita, tření a úroveň cesty budou pocházet ze stejné definice jako cena a doba stavby.
   - Ověřím, že přerušení nebo nedokončení úseku tok zastaví či přesměruje.

5. **Ověření**
   - Přidám testy pro trasu přes podčtverce, potvrzení, upgrade, most, dokončení po tahu a obchodní průchodnost.
   - Ověřím skutečný postup v náhledu: vybrat podčtverec → nakreslit → potvrdit → projekt viditelný → dokončit tah → cesta použitá tokem.

## Technické poznámky
- `road_projects` a `road_segments` budou autoritativní pro meziměstskou dopravní síť.
- `tile_infrastructure` zůstane kompatibilní projekcí stavu infrastruktury pole, ne druhou nezávislou cestou.
- Souřadnice uloží makro pole i lokální index podčtverce, aby kresba, mosty a ekonomický routing používaly stejnou stopu.
- Změny databáze zachovají existující cesty a přidají potřebná oprávnění a ochrany přístupu.
