# Detailní ekonomická analytika v záložce Ekonomika

## Cíl

Záložka Ekonomika má hráči ukázat celý řetězec: co města potřebují, co opravdu vyrábí, odkud to pochází, co se vyváží/dováží a podle čeho se má rozhodnout, co stavět.

## Rozsah první implementace

1. **Vyčistit zastaralé metriky**
   - Přejmenovat hlavní „GDP“ na aktuální ekonomickou hodnotu tak, aby neslibovala export ani starý node wealth model.
   - Odstranit nebo přepsat texty, které mluví o `wealth` jako o paralelní produkci.
   - Sloučit duplicitní „výkon/tržní podíl/supply chain“ pohledy pod jeden srozumitelný analytický tok.

2. **Přidat městský produkční rozbor**
   - Tabulka po městech: poptávka, lokální nabídka, uspokojení, deficit, exportní přebytek.
   - Rozpad nabídky na domácnosti / receptury / budovy a čtvrti.
   - Detail města: které koše vyrábí, co mu chybí, co má navíc.
   - Napojit existující budovy a čtvrti u města, aby bylo vidět, které stavby přidávají výrobu.

3. **Přidat vysvětlení poptávky**
   - U každého koše ukázat, kde je problém: chybí místní výroba, chybí dovoz, je malá dopravní/tržní dostupnost, nebo není vhodná budova.
   - Ke košům ukázat akční doporučení: co postavit / kde posílit produkci / kde je potřeba cesta nebo import.

4. **Přidat obchodní toky mezi městy**
   - Samostatný přehled toků z `basket_trade_flows`: zdrojové město → cílové město, koš, objem, hodnota, úroveň přístupu, módy dopravy.
   - Deduplikovat stejný koridor do jedné rozkliknutelné řádky, aby bylo jasné, co proudí například mezi Lachimgradem a Ravensburgem.
   - Filtrovat na aktuální tah a hráčova města, aby se nemíchala stará historie.

5. **Správa výroby bez nové backend mechaniky**
   - Pokud hra už má pro budovy/čtvrti nastavitelné výstupy, zobrazit jejich současný výstup a přivést hráče na správu města.
   - Pokud backend zatím nepodporuje přepínání výstupu budovy, UI nebude předstírat funkci; ukáže dostupné výrobní zdroje a doporučenou stavbu.

## Technické poznámky

- Zdroje dat: `city_market_baskets`, `city_buildings`, `city_districts`, `building_templates`, `basket_trade_flows`, `cities`, případně `node_inventory` pro specializované receptury.
- Žádné nové fiskální výpočty: fiskál zůstává v `realm_resources` a pokladnici.
- Žádné nové GDP algoritmy: produkční hodnota zůstává `goods_production_value`; export je samostatná obchodní veličina.
- Player UI nesmí číst ani interpretovat `wealth_output` jako produkci.
- Dev panely zůstanou za Dev režimem; hráčská záložka dostane čistou analytiku.

## Ověření

- Zkontrolovat, že záložka Ekonomika načítá data aktuálního tahu.
- V náhledu ověřit, že hráč vidí městskou produkci, deficity a obchodní toky.
- Zkontrolovat build log a opravit případné chyby.
