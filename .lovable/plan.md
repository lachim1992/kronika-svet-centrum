
# Integrace Node Editoru s Economy v4.1

## Problém

Node Editor (`DevNodeEditor.tsx`) operuje na **starém modelu** (v2) — pracuje s `production_output`, `wealth_output`, `food_value` jako přímými čísly, zatímco v4.1 přidala do `province_nodes`:

- `node_subtype` (klíč do `NODE_CAPABILITY_MAP`)
- `node_tier` (major/minor/micro)  
- `capability_tags[]` (co uzel umí vyrábět)
- `guild_level` (cechovní úroveň)
- `specialization_scores` (JSON, kumulativní historie produkce)
- `city_id` (vazba na město)
- `spawned_strategic_resource`

Editor tyto sloupce **vůbec nezobrazuje ani neupravuje**. Současně `FullNode` type a `NODE_TYPES` seznam neobsahují nové subtypy (bakery, forge, weaver, guild_workshop, etc.).

## Duplicitní logiky (dvě source of truth)

| Koncept | Starý zdroj | v4.1 zdroj |
|---------|------------|------------|
| Produkce uzlu | `production_output` (přímé číslo) | `node_subtype` → `computeNodeProduction()` z `nodeTypes.ts` |
| Typ uzlu | `NODE_TYPES` (9 hodnot) | `NODE_CAPABILITY_MAP` (35+ subtypů) z `goodsCatalog.ts` |
| Strategická surovina | `strategic_resource_type` + `strategic_resource_tier` | `spawned_strategic_resource` |
| Trade efektivita | `trade_efficiency` (přímé číslo) | Vypočtená z `flow_role` + `guild_level` |

## Plán implementace

### 1. Rozšířit FullNode type a fetch
- Přidat chybějící sloupce: `node_subtype`, `node_tier`, `capability_tags`, `guild_level`, `specialization_scores`, `city_id`, `spawned_strategic_resource`, `label`
- Fetch query rozšířit o tyto sloupce

### 2. Přepracovat "Identita & Klasifikace" skupinu
- Přidat pole `node_subtype` jako Select — dynamický seznam dle `NODE_CAPABILITY_MAP` klíčů
- Přidat pole `node_tier` jako Select (major/minor/micro)
- Přidat `capability_tags` jako multi-tag editor (checkboxy z `CAPABILITY_TAGS`)
- Při změně `node_subtype` automaticky přednastavit `capability_tags` z `NODE_CAPABILITY_MAP`
- Zobrazit `city_id` jako readonly vazbu

### 3. Přidat novou skupinu "Goods & Cechy"
- `guild_level` (number 0–5)
- `specialization_scores` (JSON editor / klíč-hodnota tabulka)
- `spawned_strategic_resource` (text)
- Zobrazit aktuální `node_inventory` (readonly fetch z DB) — co uzel aktuálně skladuje

### 4. Aktualizovat "Produkce & Ekonomika" skupinu
- Přidat info badge "v4.1: produkce se počítá z node_subtype" 
- Označit `production_output`, `wealth_output`, `food_value` jako "computed" (šedé, s tooltipem že jsou přepisovány enginem)
- Přidat live preview: `computeNodeProduction(tier, subtype, upgrade, biome)` výsledek vedle aktuální DB hodnoty

### 5. Vzorce (live) tab — aktualizovat
- Přidat v4.1 vzorce: goods chain, guild quality boost, demand satisfaction
- Nahradit zastaralý `BASE_PRODUCTION[node_type]` breakdown za `computeNodeProduction` preview
- Zobrazit `node_inventory` obsah pro vybraný uzel

### 6. Globální konstanty tab — rozšířit
- Přidat sekci `CAPABILITY_TAGS` (přehled všech tagů)
- Přidat sekci `DEMAND_BASKETS` (přehled košů poptávky)
- Přidat sekci `NODE_CAPABILITY_MAP` (subtype → role + tags mapování)

### 7. Sjednotit NODE_TYPES
- `NODE_TYPES` array v editoru (9 hodnot) nahradit za union starých major typů + všech subtypů z `NODE_CAPABILITY_MAP`
- Přidat `node_subtype` dropdown filtrovaný dle zvoleného `node_tier`

## Technické detaily

- Import `NODE_CAPABILITY_MAP`, `CAPABILITY_TAGS`, `DEMAND_BASKETS` z `goodsCatalog.ts`
- Import `computeNodeProduction`, `MINOR_NODE_TYPES`, `MICRO_NODE_TYPES` z `nodeTypes.ts`
- Fetch `node_inventory` pro vybraný uzel jako readonly sekci
- Zachovat zpětnou kompatibilitu — staré sloupce zůstanou editovatelné, ale označené jako "computed by engine"
- Jeden soubor: `src/components/dev/DevNodeEditor.tsx`
