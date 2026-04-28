## Cíl

Z cest ve WorldMap udělat živé objekty: každá má vlastní jméno, jde rozkliknout, upgradovat na vyšší tier, navazovat na ní další cesty a hráč si může při stavbě sám vybrat hexy, kterými má vést (plánování koridorů pro budoucí expanzi).

---

## 1. Schema cesty (DB migrace)

Doplnit do `province_routes`:
- `name TEXT` — uživatelský název (např. "Via Korint–Lachim"). Pokud chybí, fallback na auto-generovaný.
- `waypoints JSONB` — povinné průchozí hexy `[{q,r}, ...]` zadané hráčem; server tyto body **musí** zařadit do A* trasy.

Žádný drop sloupců. Existující cesty zůstávají (`name = NULL` → fallback v UI).

---

## 2. Stavba s waypointy (Build flow v2)

V `WorldMapBuildPanel`:
- Přidat **Waypoint mode** — toggle "Plánovat trasu". Po zapnutí:
  - Vybraný `nodeA` se zafixuje jako start.
  - Klikání na hexy v mapě přidává/odebírá waypointy do seznamu (pořadí zachováno, drag-to-reorder není v MVP).
  - Druhý uzel B se vybere ze selectu nebo kliknutím na node-hex.
  - Pod náhledem A* se ukáže lišta s emoji řetězcem waypointů + tlačítka "Smazat" a "Vyčistit".
- Nové pole **"Název cesty"** (volitelné, max 60 znaků). Placeholder = `Via {NodeA} – {NodeB}`.
- Server (`command-dispatch / executeBuildRoute`) přijme `name` + `waypoints[]`. A* běží jako řetěz: A → wp1 → wp2 → … → B; pokud nějaký segment není průchozí, vrátí `error: "Waypoint X je nepřístupný"`.

UI mapy (`WorldHexMap.handleTileClick`) musí znát build režim — zavedeme lehký kontext nebo prop `buildMode: { active, onHexPick }` předaný z `WorldMapTab` do mapy a panelu, aby si rozdělili kliky:
- pokud `buildMode.active` → klik na hex jde do panelu (waypoint), Sheet se neotvírá;
- jinak normální chování (Sheet provincie nebo route detail).

---

## 3. Klikatelné cesty + detail (Route Sheet)

`RoadNetworkOverlay` rozšířit:
- Pro každou polyline přidat neviditelnou tlustší "hit" polyline (stroke ~14 px, `stroke="transparent"`, `pointer-events: stroke`) jako klikací cíl.
- `onClick` → `onRouteClick(routeId)` callback do rodiče.
- Hover: zvýraznit (zvýšit opacity / glow).

V `WorldHexMap` (nebo přímo ve `WorldMapTab`) přidat nový `RouteDetailSheet`:
- **Hlavička:** název cesty (editovatelný inline pro vlastníka), `node_a ↔ node_b`, tier badge.
- **Statistiky:** route_type, upgrade_level, capacity_value, control_state, vulnerability_score, hex_path_length, build_cost.
- **Údržba (route_state):** maintenance_level, lifecycle_state, turns_unpaid.
- **Akce (jen pro vlastníka = `controlled_by` nebo `metadata.built_by`):**
  - **Upgrade tier** (trail → road → paved): tlačítko + cena, posílá `UPGRADE_ROUTE`.
  - **Investovat do údržby** (50 g) — `manage-route INVEST_MAINTENANCE`.
  - **Obnovit** (200 g) když `blocked` — `RESTORE_ROUTE`.
  - **Opustit cestu** — `ABANDON_ROUTE` s confirm dialogem.
  - **Přejmenovat** — nový lehký command `RENAME_ROUTE { routeId, name }` přes command-dispatch (idempotent on (routeId, name)).
  - **Postavit navazující cestu** — tlačítko "Stavět odsud", které předvyplní `nodeA` v build panelu jedním z koncových uzlů a otevře build mode.

---

## 4. Upgrade systém (lineární tier)

Rozšířit existující `UPGRADE_ROUTE` v `command-dispatch`:
- Definovat tier order: `trail → road → paved` (a držet legacy aliasy `land_road`/atd. mapované do `road`).
- Při upgradu změnit `route_type` na další tier + zvednout `upgrade_level`, `capacity_value`, `speed_value`, snížit `vulnerability_score`.
- Cena: `build_cost * 0.5 * (level+1)` (už existuje), přidat strop `paved` (nelze upgradovat dál).
- Logovat `world_event` typu `route_upgraded` pro chronicle.

UI v `RouteDetailSheet` ukáže "Aktuální: Cesta → Další: Dlážděná (cena 200 g)" nebo "Maximální tier".

---

## 5. Pojmenování — UI logika

- Při stavbě: vstupní pole. Pokud prázdné → server uloží `name = NULL`, UI render používá `name ?? "Via {nodeA.name} – {nodeB.name}"`.
- V detailu: ikona tužky vedle názvu pro vlastníka → modal/inline edit → `RENAME_ROUTE`.
- Popisek v `RoadNetworkOverlay` (na hover tooltip) ukáže název.

---

## 6. Soubory, které se změní / vytvoří

**DB migrace:**
- Přidat sloupce `name`, `waypoints` do `province_routes`.

**Backend (`supabase/functions/command-dispatch/index.ts`):**
- `executeBuildRoute` — přijímat `name`, `waypoints`, řetězit A* mezi waypointy, ukládat oba sloupce.
- `executeUpgradeRoute` — tier ladder (trail→road→paved), aktualizace stat, validace stropu.
- Nový handler `executeRenameRoute` + zaregistrovat command type `RENAME_ROUTE`.

**Frontend:**
- `src/components/map/WorldMapBuildPanel.tsx` — waypoint mode, název, předání `buildMode` callbacku ven.
- `src/components/map/RoadNetworkOverlay.tsx` — neviditelná hit polyline + `onRouteClick` prop, hover state.
- `src/components/map/RouteDetailSheet.tsx` — **nový soubor**, full detail + akce.
- `src/components/WorldHexMap.tsx` — koordinace `selectedRouteId` ↔ `selectedHex`, build mode gating klikání na hexy, vykreslení `RouteDetailSheet`.
- `src/pages/game/WorldMapTab.tsx` — přemostění stavu `buildMode` mezi panelem a mapou.

**`src/lib/commands.ts`:** typy pro `BUILD_ROUTE` (name, waypoints) a `RENAME_ROUTE`.

---

## 7. Co je mimo rozsah (pro tuto iteraci)

- Drag waypointů pro reorder (zatím jen smaž a přidej znovu).
- Multi-osa upgrade (capacity/safety/speed zvlášť) — zachováváme lineární tier.
- AI generování názvů.
- Vizualizace plánovaných (zatím nepostavených) koridorů jako "ghost cest" — lze přidat v dalším kroku.

---

## Akceptační kritéria

1. Klik na čáru cesty otevře Sheet s názvem, statistikami a akcemi.
2. Vlastník může cestu přejmenovat, upgradovat (trail→road→paved), udržovat, obnovit, opustit.
3. V build módu lze sekvenčně klikat hexy a vytvořit tak povinný koridor; A* respektuje waypointy.
4. Stavba přijímá vlastní název (nebo fallback `Via A – B`).
5. Existující cesty bez `name` a `waypoints` fungují beze změny.
6. Po upgradu se polyline na mapě překreslí novým tier stylem.
