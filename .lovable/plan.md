
## Co jsem zjistil — staré vs nové vrstvy se bijí

### 1. Mapa se generuje DVAKRÁT s různými parametry
- `create-world-bootstrap` (nová pipeline v9) zavolá `generate-world-map` s rozměrem z `resolveMapSize` (small=21, medium=31, large=41) a `terrain_params` ze specu hráče (`targetLandRatio`, `continentShape`, `biomeWeights`…).
- Vzápětí (fire-and-forget) zavolá `world-generate-init`, který **má vlastní `sizeConfig.mapW/mapH` (21/31/41) a vlastní `shapeMap`** odvozený z AI `world.geography.continentShape` a **přepíše stejnou mapu znovu** voláním `generate-world-map`. Hráčem nastavené `biomeWeights`, `mountainDensity`, `targetLandRatio` jsou v tomto druhém průběhu **zahozeny**.
- Výsledek: to, co hráč vidí v Preview a nastaví ve wizardu, **není to, co se reálně vygeneruje**.

### 2. Geography blueprint má dva nekompatibilní zdroje
- Wizard/`translate-premise-to-spec` produkuje `geographyBlueprint` ve formátu **v9** (`ridges: {startQ,startR,endQ,endR,strength}`, `biomeZones: {centerQ,centerR,radius,intensity}`, `climateGradient`, `oceanPattern`).
- `world-generate-init` ho ignoruje a místo toho čerpá `world.geography` z AI promptu v **starém formátu** (`ridges: {x1,y1,x2,y2,width}`, `rivers`, různá enum hodnota). Spec blueprint hráče nikdo nepoužije.

### 3. Ancient layer (v9.1) běží odpojeně
- `world-layer-bootstrap` projektuje `mythic_seeds` na `province_nodes`, ale **`province_nodes` v okamžiku jeho běhu neexistují** (graf se zatím nespočítal). Důsledek: 0 mythic tagged, 0 spawned, žádné heritage_effects nemají na co působit, dokud nevzniknou města.
- Volání je navíc fire-and-forget paralelně s detached `world-generate-init` — pořadí je nedefinované.

### 4. Province nodes a routes se vůbec negenerují při startu
- `compute-province-nodes`, `compute-province-graph` ani `compute-province-routes` **nikdo při bootstrapu nevolá**. Pouští se jen ručně z DEV panelu, z `commit-turn` (po prvním tahu) nebo z `BuildNodeDialog`.
- Network log v aktuální relaci `5d09adbe…` to potvrzuje — `province_nodes`, `province_routes`, `flow_paths`, `cities`, `provinces`, `regions`, `realm_resources`, `military_stacks`, `expeditions` všechno vrací `[]`. Hra je prázdná protože AI seeding běžel detached, pravděpodobně padl v 504, a po něm už nikdo ontologickou/ekonomickou vrstvu nedopočítal.

### 5. Status race
- `create-world-bootstrap` nastavuje `init_status: ready` ihned po vygenerování mapy (předtím než AI seeding doběhne). UI hráče přepne do hry, ale data ještě nejsou hotová → blank screen / prázdný realm.

### 6. Dokumentace bez implementace
- `docs/architecture/world-layer-contract.md` definuje fáze K1–K5, Track 1/Track 2, ale Track 2 (route lifecycle, control progression, migration↔economy contract, commit-turn fáze 4–9) je v kódu jen částečně. `route_state` se backfilluje, ale graf samotný neexistuje, takže není co projektovat.
- `docs/economy-v4.3-architecture.md` (12 košů, civilizační vrstvy) — engine je v `commit-turn` přítomen, ale bez měst a uzlů nemá vstupy.

---

## Plán implementace

Cíl: **co hráč vidí a nastaví ve wizardu = co se vygeneruje**, a po dokončení wizardu existuje plně hratelný svět (mapa + provincie + města + uzly + trasy + ekonomika + ontologie).

