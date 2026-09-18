import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowUpRight, Castle, Check, Factory, Flag, Grid3x3, Home, Landmark, Layers3, Loader2, Minus, Plus, Route as RouteIcon, Shield, Store, Trees, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";

import { dispatchCommand } from "@/lib/commands";
import { gridDistance, projectCell, squareDiamondPoints } from "@/lib/mapTopology";
import { parcelClaimCost, POPULATION_PER_SLOT, TILE_PARCEL_COLS, TILE_PARCEL_ROWS, armyParcelFootprint, armyCampParcels, fallbackArmyParcel, riverChannelCells, generateTileParcels, type TileParcelSpec } from "@/lib/tileParcels";
import { localRoadSegments, tileInfrastructureLevel } from "@/lib/tileInfrastructure";
import { CARDINAL_STEPS, areSubRoadNeighbours, macroPathFromSubRoad, subRoadDetour, subRoadPathBetween, tileBridgeCells, tileRoadBranches, tileRoadCells, tileRoadCost, type RoadStep, type SubRoadCell } from "@/lib/tileRoads";
import { cityCatchmentRadius, nodeCatchmentRadius } from "@/lib/roadCatchment";
import { useIsMobile } from "@/hooks/use-mobile";
import ArmyMarker from "@/components/map/ArmyMarker";
import spriteFarmstead from "@/assets/map/node-farmstead.png";
import spriteWorkshop from "@/assets/map/node-workshop.png";
import spriteGuardPost from "@/assets/map/node-guard-post.png";
import spriteTradePost from "@/assets/map/node-trade-post.png";
import spriteRiverWharf from "@/assets/map/node-river-wharf.png";
import spriteHamlet from "@/assets/map/node-hamlet.png";
import spriteFortress from "@/assets/map/node-fortress.png";
import spritePort from "@/assets/map/node-port.png";
import spriteShrine from "@/assets/map/node-shrine.png";
import spriteMine from "@/assets/map/node-mine.png";
import spriteRuin from "@/assets/map/node-ruin.png";
import buildResidential from "@/assets/map/build-residential.png";
import buildCulture from "@/assets/map/build-culture.png";
import buildInfrastructure from "@/assets/map/build-infrastructure.png";
import buildMilitary from "@/assets/map/build-military.png";
import buildArena from "@/assets/map/build-arena.png";
import buildBardsHouse from "@/assets/map/build-bards-house.png";
import buildTemple from "@/assets/map/build-temple.png";
import buildTheatre from "@/assets/map/build-theatre.png";
import buildMonastery from "@/assets/map/build-monastery.png";
import buildLibrary from "@/assets/map/build-library.png";
import buildCourthouse from "@/assets/map/build-courthouse.png";
import buildStadium from "@/assets/map/build-stadium.png";
import buildSmithy from "@/assets/map/build-smithy.png";
import buildManufactory from "@/assets/map/build-manufactory.png";
import buildMint from "@/assets/map/build-mint.png";
import buildSawmill from "@/assets/map/build-sawmill.png";
import buildGlassworks from "@/assets/map/build-glassworks.png";
import buildGranary from "@/assets/map/build-granary.png";
import buildMarket from "@/assets/map/build-market.png";
import buildAqueduct from "@/assets/map/build-aqueduct.png";
import buildSewer from "@/assets/map/build-sewer.png";
import buildBaths from "@/assets/map/build-baths.png";
import buildBridge from "@/assets/map/build-bridge.png";
import buildRoad from "@/assets/map/build-road.png";
import buildWell from "@/assets/map/build-well.png";
import buildWalls from "@/assets/map/build-walls.png";
import buildRidingSchool from "@/assets/map/build-riding-school.png";
import buildBarracks from "@/assets/map/build-barracks.png";
import buildSiegeWorkshop from "@/assets/map/build-siege-workshop.png";
import buildWatchtower from "@/assets/map/build-watchtower.png";
import buildShootingRange from "@/assets/map/build-shooting-range.png";
import buildHeadquarters from "@/assets/map/build-headquarters.png";
import buildQuarry from "@/assets/map/build-quarry.png";


const NODE_SPRITE: Record<string, string> = {
  farmstead: spriteFarmstead, workshop: spriteWorkshop, guard_post: spriteGuardPost,
  trade_post: spriteTradePost, river_wharf: spriteRiverWharf,
  fortress: spriteFortress, port: spritePort, trade_hub: spriteTradePost,
  village_cluster: spriteHamlet, neutral_settlement: spriteHamlet,
  shrine: spriteShrine, religious_center: spriteShrine, ruin: spriteRuin,
  resource_outpost: spriteMine, resource_node: spriteMine,
};
const nodeSprite = (node: { node_type: string; node_subtype: string | null }) =>
  NODE_SPRITE[node.node_subtype || ""] || NODE_SPRITE[node.node_type] || spriteHamlet;

/** Buildable subnodes — costs mirror SUBNODE_DEFS in command-dispatch. */
type SubnodeOption = { key: string; label: string; gold: number; production: number; hint: string };
const SUBNODE_OPTIONS: SubnodeOption[] = [
  { key: "farmstead", label: "Produkční dvůr", gold: 35, production: 45, hint: "+4 zásoby" },
  { key: "workshop", label: "Řemeslná dílna", gold: 45, production: 55, hint: "+5 produkce" },
  { key: "guard_post", label: "Strážnice", gold: 50, production: 65, hint: "kontrola pole" },
  { key: "trade_post", label: "Obchodní stanice", gold: 70, production: 40, hint: "+5 bohatství" },
  { key: "river_wharf", label: "Říční překladiště", gold: 80, production: 60, hint: "říční obchod" },
];


/**
 * Painted picture for a building or district.
 *
 * Keywords match only at the START of a word (so "pevnost" no longer reads as
 * "most" and "Dokonalost" no longer reads as "dok"), and the longest matching
 * keyword wins, so specific names beat generic ones. Category is the fallback.
 */
