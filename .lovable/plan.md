

# Dev Tools v mapovem hex detail panelu

## Co se zmeni

Po rozkliknuti hexu na mape se v dev mode objevi rozbalitelne sekce pod stavajicimi akcemi. Kazda sekce je `Collapsible` accordion, vizualne oznacena `DEV` badge.

## Sekce

### 1. DEV: Suroviny hexu (Resource Deposits)
- Zobrazuje aktualni `resource_deposits[]` z `province_hexes`
- Tlacitka pro rychle pridani suroviny: wheat, iron, stone, timber, game, fish, salt, copper, gold, marble, herbs, resin (dle biomu nabidne relevantni)
- Kazda surovina ma quality slider (1-5) a tlacitko Pridat
- Moznost odebrat existujici surovinu
- Uklada primo do `province_hexes.resource_deposits` pres Supabase update

### 2. DEV: Node Editor (inline)
- Pro kazdy uzel na hexu: rozbalitelny mini-editor
- Editovatelne: `node_subtype` (Select z NODE_CAPABILITY_MAP), `node_tier`, `capability_tags` (checkboxy), `guild_level` (0-5), `flow_role`, `spawned_strategic_resource`
- Tlacitko Smazat uzel (s potvrzenim)
- Tlacitko Prejmenovat
- Pri zmene `node_subtype` auto-nastavi `capability_tags`
- Uklada primo do `province_nodes`

### 3. DEV: Inventory & Poptavka
- Readonly fetch `node_inventory` pro uzly na hexu
- Readonly fetch `demand_baskets` pro mesto na hexu (pokud existuje)
- Zobrazuje stav zasoby / poptavka satisfaction jako progress bary

### 4. DEV: Obchodni trasa
- Dropdown "Uzel A" (predvyplneny uzlem na tomto hexu)
- Dropdown "Uzel B" (vsechny major/minor uzly v session)
- Select typ trasy (land_road, river_route, sea_lane, caravan_route)
- Tlacitko "Vytvorit trasu" — insert do `province_routes` s `path_dirty: true`
- Tlacitko "Prepocitat toky" — invoke `compute-hex-flows`
- Integrace se stavajicim `RouteCorridorsOverlay` a `RoadNetworkOverlay` (po refreshi se trasa zobrazi na mape)

### 5. DEV: Quick Actions
- Prepocitat toky (invoke `compute-hex-flows`)
- Prepocitat province graph (invoke `compute-province-graph`)
- Prepocitat trade flows (invoke `compute-trade-flows`)

## Technicke detaily

### Soubor: `src/components/WorldHexMap.tsx`
- Pridani stavu pro dev sekce (expandovane/kolapsovane)
- Import `NODE_CAPABILITY_MAP`, `CAPABILITY_TAGS` z `goodsCatalog.ts`
- Import `Collapsible, CollapsibleContent, CollapsibleTrigger` z ui
- Fetch `node_inventory` a `demand_baskets` on-demand pri rozkliknuti dev sekce
- Vsechny dev sekce schovane za `{devMode && (...)}`

### Datove operace
- Resource deposits: `supabase.from("province_hexes").update({ resource_deposits }).eq("id", hexId)`
- Node edit: `supabase.from("province_nodes").update({...}).eq("id", nodeId)`
- Node delete: smazat routes + flow_paths + node (jako v DevNodeSpawner)
- Route create: insert do `province_routes` s `path_dirty: true`
- Inventory read: `supabase.from("node_inventory").select("*").eq("node_id", nodeId)`
- Demand read: `supabase.from("demand_baskets").select("*").eq("city_id", cityId)`

### NodeOnHex interface
- Rozsireni o: `capability_tags`, `guild_level`, `flow_role`, `spawned_strategic_resource`, `node_subtype` (uz tam je), `city_id`

### Vzhled
- Kazdy accordion: border-primary/20, DEV badge zluta
- Kompaktni, maximalne usetrny prostor (text-[10px], h-7 buttony)
- Po ukladani automaticky `fetchNodes()` + `setRouteRefreshKey` pro refresh mapy