### A. Sjednotit pipeline na jeden synchronní orchestrátor

Nahradit fire-and-forget detached `world-generate-init` za **strukturované, synchronní volání s rozpočtem**. Bootstrap musí doběhnout do 150 s a vrátit hratelný svět. Pokud AI naratíva (kroniky, persons, wonders) nestihne — pošle se na pozadí, ale **fyzický svět (mapa, provincie, města, uzly, trasy, ekonomika) musí být hotový synchronně**.

Nová sekvence v `create-world-bootstrap`:

```text
0. validate + idempotency
1. world_foundations upsert (status=bootstrapping)
2. server_config ensure
3. generate-world-map  (JEDINÉ volání, parametry ze specu)
4. parity check (mapa ↔ spec.resolvedSize)
5. seed-realm-skeleton  (NOVÁ inline funkce):
   - vytvoř 1 region, 1 provincii, 1 město pro hráče
   - pro každou AI frakci to samé
   - umístění z mapStartPositions (terrain-aware)
   - založ realm_resources, player_resources, civilizations row
6. compute-province-nodes  (synchronně, z měst → uzly)
7. compute-province-routes (synchronně, z uzlů → trasy)
8. world-layer-bootstrap   (synchronně, mythic seeds → uzly, lineages → heritage_effects)
9. refresh-economy         (synchronně, naplnit market baskets, prestige…)
10. finalize: init_status=ready, current_turn=1
11. dispatch-narrative-async (fire-and-forget): pošle do `world-generate-init` pouze
    naratívní část (persons, wonders, prehistory, chronicle, rumors, wiki images).
    Mapa ani uzly se v něm už NEgenerují.
```

### B. Refactor `world-generate-init` na čistě naratívní

- Vyřízne se: generování mapy (`generate-world-map` call), `sizeConfig.mapW/mapH`, `terrainParams`, blueprint mapping, `provinces/regions/cities` zakládání, `realm_resources` insert, `civ_identity` extract, `init_status: ready`.
- Zůstane: AI prompt na `persons`, `wonders`, `preHistoryEvents`, `battles`, `historyEvents`, `preHistoryChronicle`, `rumors`, `loreBible`, `worldMemories`, `world_premise`, `game_style_settings`, `wiki-generate` images, diplomacy rooms.
- Vstupem je **hotový svět** — funkce dohledává města/regiony/frakce z DB místo aby si je vytvářela.
- Přejmenuje se na `narrate-world` (ponechán alias `world-generate-init` po nějakou dobu).

### C. Geography blueprint — jeden formát (v9)

`generate-world-map` rozšířit, aby konzumoval `terrain.geographyBlueprint` ve formátu v9 (`startQ/startR/endQ/endR`, `biomeZones.centerQ/centerR/radius/intensity`, `climateGradient`, `oceanPattern`). Mapování ze starého `x1/y1/x2/y2/width` smaže — wizard a translate-premise-to-spec už produkují jen v9.

`composeBootstrapFromSpec` doplnit, aby do `map.terrain` posílal i `geographyBlueprint` (dnes posílá jen 5 skalárů).

### D. Synchronní seeding kostry říše (nový shared modul)

Nový soubor `supabase/functions/_shared/seed-realm-skeleton.ts`:
- vytvoří 1 country/region/provincii/město na hráče i na každou AI frakci
- pozice měst z `mapStartPositions` filtrované přes `province_hexes.biome_family ∈ {plains,hills,forest,coast}` a `is_passable`
- `realm_resources` (gold=100, stability=70, …), `player_resources` (food/wood/stone/iron/wealth income+upkeep+stockpile)
- `civ_identity` minimální řádek (rozšíření AI v naratívní fázi)
- vrací `{regionIds, provinceIds, cityIds, factionPlayerMap}` — předáno do navazujících kroků

### E. Ontologická vrstva po vzniku grafu

