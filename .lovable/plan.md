# Atlas — read-only encyklopedie herní reality

## 1. Ověřený stav (HEAD v repu)
- `TabId` je v `BottomNav.tsx`; obsahuje `codex`, ale `AppSidebar` ani `BottomNav` ho nenabízí. `Dashboard.tsx` renderuje `CodexTab` (lore/world foundation).
- `BASKET_DEMAND` v `_shared/demandModel.ts` má 13 košů: staple_food, drinking_water, fuel, basic_clothing, tools, storage_logistics, admin_supplies, construction, military_supply, variety, feast, luxury_clothing, metalwork (intermediate_only).
- Kanonické exporty existují: `PRODUCT_META`, `substitutionEfficiency` (productMarket.ts), `PRODUCTION_BUILDINGS`, `producersOfRecipe` (productionCatalog.ts), `parcelPotential` (parcelEconomy.ts).
- `city_market_summary`: city_node_id, good_key, supply_volume, demand_volume, price_numeric, price_band, avg_quality, domestic/import_share, turn_number.
- `macro_surveys`: session_id, player_name, grid_x/y, level, findings, surveyed_turn.
- `useManagementReport` hook existuje (owner-scoped `read_economy_management`).

## 2. Volba: nový `atlas` TabId + `AtlasTab`
Codex zůstává lore. Atlas je jiný účel (mechaniky + osobní analýza); rozšíření Codexu by míchalo narativ a čísla a porušilo Founder Safe Mode. Položka „Atlas“ se přidá do `AppSidebar` (skupina hra) i `BottomNav`.

## 3. Rozvržení (6 podzáložek, česky, vyhledávání + filtry)
1. **Jak funguje svět** — statický text cyklu, legenda stavů: Potvrzeno / Skutečný provoz / Potenciál / Odvozeno / Nedostupná data; slovník (výstup vs. kapacita vs. potenciál vs. zásoba vs. příjem vs. přidaná hodnota).
2. **Suroviny a zboží** — tabulka/karty z `goods`, filtr fáze/koš/kategorie, základní cena vs. aktuální cena (se zdrojem a tahem, jinak „nedostupné“).
3. **Spotřební koše** — 13 karet z `BASKET_DEMAND`: třída, drivers, shortage, basic need; napojené produkty (goods.demand_basket + PRODUCT_META) s účinností přes `substitutionEfficiency` (nutritionOnly pro kritické jídlo).
4. **Výrobní řetězce** — vybrané zboží → strom vstupů/receptů/budov (DB `production_recipes` čísla, `producersOfRecipe` mapování); zdroje bez vstupů, alternativy; nesoulad DB vs. katalog označen.
5. **Světové trhy** — agregace posledního snapshotu `city_market_summary`: poptávkou vážená cena, Σ nabídka/poptávka, počet trhů, tah a stáří. Osobní ceny/marže/toky z management reportu.
6. **Moje území** — moje makropole, parcely, budovy, cesty; potvrzené suroviny jen z vlastních `macro_surveys`; biom jako „Odvozeno (inference)“; `parcelPotential` jako „Potenciál“; skutečný výnos z `report.producers`. Příležitosti: deterministické pravidlo (vysoká lokální cena + neuspokojená poptávka z reportu + existující řetězec + dostupný potenciál), s důvodem, překážkou a jistotou.

## 4. Datové zdroje a read path
| Sekce | Zdroj | Cesta |
|---|---|---|
| Zboží | goods | client select (RLS čtení) |
| Recepty | production_recipes | client select |
| Koše/meta/katalog | demandModel, productMarket, productionCatalog | import čistých konstant/funkcí do frontendu (re-export modul `src/lib/atlas/canon.ts`, bez kopírování) |
| Trhy svět | city_market_summary + province_nodes(city_id) | session-scoped, stránkované, jen max(turn_number) |
| Osobní ekonomika | useManagementReport | existující RPC (owner-scoped) |
| Území | province_hexes, tile_parcels, tile_parcel_contents, city_buildings, road_segments, macro_surveys | session + owner filtry, stránkované |
Zakázáno: economy_turn_ledgers, macro_deposits, geology_seeds, jakýkoli insert/update/rpc zápis, edge funkce kromě čtení.

## 5. Mezery v datech a jak je UI přizná
- Chybí snapshot / starý tah → banner „Data z tahu N (o X tahů starší)“ nebo „Nedostupné“, nikdy 0.
- Stránkování nedokončeno / chyba → „Neúplná data“ místo součtů.
- Recept v DB bez budovy v katalogu (nebo opačně) → štítek „Nesoulad katalogu“.
- Zboží bez PRODUCT_META → účinnost „nedostupná“.
- Report nedostupný (nečlen, chyba) → osobní sekce skryje čísla.
- Ověřit před implementací: zda frontend smí importovat `_shared` moduly (Deno importy); pokud ne, tenký re-export bez logiky, test parity.

## 6. Testy
- basket coverage: všech 13 košů z BASKET_DEMAND se renderuje, každý goods.demand_basket mapuje na známý koš.
- recipe-chain integrity: graf bez cyklů/vymyšlených uzlů; každý uzel existuje v DB fixture.
- provenance labels: každá číselná hodnota nese stav a zdroj.
- no hidden deposit leakage: dotazy nikdy necílí macro_deposits/geology_seeds; surveys filtrované na hráče.
- staleness/empty: prázdný snapshot → „nedostupné“, ne 0; starý tah → štítek stáří.
- world price aggregation: vážený průměr na fixture.
- read-only: mock supabase klienta — žádné insert/update/delete/upsert/rpc kromě read_economy_management, žádné functions.invoke.

## 7. Pořadí (malé ověřené řezy)
1. Kostra: TabId `atlas`, navigace, prázdný `AtlasTab` + podzáložky, read-only test strážce.
2. Datová vrstva `src/lib/atlas/` (stránkovaný loader, provenance typy, agregace trhu) + testy.
3. Zboží + Koše.
4. Výrobní řetězce.
5. Světové trhy + osobní report.
6. Moje území + příležitosti.
7. Browser kontrola JV72O7 jen čtením (bez tahů/refresh), roadmap.md update s dalším krokem.

Rozsah: ~10–14 nových souborů (AtlasTab, 6 sekcí, lib/atlas 3–4 moduly, 5–6 testů), 3 upravené (AppSidebar, BottomNav, Dashboard). Žádná migrace, publish ani zápis do hry.