const BUILD_KEYWORD_SPRITE: Array<[string, string[]]> = [
  [buildArena, ["arén", "arena", "amfiteát", "kolose", "kolize", "gladiát"]],
  [buildBardsHouse, ["bard", "pěvec", "pěvc", "hudeb", "loutn"]],
  [buildTemple, ["chrám", "katedrál", "svatyn", "bazilik", "oltář", "mauzole", "hřbitov", "kaple"]],
  [buildTheatre, ["divadl", "odeon", "scén"]],
  [buildMonastery, ["klášter", "opatstv", "poustev", "konvent"]],
  [buildLibrary, ["knihovn", "univerz", "akademi", "škol", "písař", "archiv", "skript", "observat"]],
  [buildCourthouse, ["soud", "radnic", "úřad", "kancelář", "palác", "sněm", "kuri"]],
  [buildStadium, ["stadion", "cirk", "závodišt", "hipodr", "hřišt"]],
  [buildSmithy, ["kovárn", "kovář", "hut", "slévárn", "výheň", "zbrojíř"]],
  [buildManufactory, ["manufaktur", "dílna", "dílny", "tkaln", "přádeln", "barvírn", "koželuž", "pivovar", "lihovar", "papírn"]],
  [buildMint, ["mincovn", "banka", "bankov", "pokladn", "penězom", "směnárn"]],
  [buildSawmill, ["pila", "pily", "dřevo", "řezb", "truhl", "mlýn", "lesnic"]],
  [buildGlassworks, ["sklárn", "sklo", "hrnčí", "keramik", "cihel", "vápenk"]],
  [buildGranary, ["sýpk", "špýchar", "sklad", "obiln", "silo", "pekárn"]],
  [buildMarket, ["tržišt", "trh", "trhy", "obchod", "celnic", "bazar", "krám", "hostinec", "hospod", "krčm", "tavern"]],
  [buildAqueduct, ["akvadukt", "vodovod", "vodní věž"]],
  [buildSewer, ["kanalizac", "stok", "latrín"]],
  [buildBaths, ["lázn", "lázeň", "terma", "kúpel", "špitál", "nemocnic", "lékárn", "hospic"]],
  [buildBridge, ["most", "mostek", "lávka", "brod"]],
  [buildRoad, ["silnic", "cesta", "cesty", "dlážd", "dlážd", "stezk"]],
  [buildWell, ["studn", "cistern", "vodojem", "fontán", "kašna"]],
  [buildWalls, ["hradb", "bašt", "opevněn", "palisád", "brána", "válec"]],
  [buildRidingSchool, ["jízd", "stáj", "koň", "kon", "maneg"]],
  [buildBarracks, ["kasárn", "zbrojnic", "výcvik", "arzenál", "posádk"]],
  [buildSiegeWorkshop, ["obléhac", "obléh", "katapult", "balist", "beran"]],
  [buildWatchtower, ["věž", "strážn", "hláska", "maják", "rozhledn"]],
  [buildShootingRange, ["střelnic", "lukostřel", "kušen"]],
  [buildHeadquarters, ["velitelstv", "generál", "štáb", "citadel", "pevnost", "tvrz", "donjon"]],
  [buildQuarry, ["lom", "kamenolom", "pískovn"]],
  [spriteMine, ["důl", "dolu", "šacht", "ruda", "rudn", "těžb", "sůl", "solivar"]],
  [spriteFarmstead, ["farm", "vinice", "vinohrad", "vinař", "ryb", "statek", "dvůr", "pole", "polnost", "sad", "pastvin", "chmeln", "ovčín", "kravín"]],
  [spritePort, ["přístav", "dok", "loděnic", "molo", "kotvišt", "překlad"]],
  [buildResidential, ["čtvrť", "obytn", "domy", "kolonie", "předmě", "nájem", "sirotč", "ubytov", "insul"]],
];
/** Flattened, longest-keyword-first so specific names win over short generic ones. */
const BUILD_NAME_SPRITE: Array<[RegExp, string]> = BUILD_KEYWORD_SPRITE
  .flatMap(([sprite, keywords]) => keywords.map(keyword => ({ sprite, keyword })))
  .sort((a, b) => b.keyword.length - a.keyword.length)
  .map(({ sprite, keyword }) => [
    new RegExp(`(^|[^\\p{L}])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu"),
    sprite,
  ] as [RegExp, string]);
/** Terrain a new settlement may be founded on — mirrors the server rule in FOUND_CITY. */
const CITY_ALLOWED_BIOMES = ["plains", "hills", "forest", "swamp"];

const CATEGORY_SPRITE: Record<string, string> = {
  economic: spriteWorkshop, cultural: buildCulture, infrastructure: buildInfrastructure,
  military: buildMilitary, residential: buildResidential,
};
const buildSprite = (name: string, category?: string) =>
  BUILD_NAME_SPRITE.find(([pattern]) => pattern.test(name))?.[1]
  || CATEGORY_SPRITE[category || ""] || spriteHamlet;
const BUILD_CATEGORY_LABEL: Record<string, string> = {
  economic: "Hospodářství", cultural: "Kultura a víra", infrastructure: "Infrastruktura",
  military: "Vojenství", residential: "Bydlení", administrative: "Správa", ostatní: "Ostatní",
};
const LAND_USE_SPRITE: Record<string, string> = {
  residential: buildResidential, commercial: spriteTradePost, industrial: spriteWorkshop,
  military: buildMilitary, sacred: spriteShrine, civic: buildCulture,
  infrastructure: buildInfrastructure, agricultural: spriteFarmstead,
};
/** Sprites for the production district families shown in the build panel. */
const DISTRICT_SPRITE: Record<string, string> = {
  farm_belt: spriteFarmstead, craft_row: spriteWorkshop, manufactory_yard: buildInfrastructure,
  depot_quarter: spriteTradePost, arsenal_quarter: buildMilitary,
};


/** District families live in a shared catalogue so the server validates the same numbers. */
import { RESIDENTIAL_DISTRICTS, PRODUCTION_DISTRICTS, PRODUCTION_PER_RESIDENTIAL, type DistrictBlueprint } from "@/lib/cityDistricts";
import { DEMAND_BASKETS } from "@/lib/goodsCatalog";


interface Props {
  sessionId: string;
  playerName: string;
  currentTurn?: number;
  onCityClick?: (cityId: string) => void;
  gridKind?: "hex6" | "square4";
  onDetailOpenChange?: (open: boolean) => void;
}

type Tile = { id: string; q: number; r: number; grid_x: number | null; grid_y: number | null; province_id: string | null; biome_family: string; owner_player: string | null; mean_height: number | null; is_passable: boolean; has_river: boolean | null; river_direction: string | null; coastal: boolean | null };
type StoredSubBiome = { grid_x: number; grid_y: number; parcel_index: number; parcel_x: number; parcel_y: number; sub_biome: string };
type City = { id: string; name: string; province_q: number; province_r: number; grid_x: number | null; grid_y: number | null; owner_player: string; settlement_level: string; population_total: number; housing_capacity: number; development_level: number; birth_rate: number; death_rate: number; migration_pressure: number; founded_parcel_index: number | null };
type Node = { id: string; name: string; hex_q: number; hex_r: number; grid_x: number | null; grid_y: number | null; node_type: string; node_tier: string; node_subtype: string | null; city_id: string | null; controlled_by: string | null; production_output: number; wealth_output: number; food_value: number; parcel_index: number | null; upgrade_level: number | null; infrastructure_level: number | null };
type Army = { id: string; name: string; hex_q: number; hex_r: number; grid_x: number | null; grid_y: number | null; player_name: string; soldiers: number; morale: number; unit_count: number; power: number; stance: string; formation_type: string; assignment: string; moved_this_turn: boolean; parcel_index: number | null };
type PathCell = { x?: number; y?: number; q?: number; r?: number };
type Route = { route_id: string | null; path_cells: PathCell[] | null; hex_path: PathCell[] | null; transport_modes?: string[] | null };
type ParcelContent = { id: string; parcel_id: string; entity_type: string; entity_id: string; slots_used: number };
type TileInfrastructure = { id: string; grid_x: number; grid_y: number; owner_player: string; level: number; target_level: number | null; status: string; progress: number };
type RoadSegment = { id: string; project_id: string | null; owner_player: string; from_x: number; from_y: number; to_x: number; to_y: number; level: number; status: string; progress: number; capacity: number; utilization: number; maintenance: number; bridge_count: number; sub_path_cells: SubRoadCell[] };
type RoadProject = { id: string; owner_player: string; level: number; status: string; progress: number; path_cells: Array<{ x: number; y: number }>; sub_path_cells: SubRoadCell[]; bridge_count: number; cost_gold: number; cost_production: number };
type BuildingTemplate = { id: string; name: string; category: string; description: string; cost_wealth: number; cost_wood: number; cost_stone: number; cost_iron: number; build_turns: number; effects: unknown; max_level: number; level_data: unknown };
type ConstructionEntity = { id: string; name: string; category?: string | null; status: string; build_started_turn: number; build_duration: number; completed_turn: number | null; parcel_id: string | null };
/** A city district — either housing or a workshop pointed at one demand basket. */
type CityDistrict = {
  id: string; city_id: string; name: string; status: string; district_type: string;
  basket_key: string | null; basket_output: number; is_staffed: boolean; population_capacity: number; parcel_id: string | null;
};

/** One of the 36 sub-parcels of a map cell — the only city land model. */
type TileParcel = {
  id: string; grid_x: number; grid_y: number; parcel_index: number; parcel_x: number; parcel_y: number;
  sub_biome: string; elevation: number; buildable: boolean; build_cost_multiplier: number;
  capacity_slots: number; status: string; land_use: string | null; city_id: string | null; owner_player: string | null;
};

const NODE_STYLE: Record<string, { landUse: string; accent: string; walled: boolean; houses: number; label: string }> = {
  fortress: { landUse: "military", accent: "var(--map-city-rival)", walled: true, houses: 2, label: "pevnost" },
  port: { landUse: "infrastructure", accent: "var(--map-route)", walled: false, houses: 2, label: "přístav" },
  trade_hub: { landUse: "commercial", accent: "var(--map-route)", walled: false, houses: 3, label: "obchodní uzel" },
  village_cluster: { landUse: "residential", accent: "var(--map-city-own)", walled: false, houses: 4, label: "vesnice" },
  neutral_settlement: { landUse: "residential", accent: "var(--map-marker-edge)", walled: false, houses: 3, label: "neutrální osada" },
  shrine: { landUse: "sacred", accent: "var(--map-focus)", walled: false, houses: 1, label: "svatyně" },
  religious_center: { landUse: "sacred", accent: "var(--map-focus)", walled: true, houses: 2, label: "duchovní centrum" },
  ruin: { landUse: "open", accent: "var(--map-mountain-edge)", walled: false, houses: 1, label: "ruina" },
  resource_outpost: { landUse: "industrial", accent: "var(--map-city-own)", walled: false, houses: 2, label: "výrobní stanice" },
  resource_node: { landUse: "industrial", accent: "var(--map-marker-edge)", walled: false, houses: 1, label: "zdrojové ložisko" },
};

const TILE_SIZE = 42;
const BIOMES: Record<string, [string, string]> = {
  sea: ["var(--map-water)", "var(--map-water-edge)"], plains: ["var(--map-plains)", "var(--map-plains-edge)"],
  grassland: ["var(--map-plains)", "var(--map-plains-edge)"], forest: ["var(--map-forest)", "var(--map-forest-edge)"],
  dense_forest: ["var(--map-forest)", "var(--map-forest-edge)"], hills: ["var(--map-hills)", "var(--map-hills-edge)"],
  mountains: ["var(--map-mountain)", "var(--map-mountain-edge)"], mountain: ["var(--map-mountain)", "var(--map-mountain-edge)"],
  desert: ["var(--map-desert)", "var(--map-desert-edge)"], swamp: ["var(--map-swamp)", "var(--map-swamp-edge)"],
  tundra: ["var(--map-tundra)", "var(--map-tundra-edge)"],
};

const SUB_BIOME_LABEL: Record<string, string> = {
  fertile_flat: "úrodná rovina", grassland: "pastvina", hillock: "pahorek", boggy_dip: "mokrá sníženina",
  dry_flat: "vyprahlá rovina", gravel_rise: "štěrkový hřbet", dense_forest: "hustý les", clearing: "průsek",
  creek_bank: "břeh potoka", ridge_woods: "lesnatý hřeben", thick_canopy: "neprostupný prales", terrace: "terasa",
  saddle: "sedlo", steep_slope: "prudký svah", sheltered_hollow: "chráněná úžlabina", crag: "skalní stěna",
  mountain_shelf: "horská police", pass_floor: "dno průsmyku", sand_flat: "písečná plošina", dune: "duna",
  rocky_patch: "kamenitá plocha", oasis_edge: "okraj oázy", frozen_flat: "zmrzlá rovina",
  permafrost_rise: "permafrostový hřbet", reed_marsh: "rákosiště", raised_bank: "vyvýšený břeh",
  fertile_silt: "úrodné nánosy", shore: "pobřeží", harbour_flat: "přístavní rovina", cliff_edge: "útes",
  open_water: "otevřená voda", river_bank: "břeh řeky", river_channel: "řečiště", lake: "jezero", open_ground: "otevřená zem", shallow_dip: "mírná sníženina",
  thicket: "houští",
};

const SUB_BIOME_COLOR: Record<string, string> = {
  fertile_flat: "var(--map-plains)", grassland: "var(--map-plains)", dry_flat: "var(--map-desert)",
  hillock: "var(--map-hills)", terrace: "var(--map-hills)", saddle: "var(--map-hills)",
  steep_slope: "var(--map-mountain)", crag: "var(--map-mountain)", mountain_shelf: "var(--map-mountain)",
  pass_floor: "var(--map-hills)", dense_forest: "var(--map-forest)", ridge_woods: "var(--map-forest)",
  thick_canopy: "var(--map-forest)", clearing: "var(--map-plains)", thicket: "var(--map-forest)",
  creek_bank: "var(--map-water)", river_bank: "var(--map-water)", shore: "var(--map-water-edge)",
  harbour_flat: "var(--map-water-edge)", open_water: "var(--map-water)",
  river_channel: "var(--map-water)", lake: "var(--map-water)", cliff_edge: "var(--map-mountain-edge)",
  boggy_dip: "var(--map-swamp)", reed_marsh: "var(--map-swamp)", raised_bank: "var(--map-swamp-edge)",
  fertile_silt: "var(--map-plains-edge)", sand_flat: "var(--map-desert)", dune: "var(--map-desert-edge)",
  oasis_edge: "var(--map-plains)", rocky_patch: "var(--map-hills-edge)", gravel_rise: "var(--map-hills-edge)",
  frozen_flat: "var(--map-tundra)", permafrost_rise: "var(--map-tundra-edge)",
  sheltered_hollow: "var(--map-plains)", shallow_dip: "var(--map-plains)", open_ground: "var(--map-plains)",
};

const LAND_USE_COLOR: Record<string, string> = {
  open: "var(--map-parcel-open)", residential: "var(--map-parcel-home)", commercial: "var(--map-parcel-market)",
  industrial: "var(--map-parcel-industry)", civic: "var(--map-city-own)", military: "var(--map-city-rival)",
  sacred: "var(--map-focus)", infrastructure: "var(--map-route)",
};

const cellKey = (a: number, b: number) => `${a},${b}`;

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 8;
const LABEL_ZOOM = 1.15;
const clampZoom = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

/** Map layer visibility that survives reloads, one localStorage key per layer. */
function useMapLayer(key: string, initial = true) {
  const storageKey = `ch_mapLayer_${key}`;
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return initial;
    const stored = window.localStorage.getItem(storageKey);
    return stored === null ? initial : stored === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, visible ? "1" : "0");
  }, [storageKey, visible]);
  return [visible, setVisible] as const;
}

export default function IsometricSquareMap({ sessionId, playerName, currentTurn = 1, onCityClick, gridKind = "hex6", onDetailOpenChange }: Props) {
  const isMobile = useIsMobile();
  const viewportRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [armies, setArmies] = useState<Army[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [cityParcels, setCityParcels] = useState<TileParcel[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 40 });
  const [selected, setSelected] = useState<Tile | null>(null);
  const hasInitialized = useRef(false);
  const lastSelectedId = useRef<string | null>(null);
  const [cityLayerCityId, setCityLayerCityId] = useState<string | null>(null);
  const [tileParcels, setTileParcels] = useState<TileParcel[]>([]);
  const [parcelsLoading, setParcelsLoading] = useState(false);
  const [claimingParcel, setClaimingParcel] = useState<number | null>(null);
  const [treasury, setTreasury] = useState({ gold: 0, production: 0 });
  const [selectedArmyId, setSelectedArmyId] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useMapLayer("routes");
  const [showNodes, setShowNodes] = useMapLayer("nodes");
  const [showLabels, setShowLabels] = useMapLayer("labels");
  const [showSubBiomes, setShowSubBiomes] = useMapLayer("subBiomes");
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [parcelContents, setParcelContents] = useState<ParcelContent[]>([]);
  const [infrastructure, setInfrastructure] = useState<TileInfrastructure[]>([]);
  const [roadSegments, setRoadSegments] = useState<RoadSegment[]>([]);
  const [roadProjects, setRoadProjects] = useState<RoadProject[]>([]);
  const [roadDraft, setRoadDraft] = useState<SubRoadCell[]>([]);
  const [roadDraftLevel, setRoadDraftLevel] = useState(1);
  const [buildingTemplates, setBuildingTemplates] = useState<BuildingTemplate[]>([]);
  const [constructionEntities, setConstructionEntities] = useState<ConstructionEntity[]>([]);
  const [recentlyBuiltParcelId, setRecentlyBuiltParcelId] = useState<string | null>(null);
  const [buildingAction, setBuildingAction] = useState<string | null>(null);
  const [newCityName, setNewCityName] = useState("");
  const [districts, setDistricts] = useState<CityDistrict[]>([]);
  const [productionPick, setProductionPick] = useState<Record<string, string>>({});
  const [storedSubBiomes, setStoredSubBiomes] = useState<StoredSubBiome[]>([]);



  const tileCell = useCallback((tile: Tile) => ({
    a: tile.grid_x !== null ? tile.grid_x : tile.q,
    b: tile.grid_y !== null ? tile.grid_y : tile.r,
  }), []);
  const entityCell = useCallback((entity: { grid_x: number | null; grid_y: number | null; hex_q?: number; hex_r?: number; province_q?: number; province_r?: number }) => ({
    a: entity.grid_x !== null ? entity.grid_x : entity.hex_q ?? entity.province_q ?? 0,
    b: entity.grid_y !== null ? entity.grid_y : entity.hex_r ?? entity.province_r ?? 0,
  }), []);

  const load = useCallback(async () => {
    const [tileRes, cityRes, nodeRes, routeRes, tradeFlowRes, basketFlowRes, armyRes, parcelRes, subBiomeRes, realmRes, contentRes, infrastructureRes, roadSegmentRes, roadProjectRes, templateRes, buildingRes, districtRes] = await Promise.all([
      supabase.from("province_hexes").select("id, q, r, grid_x, grid_y, province_id, biome_family, owner_player, mean_height, is_passable, has_river, river_direction, coastal").eq("session_id", sessionId).limit(4000),
      supabase.from("cities").select("id, name, province_q, province_r, grid_x, grid_y, owner_player, settlement_level, population_total, housing_capacity, development_level, birth_rate, death_rate, migration_pressure, founded_parcel_index").eq("session_id", sessionId),
      supabase.from("province_nodes").select("id, name, hex_q, hex_r, grid_x, grid_y, node_type, node_tier, node_subtype, city_id, controlled_by, production_output, wealth_output, food_value, parcel_index, upgrade_level, infrastructure_level").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("flow_paths").select("route_id, path_cells, hex_path").eq("session_id", sessionId),
      supabase.from("trade_flows").select("id, path_cells, transport_modes").eq("session_id", sessionId).not("path_cells", "is", null),
      supabase.from("basket_trade_flows").select("id, path_cells, transport_modes").eq("session_id", sessionId).not("path_cells", "is", null),
      supabase.from("military_stacks").select("id, name, hex_q, hex_r, grid_x, grid_y, player_name, soldiers, morale, unit_count, power, stance, formation_type, assignment, moved_this_turn, parcel_index").eq("session_id", sessionId).eq("is_active", true).eq("is_deployed", true),
      supabase.from("tile_parcels").select("id, grid_x, grid_y, parcel_index, parcel_x, parcel_y, sub_biome, elevation, buildable, build_cost_multiplier, capacity_slots, status, land_use, city_id, owner_player").eq("session_id", sessionId).not("city_id", "is", null).limit(6000),
      supabase.from("tile_parcels").select("grid_x, grid_y, parcel_index, parcel_x, parcel_y, sub_biome").eq("session_id", sessionId).limit(40000),
      supabase.from("realm_resources").select("gold_reserve, production_reserve").eq("session_id", sessionId).eq("player_name", playerName).maybeSingle(),
      supabase.from("tile_parcel_contents").select("id, parcel_id, entity_type, entity_id, slots_used").eq("session_id", sessionId),
      supabase.from("tile_infrastructure").select("id, grid_x, grid_y, owner_player, level, target_level, status, progress").eq("session_id", sessionId),
      supabase.from("road_segments").select("id, project_id, owner_player, from_x, from_y, to_x, to_y, level, status, progress, capacity, utilization, maintenance, bridge_count, sub_path_cells").eq("session_id", sessionId),
      supabase.from("road_projects").select("id, owner_player, level, status, progress, path_cells, sub_path_cells, bridge_count, cost_gold, cost_production").eq("session_id", sessionId),
      supabase.from("building_templates").select("id, name, category, description, cost_wealth, cost_wood, cost_stone, cost_iron, build_turns, effects, max_level, level_data").order("category").order("name"),
      supabase.from("city_buildings").select("id, name, category, status, build_started_turn, build_duration, completed_turn, parcel_id").eq("session_id", sessionId).not("parcel_id", "is", null),
      supabase.from("city_districts").select("id, city_id, name, status, district_type, basket_key, basket_output, is_staffed, population_capacity, build_started_turn, build_turns, completed_turn, parcel_id").eq("session_id", sessionId),
    ]);
    setTiles((tileRes.data || []) as Tile[]); setCities((cityRes.data || []) as City[]); setNodes((nodeRes.data || []) as Node[]);
    const economicRoutes = [...(tradeFlowRes.data || []), ...(basketFlowRes.data || [])].map((flow: any) => ({ route_id: flow.id, path_cells: flow.path_cells, hex_path: null, transport_modes: flow.transport_modes }));
    setRoutes((economicRoutes.length ? economicRoutes : (routeRes.data || [])) as unknown as Route[]); setArmies((armyRes.data || []) as Army[]);
    setCityParcels((parcelRes.data || []) as TileParcel[]);
    setStoredSubBiomes((subBiomeRes.data || []) as StoredSubBiome[]);
    setParcelContents((contentRes.data || []) as ParcelContent[]);
    setInfrastructure((infrastructureRes.data || []) as TileInfrastructure[]);
    setRoadSegments((roadSegmentRes.data || []) as RoadSegment[]);
    setRoadProjects((roadProjectRes.data || []) as unknown as RoadProject[]);
    setBuildingTemplates((templateRes.data || []) as unknown as BuildingTemplate[]);
    setDistricts((districtRes.data || []) as unknown as CityDistrict[]);
    setConstructionEntities([
      ...((buildingRes.data || []) as ConstructionEntity[]),
      ...((districtRes.data || []).filter((item: any) => item.parcel_id).map((item: any) => ({ ...item, build_duration: item.build_turns, category: item.district_type === "residential" ? "residential" : "economic" })) as ConstructionEntity[]),
    ]);

    setTreasury({ gold: Number(realmRes.data?.gold_reserve || 0), production: Number(realmRes.data?.production_reserve || 0) });
  }, [sessionId, playerName]);

  useEffect(() => { void load(); }, [load]);
  // Every city must own a footprint on the 32-parcel grid; this tops up anything missing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { error } = await supabase.functions.invoke("seed-city-parcels", { body: { session_id: sessionId } });
      if (!cancelled && !error) await load();
    })();
    return () => { cancelled = true; };
  }, [sessionId, load]);

  const center = useMemo(() => {
    if (!tiles.length) return { x: 0, y: 0 };
    const points = tiles.map(tile => projectCell("square4", tileCell(tile), TILE_SIZE));
    return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
  }, [tiles, tileCell]);
  const home = useCallback(() => {
    const element = viewportRef.current; if (!element) return;
    setZoom(1); setPan({ x: element.clientWidth / 2 - center.x, y: element.clientHeight * 0.35 - center.y }); setSelected(null); setCityLayerCityId(null); onDetailOpenChange?.(false);
  }, [center, onDetailOpenChange]);
  useEffect(() => {
    if (tiles.length > 0 && !hasInitialized.current) {
      home();
      hasInitialized.current = true;
    }
  }, [tiles.length, home]);

  const cityById = useMemo(() => new Map(cities.map(city => [city.id, city])), [cities]);
  const cityCellOf = useCallback((city: City) => entityCell(city), [entityCell]);
  /** Which city holds land on a given map cell. */
  const cityByCell = useMemo(() => {
    const map = new Map<string, string>();
    cities.forEach(city => { const cell = cityCellOf(city); map.set(cellKey(cell.a, cell.b), city.id); });
    cityParcels.forEach(parcel => {
      if (parcel.city_id) map.set(cellKey(parcel.grid_x, parcel.grid_y), map.get(cellKey(parcel.grid_x, parcel.grid_y)) || parcel.city_id);
    });
    return map;
  }, [cities, cityParcels, cityCellOf]);
  const parcelsByCell = useMemo(() => {
    const map = new Map<string, TileParcel[]>();
    cityParcels.forEach(parcel => {
      const key = cellKey(parcel.grid_x, parcel.grid_y);
      map.set(key, [...(map.get(key) || []), parcel]);
    });
    return map;
  }, [cityParcels]);
  const cityCellsById = useMemo(() => {
    const map = new Map<string, string[]>();
    cityParcels.forEach(parcel => {
      if (!parcel.city_id) return;
      const list = map.get(parcel.city_id) || [];
      const key = cellKey(parcel.grid_x, parcel.grid_y);
      if (!list.includes(key)) map.set(parcel.city_id, [...list, key]);
    });
    return map;
  }, [cityParcels]);

  /** Macro rivers use the exact same 6×6 channel footprint as the opened parcel layer. */
  const riverSegments = useMemo(() => {
    const tileByCell = new Map(tiles.map(tile => { const cell = tileCell(tile); return [cellKey(cell.a, cell.b), tile] as const; }));
    const points = new Map<string, { x: number; y: number }>();
    tiles.filter(tile => tile.has_river).forEach(tile => {
      const cell = tileCell(tile);
      const neighbours = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }].flatMap(step => {
        const neighbour = tileByCell.get(cellKey(cell.a + step.dx, cell.b + step.dy));
        return neighbour ? [{ dx: step.dx, dy: step.dy, terrain: {
          biome_family: neighbour.biome_family, elevation: neighbour.mean_height,
          has_river: neighbour.has_river, river_direction: neighbour.river_direction,
          is_passable: neighbour.is_passable,
        } }] : [];
      });
      riverChannelCells(sessionId, cell.a, cell.b, {
        biome_family: tile.biome_family, elevation: tile.mean_height, has_river: tile.has_river,
        river_direction: tile.river_direction, is_passable: tile.is_passable,
      }, neighbours).forEach(parcel => {
        const key = cellKey(cell.a * TILE_PARCEL_COLS + parcel.x, cell.b * TILE_PARCEL_ROWS + parcel.y);
        const center = projectCell("square4", {
          a: cell.a + (parcel.x + .5) / TILE_PARCEL_COLS - .5,
          b: cell.b + (parcel.y + .5) / TILE_PARCEL_ROWS - .5,
        }, TILE_SIZE);
        points.set(key, center);
      });
    });
    const segments: Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number } }> = [];
    points.forEach((point, key) => {
      const [x, y] = key.split(",").map(Number);
      [{ x: x + 1, y }, { x, y: y + 1 }].forEach(next => {
        const nextKey = cellKey(next.x, next.y); const end = points.get(nextKey);
        if (end) segments.push({ id: `${key}>${nextKey}`, from: point, to: end });
      });
    });
    return segments;
  }, [tiles, tileCell, sessionId]);

  const tileByCell = useMemo(() => new Map(tiles.map(tile => {
    const cell = tileCell(tile); return [cellKey(cell.a, cell.b), tile] as const;
  })), [tiles, tileCell]);
  const infrastructureByCell = useMemo(
    () => new Map(infrastructure.map(item => [cellKey(item.grid_x, item.grid_y), item])),
    [infrastructure],
  );
  /** Screen point of one sub-parcel, in unpanned map space. */
  const subPoint = useCallback((a: number, b: number, px: number, py: number) => projectCell("square4", {
    a: a + (px + .5) / TILE_PARCEL_COLS - .5,
    b: b + (py + .5) / TILE_PARCEL_ROWS - .5,
  }, TILE_SIZE), []);
  const terrainOf = useCallback((tile: Tile) => ({
    biome_family: tile.biome_family, elevation: tile.mean_height, has_river: tile.has_river,
    river_direction: tile.river_direction, is_coastal: tile.coastal, is_passable: tile.is_passable,
  }), []);
  /**
   * Deterministic sub-biome survey of a cell, cached per cell so the macro map can tint the
   * hinted sub-parcel grid with the very same terrain the opened parcel layer shows.
   */
  const subBiomeCache = useRef(new Map<string, TileParcelSpec[]>());
  useEffect(() => { subBiomeCache.current.clear(); }, [tiles, sessionId]);
  /** Already materialized sub-parcels are the truth; the hint must never diverge from them. */
  const storedSubBiomesByCell = useMemo(() => {
    const map = new Map<string, TileParcelSpec[]>();
    storedSubBiomes.forEach(row => {
      const key = cellKey(row.grid_x, row.grid_y);
      const spec = {
        parcelIndex: row.parcel_index, parcelX: row.parcel_x, parcelY: row.parcel_y, subBiome: row.sub_biome,
      } as TileParcelSpec;
      map.set(key, [...(map.get(key) || []), spec]);
    });
    return map;
  }, [storedSubBiomes]);
  const subBiomesOf = useCallback((tile: Tile, a: number, b: number) => {
    const key = cellKey(a, b);
    const stored = storedSubBiomesByCell.get(key);
    if (stored && stored.length) return stored;
    const cached = subBiomeCache.current.get(key);
    if (cached) return cached;
    const neighbours = CARDINAL_STEPS.flatMap(step => {
      const neighbour = tileByCell.get(cellKey(a + step.dx, b + step.dy));
      return neighbour ? [{ dx: step.dx, dy: step.dy, terrain: terrainOf(neighbour) }] : [];
    });
    const specs = generateTileParcels(sessionId, a, b, terrainOf(tile), neighbours);
    subBiomeCache.current.set(key, specs);
    return specs;
  }, [storedSubBiomesByCell, tileByCell, terrainOf, sessionId]);


  /** Which borders a cell's road reaches: neighbours that carry a road or hold a settlement. */
  const roadStepsOf = useCallback((a: number, b: number) => CARDINAL_STEPS.filter(step => {
    const neighbour = tileByCell.get(cellKey(a + step.dx, b + step.dy));
    if (!neighbour || neighbour.is_passable === false || neighbour.biome_family === "sea") return false;
    return !!infrastructureByCell.get(cellKey(a + step.dx, b + step.dy)) || !!cityByCell.get(cellKey(a + step.dx, b + step.dy));
  }), [tileByCell, infrastructureByCell, cityByCell]);

  /**
   * Macro roads trace the very same sub-parcel channel as the opened parcel layer, and every
   * sub-parcel where the trace meets the river is drawn (and charged) as a bridge.
   */
  const roadNetwork = useMemo(() => {
    const segments: Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number }; level: number; building: boolean }> = [];
    const bridges: Array<{ id: string; point: { x: number; y: number } }> = [];
    infrastructure.forEach(item => {
      const tile = tileByCell.get(cellKey(item.grid_x, item.grid_y));
      if (!tile) return;
      const steps = roadStepsOf(item.grid_x, item.grid_y);
      const branches = tileRoadBranches(sessionId, item.grid_x, item.grid_y, steps);
      branches.forEach((branch, branchIndex) => {
        for (let index = 0; index < branch.length - 1; index += 1) {
          segments.push({
            id: `road-${item.id}-${branchIndex}-${index}`,
            from: subPoint(item.grid_x, item.grid_y, branch[index].x, branch[index].y),
            to: subPoint(item.grid_x, item.grid_y, branch[index + 1].x, branch[index + 1].y),
            level: item.level || 1,
            building: item.status === "building",
          });
        }
      });
      const neighbours = CARDINAL_STEPS.flatMap(step => {
        const neighbour = tileByCell.get(cellKey(item.grid_x + step.dx, item.grid_y + step.dy));
        return neighbour ? [{ dx: step.dx, dy: step.dy, terrain: terrainOf(neighbour) }] : [];
      });
      tileBridgeCells(sessionId, item.grid_x, item.grid_y, steps, terrainOf(tile), neighbours).forEach((cell, index) => {
        bridges.push({ id: `bridge-${item.id}-${index}`, point: subPoint(item.grid_x, item.grid_y, cell.x, cell.y) });
      });
    });
    return { segments, bridges };
  }, [infrastructure, tileByCell, roadStepsOf, sessionId, subPoint, terrainOf]);

  /** Authoritative inter-cell road segments, including projects still under construction. */
  const explicitRoadNetwork = useMemo(() => roadSegments.map(segment => ({
    ...segment,
    from: projectCell("square4", { a: segment.from_x, b: segment.from_y }, TILE_SIZE),
    to: projectCell("square4", { a: segment.to_x, b: segment.to_y }, TILE_SIZE),
  })), [roadSegments]);

  /** Roads live on the sub-parcel grid; legacy segments receive a deterministic fallback trace. */
  const roadSurfaceByCell = useMemo(() => {
    const surface = new Map<string, { level: number; steps: RoadStep[]; cells: Map<string, { x: number; y: number }>; draft: boolean }>();
    const push = (x: number, y: number, level: number, step: RoadStep | null, draft: boolean, sub?: { x: number; y: number }) => {
      const key = cellKey(x, y);
      const entry = surface.get(key) || { level: 0, steps: [] as RoadStep[], cells: new Map<string, { x: number; y: number }>(), draft: false };
      entry.level = Math.max(entry.level, level);
      entry.draft = entry.draft || draft;
      if (step && !entry.steps.some(item => item.dx === step.dx && item.dy === step.dy)) entry.steps.push(step);
      if (sub) entry.cells.set(`${sub.x},${sub.y}`, sub);
      surface.set(key, entry);
    };
    const projectsWithExactTrace = new Set<string>();
    roadProjects.filter(project => project.status !== "cancelled" && project.sub_path_cells?.length).forEach(project => {
      projectsWithExactTrace.add(project.id);
      project.sub_path_cells.forEach(sub => push(sub.gridX, sub.gridY, project.level, null, project.status === "building", { x: sub.parcelX, y: sub.parcelY }));
    });
    roadSegments.filter(segment => segment.status !== "blocked" && (!segment.project_id || !projectsWithExactTrace.has(segment.project_id))).forEach(segment => {
      if (segment.sub_path_cells?.length) {
        segment.sub_path_cells.forEach(sub => push(sub.gridX, sub.gridY, segment.level, null, segment.status === "building", { x: sub.parcelX, y: sub.parcelY }));
      } else {
        // Legacy segments carry no sub-parcel trace: draw the same thin line a player would build.
        const mid = { x: Math.floor(TILE_PARCEL_COLS / 2), y: Math.floor(TILE_PARCEL_ROWS / 2) };
        const from: SubRoadCell = { gridX: segment.from_x, gridY: segment.from_y, parcelX: mid.x, parcelY: mid.y };
        const to: SubRoadCell = { gridX: segment.to_x, gridY: segment.to_y, parcelX: mid.x, parcelY: mid.y };
        [from, ...subRoadPathBetween(from, to)].forEach(sub =>
          push(sub.gridX, sub.gridY, segment.level, null, segment.status === "building", { x: sub.parcelX, y: sub.parcelY }));
      }
    });
    roadDraft.forEach(sub => push(sub.gridX, sub.gridY, roadDraftLevel, null, true, { x: sub.parcelX, y: sub.parcelY }));
    return new Map([...surface.entries()].map(([key, entry]) => {
      const [x, y] = key.split(",").map(Number);
      const cells = entry.cells.size ? [...entry.cells.values()] : tileRoadCells(sessionId, x, y, entry.steps);
      return [key, { level: entry.level, draft: entry.draft, cells }];
    }));
  }, [roadSegments, roadProjects, roadDraft, roadDraftLevel, sessionId]);


  const roadDraftSummary = useMemo(() => {
    const macroPath = macroPathFromSubRoad(roadDraft);
    if (roadDraft.length < 2) return { bridges: 0, gold: 0, production: 0, turns: 0, macroLength: Math.max(0, macroPath.length - 1), subLength: 0 };
    const tier = tileInfrastructureLevel(roadDraftLevel);
    if (!tier) return { bridges: 0, gold: 0, production: 0, turns: 0, macroLength: 0, subLength: 0 };
    const draftTiles = roadDraft.map(cell => tileByCell.get(cellKey(cell.gridX, cell.gridY))).filter((tile): tile is Tile => !!tile);
    const terrainFactor = draftTiles.length ? draftTiles.reduce((sum, tile) => sum + (["mountain", "mountains"].includes(tile.biome_family) ? 1.8 : tile.biome_family === "swamp" ? 1.5 : tile.biome_family === "hills" ? 1.25 : 1), 0) / draftTiles.length : 1;
    const bridges = roadDraft.filter(sub => {
      const tile = tileByCell.get(cellKey(sub.gridX, sub.gridY));
      return tile ? subBiomesOf(tile, sub.gridX, sub.gridY).some(spec => spec.parcelX === sub.parcelX && spec.parcelY === sub.parcelY && spec.subBiome === "river_channel") : false;
    }).length;
    const subLength = roadDraft.length - 1;
    const macroLength = macroPath.length - 1;
    const edgeEquivalent = subLength / TILE_PARCEL_COLS;
    return { bridges, gold: Math.ceil(tier.gold * edgeEquivalent * terrainFactor + bridges * 45), production: Math.ceil(tier.production * edgeEquivalent * terrainFactor + bridges * 30), turns: tier.turns, macroLength, subLength };
  }, [roadDraft, roadDraftLevel, tileByCell, subBiomesOf]);

  const roadDraftBlock = useMemo(() => {
    if (roadDraft.length < 2) return "Nakresli alespoň dva sousední podčtverce.";
    if (treasury.gold < roadDraftSummary.gold || treasury.production < roadDraftSummary.production) return `Chybí zdroje: potřeba ${roadDraftSummary.gold} zlata a ${roadDraftSummary.production} produkce.`;
    return null;
  }, [roadDraft.length, roadDraftSummary, treasury]);

  /**
   * While drawing: how far from each of my settlements and nodes a finished road still
   * hooks them into the transport system. Shown so the player knows how far to build.
   */
  const roadCatchmentOverlay = useMemo(() => {
    if (roadDraft.length === 0) return [];
    const reach = new Map<string, { a: number; b: number; edge: boolean }>();
    const paint = (origin: { a: number; b: number }, radius: number) => {
      for (let da = -radius; da <= radius; da++) {
        for (let db = -radius; db <= radius; db++) {
          const distance = Math.max(Math.abs(da), Math.abs(db));
          if (distance > radius) continue;
          const key = cellKey(origin.a + da, origin.b + db);
          const existing = reach.get(key);
          const edge = distance === radius;
          if (!existing) reach.set(key, { a: origin.a + da, b: origin.b + db, edge });
          else if (!edge) existing.edge = false;
        }
      }
    };
    cities.filter(city => city.owner_player === playerName)
      .forEach(city => paint(cityCellOf(city), cityCatchmentRadius(city)));
    nodes.filter(node => node.controlled_by === playerName)
      .forEach(node => paint(entityCell(node), nodeCatchmentRadius(node)));
    return [...reach.values()];
  }, [roadDraft.length, cities, nodes, playerName, cityCellOf, entityCell]);

  /** Trade flows ride the road trace instead of cutting straight across cell centres. */
  const routePolylines = useMemo(() => routes.flatMap(route => {
    const path = gridKind === "square4" && Array.isArray(route.path_cells) ? route.path_cells : route.hex_path;
    if (!Array.isArray(path) || path.length < 2) return [];
    const cells = path.map(cell => ({ a: cell.x ?? cell.q ?? 0, b: cell.y ?? cell.r ?? 0 }));
    const points: Array<{ x: number; y: number }> = [];
    cells.forEach((cell, index) => {
      const previous = cells[index - 1]; const next = cells[index + 1];
      const steps = [previous, next].flatMap(other => other
        ? [{ dx: Math.sign(other.a - cell.a), dy: Math.sign(other.b - cell.b) }]
        : []).filter(step => Math.abs(step.dx) + Math.abs(step.dy) === 1);
      if (!steps.length) { points.push(subPoint(cell.a, cell.b, 2, 2)); return; }
      const branches = tileRoadBranches(sessionId, cell.a, cell.b, steps);
      const toPrevious = previous ? branches[0] : null;
      const toNext = previous ? branches[1] : branches[0];
      (toPrevious || []).forEach(sub => points.push(subPoint(cell.a, cell.b, sub.x, sub.y)));
      [...(toNext || [])].reverse().forEach(sub => points.push(subPoint(cell.a, cell.b, sub.x, sub.y)));
    });
    return [{ id: route.route_id || JSON.stringify(path), points }];
  }), [routes, gridKind, sessionId, subPoint]);


  /** One war-band illustration per cell; further stacks are folded into a count badge. */
  const armyGroups = useMemo(() => {
    const groups = new Map<string, { cell: { a: number; b: number }; list: Army[] }>();
    armies.forEach(army => {
      const cell = entityCell(army);
      const key = cellKey(cell.a, cell.b);
      const group = groups.get(key) || { cell, list: [] };
      group.list.push(army);
      groups.set(key, group);
    });
    return [...groups.entries()].map(([key, group]) => ({
      key,
      cell: group.cell,
      list: [...group.list].sort((left, right) => right.soldiers - left.soldiers),
    }));
  }, [armies, entityCell]);
  const selectedArmy = useMemo(() => armies.find(army => army.id === selectedArmyId) || null, [armies, selectedArmyId]);
  const selectedArmyStack = useMemo(() => {
    if (!selectedArmy) return [];
    const cell = entityCell(selectedArmy);
    return armyGroups.find(group => group.key === cellKey(cell.a, cell.b))?.list || [];
  }, [selectedArmy, armyGroups, entityCell]);

  const sortedTiles = useMemo(() => [...tiles].sort((left, right) => {
    const a = tileCell(left); const b = tileCell(right); return (a.a + a.b) - (b.a + b.b);
  }), [tiles, tileCell]);
  const selectedCell = selected ? tileCell(selected) : null;
  const selectedParcel = tileParcels.find(parcel => parcel.id === selectedParcelId) || null;
  const selectedParcelContents = selectedParcel ? parcelContents.filter(item => item.parcel_id === selectedParcel.id) : [];
  const selectedNode = nodes.find(node => node.id === selectedNodeId) || null;
  const selectedParcelNodes = selectedParcel && selectedCell ? nodes.filter(node => {
    const cell = entityCell(node);
    return node.node_tier === "micro" && cell.a === selectedCell.a && cell.b === selectedCell.b && node.parcel_index === selectedParcel.parcel_index;
  }) : [];
  const selectedParcelUsed = selectedParcelContents.reduce((sum, item) => sum + item.slots_used, 0);
  const selectedInfrastructure = selectedCell ? infrastructure.find(item => item.grid_x === selectedCell.a && item.grid_y === selectedCell.b) : undefined;
  /** Road trace of the inspected cell plus the bridges the next tier would have to pay for. */
  const selectedRoadPlan = useMemo(() => {
    if (!selected || !selectedCell) return null;
    const steps = roadStepsOf(selectedCell.a, selectedCell.b);
    const branches = tileRoadBranches(sessionId, selectedCell.a, selectedCell.b, steps);
    const neighbours = CARDINAL_STEPS.flatMap(step => {
      const neighbour = tileByCell.get(cellKey(selectedCell.a + step.dx, selectedCell.b + step.dy));
      return neighbour ? [{ dx: step.dx, dy: step.dy, terrain: terrainOf(neighbour) }] : [];
    });
    const bridges = tileBridgeCells(sessionId, selectedCell.a, selectedCell.b, steps, terrainOf(selected), neighbours);
    const tier = tileInfrastructureLevel((selectedInfrastructure?.level || 0) + 1);
    return { branches, bridges, tier, cost: tier ? tileRoadCost(tier, bridges.length) : null };
  }, [selected, selectedCell, roadStepsOf, sessionId, tileByCell, terrainOf, selectedInfrastructure]);

  const constructionByParcel = useMemo(() => new Map(constructionEntities.map(entity => [entity.parcel_id, entity])), [constructionEntities]);
  const cityLayerCity = cityLayerCityId ? cityById.get(cityLayerCityId) : undefined;
  const selectedCityId = selectedCell ? cityByCell.get(cellKey(selectedCell.a, selectedCell.b)) : undefined;
  const selectedCity = cityLayerCity || (selectedCityId ? cityById.get(selectedCityId) : undefined);
  /** A neighbouring city of yours that may buy parcels on this cell. */
  const foreignOwner = selected?.owner_player && selected.owner_player !== playerName ? selected.owner_player : null;
  /** A road is allowed wherever you already have a foothold: parcel, city seat or sub-node on the tile. */
  const canBuildRoadHere = !!selected && !foreignOwner && (
    selected.owner_player === playerName
    || tileParcels.some(parcel => parcel.owner_player === playerName)
    || selectedCity?.owner_player === playerName
    || (selectedCell ? roadSegments.some(segment => segment.status === "completed" && (
      (segment.from_x === selectedCell.a && segment.from_y === selectedCell.b)
      || (segment.to_x === selectedCell.a && segment.to_y === selectedCell.b)
    )) : false)
    || (selectedCell ? nodes.some(node => { const cell = entityCell(node); return cell.a === selectedCell.a && cell.b === selectedCell.b && node.controlled_by === playerName; }) : false));
  const expansionCity = useMemo(() => {
    if (!selectedCell || selectedCity || foreignOwner) return undefined;
    return cities.find(city => {
      if (city.owner_player !== playerName) return false;
      const cells = [...(cityCellsById.get(city.id) || []), cellKey(cityCellOf(city).a, cityCellOf(city).b)];
      return cells.some(key => {
        const [x, y] = key.split(",").map(Number);
        return Math.abs(x - selectedCell.a) + Math.abs(y - selectedCell.b) === 1;
      });
    });
  }, [selectedCell, selectedCity, foreignOwner, cities, playerName, cityCellsById, cityCellOf]);


  const cityForPressure = selectedCity || expansionCity;
  const cityHeldParcels = useMemo(() => cityForPressure ? cityParcels.filter(parcel => parcel.city_id === cityForPressure.id) : [], [cityParcels, cityForPressure]);
  const cityCapacity = cityHeldParcels.reduce((sum, parcel) => sum + (parcel.capacity_slots || 0), 0) * POPULATION_PER_SLOT;
  const growthPressure = cityForPressure ? Math.min(100, Math.round(cityForPressure.population_total / Math.max(1, cityCapacity) * 100)) : 0;
  const occupiedParcels = cityHeldParcels.filter(parcel => parcel.status === "occupied").length;
  const netGrowth = cityForPressure ? Math.round(cityForPressure.population_total * ((cityForPressure.birth_rate || 0) - (cityForPressure.death_rate || 0)) + (cityForPressure.migration_pressure || 0)) : 0;

  const loadTileParcels = useCallback(async (gridX: number, gridY: number) => {
    setParcelsLoading(true);
    const { data, error } = await supabase.functions.invoke("tile-parcels", { body: { session_id: sessionId, grid_x: gridX, grid_y: gridY } });
    setParcelsLoading(false);
    if (error) { setTileParcels([]); return; }
    setTileParcels(((data as { parcels?: TileParcel[] })?.parcels || []) as TileParcel[]);
  }, [sessionId]);

  useEffect(() => {
    if (!selected) {
      setTileParcels([]);
      setSelectedParcelId(null);
      setSelectedNodeId(null);
      lastSelectedId.current = null;
      return;
    }
    if (selected.id !== lastSelectedId.current) {
      setSelectedParcelId(null);
      lastSelectedId.current = selected.id;
      const cell = tileCell(selected);
      void loadTileParcels(cell.a, cell.b);
    }
    if (selectedNodeId) {
      const node = nodes.find(item => item.id === selectedNodeId);
      const cell = node ? entityCell(node) : null;
      const selectedTileCell = tileCell(selected);
      if (!cell || cell.a !== selectedTileCell.a || cell.b !== selectedTileCell.b) setSelectedNodeId(null);
    }
  }, [selected, selectedNodeId, nodes, entityCell, tileCell, loadTileParcels]);

  useEffect(() => {
    if (!selectedNodeId || !tileParcels.length) return;
    const node = nodes.find(item => item.id === selectedNodeId);
    const parcel = node?.parcel_index === null || node?.parcel_index === undefined
      ? undefined : tileParcels.find(item => item.parcel_index === node.parcel_index);
    if (parcel) setSelectedParcelId(parcel.id);
  }, [selectedNodeId, tileParcels, nodes]);

  const claimedSlots = useMemo(() => tileParcels.reduce((sum, parcel) =>
    parcel.status === "claimed" || parcel.status === "occupied" ? sum + (parcel.capacity_slots || 0) : sum, 0), [tileParcels]);
  // Only your own city can buy parcels — a rival settlement must never offer the action.
  const claimHost = [selectedCity, expansionCity].find(city => city?.owner_player === playerName);
  const claimedForCity = useMemo(() => tileParcels.filter(parcel => parcel.city_id && parcel.city_id === claimHost?.id).length, [tileParcels, claimHost]);

  const claimParcel = async (parcel: TileParcel) => {
    if (!claimHost || !selectedCell) return;
    // Pre-flight affordability check so the server never has to reject the click.
    const price = parcelClaimCost(Number(parcel.build_cost_multiplier || 1), claimedForCity);
    if (treasury.gold < price.gold || treasury.production < price.production) {
      toast.error(`Na parcelu chybí prostředky — potřeba ${price.gold} zlata a ${price.production} produkce (máš ${treasury.gold} / ${treasury.production}).`);
      return;
    }
    setClaimingParcel(parcel.parcel_index);
    const result = await dispatchCommand({
      sessionId, turnNumber: currentTurn, actor: { name: playerName },
      commandType: "CLAIM_TILE_PARCEL",
      commandPayload: { cityId: claimHost.id, gridX: selectedCell.a, gridY: selectedCell.b, parcelIndex: parcel.parcel_index },
    });
    setClaimingParcel(null);
    if (!result.ok) { toast.error(result.error || "Parcelu nelze získat"); return; }
    toast.success(`${claimHost.name} zabralo parcelu ${parcel.parcel_index + 1}`);
    await loadTileParcels(selectedCell.a, selectedCell.b);
    await load();
  };

  const parcelQuad = (centerPoint: { x: number; y: number }, px: number, py: number) => {
    const point = (a: number, b: number) => `${centerPoint.x + (a - b) * TILE_SIZE},${centerPoint.y + (a + b - 1) * TILE_SIZE / 2}`;
    const a0 = px / TILE_PARCEL_COLS; const a1 = (px + 1) / TILE_PARCEL_COLS;
    const b0 = py / TILE_PARCEL_ROWS; const b1 = (py + 1) / TILE_PARCEL_ROWS;
    return [point(a0, b0), point(a1, b0), point(a1, b1), point(a0, b1)].join(" ");
  };

  /** SVG has no depth buffer: paint rear parcels first, then let nearer buildings occlude them. */
  const parcelsBackToFront = (parcels: TileParcel[]) => [...parcels].sort((left, right) => {
    const leftDepth = left.parcel_x + left.parcel_y;
    const rightDepth = right.parcel_x + right.parcel_y;
    return leftDepth - rightDepth || left.parcel_x - right.parcel_x || left.parcel_index - right.parcel_index;
  });

  /** Full 32-parcel survey of the cell the player is inspecting. */
  const renderTileParcels = (centerPoint: { x: number; y: number }) => {
    const cityOwned = tileParcels.filter(parcel => parcel.city_id);
    const wallEdges = cityOwned.length ? footprintWallEdges(cityOwned, centerPoint) : [];
    const holder = cityOwned[0]?.city_id ? cityById.get(cityOwned[0].city_id) : undefined;
    const holderColor = holder ? (holder.owner_player === playerName ? "var(--map-city-own)" : "var(--map-city-rival)") : "var(--map-city-own)";
    const hatchFill = holder && holder.owner_player !== playerName ? "url(#iso-city-hatch-rival)" : "url(#iso-city-hatch)";
    const occupiedIndexes = tileParcels.filter(parcel => parcelContents.some(item => item.parcel_id === parcel.id)).map(parcel => parcel.parcel_index);
    const roadTier = selectedInfrastructure?.level || 0;
    return <g>
      {tileParcels.map(parcel => {
        const base = SUB_BIOME_COLOR[parcel.sub_biome] || "var(--map-plains)";
        const mine = !!parcel.city_id;
        const fill = parcel.status === "occupied" ? (LAND_USE_COLOR[parcel.land_use || "civic"] || LAND_USE_COLOR.open)
          : parcel.status === "claimed" ? "var(--map-parcel-open)" : base;
        const quad = parcelQuad(centerPoint, parcel.parcel_x, parcel.parcel_y);
        const activeParcel = parcel.id === selectedParcelId;
        return <g key={parcel.id} role="button" tabIndex={0} className="cursor-pointer"
          onClick={event => { event.stopPropagation(); setSelectedParcelId(parcel.id); }}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedParcelId(parcel.id); } }}>
          <polygon points={quad} fill={fill}
            stroke={activeParcel ? "var(--map-focus)" : mine ? holderColor : parcel.buildable ? "var(--map-marker-edge)" : "var(--map-mountain-edge)"}
            strokeWidth={activeParcel ? 2 : mine ? 1.1 : .5}
            opacity={mine ? 1 : parcel.buildable ? (parcel.status === "wild" ? .6 : .95) : .45} />
          {/* hatching marks every sub-parcel the city holds */}
          {mine && <polygon points={quad} fill={hatchFill} opacity=".55" />}
          <title>{`${parcel.parcel_index + 1} · ${SUB_BIOME_LABEL[parcel.sub_biome] || parcel.sub_biome} · výška ${parcel.elevation}${mine ? ` · patří ${holder?.name || "městu"}` : ""}`}</title>
        </g>;
      })}
      {/* city land is ringed so the built-up block reads at a glance */}
      {renderWallRun(wallEdges, holderColor, 2, "survey-wall")}
      {(roadTier > 0 || selectedInfrastructure?.status === "building") && localRoadSegments(occupiedIndexes).map((segment, index) => {
        const centre = (point: { x: number; y: number }) => {
          const corners = parcelCorners(centerPoint, point.x, point.y);
          return { x: (corners.a.x + corners.c.x) / 2, y: (corners.a.y + corners.c.y) / 2 };
        };
        const from = centre(segment.from); const to = centre(segment.to);
        const roadBuilding = selectedInfrastructure?.status === "building";
        return <line key={`local-road-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="var(--map-route)" strokeWidth={roadTier === 3 ? 2.2 : roadTier === 2 ? 1.6 : 1}
          strokeDasharray={roadBuilding || roadTier === 1 ? "2 1.5" : undefined} strokeLinecap="round" opacity=".95" pointerEvents="none"
          className={roadBuilding ? "iso-construction-road" : undefined} />;
      })}
      {/* the through-road: same channel the macro map draws, with bridges over the river.
          Roads only cross the sub-parcels — they never take a building slot, so a planned
          trace is drawn even before the project is paid for. */}
      {selectedRoadPlan?.branches.flatMap((branch, branchIndex) => {
        const planned = roadTier === 0 && selectedInfrastructure?.status !== "building";
        const centre = (sub: { x: number; y: number }) => {
          const corners = parcelCorners(centerPoint, sub.x, sub.y);
          return { x: (corners.a.x + corners.c.x) / 2, y: (corners.a.y + corners.c.y) / 2 };
        };
        return branch.slice(1).map((sub, index) => {
          const from = centre(branch[index]); const to = centre(sub);
          return <line key={`through-road-${branchIndex}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            stroke="var(--map-route)" strokeWidth={planned ? 1.2 : roadTier === 3 ? 3 : roadTier === 2 ? 2.4 : 1.6}
            strokeDasharray={planned || selectedInfrastructure?.status === "building" || roadTier === 1 ? "3 2" : undefined}
            strokeLinecap="round" opacity={planned ? .4 : .95} pointerEvents="none" />;
        });
      })}
      {selectedRoadPlan?.bridges.map((sub, index) => {
        const corners = parcelCorners(centerPoint, sub.x, sub.y);
        const point = { x: (corners.a.x + corners.c.x) / 2, y: (corners.a.y + corners.c.y) / 2 };
        return <rect key={`bridge-${index}`} x={point.x - 4} y={point.y - 2} width="8" height="4" rx="1"
          fill="var(--map-route)" stroke="var(--map-marker-edge)" strokeWidth=".6" pointerEvents="none" />;
      })}

      {parcelsBackToFront(tileParcels.filter(parcel => parcel.status === "occupied")).map((parcel, index) => {
        const entity = constructionByParcel.get(parcel.id);
        const progress = entity?.status === "building"
          ? Math.max(8, Math.min(92, Math.round(((currentTurn - entity.build_started_turn) / Math.max(1, entity.build_duration)) * 100)))
          : 100;
        return renderParcelHouse(parcel, centerPoint, index, entity?.status === "building" || recentlyBuiltParcelId === parcel.id, progress);
      })}
    </g>;
  };

  const buildOnParcel = async (template: BuildingTemplate) => {
    if (!selectedParcel || !selectedCity || selectedCity.owner_player !== playerName) return;
    setBuildingAction(`building-${template.id}`);
    const result = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "BUILD_BUILDING", commandPayload: {
      cityId: selectedCity.id, cityName: selectedCity.name, parcelId: selectedParcel.id,
      building: { template_id: template.id, name: template.name, category: template.category, description: template.description,
        cost_wealth: template.cost_wealth, cost_wood: template.cost_wood, cost_stone: template.cost_stone, cost_iron: template.cost_iron,
        build_duration: template.build_turns, effects: template.effects, max_level: template.max_level, level_data: template.level_data },
    }});
    setBuildingAction(null);
    if (!result.ok) { toast.error(result.error || "Stavba se nepodařila"); return; }
    setRecentlyBuiltParcelId(selectedParcel.id);
    window.setTimeout(() => setRecentlyBuiltParcelId(current => current === selectedParcel.id ? null : current), 2600);
    toast.success(`${template.name} se staví na parcele ${selectedParcel.parcel_index + 1}`); await loadTileParcels(selectedParcel.grid_x, selectedParcel.grid_y); await load();
  };

  /** Residential districts raise the city's housing capacity, so they get their own action. */
  /** Housing staffs workshops: this is the labour budget of the selected city. */
  const labour = useMemo(() => {
    const own = districts.filter(d => d.city_id === selectedCity?.id && d.status === "completed");
    const housing = own.filter(d => d.district_type === "residential").length;
    const production = own.filter(d => d.district_type === "production");
    return { housing, slots: housing * PRODUCTION_PER_RESIDENTIAL, production, free: housing * PRODUCTION_PER_RESIDENTIAL - production.length };
  }, [districts, selectedCity?.id]);

  /** Subnodes attached to the selected city — they feed the same markets as its districts. */
  const citySubnodes = useMemo(() => {
    if (!selectedCity) return { list: [] as Node[], production: 0, wealth: 0, food: 0 };
    const list = nodes.filter(n => n.city_id === selectedCity.id && n.node_tier === "micro");
    return {
      list,
      production: Math.round(list.reduce((sum, n) => sum + Number(n.production_output || 0), 0) * 10) / 10,
      wealth: Math.round(list.reduce((sum, n) => sum + Number(n.wealth_output || 0), 0) * 10) / 10,
      food: Math.round(list.reduce((sum, n) => sum + Number(n.food_value || 0), 0) * 10) / 10,
    };
  }, [nodes, selectedCity?.id]);

  const buildDistrict = async (district: DistrictBlueprint, basketKey?: string) => {

    if (!selectedParcel || !selectedCity || selectedCity.owner_player !== playerName) return;
    setBuildingAction(`district-${district.key}`);
    const result = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "BUILD_DISTRICT", commandPayload: {
      cityId: selectedCity.id, cityName: selectedCity.name, parcelId: selectedParcel.id, district, basketKey,
    }});
    setBuildingAction(null);
    if (!result.ok) { toast.error(result.error || "Čtvrť se nepodařilo založit"); return; }
    setRecentlyBuiltParcelId(selectedParcel.id);
    window.setTimeout(() => setRecentlyBuiltParcelId(current => current === selectedParcel.id ? null : current), 2600);
    toast.success(district.district_type === "residential"
      ? `${district.name} vzniká · +${district.population_capacity} obyvatel`
      : `${district.name} vzniká · vyrábí ${basketKey}`);
    await loadTileParcels(selectedParcel.grid_x, selectedParcel.grid_y); await load();
  };

  /** Re-point a finished production district at a different basket. */
  const setDistrictProduction = async (districtId: string, basketKey: string) => {
    setBuildingAction(`switch-${districtId}`);
    const result = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "SET_DISTRICT_PRODUCTION", commandPayload: { districtId, basketKey } });
    setBuildingAction(null);
    if (!result.ok) { toast.error(result.error || "Přenastavení se nepodařilo"); return; }
    toast.success(`Čtvrť nyní vyrábí ${basketKey}`); await load();
  };




  /** Single reason the selected parcel accepts nothing at all — shown instead of hiding the menu. */
  const parcelBlock = useMemo(() => {
    if (!selectedParcel) return null;
    if (!selectedParcel.buildable) return "Tato parcela je nezastavitelná (voda, skála nebo prudký sráz).";
    if (selectedParcel.owner_player !== playerName) {
      return selectedParcel.owner_player
        ? `Parcelu drží ${selectedParcel.owner_player}.`
        : "Parcela ještě není tvoje — klikni na ni v mřížce a město ji vykoupí, pak se dá stavět.";
    }
    if (!selectedParcel.city_id) return "Parcela není přiřazena žádnému tvému městu.";
    if (selectedParcelUsed >= selectedParcel.capacity_slots) return "Parcela je plná — všechny stavební sloty jsou obsazené.";
    return null;
  }, [selectedParcel, selectedParcelUsed, playerName]);

  /** Why this subnode cannot be placed on the selected parcel right now — null means buildable. */

  const subnodeBlockReason = (option: SubnodeOption): string | null => {
    if (!selectedParcel) return "Vyber podčtverec";
    if (selectedParcel.owner_player && selectedParcel.owner_player !== playerName) return `Parcelu drží ${selectedParcel.owner_player}`;
    if (foreignOwner) return `Pole ovládá ${foreignOwner}`;
    if (!selectedParcel.buildable) return "Nezastavitelná parcela";
    if (selectedParcelUsed >= selectedParcel.capacity_slots) return "Parcela je plná";
    if (option.key === "river_wharf" && !selected?.has_river && !selected?.coastal) return "Vyžaduje řeku nebo pobřeží";
    if (option.key === "farmstead" && ["mountains", "mountain", "desert"].includes(selected?.biome_family || "")) return "Nevhodný terén";
    if (treasury.gold < option.gold || treasury.production < option.production) return `Chybí zdroje (${option.gold} zlata, ${option.production} produkce)`;
    return null;
  };

  const buildSubnode = async (subtype: string, label: string) => {

    if (!selectedParcel) return;
    setBuildingAction(`node-${subtype}`);
    const result = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "BUILD_SUBNODE", commandPayload: { parcelId: selectedParcel.id, subtype } });
    setBuildingAction(null);
    if (!result.ok) { toast.error(result.error || "Subuzel se nepodařilo postavit"); return; }
    setRecentlyBuiltParcelId(selectedParcel.id);
    window.setTimeout(() => setRecentlyBuiltParcelId(current => current === selectedParcel.id ? null : current), 2600);
    toast.success(`${label} byl postaven`); await loadTileParcels(selectedParcel.grid_x, selectedParcel.grid_y); await load();
  };

  /** Found a brand-new settlement straight on the map cell the player is inspecting. */
  const foundCityHere = async () => {
    if (!selected || !selectedCell) return;
    if (!newCityName.trim()) { toast.error("Zadej název osady"); return; }
    setBuildingAction("found-city");
    const result = await dispatchCommand({
      sessionId, turnNumber: currentTurn, actor: { name: playerName, type: "player" },
      commandType: "FOUND_CITY",
      commandPayload: {
        cityName: newCityName.trim(), provinceId: selected.province_id || null, provinceName: "",
        provinceQ: selectedCell.a, provinceR: selectedCell.b,
        ...(selectedParcel ? { parcelIndex: selectedParcel.parcel_index } : {}),
      },
    });
    setBuildingAction(null);
    if (!result.ok) { toast.error(result.error || "Osadu nelze založit"); return; }
    toast.success(`Osada ${newCityName.trim()} byla založena`);
    setNewCityName("");
    await loadTileParcels(selectedCell.a, selectedCell.b); await load();
  };



  /** Corner points of a single parcel, in draw order A(top) B(right) C(bottom) D(left). */
  const parcelCorners = (centerPoint: { x: number; y: number }, px: number, py: number) => {
    const point = (a: number, b: number) => ({ x: centerPoint.x + (a - b) * TILE_SIZE, y: centerPoint.y + (a + b - 1) * TILE_SIZE / 2 });
    const a0 = px / TILE_PARCEL_COLS; const a1 = (px + 1) / TILE_PARCEL_COLS;
    const b0 = py / TILE_PARCEL_ROWS; const b1 = (py + 1) / TILE_PARCEL_ROWS;
    return { a: point(a0, b0), b: point(a1, b0), c: point(a1, b1), d: point(a0, b1) };
  };

  /** Outer edges of a held parcel block — the line the ramparts follow, each edge only once. */
  const footprintWallEdges = (parcels: TileParcel[], centerPoint: { x: number; y: number }) => {
    const held = new Set(parcels.map(parcel => `${parcel.parcel_x},${parcel.parcel_y}`));
    const seen = new Set<string>();
    const edges: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
    const push = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const round = (point: { x: number; y: number }) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      const key = [round(from), round(to)].sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ from, to });
    };
    parcels.forEach(parcel => {
      const { a, b, c, d } = parcelCorners(centerPoint, parcel.parcel_x, parcel.parcel_y);
      if (!held.has(`${parcel.parcel_x},${parcel.parcel_y - 1}`)) push(a, b);
      if (!held.has(`${parcel.parcel_x + 1},${parcel.parcel_y}`)) push(b, c);
      if (!held.has(`${parcel.parcel_x},${parcel.parcel_y + 1}`)) push(c, d);
      if (!held.has(`${parcel.parcel_x - 1},${parcel.parcel_y}`)) push(d, a);
    });
    return edges;
  };

  /** Corners where the rampart turns — the only places a tower belongs. */
  const wallCorners = (edges: { from: { x: number; y: number }; to: { x: number; y: number } }[]) => {
    const byPoint = new Map<string, { point: { x: number; y: number }; dirs: Set<string> }>();
    edges.forEach(edge => {
      const dir = `${Math.sign(Math.round(edge.to.x - edge.from.x))},${Math.sign(Math.round((edge.to.y - edge.from.y) * 10))}`;
      [edge.from, edge.to].forEach(point => {
        const key = `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
        const entry = byPoint.get(key) || { point, dirs: new Set<string>() };
        entry.dirs.add(dir);
        byPoint.set(key, entry);
      });
    });
    return [...byPoint.values()].filter(entry => entry.dirs.size > 1).map(entry => entry.point);
  };

  /** One low stone rampart run, drawn as a solid wall face with a lit crown. */
  const renderWallRun = (
    edges: { from: { x: number; y: number }; to: { x: number; y: number } }[],
    wallColor: string, height = 2.4, prefix = "wall",
  ) => <g>
    {edges.map((edge, index) => (
      <path key={`${prefix}-face-${index}`}
        d={`M${edge.from.x} ${edge.from.y} L${edge.to.x} ${edge.to.y} L${edge.to.x} ${edge.to.y - height} L${edge.from.x} ${edge.from.y - height} Z`}
        fill="var(--map-city-wall-dark)" stroke="none" opacity=".92" />
    ))}
    {edges.map((edge, index) => (
      <line key={`${prefix}-crown-${index}`} x1={edge.from.x} y1={edge.from.y - height} x2={edge.to.x} y2={edge.to.y - height}
        stroke="var(--map-city-wall-light)" strokeWidth=".9" strokeLinecap="square" />
    ))}
    {wallCorners(edges).map((point, index) => (
      <g key={`${prefix}-tower-${index}`} transform={`translate(${point.x},${point.y})`}>
        <rect x="-1.1" y={-height - 2.2} width="2.2" height={height + 2.4} fill="var(--map-city-wall-light)" stroke="var(--map-city-wall-dark)" strokeWidth=".3" />
        <rect x="-1.4" y={-height - 3} width="2.8" height=".9" fill={wallColor} />
      </g>
    ))}
  </g>;


  /** Small house or an active construction site, built in the same visual language as the walls. */
  const renderParcelHouse = (parcel: TileParcel, centerPoint: { x: number; y: number }, index: number, building = false, progress = 100) => {
    const { a, b, c, d } = parcelCorners(centerPoint, parcel.parcel_x, parcel.parcel_y);
    const cx = (a.x + b.x + c.x + d.x) / 4; const cy = (a.y + b.y + c.y + d.y) / 4;
    const width = (b.x - a.x) * .52; const height = width * .78;
    if (building) return <g key={`house-${parcel.id}`} transform={`translate(${cx},${cy})`} className="iso-construction-site">
      <path d={`M${-width} 2 L0 ${height * .5 + 2} L${width} 2 L0 ${-height * .5} Z`} fill="var(--map-city-wall-dark)" opacity=".36" />
      <g className="iso-construction-rise" style={{ "--construction-rise": `${Math.max(.18, progress / 100)}` } as CSSProperties}>
        <path d={`M${-width} 1 L0 ${-height * .5} L${width} 1 L0 ${height * .5 + 1} Z`} fill="var(--map-city-wall-dark)" opacity=".78" />
        <path d={`M${-width} 1 L0 ${-height * .5} L${width} 1 L0 ${-height * .1} Z`} fill="var(--map-city-wall-light)" opacity=".78" />
      </g>
      <path d={`M${-width - 1} 3 L${-width - 1} ${-height - 2} M${width + 1} 3 L${width + 1} ${-height - 2} M${-width - 2} ${-height * .45} L${width + 2} ${-height * .45} M${-width} 1 L${width} ${-height - 1} M${width} 1 L${-width} ${-height - 1}`} fill="none" stroke="var(--map-route)" strokeWidth=".65" className="iso-construction-scaffold" />
      <circle r="1.2" cy={height * .6 + 2} fill="var(--map-focus)" className="iso-construction-worker" />
      <title>Výstavba · {progress} %</title>
    </g>;
    const built = constructionByParcel.get(parcel.id);
    const sprite = built?.name ? buildSprite(built.name, built.category || undefined) : LAND_USE_SPRITE[parcel.land_use || ""];
    if (sprite) {
      const size = width * 3.1;
      return <g key={`house-${parcel.id}`} transform={`translate(${cx},${cy})`}>
        <path d={`M${-width} 1 L0 ${-height * .5} L${width} 1 L0 ${height * .5 + 1} Z`} fill="var(--map-city-wall-dark)" opacity=".3" />
        <image href={sprite} x={-size / 2} y={-size + height * .55} width={size} height={size} preserveAspectRatio="xMidYMax meet" />
        <title>{built?.name || parcel.land_use || "Zástavba"}</title>
      </g>;
    }

    return <g key={`house-${parcel.id}`} transform={`translate(${cx},${cy})`}>
      <path d={`M${-width} 1 L0 ${-height * .5} L${width} 1 L0 ${height * .5 + 1} Z`} fill="var(--map-city-wall-dark)" opacity=".85" />
      <path d={`M${-width} 1 L0 ${-height * .5} L${width} 1 L0 ${-height * .1} Z`} fill="var(--map-city-wall-light)" opacity=".95" />
      <rect className="iso-city-hearth" style={{ animationDelay: `${(index % 5) * .7}s` }} x={-1.4} y={-1.6} width="2.8" height="2.4" fill="var(--map-window)" />
    </g>;
  };

  /** City-held parcels of a cell: footprint, ramparts with towers, and houses. */
  const renderCityFootprint = (parcels: TileParcel[], centerPoint: { x: number; y: number }, own: boolean) => {
    const wallColor = own ? "var(--map-city-own)" : "var(--map-city-rival)";
    const edges = footprintWallEdges(parcels, centerPoint);
    const occupied = parcels.filter(parcel => parcel.status === "occupied");
    return <g>
      {parcels.map(parcel => (
        <polygon key={parcel.id} points={parcelQuad(centerPoint, parcel.parcel_x, parcel.parcel_y)}
          fill={parcel.status === "occupied" ? (LAND_USE_COLOR[parcel.land_use || "civic"] || LAND_USE_COLOR.open) : "var(--map-parcel-open)"}
          stroke="var(--map-marker-edge)" strokeWidth=".35" opacity={parcel.status === "occupied" ? .95 : .72} />
      ))}
      {renderWallRun(edges, wallColor, 2.2, "wall")}
      {parcelsBackToFront(occupied).map((parcel, index) => renderParcelHouse(parcel, centerPoint, index))}
    </g>;
  };

  /** Painted sprite of what the node actually is — no ramparts, no towers. */
  const renderWorkplaceGlyph = (node: Node, scale = 1) => {
    const style = NODE_STYLE[node.node_type] || NODE_STYLE.resource_node;
    const size = 10.5 * scale;
    return <g>
      <ellipse cx="0" cy="2.4" rx={size * .38} ry={size * .17} fill="var(--map-city-wall-dark)" opacity=".22" />
      <image href={nodeSprite(node)} x={-size / 2} y={-size + 2.6} width={size} height={size}
        preserveAspectRatio="xMidYMax meet" style={{ imageRendering: "auto" }} />

      <title>{`${node.name} · ${style.label}`}</title>
    </g>;
  };

  /** Node on the world map: a tinted footprint plus its painted sprite. */
  const renderNodeCompound = (node: Node, centerPoint: { x: number; y: number }) => {
    const style = NODE_STYLE[node.node_type] || NODE_STYLE.resource_node;
    const micro = node.node_tier === "micro";
    const size = node.node_tier === "major" ? 6 : node.node_tier === "minor" ? 3 : 1;
    const anchor = node.parcel_index ?? fallbackArmyParcel(node.id);
    const parcels = armyCampParcels(anchor, size).map((index, order) => ({
      id: `${node.id}-${order}`, parcel_x: index % TILE_PARCEL_COLS, parcel_y: Math.floor(index / TILE_PARCEL_COLS),
      parcel_index: index, status: "occupied", land_use: style.landUse,
    })) as unknown as TileParcel[];
    const cornerSet = parcels.map(parcel => parcelCorners(centerPoint, parcel.parcel_x, parcel.parcel_y));
    const center = cornerSet.reduce((acc, corners) => ({
      x: acc.x + (corners.a.x + corners.c.x) / (2 * cornerSet.length),
      y: acc.y + (corners.a.y + corners.c.y) / (2 * cornerSet.length),
    }), { x: 0, y: 0 });
    const spriteScale = micro ? .95 : node.node_tier === "minor" ? 1.5 : 2.2;
    return <g pointerEvents="auto">
      {parcels.map(parcel => (
        <polygon key={parcel.id} points={parcelQuad(centerPoint, parcel.parcel_x, parcel.parcel_y)}
          fill={LAND_USE_COLOR[style.landUse] || LAND_USE_COLOR.open}
          stroke={style.accent} strokeWidth=".35" opacity=".72" />
      ))}
      <g transform={`translate(${center.x},${center.y})`}>{renderWorkplaceGlyph(node, spriteScale)}</g>
    </g>;
  };


  const renderSelectedCellSubnodes = (centerPoint: { x: number; y: number }) => {
    if (!selectedCell) return null;
    return nodes.filter(node => {
      const cell = entityCell(node);
      return node.node_tier === "micro" && node.parcel_index !== null && cell.a === selectedCell.a && cell.b === selectedCell.b;
    }).map((node, order) => {
      const index = node.parcel_index;
      if (index === null) return null;
      const parcel = tileParcels.find(item => item.parcel_index === index);
      if (!parcel) return null;
      const corners = parcelCorners(centerPoint, parcel.parcel_x, parcel.parcel_y);
      const point = { x: (corners.a.x + corners.c.x) / 2, y: (corners.a.y + corners.c.y) / 2 };
      const active = selectedNodeId === node.id;
      const style = NODE_STYLE[node.node_type] || NODE_STYLE.resource_node;
      return <g key={node.id} role="button" tabIndex={0} aria-label={`Otevřít subuzel ${node.name}`}
        className="cursor-pointer" transform={`translate(${point.x},${point.y - order * 2})`}
        onClick={event => { event.stopPropagation(); setSelectedParcelId(parcel.id); setSelectedNodeId(node.id); }}
        onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedParcelId(parcel.id); setSelectedNodeId(node.id); } }}>
        {active && <polygon points={parcelQuad(centerPoint, parcel.parcel_x, parcel.parcel_y).split(" ").map(pair => {
          const [x, y] = pair.split(",").map(Number);
          return `${x - point.x},${y - point.y}`;
        }).join(" ")} fill="none" stroke="var(--map-focus)" strokeWidth="1.2" />}
        {renderWorkplaceGlyph(node, 1.1)}
        <title>{`${node.name} · parcela ${index + 1}`}</title>
      </g>;
    });
  };

  const at = (a: number, b: number) => { const point = projectCell("square4", { a, b }, TILE_SIZE); return { x: point.x + pan.x, y: point.y + pan.y }; };
  const viewRef = useRef({ zoom, pan });
  viewRef.current = { zoom, pan };
  const zoomBy = (factor: number, screenX?: number, screenY?: number) => {
    const { zoom: current, pan: currentPan } = viewRef.current;
    const next = clampZoom(current * factor);
    if (next === current) return;
    const element = viewportRef.current;
    const px = screenX ?? (element ? element.clientWidth / 2 : 0);
    const py = screenY ?? (element ? element.clientHeight / 2 : 0);
    const shift = 1 / next - 1 / current;
    setPan({ x: currentPan.x + px * shift, y: currentPan.y + py * shift });
    setZoom(next);
  };
  const zoomHandlerRef = useRef(zoomBy);
  zoomHandlerRef.current = zoomBy;
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const rect = element.getBoundingClientRect();
      zoomHandlerRef.current(Math.exp(-dy * 0.0018), event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);
  const focusTile = (tile: Tile, requestedCityId?: string) => {
    const element = viewportRef.current; if (!element) return;
    const cell = tileCell(tile); const projected = projectCell("square4", cell, TILE_SIZE);
    const cityId = requestedCityId || cityByCell.get(cellKey(cell.a, cell.b));
    const city = cityId ? cityById.get(cityId) : undefined;
    const targetZoom = city ? 2.25 : 1.65;
    setSelected(tile); setZoom(targetZoom);
    setCityLayerCityId(city?.id || null);
    onDetailOpenChange?.(true);
    setPan({ x: element.clientWidth * (city ? .47 : .38) / targetZoom - projected.x, y: element.clientHeight * .46 / targetZoom - projected.y });
  };

  const startRoadDraft = () => {
    if (!selectedCell || !selectedParcel || parcelsLoading || !canBuildRoadHere) {
      toast.error(parcelsLoading ? "Počkej na načtení podčtverců" : "Nejprve vyber vlastní podčtverec, město, subuzel nebo hotovou cestu");
      return;
    }
    const start: SubRoadCell = { gridX: selectedCell.a, gridY: selectedCell.b, parcelX: selectedParcel.parcel_x, parcelY: selectedParcel.parcel_y };
    setRoadDraftLevel(1);
    setRoadDraft([start]);
    setCityLayerCityId(null);
    setSelectedParcelId(null);
    setSelectedNodeId(null);
    setSelected(null);
    onDetailOpenChange?.(false);
    toast.info("Klikáním nebo tažením vyznač trasu přes sousední podčtverce. Mapu posuneš pravým nebo prostředním tlačítkem, přiblížíš kolečkem.");
  };

  const extendRoadDraft = (next: SubRoadCell) => {
    setRoadDraft(current => {
      const last = current[current.length - 1];
      if (!last) return [next];
      const sameCell = (a: SubRoadCell, b: SubRoadCell) =>
        a.gridX === b.gridX && a.gridY === b.gridY && a.parcelX === b.parcelX && a.parcelY === b.parcelY;
      const existingIndex = current.findIndex(item => sameCell(item, next));
      if (existingIndex >= 0) return current.slice(0, existingIndex + 1);

      const passable = (cell: SubRoadCell) => {
        const tile = tileByCell.get(cellKey(cell.gridX, cell.gridY));
        return !!tile && tile.is_passable !== false && tile.biome_family !== "sea";
      };
      if (!passable(next)) { toast.error("Tímto podčtvercem cesta vést nemůže"); return current; }

      // Clicking or dragging over a gap fills the trace in between — around water and
      // impassable ground — so the player never has to hit every sub-parcel by hand.
      let filled: SubRoadCell[] = [];
      if (areSubRoadNeighbours(last, next)) filled = [next];
      else {
        const straight = subRoadPathBetween(last, next);
        filled = straight.every(passable) ? straight : (subRoadDetour(last, next, passable) ?? []);
        if (!filled.length) { toast.error("Mezi těmito podčtverci nevede průchodná trasa"); return current; }
      }


      const result = [...current];
      filled.forEach(cell => { if (!result.some(item => sameCell(item, cell))) result.push(cell); });
      return result;
    });
  };

  const confirmRoadDraft = async () => {
    if (roadDraftBlock) { toast.error(roadDraftBlock); return; }
    const pathCells = macroPathFromSubRoad(roadDraft);
    setBuildingAction("road-path");
    const result = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "BUILD_ROAD_PATH", commandPayload: { pathCells, subPathCells: roadDraft, level: roadDraftLevel } });
    setBuildingAction(null);
    if (!result.ok) { toast.error(result.error || "Cestu nelze postavit"); return; }
    toast.success(`${tileInfrastructureLevel(roadDraftLevel)?.label || "Cesta"}: projekt zahájen`);
    setRoadDraft([]);
    await load();
  };
  const leaveCityLayer = () => {
    setCityLayerCityId(null);
    setSelected(null);
    onDetailOpenChange?.(false);
    const element = viewportRef.current;
    if (element) { setZoom(1); setPan({ x: element.clientWidth / 2 - center.x, y: element.clientHeight * .35 - center.y }); }
  };

  /** Static settlement silhouette: houses, walls, keep — scaled by population. */

  return (
    <div ref={viewportRef} className="relative h-full w-full overflow-hidden bg-map select-none"
      style={{ touchAction: "none" }}
      onContextMenu={(event) => { if (roadDraft.length > 0) event.preventDefault(); }}
      onPointerDown={(event) => {
        pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinchRef.current.size === 2) {
          const [a, b] = [...pinchRef.current.values()];
          pinchStartRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
          dragRef.current = null;
          return;
        }
        // While drawing a road the primary button belongs to the route; pan with middle/right button or two fingers.
        if (roadDraft.length > 0 && event.button === 0) { dragRef.current = null; return; }
        dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
      }}
      onPointerMove={(event) => {

        if (pinchRef.current.has(event.pointerId)) pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const start = pinchStartRef.current;
        if (start && pinchRef.current.size === 2) {
          const [a, b] = [...pinchRef.current.values()];
          const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          setZoom(clampZoom(start.zoom * (distance / start.distance)));
          return;
        }
        const drag = dragRef.current; if (!drag) return;
        const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
        if (drag.moved) setPan({ x: drag.panX + dx / zoom, y: drag.panY + dy / zoom });
      }}
      onPointerUp={(event) => { pinchRef.current.delete(event.pointerId); if (pinchRef.current.size < 2) pinchStartRef.current = null; window.setTimeout(() => { dragRef.current = null; }, 0); }}
      onPointerCancel={(event) => { pinchRef.current.delete(event.pointerId); pinchStartRef.current = null; dragRef.current = null; }}
      onPointerLeave={(event) => { pinchRef.current.delete(event.pointerId); pinchStartRef.current = null; dragRef.current = null; }}
      >
      <svg className="h-full w-full">
        <defs>
          <filter id="iso-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".35" /></filter>
          <pattern id="iso-city-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="none" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--map-city-own)" strokeWidth="2.4" opacity=".85" />
          </pattern>
          <pattern id="iso-city-hatch-rival" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="none" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--map-city-rival)" strokeWidth="2.4" opacity=".85" />
          </pattern>
          <pattern id="iso-water" width="30" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 Q7 0 15 4 T30 4" fill="none" stroke="var(--map-water-glint)" strokeWidth="1" opacity=".22" /></pattern>
        </defs>
        <g transform={`scale(${zoom})`}>
          {sortedTiles.map(tile => {
            const cell = tileCell(tile); const point = at(cell.a, cell.b); const colors = BIOMES[tile.biome_family] || BIOMES.plains;
            const roadSurface = roadSurfaceByCell.get(cellKey(cell.a, cell.b));
            const visibleRoadLevel = roadSurface?.level || 0;
            const roadFill = visibleRoadLevel === 3 ? "var(--map-road-paved)" : visibleRoadLevel === 2 ? "var(--map-road-built)" : "var(--map-road-trail)";
            const active = selected?.id === tile.id;
            const holderCityId = cityByCell.get(cellKey(cell.a, cell.b));
            const inActiveCity = cityLayerCityId && holderCityId === cityLayerCityId;
            const footprint = parcelsByCell.get(cellKey(cell.a, cell.b)) || [];
            const holderCity = holderCityId ? cityById.get(holderCityId) : undefined;
            const holderOwn = holderCity ? holderCity.owner_player === playerName : true;
            const holderColor = holderCity ? (holderOwn ? "var(--map-city-own)" : "var(--map-city-rival)") : colors[1];
            return <g key={tile.id} onClick={(event) => { event.stopPropagation(); if (roadDraft.length > 0) return; if (!dragRef.current?.moved) focusTile(tile); }}
              className={roadDraft.length > 0 ? "cursor-crosshair" : "cursor-pointer"}>

              <polygon points={squareDiamondPoints(point, TILE_SIZE)} fill={colors[0]}
                stroke={active || inActiveCity ? "var(--map-focus)" : holderColor}
                strokeWidth={active ? 3 : inActiveCity ? 2.2 : holderCity ? 2 : 1}
                opacity={cityLayerCityId && !inActiveCity ? .42 : 1} />
              {holderCity && !active && <polygon points={squareDiamondPoints(point, TILE_SIZE - 3)} fill="none" stroke={holderColor} strokeWidth=".9" opacity=".7" strokeDasharray="5 3" />}
              <polygon points={squareDiamondPoints(point, TILE_SIZE - 2)} fill={`url(#iso-${tile.biome_family})`} opacity=".55" />
              {/* the road itself only paints the sub-parcels it runs through */}
              {roadSurface && <g pointerEvents="none">
                {roadSurface.cells.map(sub => (
                  <polygon key={`road-sub-${sub.x}-${sub.y}`} points={parcelQuad(point, sub.x, sub.y)}
                    fill={roadFill} stroke="var(--map-road-edge)" strokeWidth=".5"
                    opacity={roadSurface.draft ? .7 : .95} />
                ))}
              </g>}

              {/* sub-parcel grid with its real sub-biome tint, so the landscape reads on the macro map */}
              {!active && showSubBiomes && zoom >= 1.2 && <g pointerEvents="none">
                <g opacity=".5">
                  {subBiomesOf(tile, cell.a, cell.b).map(parcel => (
                    <polygon key={`subbiome-${parcel.parcelIndex}`} points={parcelQuad(point, parcel.parcelX, parcel.parcelY)}
                      fill={SUB_BIOME_COLOR[parcel.subBiome] || colors[0]} stroke="none" />
                  ))}
                </g>
                <g opacity=".12">
                  {Array.from({ length: TILE_PARCEL_COLS - 1 }, (unused, index) => {
                    const fraction = (index + 1) / TILE_PARCEL_COLS;
                    const line = (ax: number, ay: number, bx: number, by: number) =>
                      ({ x1: point.x + (ax - ay) * TILE_SIZE, y1: point.y + (ax + ay - 1) * TILE_SIZE / 2,
                        x2: point.x + (bx - by) * TILE_SIZE, y2: point.y + (bx + by - 1) * TILE_SIZE / 2 });
                    const across = line(fraction, 0, fraction, 1);
                    const along = line(0, fraction, 1, fraction);
                    return <g key={`subgrid-${index}`}>
                      <line {...across} stroke="var(--map-label)" strokeWidth=".5" />
                      <line {...along} stroke="var(--map-label)" strokeWidth=".5" />
                    </g>;
                  })}
                </g>
              </g>}

              {tile.biome_family === "sea" && <polygon points={squareDiamondPoints(point, TILE_SIZE - 4)} fill="url(#iso-water)" />}
              {tile.biome_family.includes("forest") && !footprint.length && <Trees x={point.x - 8} y={point.y - 11} width="16" height="16" fill="var(--map-forest-edge)" stroke="var(--map-label)" strokeWidth=".8" />}
              {active && tileParcels.length > 0
                ? renderTileParcels(point)
                : footprint.length > 0 && renderCityFootprint(footprint, point, holderOwn)}
            </g>;
          })}
          {roadCatchmentOverlay.length > 0 && <g pointerEvents="none">
            {roadCatchmentOverlay.map(cell => {
              const point = at(cell.a, cell.b);
              return <polygon key={`catch-${cell.a}-${cell.b}`} points={squareDiamondPoints(point, TILE_SIZE - 2)}
                fill="var(--map-focus)" fillOpacity={cell.edge ? .05 : .12}
                stroke="var(--map-focus)" strokeWidth={cell.edge ? 1.6 : .7} strokeDasharray="4 3" opacity=".85" />;
            })}
          </g>}
          {selected && tileParcels.length > 0 && renderSelectedCellSubnodes(at(selectedCell?.a ?? 0, selectedCell?.b ?? 0))}
          {!cityLayerCityId && riverSegments.map(segment => {
            const from = { x: segment.from.x + pan.x, y: segment.from.y + pan.y };
            const end = { x: segment.to.x + pan.x, y: segment.to.y + pan.y };
            return <g key={segment.id} pointerEvents="none">
              <line x1={from.x} y1={from.y} x2={end.x} y2={end.y} stroke="var(--map-water-edge)" strokeWidth="2.4" strokeLinecap="round" opacity=".48" />
              <line x1={from.x} y1={from.y} x2={end.x} y2={end.y} stroke="var(--map-water)" strokeWidth="1.15" strokeLinecap="round" opacity=".95" />
            </g>;
          })}
          {roadNetwork.segments.map(segment => {
            const from = { x: segment.from.x + pan.x, y: segment.from.y + pan.y };
            const end = { x: segment.to.x + pan.x, y: segment.to.y + pan.y };
            const width = segment.level >= 3 ? 4.4 : segment.level === 2 ? 3.4 : 2.4;
            return <g key={segment.id} pointerEvents="none">
              <line x1={from.x} y1={from.y} x2={end.x} y2={end.y} stroke="var(--map-marker-edge)" strokeWidth={width + 1.4} strokeLinecap="round" opacity=".35" />
              <line x1={from.x} y1={from.y} x2={end.x} y2={end.y} stroke="var(--map-route)" strokeWidth={width} strokeLinecap="round"
                strokeDasharray={segment.building || segment.level === 1 ? "4 3" : undefined} opacity=".95" />
            </g>;
          })}
          {roadNetwork.bridges.map(bridge => {
            const point = { x: bridge.point.x + pan.x, y: bridge.point.y + pan.y };
            return <g key={bridge.id} pointerEvents="none">
              <rect x={point.x - 5} y={point.y - 2.6} width="10" height="5.2" rx="1.4" fill="var(--map-route)" stroke="var(--map-marker-edge)" strokeWidth=".8" />
              <line x1={point.x - 5} y1={point.y - 2.6} x2={point.x + 5} y2={point.y - 2.6} stroke="var(--map-marker-edge)" strokeWidth=".7" opacity=".8" />
            </g>;
          })}
          {showRoutes && explicitRoadNetwork.map(segment => {
            const from = { x: segment.from.x + pan.x, y: segment.from.y + pan.y };
            const end = { x: segment.to.x + pan.x, y: segment.to.y + pan.y };
            const width = segment.level === 3 ? 5.4 : segment.level === 2 ? 4 : 2.5;
            return <g key={`explicit-${segment.id}`} pointerEvents="none">
              <line x1={from.x} y1={from.y} x2={end.x} y2={end.y} stroke="var(--map-marker-edge)" strokeWidth={width + 2} strokeLinecap="round" opacity=".55" />
              <line x1={from.x} y1={from.y} x2={end.x} y2={end.y} stroke="var(--map-route)" strokeWidth={width} strokeLinecap="round"
                strokeDasharray={segment.status === "building" ? "5 3" : segment.level === 1 ? "2 3" : undefined} opacity={segment.status === "blocked" ? .35 : .95} />
              {segment.level === 3 && <line x1={from.x} y1={from.y} x2={end.x} y2={end.y} stroke="var(--map-label)" strokeWidth=".65" strokeDasharray="2 3" opacity=".5" />}
            </g>;
          })}
          {!cityLayerCityId && showRoutes && routePolylines.map(route => (
            <polyline key={route.id} points={route.points.map(point => `${point.x + pan.x},${point.y + pan.y}`).join(" ")}
              fill="none" stroke="var(--map-route)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
              opacity=".95" className="iso-active-route" pointerEvents="none" />
          ))}

          {showNodes && nodes.map(node => {
            if (node.node_type === "primary_city" || node.node_type === "secondary_city") return null;
            const cell = entityCell(node);
            if (cityLayerCityId && cityByCell.get(cellKey(cell.a, cell.b)) !== cityLayerCityId) return null;
            if (cityLayerCityId && selectedCell && (cell.a !== selectedCell.a || cell.b !== selectedCell.b)) return null;
            const openNode = () => {
              const tile = tiles.find(candidate => { const candidateCell = tileCell(candidate); return candidateCell.a === cell.a && candidateCell.b === cell.b; });
              if (!tile) return;
              focusTile(tile, cityByCell.get(cellKey(cell.a, cell.b)));
              setSelectedNodeId(node.id);
              if (node.parcel_index !== null) {
                const parcel = tileParcels.find(item => item.parcel_index === node.parcel_index);
                if (parcel) setSelectedParcelId(parcel.id);
              }
            };
            return <g key={node.id} role="button" tabIndex={0} aria-label={`Otevřít uzel ${node.name}`} className="cursor-pointer" pointerEvents={roadDraft.length > 0 ? "none" : "auto"}
              onClick={event => { event.stopPropagation(); openNode(); }}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openNode(); } }}>
              {renderNodeCompound(node, at(cell.a, cell.b))}
            </g>;
          })}
          {cities.map(city => {
            const cell = cityCellOf(city); const point = at(cell.a, cell.b);
            const own = city.owner_player === playerName;
            if (cityLayerCityId === city.id) return null;
            // Sit the silhouette on the seat parcel so founding position is visible.
            const seat = city.founded_parcel_index;
            const seatOffset = seat === null || seat === undefined ? { x: 0, y: 0 } : (() => {
              const px = (seat % TILE_PARCEL_COLS + .5) / TILE_PARCEL_COLS;
              const py = (Math.floor(seat / TILE_PARCEL_COLS) + .5) / TILE_PARCEL_ROWS;
              return { x: (px - py) * TILE_SIZE, y: (px + py - 1) * TILE_SIZE / 2 };
            })();
            const openCityLayer = () => {
              const exactTile = tiles.find(candidate => { const candidateCell = tileCell(candidate); return candidateCell.a === cell.a && candidateCell.b === cell.b; });
              const fallbackTile = exactTile || tiles.reduce<Tile | undefined>((closest, candidate) => {
                if (!closest) return candidate;
                const candidateCell = tileCell(candidate); const closestCell = tileCell(closest);
                return gridDistance("square4", candidateCell, cell) < gridDistance("square4", closestCell, cell) ? candidate : closest;
              }, undefined);
              if (fallbackTile) focusTile(fallbackTile, city.id);
            };
            return <g key={city.id} data-map-city={city.id} role="button" aria-label={`Vstoupit do města ${city.name}`} tabIndex={0} transform={`translate(${point.x + seatOffset.x},${point.y + seatOffset.y - 16})`} className="cursor-pointer" pointerEvents={roadDraft.length > 0 ? "none" : "auto"} onClick={(event) => { event.stopPropagation(); openCityLayer(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCityLayer(); } }}>
              <title>{city.name}</title>
              {showLabels && (zoom >= LABEL_ZOOM || own || cityLayerCityId === city.id) && (() => {
                const labelScale = Math.max(.5, Math.min(1.25, 1 / zoom));
                const half = Math.max(20, city.name.length * 2.7);
                return <g transform={`translate(0,26) scale(${labelScale})`} pointerEvents="none">
                  <rect x={-half} y="0" width={half * 2} height="12" rx="2" fill="var(--map-marker)" stroke={own ? "var(--map-city-own)" : "var(--map-city-rival)"} strokeWidth=".8" opacity=".9" />
                  <text y="8.6" textAnchor="middle" fill="var(--map-label)" fontSize="7.5" fontWeight="700">{city.name}</text>
                </g>;
              })()}
              {city.population_total > city.housing_capacity && <path d="M-27 -11 L-22 -20 L-17 -11 Z" fill="var(--map-focus)"><title>Tlak na růst</title></path>}
            </g>;
          })}
          {!cityLayerCityId && armyGroups.map(group => {
            const point = at(group.cell.a, group.cell.b);
            const lead = group.list[0];
            const own = lead.player_name === playerName;
            const stacked = group.list.length;
            const active = group.list.some(army => army.id === selectedArmyId);
            const banner = own ? "var(--map-city-own)" : "var(--map-city-rival)";
            // The camp sits on concrete sub-parcels; size of the army decides how many it takes.
            const anchor = lead.parcel_index ?? fallbackArmyParcel(lead.id);
            const camp = armyCampParcels(anchor, armyParcelFootprint(group.list.reduce((sum, army) => sum + army.soldiers, 0)));
            const centreOf = (index: number) => {
              const px = (index % TILE_PARCEL_COLS + .5) / TILE_PARCEL_COLS;
              const py = (Math.floor(index / TILE_PARCEL_COLS) + .5) / TILE_PARCEL_ROWS;
              return { x: (px - py) * TILE_SIZE, y: (px + py - 1) * TILE_SIZE / 2 };
            };
            const seat = camp.reduce((sum, index) => { const c = centreOf(index); return { x: sum.x + c.x / camp.length, y: sum.y + c.y / camp.length }; }, { x: 0, y: 0 });
            const openArmy = () => { setSelectedArmyId(lead.id); setSelected(null); setCityLayerCityId(null); onDetailOpenChange?.(true); };
            return <g key={group.key} data-map-army={lead.id} role="button" tabIndex={0} aria-label={`Armáda ${lead.name}`}
              pointerEvents={roadDraft.length > 0 ? "none" : "auto"}
              className="cursor-pointer"
              onClick={(event) => { event.stopPropagation(); if (!dragRef.current?.moved) openArmy(); }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openArmy(); } }}>
              {/* the cell the army stands on */}
              <polygon points={squareDiamondPoints(point, TILE_SIZE - 2)} fill="none" stroke={active ? "var(--map-focus)" : banner} strokeWidth={active ? 2.4 : 1.4} strokeDasharray="4 3" opacity=".85" />
              {/* occupied sub-parcels */}
              {camp.map(index => <polygon key={index} points={parcelQuad(point, index % TILE_PARCEL_COLS, Math.floor(index / TILE_PARCEL_COLS))}
                fill={banner} opacity={active ? .38 : .26} stroke={banner} strokeWidth=".6" />)}
              <g transform={`translate(${point.x + seat.x},${point.y + seat.y - 12})`} filter="url(#iso-shadow)">
                <ArmyMarker army={lead} own={own} active={active} />
                {stacked > 1 && <g transform="translate(15,-19)">
                  <circle r="7" fill="var(--map-marker)" stroke={banner} strokeWidth="1.2" />
                  <text textAnchor="middle" y="2.6" fontSize="7.5" fontWeight="700" fill="var(--map-label)">{stacked}</text>
                </g>}
                <title>{`${lead.name} · pole ${group.cell.a}, ${group.cell.b} · ${camp.length} sub-čtverců`}</title>
              </g>
            </g>;
          })}
          {/* top-most drawing layer: sub-parcels of passable cells catch every click and drag */}
          {roadDraft.length > 0 && <g>
            {sortedTiles.map(tile => {
              if (tile.is_passable === false || tile.biome_family === "sea") return null;
              const cell = tileCell(tile); const point = at(cell.a, cell.b);
              return <g key={`road-hit-${tile.id}`}>
                {Array.from({ length: TILE_PARCEL_COLS * TILE_PARCEL_ROWS }, (unused, parcelIndex) => {
                  const parcelX = parcelIndex % TILE_PARCEL_COLS; const parcelY = Math.floor(parcelIndex / TILE_PARCEL_COLS);
                  const next: SubRoadCell = { gridX: cell.a, gridY: cell.b, parcelX, parcelY };
                  return <polygon key={parcelIndex} points={parcelQuad(point, parcelX, parcelY)} fill="transparent" stroke="transparent"
                    className="cursor-crosshair" role="button" aria-label={`Vést cestu přes pole ${cell.a}, ${cell.b} podčtverec ${parcelIndex + 1}`}
                    onPointerDown={event => { if (event.button !== 0) return; event.stopPropagation(); extendRoadDraft(next); }}
                    onPointerEnter={event => { if (event.buttons === 1) extendRoadDraft(next); }}
                    onClick={event => event.stopPropagation()} />;
                })}
              </g>;
            })}
          </g>}
        </g>

      </svg>

      <div className={`map-floating-control absolute right-3 z-50 flex items-center gap-1 p-1 ${isMobile ? (selected ? "bottom-[66vh]" : "bottom-20") : "bottom-4"}`}>
        <Button size="icon" variant="ghost" aria-label="Oddálit" onClick={() => zoomBy(1 / 1.3)}><Minus className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Celá mapa" onClick={home}><Home className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Přiblížit" onClick={() => zoomBy(1.3)}><Plus className="h-4 w-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button size="icon" variant={showRoutes ? "secondary" : "ghost"} aria-label={showRoutes ? "Skrýt toky a cesty" : "Zobrazit toky a cesty"} aria-pressed={showRoutes} onClick={() => setShowRoutes(value => !value)}><RouteIcon className={`h-4 w-4 ${showRoutes ? "" : "opacity-40"}`} /></Button>
        <Button size="icon" variant={showNodes ? "secondary" : "ghost"} aria-label={showNodes ? "Skrýt uzly" : "Zobrazit uzly"} aria-pressed={showNodes} onClick={() => setShowNodes(value => !value)}><Landmark className={`h-4 w-4 ${showNodes ? "" : "opacity-40"}`} /></Button>
        <Button size="icon" variant={showLabels ? "secondary" : "ghost"} aria-label={showLabels ? "Skrýt názvy měst" : "Zobrazit názvy měst"} aria-pressed={showLabels} onClick={() => setShowLabels(value => !value)}><Flag className={`h-4 w-4 ${showLabels ? "" : "opacity-40"}`} /></Button>
        <Button size="icon" variant={showSubBiomes ? "secondary" : "ghost"} aria-label={showSubBiomes ? "Skrýt subbiomy" : "Zobrazit subbiomy"} aria-pressed={showSubBiomes} onClick={() => setShowSubBiomes(value => !value)}><Grid3x3 className={`h-4 w-4 ${showSubBiomes ? "" : "opacity-40"}`} /></Button>
      </div>
      <div className={`map-floating-control absolute left-3 top-3 z-20 flex items-center gap-2 px-2.5 py-1.5 ${isMobile ? "text-[10px]" : "text-xs"}`}><Layers3 className="h-4 w-4 text-primary"/><span>Čtvercová síť · izometrické zobrazení</span></div>
      {/* rendered straight into the page body: app chrome (tabs, docks) would swallow the clicks */}
      {roadDraft.length > 0 && createPortal(<div className={`map-floating-control fixed left-1/2 z-[200] w-[min(92vw,560px)] -translate-x-1/2 p-3 ${isMobile ? "bottom-24" : "bottom-16"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <RouteIcon className="h-4 w-4 text-primary" />
          <strong className="mr-auto text-sm">Kreslení cesty · {Math.max(0, roadDraft.length - 1)} podúseků</strong>
          <Button size="icon" variant="ghost" aria-label="Vrátit poslední úsek" disabled={roadDraft.length <= 1} onClick={() => setRoadDraft(current => current.slice(0, -1))}><Undo2 className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" aria-label="Zrušit kreslení" onClick={() => setRoadDraft([])}><X className="h-4 w-4" /></Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <select value={roadDraftLevel} onChange={event => setRoadDraftLevel(Number(event.target.value))} className="h-8 rounded border border-input bg-background px-2">
            {[1, 2, 3].map(level => <option key={level} value={level}>{tileInfrastructureLevel(level)?.label}</option>)}
          </select>
          <span className="text-muted-foreground">{roadDraftSummary.gold} zlata · {roadDraftSummary.production} produkce · {roadDraftSummary.turns} kol{roadDraftSummary.bridges ? ` · ${roadDraftSummary.bridges} mostů` : ""}</span>
          <Button size="sm" className="ml-auto" disabled={!!roadDraftBlock || !!buildingAction} title={roadDraftBlock || undefined} onClick={() => void confirmRoadDraft()}>
            {buildingAction === "road-path" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}Potvrdit
          </Button>
        </div>
        {roadDraftBlock && <p className="mt-2 text-[11px] text-muted-foreground">{roadDraftBlock}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">Vyznačená pole jsou dosah napojení tvých měst a uzlů — cesta v nich je připojí k síti. Klikat můžeš i přes mezeru, trasa se doplní sama.</p>
      </div>, document.body)}
      {cityLayerCity && <div className="map-floating-control absolute left-4 top-16 z-30 flex items-center gap-3 px-2 py-2"><Button size="icon" variant="ghost" aria-label="Zpět na světovou mapu" onClick={leaveCityLayer}><ArrowLeft className="h-4 w-4"/></Button><div className="pr-3"><p className="text-[10px] uppercase text-primary">Městská vrstva</p><p className="font-display text-sm">{cityLayerCity.name} · {(cityCellsById.get(cityLayerCity.id) || []).length || 1} polí</p></div></div>}

      {selected && <aside className={`map-tile-detail absolute z-40 overflow-y-auto border-primary/20 bg-background/95 shadow-2xl backdrop-blur-xl ${isMobile ? "inset-x-0 bottom-0 max-h-[64vh] rounded-t-2xl border-t p-4" : "bottom-0 right-0 top-0 w-[380px] border-l p-5"}`}>
        <Button size="icon" variant="ghost" className="absolute right-3 top-3" aria-label="Zavřít detail" onClick={() => { setSelected(null); setCityLayerCityId(null); onDetailOpenChange?.(false); }}><X className="h-4 w-4"/></Button>
        <div className="pr-10">
          <p className="text-[10px] font-semibold uppercase text-primary">Pole {selectedCell?.a}, {selectedCell?.b}</p>
          <h2 className="mt-1 text-xl capitalize">{selected.biome_family.replace("_", " ")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{selected.owner_player || "Neutrální území"} · {selected.is_passable === false ? "Neprůchodné" : "Průchodné"}{selected.has_river ? " · Řeka" : ""}</p>
        </div>

        <section className="mt-5 border-y border-border/70 py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm">Podparcely pole ({TILE_PARCEL_COLS}×{TILE_PARCEL_ROWS})</h3>
            <span className="text-[10px] text-muted-foreground">{claimedSlots * POPULATION_PER_SLOT} míst k bydlení</span>
          </div>
          {parcelsLoading && <p className="text-xs text-muted-foreground">Vyměřuji parcely…</p>}
          {!parcelsLoading && !tileParcels.length && <p className="text-xs text-muted-foreground">Toto pole nemá vyměřené parcely.</p>}
          {!parcelsLoading && tileParcels.length > 0 && <>
            <div className="grid grid-cols-6 gap-[3px]">
              {tileParcels.map(parcel => {
                const cost = parcelClaimCost(Number(parcel.build_cost_multiplier || 1), claimedForCity);
                const mine = parcel.owner_player === playerName;
                const affordable = treasury.gold >= cost.gold && treasury.production >= cost.production;
                const canClaim = !!claimHost && parcel.buildable && parcel.status === "wild" && affordable;
                return <button key={parcel.id} type="button" disabled={claimingParcel !== null}
                  onClick={() => { setSelectedParcelId(parcel.id); setSelectedNodeId(null); if (canClaim) void claimParcel(parcel); }}
                  title={`${SUB_BIOME_LABEL[parcel.sub_biome] || parcel.sub_biome} · výška ${parcel.elevation} · ${parcel.capacity_slots} slotů · ${cost.gold} zlata / ${cost.production} produkce${!affordable && parcel.status === "wild" && parcel.buildable ? " · nedostatek prostředků" : ""}`}
                  className={`aspect-square border text-[8px] leading-none transition-colors ${selectedParcelId === parcel.id ? "ring-2 ring-primary ring-offset-1 ring-offset-background " : ""}${
                    parcel.status === "occupied" ? "border-primary/60 bg-primary/25"
                    : parcel.status === "claimed" ? (mine ? "border-primary/40 bg-primary/10" : "border-border bg-muted/40")
                    : !parcel.buildable ? "border-border/40 bg-muted/20 text-muted-foreground"
                    : canClaim ? "border-border bg-card hover:border-primary hover:bg-primary/10" : "border-border bg-card"}`}>
                  {parcel.status === "occupied" ? "🏠" : parcel.status === "claimed" ? "▣" : !parcel.buildable ? "▲" : parcel.parcel_index + 1}
                </button>;
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {claimHost
                ? `Klikni na volnou parcelu a ${claimHost.name} ji vykoupí. V pokladně máš ${treasury.gold} zlata a ${treasury.production} produkce.`
                : foreignOwner
                  ? `Toto pole ovládá ${foreignOwner} — parcely tu vykupovat nelze.`
                  : selectedCity
                    ? `${selectedCity.name} patří ${selectedCity.owner_player} — cizí parcely vykupovat nelze.`
                    : "Parcely lze vykupovat jen z pole vašeho města nebo z pole hned vedle něj."}
            </p>

          </>}
        </section>

        <section className="mt-4 border border-primary/25 bg-primary/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Cesty a infrastruktura</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {selectedInfrastructure?.status === "building"
                  ? `${tileInfrastructureLevel(selectedInfrastructure.level)?.label || "Cesta"} ve výstavbě · ${selectedInfrastructure.progress} %`
                  : selectedInfrastructure?.level
                    ? `${tileInfrastructureLevel(selectedInfrastructure.level)?.label || "Cesta"} na tomto poli`
                    : "Z tohoto pole může začít nová trasa."}
              </p>
            </div>
            {selectedRoadPlan?.bridges.length ? <span className="text-[10px] text-muted-foreground">Řeka · bude potřeba most</span> : null}
          </div>
          <Button className="mt-3 w-full" disabled={!!buildingAction || parcelsLoading || !selectedParcel || !canBuildRoadHere}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => { event.stopPropagation(); startRoadDraft(); }}>
            <RouteIcon className="mr-1.5 h-4 w-4" />Postavit cestu
          </Button>
          {!canBuildRoadHere && <p className="mt-2 text-[11px] text-muted-foreground">
            Začni na vlastním městě, subuzlu, vlastněném poli nebo na již dokončené cestě.
          </p>}
          {canBuildRoadHere && <p className="mt-2 text-[11px] text-muted-foreground">
             Po stisknutí kresli přes sousední podčtverce, zvol jednu ze tří úrovní a potvrď cenu. Trasa může zůstat i uvnitř tohoto pole.
          </p>}
        </section>

        {selectedCity && <section className="mt-4 space-y-2 border border-border/70 p-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm">Výroba a pracovní síla · {selectedCity.name}</h3>
            <span className="text-[10px] text-muted-foreground">{labour.production.length}/{labour.slots} obsazeno</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {labour.housing} obytných čtvrtí · jedna uživí {PRODUCTION_PER_RESIDENTIAL} produkční
            {labour.free > 0 ? ` · volná pracovní síla ${labour.free}` : " · bez volné pracovní síly"}
          </p>
          {labour.production.length === 0
            ? <p className="text-xs text-muted-foreground">Žádná produkční čtvrť. Postav ji na vlastní parcele níže.</p>
            : <div className="space-y-1">{labour.production.map(district => (
              <div key={district.id} className="flex items-center gap-2 text-[11px]">
                <span className="flex-1 truncate">{district.name}{district.is_staffed ? "" : " · neobsazená"}</span>
                <span className="text-muted-foreground">+{district.basket_output}</span>
                <select className="h-6 rounded border border-input bg-background px-1 text-[10px]" value={district.basket_key || "staple_food"}
                  disabled={!!buildingAction || selectedCity.owner_player !== playerName}
                  onChange={event => void setDistrictProduction(district.id, event.target.value)}>
                  {DEMAND_BASKETS.map(basket => <option key={basket.key} value={basket.key}>{basket.label}</option>)}
                </select>
              </div>
            ))}</div>}
          <div className="border-t border-border/60 pt-2">
            <div className="flex items-baseline justify-between">
              <h4 className="text-xs">Subuzly v okolí</h4>
              <span className="text-[10px] text-muted-foreground">{citySubnodes.list.length}</span>
            </div>
            {citySubnodes.list.length === 0
              ? <p className="text-[11px] text-muted-foreground">Žádné subuzly. Postav dvůr, dílnu nebo překladiště na podčtverci.</p>
              : <>
                <div className="space-y-1">{citySubnodes.list.map(node => (
                  <button key={node.id} type="button" className="flex w-full items-center gap-2 text-left text-[11px]" onClick={() => setSelectedNodeId(node.id)}>
                    <span className="flex-1 truncate">{node.name}</span>
                    <span className="text-muted-foreground">P {Number(node.production_output || 0)} · Z {Number(node.wealth_output || 0)} · F {Number(node.food_value || 0)}</span>
                  </button>
                ))}</div>
                <p className="mt-1 text-[10px] text-muted-foreground">Celkem: produkce {citySubnodes.production} · bohatství {citySubnodes.wealth} · potraviny {citySubnodes.food} — přepočítá se při dalším tahu.</p>
              </>}
          </div>
          {selectedCity.owner_player !== playerName && <p className="text-[10px] text-muted-foreground">Cizí město — výrobu tu nastavit nelze.</p>}
        </section>}

        {selectedParcel && <section className="mt-4 space-y-3 border border-primary/25 bg-primary/5 p-3">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase text-primary">Parcela {selectedParcel.parcel_index + 1}</p><h3 className="text-sm">{SUB_BIOME_LABEL[selectedParcel.sub_biome] || selectedParcel.sub_biome}</h3></div><span className="text-xs text-muted-foreground">{selectedParcelUsed}/{selectedParcel.capacity_slots} slotů</span></div>
          {(selectedParcelContents.length > 0 || selectedParcelNodes.length > 0) && <div className="space-y-1 text-xs">
            {selectedParcelContents.filter(item => item.entity_type !== "node").map(item => <div key={item.id} className="flex justify-between border-b border-border/50 py-1"><span className="capitalize">{item.entity_type}</span><span>{item.slots_used} slot</span></div>)}
            {selectedParcelNodes.map(node => <Button key={node.id} type="button" variant="ghost" size="sm" className="h-auto w-full justify-between rounded-none border-b border-border/50 px-0 py-1 text-left" onClick={() => setSelectedNodeId(node.id)}><span>{node.name}</span><span className="text-muted-foreground">subuzel</span></Button>)}
          </div>}
          {selectedNode && selectedParcelNodes.some(node => node.id === selectedNode.id) && <div className="border-l-2 border-primary bg-background/60 p-2 text-xs">
            <p className="font-medium">{selectedNode.name}</p>
            <p className="mt-1 text-muted-foreground">{selectedNode.node_subtype || selectedNode.node_type} · správce {selectedNode.controlled_by || "nezávislý"}</p>
            <div className="mt-2 flex gap-3"><span>Produkce {selectedNode.production_output}</span><span>Bohatství {selectedNode.wealth_output}</span><span>Potraviny {selectedNode.food_value}</span></div>
          </div>}
          {parcelBlock && <p className="border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">{parcelBlock}</p>}
          {selectedParcel.status === "wild" && selectedParcel.buildable && !!claimHost && <Button size="sm" className="w-full" disabled={claimingParcel !== null || !!buildingAction} onClick={() => void claimParcel(selectedParcel)}>
            {claimingParcel !== null ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Vykoupit parcelu · {parcelClaimCost(Number(selectedParcel.build_cost_multiplier || 1), claimedForCity).gold} zlata / {parcelClaimCost(Number(selectedParcel.build_cost_multiplier || 1), claimedForCity).production} produkce
          </Button>}

          <>
            <div>
              <p className="mb-2 text-xs font-medium">Obytné čtvrti</p>
              <div className="grid grid-cols-2 gap-2">{RESIDENTIAL_DISTRICTS.map(district => (
                <Button key={district.key} size="sm" variant="outline" className="h-auto flex-col items-start gap-1 px-2 py-2 text-left text-xs" disabled={!!buildingAction || !!parcelBlock || !selectedCity || selectedCity.owner_player !== playerName} onClick={() => void buildDistrict(district)}>

                  <span className="flex w-full items-center gap-2">
                    {buildingAction === `district-${district.key}`
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <img src={buildResidential} alt="" className="h-7 w-7 object-contain" />}
                    <span className="flex-1 leading-tight">{district.name}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">+{district.population_capacity} obyvatel · {district.build_cost_wealth} zlata · {district.build_turns} t.</span>
                </Button>
              ))}</div>
              {(!selectedCity || selectedCity.owner_player !== playerName) && <p className="mt-1 text-[10px] text-muted-foreground">Čtvrti lze zakládat jen na parcele vlastního města.</p>}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium">Produkční čtvrti</p>
                <span className="text-[10px] text-muted-foreground">{labour.production.length}/{labour.slots} obsazeno</span>
              </div>
              <p className="mb-2 text-[10px] text-muted-foreground">Jedna obytná čtvrť uživí {PRODUCTION_PER_RESIDENTIAL} produkční. {labour.free > 0 ? `Volná pracovní síla: ${labour.free}.` : "Bez další obytné čtvrti nové dílny nikdo neobsadí."}</p>
              <div className="space-y-2">{PRODUCTION_DISTRICTS.map(district => {
                const choices = district.baskets?.length ? district.baskets : DEMAND_BASKETS.map(b => b.key);
                const picked = productionPick[district.key] || choices[0];
                return <div key={district.key} className="rounded border border-border/60 p-2">
                  <div className="flex items-center gap-2">
                    <img src={DISTRICT_SPRITE[district.key] || buildInfrastructure} alt="" className="h-7 w-7 object-contain" />
                    <div className="flex-1 leading-tight">
                      <p className="text-xs font-medium">{district.name}</p>
                      <p className="text-[10px] text-muted-foreground">+{district.basket_output} do koše · {district.build_cost_wealth} zlata · {district.build_turns} t.</p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <select className="h-7 flex-1 rounded border border-input bg-background px-1 text-[11px]" value={picked}
                      onChange={event => setProductionPick(current => ({ ...current, [district.key]: event.target.value }))}>
                      {choices.map(key => <option key={key} value={key}>{DEMAND_BASKETS.find(b => b.key === key)?.label || key}</option>)}
                    </select>
                    <Button size="sm" className="h-7 px-2 text-[11px]" disabled={!!buildingAction || !!parcelBlock || !selectedCity || selectedCity.owner_player !== playerName || labour.free <= 0}
                      onClick={() => void buildDistrict(district, picked)}>
                      {buildingAction === `district-${district.key}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Postavit"}
                    </Button>
                  </div>
                </div>;
              })}</div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-medium">Postavit budovu</p><span className="text-[10px] text-muted-foreground">{buildingTemplates.length} možností</span></div>
              <div className="max-h-72 space-y-3 overflow-y-auto pr-1">{Object.entries(buildingTemplates.reduce<Record<string, BuildingTemplate[]>>((groups, template) => {
                const key = template.category || "ostatní"; (groups[key] ||= []).push(template); return groups;
              }, {})).map(([category, templates]) => (
                <div key={category}>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{BUILD_CATEGORY_LABEL[category] || category}</p>
                  <div className="grid grid-cols-2 gap-2">{templates.map(template => (
                    <Button key={template.id} size="sm" variant="outline" className="h-auto flex-col items-start gap-1 px-2 py-2 text-left text-xs" disabled={!!buildingAction || !!parcelBlock} onClick={() => void buildOnParcel(template)}>
                      <span className="flex w-full items-center gap-2">
                        {buildingAction === `building-${template.id}`
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <img src={buildSprite(template.name, template.category)} alt="" className="h-7 w-7 object-contain" />}
                        <span className="flex-1 leading-tight">{template.name}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground">{template.cost_wealth} zlata · {template.build_turns} t.</span>
                    </Button>
                  ))}</div>
                </div>
              ))}</div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium">Vytvořit subuzel</p>
              <div className="grid grid-cols-2 gap-2">{SUBNODE_OPTIONS.map(option => {
                const reason = subnodeBlockReason(option);
                return <Button key={option.key} size="sm" variant="outline" className="h-auto flex-col items-start gap-1 px-2 py-2 text-left text-xs"
                  disabled={!!buildingAction || !!reason} title={reason || undefined}
                  onClick={() => void buildSubnode(option.key, option.label)}>
                  <span className="flex w-full items-center gap-2">
                    {buildingAction === `node-${option.key}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <img src={NODE_SPRITE[option.key] || spriteHamlet} alt="" className="h-7 w-7 object-contain" />}
                    <span className="flex-1 leading-tight">{option.label}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">{reason || `${option.gold} zlata · ${option.production} produkce`}</span>
                </Button>;
              })}</div>
            </div>

            {!selectedCity && !foreignOwner && <div className="rounded border border-border/60 p-2">
              <p className="text-xs font-medium">Založit osadu na této parcele</p>
              {CITY_ALLOWED_BIOMES.includes(selected.biome_family) && selected.is_passable !== false ? <>
                <div className="mt-2 flex gap-2">
                  <Input value={newCityName} onChange={event => setNewCityName(event.target.value)} placeholder="Název osady" className="h-8 text-xs" />
                  <Button size="sm" disabled={!!buildingAction || !newCityName.trim()} onClick={() => void foundCityHere()}>
                    {buildingAction === "found-city" ? <Loader2 className="h-4 w-4 animate-spin" /> : <img src={spriteHamlet} alt="" className="h-5 w-5 object-contain" />}
                    <span className="ml-1">Založit</span>
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Osada vznikne na parcele {selectedParcel.parcel_index + 1}.</p>
              </> : <p className="mt-1 text-[11px] text-muted-foreground">Zde osadu založit nelze — vhodné jsou pláně, kopce, les a bažiny na průchodném poli.</p>}
            </div>}

            {canBuildRoadHere && <div className="rounded border border-border/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <div><p className="text-xs font-medium">Cesta přes parcelu</p><p className="text-[11px] text-muted-foreground">Nakreslí skutečnou dopravní trasu</p></div>
                <Button size="sm" disabled={!!buildingAction || parcelsLoading} onClick={startRoadDraft}><RouteIcon className="mr-1 h-3 w-3"/>Kreslit</Button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">Cesta jen prochází podčtverci — nezabírá stavební slot, parcely pod ní zůstávají volné.</p>
            </div>}

          </>

        </section>}

        {!selectedParcel && <section className="mt-4 border border-border p-3 text-[11px] text-muted-foreground">
          Klikni na podčtverec v mřížce výše — všechny akce (vykoupení, čtvrti, budovy, subuzly, cesty i založení osady) se otevřou pro vybranou parcelu.
        </section>}



        {selectedCity && <div className="mt-5 space-y-4">
          <div className="border-y border-border/70 py-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-display text-lg">{selectedCity.name}</p><p className="text-xs text-muted-foreground">{selectedCity.settlement_level} · úroveň {selectedCity.development_level}</p></div><Button size="sm" variant="outline" onClick={() => onCityClick?.(selectedCity.id)}>Otevřít město <ArrowUpRight className="ml-1 h-3.5 w-3.5"/></Button></div>
          </div>
          <section>
            <div className="mb-2 flex justify-between text-xs"><span>Zaplnění města</span><strong>{growthPressure} %</strong></div>
            <Progress value={growthPressure} className="h-2"/>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <div><strong className="block text-foreground">{selectedCity.population_total.toLocaleString("cs-CZ")}</strong><span className="text-muted-foreground">obyvatel</span></div>
              <div><strong className="block text-foreground">{occupiedParcels}/{cityHeldParcels.length}</strong><span className="text-muted-foreground">zastavěných parcel</span></div>
              <div><strong className="block text-foreground">{netGrowth >= 0 ? "+" : ""}{netGrowth}</strong><span className="text-muted-foreground">růst/kolo</span></div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Drží {cityHeldParcels.length} podparcel na {(cityCellsById.get(selectedCity.id) || []).length || 1} polích · kapacita {cityCapacity.toLocaleString("cs-CZ")} obyvatel.</p>
          </section>
        </div>}

        {!selectedCity && expansionCity && <div className="mt-6 border border-primary/30 bg-primary/5 p-4 text-sm">
          <h3 className="text-base">Rozšířit {expansionCity.name}</h3>
          <p className="mt-2 text-xs text-muted-foreground">Město tlačí na hranice z {growthPressure} %. Vykupuj jednotlivé podparcely v mřížce výše — každá přidá kapacitu podle svého podterénu.</p>
        </div>}
        {!selectedCity && !expansionCity && <div className="mt-6 border border-border p-4 text-sm text-muted-foreground"><p>Na tomto poli není město ani možný směr rozšíření.</p><p className="mt-2 text-xs">Parcely lze vykupovat z pole vašeho města nebo z pole hned vedle něj.</p></div>}
      </aside>}

      {selectedArmy && <aside className={`map-tile-detail absolute z-40 overflow-y-auto border-primary/20 bg-background/95 shadow-2xl backdrop-blur-xl ${isMobile ? "inset-x-0 bottom-0 max-h-[64vh] rounded-t-2xl border-t p-4" : "bottom-0 right-0 top-0 w-[380px] border-l p-5"}`}>
        <Button size="icon" variant="ghost" className="absolute right-3 top-3" aria-label="Zavřít detail armády" onClick={() => { setSelectedArmyId(null); onDetailOpenChange?.(false); }}><X className="h-4 w-4"/></Button>
        <div className="pr-10">
          <p className="text-[10px] font-semibold uppercase text-primary">Armáda</p>
          <h2 className="mt-1 font-display text-xl">{selectedArmy.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{selectedArmy.player_name} · {selectedArmy.formation_type} · {selectedArmy.stance}</p>
        </div>
        <section className="mt-5 border-y border-border/70 py-4">
          <div className="mb-2 flex justify-between text-xs"><span>Morálka</span><strong>{selectedArmy.morale} %</strong></div>
          <Progress value={Math.max(0, Math.min(100, selectedArmy.morale))} className="h-2"/>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div><strong className="block text-foreground">{selectedArmy.soldiers.toLocaleString("cs-CZ")}</strong><span className="text-muted-foreground">vojáků</span></div>
            <div><strong className="block text-foreground">{selectedArmy.unit_count}</strong><span className="text-muted-foreground">jednotek</span></div>
            <div><strong className="block text-foreground">{Math.round(selectedArmy.power)}</strong><span className="text-muted-foreground">síla</span></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Pole {entityCell(selectedArmy).a}, {entityCell(selectedArmy).b} · tábor na sub-čtverci {(selectedArmy.parcel_index ?? fallbackArmyParcel(selectedArmy.id)) + 1} ({armyParcelFootprint(selectedArmyStack.reduce((sum, army) => sum + army.soldiers, 0) || selectedArmy.soldiers)} sub-čtverců) · {selectedArmy.assignment} · {selectedArmy.moved_this_turn ? "v tomto kole se pohnula" : "toto kolo stojí"}</p>
        </section>
        <div className="mt-4 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary"/>
          <Flag className="h-4 w-4 text-primary"/>
          <span className="text-xs text-muted-foreground">Rozkazy zadávej ve vojenském panelu.</span>
        </div>
        {selectedArmyStack.length > 1 && <div className="mt-4">
          <h3 className="text-sm">Na stejném poli ({selectedArmyStack.length})</h3>
          <div className="mt-2 space-y-1">
            {selectedArmyStack.map(army => (
              <button key={army.id} type="button" onClick={() => setSelectedArmyId(army.id)}
                className={`flex w-full items-center justify-between border px-2 py-1.5 text-left text-xs transition-colors ${army.id === selectedArmyId ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40"}`}>
                <span className="truncate">{army.name}</span>
                <span className="text-muted-foreground">{army.soldiers.toLocaleString("cs-CZ")} · {army.morale} %</span>
              </button>
            ))}
          </div>
        </div>}
      </aside>}
      {!tiles.length &&  <div className="absolute inset-0 grid place-items-center text-center"><div className="map-floating-control p-6"><Castle className="mx-auto mb-2 h-7 w-7 text-primary"/><p className="font-display text-primary">Mapa zatím nemá žádná pole.</p></div></div>}
    </div>
  );
}