Po `compute-province-nodes` a `compute-province-routes`:
- `world-layer-bootstrap` (synchronně) má již existující uzly → mythic_seeds se reálně přiřadí; `selected_lineages` se zapíšou do `realm_heritage` se vstřikem `heritage_effects` per hráč.
- Nově dopočítat `route_state` rovnou pro nově vzniklé routes (lifecycle_state=usable, maintenance=50, quality=50) — backfill blok ve `world-layer-bootstrap` už toto řeší, jen se konečně bude volat na neprázdný graf.

### F. Status race fix

`init_status: ready` se nastaví jen v kroku 10 (po dokončení synchronní části). UI tak nepřepne do prázdného světa. Step `narrate-world` na pozadí jen doplní persons/wonders/wiki bez vlivu na hratelnost.

### G. UI: wizard ukazuje stejné, co bude v mapě

- `SchematicMapPreview` už dnes volá `preview-world-map` se stejným payloadem jako bootstrap → po sjednocení (C) bude reálně shodné.
- `LineageSelector` vybrané lineages se opravdu propíší na hráčův realm (E).
- `BootstrapProgressPanel` dostane nové kanonické kroky: validate → map → realm → nodes → routes → ontology → economy → ready (a pak optionálně narrative-pending tag).

### H. Dokumentace → implementace

Implementuje se Track 2 minimum z `world-layer-contract.md`:
- `route_state` lifecycle (usable/degraded/blocked) — engine už existuje v `world-layer-tick`, jen ho po prvním tahu reálně dostane co spravovat.
- `heritage_effects` zapojit do `commit-turn` Phase 8 (pasivní bonusy) — již částečně přítomno, ověřit.

Z `docs/economy-v4.3-architecture.md` zapojit:
- 12 kanonických košů (`city_market_baskets`) — `refresh-economy` to už řeší, ale jen pokud existují města a recepty; po E to bude pravda od tahu 1.

---

## Technický rozsah úprav (pro hráče: co se reálně změní)

### Soubory

**Edit:**
- `supabase/functions/create-world-bootstrap/index.ts` — orchestrátor 11 kroků, synchronní seeding, nová detached větev jen pro narativu
- `supabase/functions/world-generate-init/index.ts` — odstranit map/realm/cities/regions/provinces/civ_identity/init_status; ponechat AI naratívu nad existujícími entitami
- `supabase/functions/generate-world-map/index.ts` — konzumovat `terrain.geographyBlueprint` ve formátu v9
- `src/lib/worldBootstrapPayload.ts` — `composeBootstrapFromSpec` posílá i `geographyBlueprint`
- `supabase/functions/world-layer-bootstrap/index.ts` — volat synchronně po `compute-province-nodes/routes` (bez vlastního změny logiky)
- `src/components/world-setup/BootstrapProgressPanel.tsx` — nové kanonické kroky

**Vytvořit:**
- `supabase/functions/_shared/seed-realm-skeleton.ts` — sdílený seeder kostry (region+province+město+resources)

**Beze změny:**
- `compute-province-nodes`, `compute-province-routes`, `refresh-economy`, `world-layer-tick`, `commit-turn` (jen je teď zavoláme ve správném pořadí).

### Riziko
- 150 s rozpočet: synchronní pořadí (mapa 5–10 s, seed 2 s, nodes 3–5 s, routes 3–5 s, layer 1 s, economy 5 s) ≈ 25 s. AI naratíva (~60–120 s) běží detached. Bezpečně do limitu.
- Idempotence: každý krok kontroluje existenci (UPSERT/onConflict) — re-bootstrap stejné session vrátí ready bez opakování.

### Co tímto nedělám
- Track 2 plný rozsah (control_progression, migration↔economy contract, integration_progress) — zůstává na další iteraci. Aktuální cíl je **mít hratelný svět od tahu 1**.
- Rebalancovat ekonomiku v4.3 — engine zůstává, jen mu konečně dáme vstupy.

Po schválení provedu úpravy v jednom průchodu a otestuji na nové session.
