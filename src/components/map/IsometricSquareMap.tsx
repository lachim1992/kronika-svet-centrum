import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Castle, Flag, Home, Layers3, Minus, Plus, Shield, Sparkles, Trees, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { dispatchCommand } from "@/lib/commands";
import { gridDistance, projectCell, squareDiamondPoints } from "@/lib/mapTopology";
import { parcelClaimCost, POPULATION_PER_SLOT, TILE_PARCEL_COLS, TILE_PARCEL_ROWS } from "@/lib/tileParcels";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn?: number;
  onCityClick?: (cityId: string) => void;
  gridKind?: "hex6" | "square4";
  onDetailOpenChange?: (open: boolean) => void;
}

type Tile = { id: string; q: number; r: number; grid_x: number | null; grid_y: number | null; biome_family: string; owner_player: string | null; mean_height: number | null; is_passable: boolean };
type City = { id: string; name: string; province_q: number; province_r: number; grid_x: number | null; grid_y: number | null; owner_player: string; settlement_level: string; population_total: number; housing_capacity: number; development_level: number; birth_rate: number; death_rate: number; migration_pressure: number };
type Node = { id: string; name: string; hex_q: number; hex_r: number; grid_x: number | null; grid_y: number | null; node_type: string; node_tier: string };
type Army = { id: string; name: string; hex_q: number; hex_r: number; grid_x: number | null; grid_y: number | null; player_name: string; soldiers: number; morale: number };
type PathCell = { x?: number; y?: number; q?: number; r?: number };
type Route = { route_id: string | null; path_cells: PathCell[] | null; hex_path: PathCell[] | null };
type UrbanCell = { id: string; city_id: string; grid_x: number; grid_y: number; cell_role: string; status: string; development_progress: number; claim_order: number };
type TileParcel = {
  id: string; parcel_index: number; parcel_x: number; parcel_y: number; sub_biome: string; elevation: number;
  buildable: boolean; build_cost_multiplier: number; capacity_slots: number; status: string;
  land_use: string | null; city_id: string | null; owner_player: string | null;
};
type Parcel = { id: string; city_id: string; urban_cell_id: string; parcel_x: number; parcel_y: number; land_use: string; status: string; building_id: string | null; district_id: string | null };

const TILE_SIZE = 42;
const PARCEL_CAPACITY = 175;
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
  open_water: "otevřená voda", river_bank: "břeh řeky", open_ground: "otevřená zem", shallow_dip: "mírná sníženina",
  thicket: "houští",
};

const SUB_BIOME_COLOR: Record<string, string> = {
  fertile_flat: "var(--map-plains)", grassland: "var(--map-plains)", dry_flat: "var(--map-desert)",
  hillock: "var(--map-hills)", terrace: "var(--map-hills)", saddle: "var(--map-hills)",
  steep_slope: "var(--map-mountain)", crag: "var(--map-mountain)", mountain_shelf: "var(--map-mountain)",
  pass_floor: "var(--map-hills)", dense_forest: "var(--map-forest)", ridge_woods: "var(--map-forest)",
  thick_canopy: "var(--map-forest)", clearing: "var(--map-plains)", thicket: "var(--map-forest)",
  creek_bank: "var(--map-water)", river_bank: "var(--map-water)", shore: "var(--map-water-edge)",
  harbour_flat: "var(--map-water-edge)", open_water: "var(--map-water)", cliff_edge: "var(--map-mountain-edge)",
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
  const [urbanCells, setUrbanCells] = useState<UrbanCell[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 40 });
  const [selected, setSelected] = useState<Tile | null>(null);
  const [cityLayerCityId, setCityLayerCityId] = useState<string | null>(null);
  const [expanding, setExpanding] = useState(false);
  const [tileParcels, setTileParcels] = useState<TileParcel[]>([]);
  const [parcelsLoading, setParcelsLoading] = useState(false);
  const [claimingParcel, setClaimingParcel] = useState<number | null>(null);

  const tileCell = useCallback((tile: Tile) => ({
    a: gridKind === "square4" && tile.grid_x !== null ? tile.grid_x : tile.q,
    b: gridKind === "square4" && tile.grid_y !== null ? tile.grid_y : tile.r,
  }), [gridKind]);
  const entityCell = useCallback((entity: { grid_x: number | null; grid_y: number | null; hex_q?: number; hex_r?: number; province_q?: number; province_r?: number }) => ({
    a: gridKind === "square4" && entity.grid_x !== null ? entity.grid_x : entity.hex_q ?? entity.province_q ?? 0,
    b: gridKind === "square4" && entity.grid_y !== null ? entity.grid_y : entity.hex_r ?? entity.province_r ?? 0,
  }), [gridKind]);

  const load = useCallback(async () => {
    const [tileRes, cityRes, nodeRes, routeRes, armyRes, urbanRes, parcelRes] = await Promise.all([
      supabase.from("province_hexes").select("id, q, r, grid_x, grid_y, biome_family, owner_player, mean_height, is_passable").eq("session_id", sessionId).limit(4000),
      supabase.from("cities").select("id, name, province_q, province_r, grid_x, grid_y, owner_player, settlement_level, population_total, housing_capacity, development_level, birth_rate, death_rate, migration_pressure").eq("session_id", sessionId),
      supabase.from("province_nodes").select("id, name, hex_q, hex_r, grid_x, grid_y, node_type, node_tier").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("flow_paths").select("route_id, path_cells, hex_path").eq("session_id", sessionId),
      supabase.from("military_stacks").select("id, name, hex_q, hex_r, grid_x, grid_y, player_name, soldiers, morale").eq("session_id", sessionId).eq("is_active", true).eq("is_deployed", true),
      supabase.from("city_urban_cells").select("id, city_id, grid_x, grid_y, cell_role, status, development_progress, claim_order").eq("session_id", sessionId),
      supabase.from("city_parcels").select("id, city_id, urban_cell_id, parcel_x, parcel_y, land_use, status, building_id, district_id").eq("session_id", sessionId),
    ]);
    setTiles((tileRes.data || []) as Tile[]); setCities((cityRes.data || []) as City[]); setNodes((nodeRes.data || []) as Node[]);
    setRoutes((routeRes.data || []) as unknown as Route[]); setArmies((armyRes.data || []) as Army[]);
    setUrbanCells((urbanRes.data || []) as UrbanCell[]); setParcels((parcelRes.data || []) as Parcel[]);
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);
  const center = useMemo(() => {
    if (!tiles.length) return { x: 0, y: 0 };
    const points = tiles.map(tile => projectCell("square4", tileCell(tile), TILE_SIZE));
    return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
  }, [tiles, tileCell]);
  const home = useCallback(() => {
    const element = viewportRef.current; if (!element) return;
    setZoom(1); setPan({ x: element.clientWidth / 2 - center.x, y: element.clientHeight * 0.35 - center.y }); setSelected(null); setCityLayerCityId(null); onDetailOpenChange?.(false);
  }, [center, onDetailOpenChange]);
  useEffect(() => { if (tiles.length) home(); }, [tiles.length, home]);

  const cityById = useMemo(() => new Map(cities.map(city => [city.id, city])), [cities]);
  const urbanByCell = useMemo(() => new Map(urbanCells.map(cell => [`${cell.grid_x},${cell.grid_y}`, cell])), [urbanCells]);
  const parcelsByUrbanCell = useMemo(() => {
    const map = new Map<string, Parcel[]>();
    parcels.forEach(parcel => map.set(parcel.urban_cell_id, [...(map.get(parcel.urban_cell_id) || []), parcel]));
    return map;
  }, [parcels]);
  const sortedTiles = useMemo(() => [...tiles].sort((left, right) => {
    const a = tileCell(left); const b = tileCell(right); return (a.a + a.b) - (b.a + b.b);
  }), [tiles, tileCell]);
  const selectedCell = selected ? tileCell(selected) : null;
  const selectedUrbanCell = selectedCell ? urbanByCell.get(`${selectedCell.a},${selectedCell.b}`) : undefined;
  const cityLayerCity = cityLayerCityId ? cityById.get(cityLayerCityId) : undefined;
  const selectedCity = cityLayerCity || (selectedUrbanCell ? cityById.get(selectedUrbanCell.city_id) : undefined);
  const expansionCity = useMemo(() => {
    if (!selectedCell || selectedUrbanCell || gridKind !== "square4") return undefined;
    return urbanCells.map(cell => ({ cell, city: cityById.get(cell.city_id) }))
      .find(({ cell, city }) => city?.owner_player === playerName && cell.status === "urbanized" && gridDistance("square4", { a: cell.grid_x, b: cell.grid_y }, selectedCell) === 1)?.city;
  }, [selectedCell, selectedUrbanCell, gridKind, urbanCells, cityById, playerName]);
  const selectedParcels = selectedUrbanCell ? parcelsByUrbanCell.get(selectedUrbanCell.id) || [] : [];
  const cityCells = selectedCity ? urbanCells.filter(cell => cell.city_id === selectedCity.id) : expansionCity ? urbanCells.filter(cell => cell.city_id === expansionCity.id) : [];
  const cityParcelCount = cityCells.length * 16;
  const cityForPressure = selectedCity || expansionCity;
  const growthPressure = cityForPressure ? Math.min(100, Math.round(cityForPressure.population_total / Math.max(1, cityParcelCount * PARCEL_CAPACITY) * 100)) : 0;
  const occupiedParcels = selectedCity ? parcels.filter(parcel => parcel.city_id === selectedCity.id && parcel.status === "occupied").length : 0;
  const netGrowth = cityForPressure ? Math.round(cityForPressure.population_total * ((cityForPressure.birth_rate || 0) - (cityForPressure.death_rate || 0)) + (cityForPressure.migration_pressure || 0)) : 0;

  const loadTileParcels = useCallback(async (gridX: number, gridY: number) => {
    setParcelsLoading(true);
    const { data, error } = await supabase.functions.invoke("tile-parcels", { body: { session_id: sessionId, grid_x: gridX, grid_y: gridY } });
    setParcelsLoading(false);
    if (error) { setTileParcels([]); return; }
    setTileParcels(((data as { parcels?: TileParcel[] })?.parcels || []) as TileParcel[]);
  }, [sessionId]);

  useEffect(() => {
    if (!selected) { setTileParcels([]); return; }
    const cell = tileCell(selected);
    void loadTileParcels(cell.a, cell.b);
  }, [selected, tileCell, loadTileParcels]);

  const claimedSlots = useMemo(() => tileParcels.reduce((sum, parcel) =>
    parcel.status === "claimed" || parcel.status === "occupied" ? sum + (parcel.capacity_slots || 0) : sum, 0), [tileParcels]);
  // Only your own city can buy parcels — a rival settlement must never offer the action.
  const claimHost = [selectedCity, expansionCity].find(city => city?.owner_player === playerName);
  const claimedForCity = useMemo(() => tileParcels.filter(parcel => parcel.city_id && parcel.city_id === claimHost?.id).length, [tileParcels, claimHost]);

  const claimParcel = async (parcel: TileParcel) => {
    if (!claimHost || !selectedCell) return;
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

  const renderTileParcels = (centerPoint: { x: number; y: number }) => <g>
    {tileParcels.map(parcel => {
      const base = SUB_BIOME_COLOR[parcel.sub_biome] || "var(--map-plains)";
      const fill = parcel.status === "occupied" ? (LAND_USE_COLOR[parcel.land_use || "open"] || LAND_USE_COLOR.open)
        : parcel.status === "claimed" ? "var(--map-parcel-open)" : base;
      return <g key={parcel.id}>
        <polygon points={parcelQuad(centerPoint, parcel.parcel_x, parcel.parcel_y)} fill={fill}
          stroke={parcel.buildable ? "var(--map-marker-edge)" : "var(--map-mountain-edge)"} strokeWidth=".5"
          opacity={parcel.buildable ? (parcel.status === "wild" ? .78 : .95) : .55} />
        <title>{`${parcel.parcel_index + 1} · ${SUB_BIOME_LABEL[parcel.sub_biome] || parcel.sub_biome} · výška ${parcel.elevation}`}</title>
      </g>;
    })}
  </g>;

  const at = (a: number, b: number) => { const point = projectCell("square4", { a, b }, TILE_SIZE); return { x: point.x + pan.x, y: point.y + pan.y }; };
  const focusTile = (tile: Tile, requestedCityId?: string) => {
    const element = viewportRef.current; if (!element) return;
    const cell = tileCell(tile); const projected = projectCell("square4", cell, TILE_SIZE);
    const urbanCell = urbanByCell.get(`${cell.a},${cell.b}`);
    const city = requestedCityId ? cityById.get(requestedCityId) : urbanCell ? cityById.get(urbanCell.city_id) : undefined;
    const targetZoom = city ? 2.25 : 1.65;
    setSelected(tile); setZoom(targetZoom);
    setCityLayerCityId(city?.id || null);
    onDetailOpenChange?.(true);
    setPan({ x: element.clientWidth * (city ? .47 : .38) / targetZoom - projected.x, y: element.clientHeight * .46 / targetZoom - projected.y });
  };
  const leaveCityLayer = () => {
    setCityLayerCityId(null);
    setSelected(null);
    onDetailOpenChange?.(false);
    const element = viewportRef.current;
    if (element) { setZoom(1); setPan({ x: element.clientWidth / 2 - center.x, y: element.clientHeight * .35 - center.y }); }
  };
  const expandCity = async () => {
    if (!expansionCity || !selectedCell) return;
    setExpanding(true);
    const result = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: "EXPAND_CITY_CELL", commandPayload: { cityId: expansionCity.id, gridX: selectedCell.a, gridY: selectedCell.b } });
    setExpanding(false);
    if (!result.ok) { toast.error(result.error || "Rozšíření města se nepodařilo"); return; }
    toast.success(`${expansionCity.name} zahájilo rozšiřování`); await load();
  };

  const renderParcelGrid = (urbanCell: UrbanCell, centerPoint: { x: number; y: number }) => {
    const cellParcels = parcelsByUrbanCell.get(urbanCell.id) || [];
    const size = TILE_SIZE / 4;
    return <g>
      {cellParcels.map(parcel => {
        const dx = (parcel.parcel_x - parcel.parcel_y) * size;
        const dy = (parcel.parcel_x + parcel.parcel_y - 3) * size * .5;
        const fill = parcel.status === "locked" ? "var(--map-parcel-locked)" : LAND_USE_COLOR[parcel.land_use] || LAND_USE_COLOR.open;
        return <g key={parcel.id} transform={`translate(${centerPoint.x + dx},${centerPoint.y + dy})`}>
          <polygon points={squareDiamondPoints({ x: 0, y: 0 }, size - .8)} fill={fill} stroke="var(--map-marker-edge)" strokeWidth=".7" opacity={parcel.status === "locked" ? .5 : .95} />
          {parcel.status === "occupied" && <path d="M-3.4 1.6 V-5.5 L0 -8.5 L3.4 -5.5 V1.6 Z" fill="var(--map-city-wall-light)" stroke="var(--map-marker-edge)" strokeWidth=".7" />}
          <title>{`Parcela ${parcel.parcel_x + 1}:${parcel.parcel_y + 1} · ${parcel.land_use} · ${parcel.status}`}</title>
        </g>;
      })}
      {urbanCell.status === "developing" && <circle cx={centerPoint.x} cy={centerPoint.y} r="18" fill="none" stroke="var(--map-focus)" strokeWidth="2" strokeDasharray={`${Math.max(1, urbanCell.development_progress)} 100`} pathLength="100" />}
    </g>;
  };

  const renderTown = (city: City, own: boolean) => {
    const population = Math.max(0, city.population_total);
    const townClass = population >= 2200 ? "major" : population >= 900 ? "town" : "village";
    const buildingCount = townClass === "major" ? 7 : townClass === "town" ? 5 : 3;
    const positions = [
      { x: -13, y: 2, h: 10 }, { x: 0, y: 6, h: 12 }, { x: 13, y: 2, h: 9 },
      { x: -7, y: -7, h: 13 }, { x: 8, y: -8, h: 11 }, { x: -17, y: -8, h: 9 }, { x: 18, y: -7, h: 10 },
    ];
    const wall = own ? "var(--map-city-own)" : "var(--map-city-rival)";
    return <>
      <path d="M-27 7 L0 20 L27 7 L0 -7 Z" fill="var(--map-city-base)" stroke="var(--map-marker-edge)" strokeWidth="1.2" />
      {townClass !== "village" && <path d="M-25 5 L0 17 L25 5 M-25 5 L-25 -1 M25 5 L25 -1" fill="none" stroke={wall} strokeWidth="2.4" strokeLinecap="square" />}
      {positions.slice(0, buildingCount).map((building, index) => {
        const width = index === 3 && townClass === "major" ? 7 : 5;
        const height = index === 3 && townClass === "major" ? 19 : building.h;
        return <g key={index} transform={`translate(${building.x},${building.y})`}>
          <path d={`M0 ${-height} L${width} ${-height + 3} V3 L0 6 Z`} fill="var(--map-city-wall-light)" stroke="var(--map-marker-edge)" strokeWidth=".7" />
          <path d={`M0 ${-height} L${-width} ${-height + 3} V3 L0 6 Z`} fill="var(--map-city-wall-dark)" stroke="var(--map-marker-edge)" strokeWidth=".7" />
          <path d={`M${-width - 1} ${-height + 3} L0 ${-height - 2} L${width + 1} ${-height + 3} L0 ${-height + 7} Z`} fill={wall} stroke="var(--map-marker-edge)" strokeWidth=".8" />
          {height >= 18 && <path d={`M-2 ${-height - 2} L0 ${-height - 8} L2 ${-height - 2}`} fill={wall} stroke="var(--map-marker-edge)" strokeWidth="1" />}
        </g>;
      })}
      {townClass === "major" && <><rect x="-24" y="-2" width="5" height="10" fill="var(--map-city-wall-light)" stroke="var(--map-marker-edge)"/><rect x="19" y="-2" width="5" height="10" fill="var(--map-city-wall-light)" stroke="var(--map-marker-edge)"/></>}
    </>;
  };

  return (
    <div ref={viewportRef} className="relative h-full w-full overflow-hidden bg-map select-none"
      style={{ touchAction: "none" }}
      onPointerDown={(event) => {
        pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinchRef.current.size === 2) {
          const [a, b] = [...pinchRef.current.values()];
          pinchStartRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
          dragRef.current = null;
          return;
        }
        dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
      }}
      onPointerMove={(event) => {
        if (pinchRef.current.has(event.pointerId)) pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const start = pinchStartRef.current;
        if (start && pinchRef.current.size === 2) {
          const [a, b] = [...pinchRef.current.values()];
          const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          setZoom(Math.max(.45, Math.min(2.4, start.zoom * (distance / start.distance))));
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
      onWheel={(event) => { event.preventDefault(); setZoom(value => Math.max(.45, Math.min(2.4, value * (event.deltaY > 0 ? .9 : 1.1)))); }}>
      <svg className="h-full w-full">
        <defs>
          <filter id="iso-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".35" /></filter>
          <pattern id="iso-water" width="30" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 Q7 0 15 4 T30 4" fill="none" stroke="var(--map-water-glint)" strokeWidth="1" opacity=".22" /></pattern>
        </defs>
        <g transform={`scale(${zoom})`}>
          {sortedTiles.map(tile => {
            const cell = tileCell(tile); const point = at(cell.a, cell.b); const colors = BIOMES[tile.biome_family] || BIOMES.plains;
             const active = selected?.id === tile.id; const urbanCell = urbanByCell.get(`${cell.a},${cell.b}`);
             const inActiveCity = cityLayerCityId && urbanCell?.city_id === cityLayerCityId;
            return <g key={tile.id} onClick={(event) => { event.stopPropagation(); if (!dragRef.current?.moved) focusTile(tile); }} className="cursor-pointer">
               <polygon points={squareDiamondPoints(point, TILE_SIZE)} fill={colors[0]} stroke={active || inActiveCity ? "var(--map-focus)" : colors[1]} strokeWidth={active ? 2.8 : inActiveCity ? 1.8 : 1} opacity={cityLayerCityId && !inActiveCity ? .42 : 1} />
              <polygon points={squareDiamondPoints(point, TILE_SIZE - 2)} fill={`url(#iso-${tile.biome_family})`} opacity=".55" />
              {tile.biome_family === "sea" && <polygon points={squareDiamondPoints(point, TILE_SIZE - 4)} fill="url(#iso-water)" />}
              {tile.biome_family.includes("forest") && !urbanCell && <Trees x={point.x - 8} y={point.y - 11} width="16" height="16" fill="var(--map-forest-edge)" stroke="var(--map-label)" strokeWidth=".8" />}
               {active && tileParcels.length > 0 && renderTileParcels(point)}
               {urbanCell && (cityLayerCityId ? cityLayerCityId === urbanCell.city_id : zoom >= 2) && renderParcelGrid(urbanCell, point)}
            </g>;
          })}
           {!cityLayerCityId && routes.flatMap(route => { const path = gridKind === "square4" && Array.isArray(route.path_cells) ? route.path_cells : route.hex_path; return Array.isArray(path) && path.length > 1 ? [<polyline key={route.route_id || JSON.stringify(path)} points={path.map(cell => { const point = at(cell.x ?? cell.q ?? 0, cell.y ?? cell.r ?? 0); return `${point.x},${point.y}`; }).join(" ")} fill="none" stroke="var(--map-route)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".9" className="iso-active-route" pointerEvents="none" />] : []; })}
           {!cityLayerCityId && nodes.map(node => { const cell = entityCell(node); const point = at(cell.a, cell.b); const major = node.node_tier === "major"; return <g key={node.id} transform={`translate(${point.x},${point.y - 8})`} filter="url(#iso-shadow)" pointerEvents="none"><path d={major ? "M-8 3 L0 7 L8 3 L0 -1 Z M-5 1 V-8 L0 -12 L5 -8 V1" : "M-7 3 L0 7 L7 3 L0 -1 Z M-4 1 V-6 L0 -9 L4 -6 V1"} fill="var(--map-marker)" stroke="var(--map-focus)" strokeWidth="1.2"/><title>{node.name}</title></g>; })}
          {cities.map(city => {
             const core = urbanCells.find(cell => cell.city_id === city.id && cell.cell_role === "core");
             const cell = gridKind === "square4" && core ? { a: core.grid_x, b: core.grid_y } : entityCell(city); const point = at(cell.a, cell.b);
             const own = city.owner_player === playerName; const scale = Math.min(1.25, .88 + Math.log10(Math.max(100, city.population_total)) * .08);
             if (cityLayerCityId === city.id) return null;
             const openCityLayer = () => {
               const exactTile = tiles.find(candidate => { const candidateCell = tileCell(candidate); return candidateCell.a === cell.a && candidateCell.b === cell.b; });
               const fallbackTile = exactTile || tiles.reduce<Tile | undefined>((closest, candidate) => {
                 if (!closest) return candidate;
                 const candidateCell = tileCell(candidate); const closestCell = tileCell(closest);
                 return gridDistance(gridKind, candidateCell, cell) < gridDistance(gridKind, closestCell, cell) ? candidate : closest;
               }, undefined);
               if (fallbackTile) focusTile(fallbackTile, city.id);
             };
             return <g key={city.id} data-map-city={city.id} role="button" aria-label={`Vstoupit do města ${city.name}`} tabIndex={0} transform={`translate(${point.x},${point.y - 16}) scale(${scale})`} className="cursor-pointer" onClick={(event) => { event.stopPropagation(); openCityLayer(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCityLayer(); } }} filter="url(#iso-shadow)">
               {renderTown(city, own)}
               <rect x={-Math.max(22, city.name.length * 2.8)} y="25" width={Math.max(44, city.name.length * 5.6)} height="13" rx="2" fill="var(--map-marker)" stroke={own ? "var(--map-city-own)" : "var(--map-city-rival)"} strokeWidth=".8" opacity=".94" />
               <text y="34" textAnchor="middle" fill="var(--map-label)" fontSize="7.5" fontWeight="700">{city.name}</text>
               {city.population_total > city.housing_capacity && <path d="M-27 -11 L-22 -20 L-17 -11 Z" fill="var(--map-focus)"><title>Tlak na růst</title></path>}
            </g>;
          })}
           {!cityLayerCityId && armies.map(army => { const cell = entityCell(army); const point = at(cell.a, cell.b); const own = army.player_name === playerName; return <g key={army.id} transform={`translate(${point.x + 19},${point.y - 34})`} filter="url(#iso-shadow)" pointerEvents="none"><circle r="11" fill={own ? "var(--map-city-own)" : "var(--map-city-rival)"} stroke="var(--map-marker-edge)" strokeWidth="2"/><Shield x="-6" y="-6" width="12" height="12" fill="none" stroke="var(--map-marker-edge)"/><Flag x="5" y="-20" width="14" height="14" fill="var(--map-route)" stroke="var(--map-marker-edge)"/><title>{army.name} · {army.soldiers} vojáků · morálka {army.morale}</title></g>; })}
        </g>
      </svg>

      <div className={`map-floating-control absolute right-3 z-50 flex items-center gap-1 p-1 ${isMobile ? (selected ? "bottom-[66vh]" : "bottom-20") : "bottom-4"}`}>
        <Button size="icon" variant="ghost" aria-label="Oddálit" onClick={() => setZoom(value => Math.max(.45, value - .15))}><Minus className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Celá mapa" onClick={home}><Home className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Přiblížit" onClick={() => setZoom(value => Math.min(2.4, value + .15))}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className={`map-floating-control absolute left-3 top-3 z-20 flex items-center gap-2 px-2.5 py-1.5 ${isMobile ? "text-[10px]" : "text-xs"}`}><Layers3 className="h-4 w-4 text-primary"/><span>{gridKind === "square4" ? "Čtvercová síť" : "Původní svět"} · izometrické zobrazení</span></div>
      {cityLayerCity && <div className="map-floating-control absolute left-4 top-16 z-30 flex items-center gap-3 px-2 py-2"><Button size="icon" variant="ghost" aria-label="Zpět na světovou mapu" onClick={leaveCityLayer}><ArrowLeft className="h-4 w-4"/></Button><div className="pr-3"><p className="text-[10px] uppercase text-primary">Městská vrstva</p><p className="font-display text-sm">{cityLayerCity.name} · {cityCells.length} polí</p></div></div>}

      {selected && <aside className={`map-tile-detail absolute z-40 overflow-y-auto border-primary/20 bg-background/95 shadow-2xl backdrop-blur-xl ${isMobile ? "inset-x-0 bottom-0 max-h-[64vh] rounded-t-2xl border-t p-4" : "bottom-0 right-0 top-0 w-[380px] border-l p-5"}`}>
        <Button size="icon" variant="ghost" className="absolute right-3 top-3" aria-label="Zavřít detail" onClick={() => { setSelected(null); onDetailOpenChange?.(false); }}><X className="h-4 w-4"/></Button>
        <div className="pr-10">
          <p className="text-[10px] font-semibold uppercase text-primary">Pole {selectedCell?.a}, {selectedCell?.b}</p>
          <h2 className="mt-1 text-xl capitalize">{selected.biome_family.replace("_", " ")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{selected.owner_player || "Neutrální území"} · {selected.is_passable === false ? "Neprůchodné" : "Průchodné"}</p>
        </div>

        <section className="mt-5 border-y border-border/70 py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm">Podparcely pole ({TILE_PARCEL_COLS}×{TILE_PARCEL_ROWS})</h3>
            <span className="text-[10px] text-muted-foreground">{claimedSlots * POPULATION_PER_SLOT} míst k bydlení</span>
          </div>
          {parcelsLoading && <p className="text-xs text-muted-foreground">Vyměřuji parcely…</p>}
          {!parcelsLoading && !tileParcels.length && <p className="text-xs text-muted-foreground">Toto pole nemá vyměřené parcely.</p>}
          {!parcelsLoading && tileParcels.length > 0 && <>
            <div className="grid grid-cols-8 gap-[3px]">
              {tileParcels.map(parcel => {
                const cost = parcelClaimCost(Number(parcel.build_cost_multiplier || 1), claimedForCity);
                const mine = parcel.owner_player === playerName;
                const canClaim = !!claimHost && parcel.buildable && parcel.status === "wild";
                return <button key={parcel.id} type="button" disabled={!canClaim || claimingParcel !== null}
                  onClick={() => void claimParcel(parcel)}
                  title={`${SUB_BIOME_LABEL[parcel.sub_biome] || parcel.sub_biome} · výška ${parcel.elevation} · ${parcel.capacity_slots} slotů${canClaim ? ` · ${cost.gold} zlata / ${cost.production} produkce` : ""}`}
                  className={`aspect-square border text-[8px] leading-none transition-colors ${
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
                ? `Klikni na volnou parcelu a ${claimHost.name} ji vykoupí. Cena i kapacita vycházejí z podterénu.`
                : selectedCity
                  ? `${selectedCity.name} patří ${selectedCity.owner_player} — cizí parcely vykupovat nelze.`
                  : "Parcely lze vykupovat jen z pole vašeho města nebo z pole hned vedle něj."}
            </p>
          </>}
        </section>

        {selectedCity && <div className="mt-5 space-y-4">
          <div className="border-y border-border/70 py-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-display text-lg">{selectedCity.name}</p><p className="text-xs text-muted-foreground">{selectedCity.settlement_level} · úroveň {selectedCity.development_level}</p></div><Button size="sm" variant="outline" onClick={() => onCityClick?.(selectedCity.id)}>Otevřít město <ArrowUpRight className="ml-1 h-3.5 w-3.5"/></Button></div>
          </div>
          <section><div className="mb-2 flex justify-between text-xs"><span>Zaplnění města</span><strong>{growthPressure} %</strong></div><Progress value={growthPressure} className="h-2"/><div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><div><strong className="block text-foreground">{selectedCity.population_total.toLocaleString("cs-CZ")}</strong><span className="text-muted-foreground">obyvatel</span></div><div><strong className="block text-foreground">{occupiedParcels}/{cityParcelCount}</strong><span className="text-muted-foreground">parcel</span></div><div><strong className="block text-foreground">{netGrowth >= 0 ? "+" : ""}{netGrowth}</strong><span className="text-muted-foreground">růst/kolo</span></div></div></section>
          <section><h3 className="mb-2 text-sm">Parcely tohoto pole</h3><div className="grid grid-cols-4 gap-1.5">{[...selectedParcels].sort((a,b) => a.parcel_y-b.parcel_y || a.parcel_x-b.parcel_x).map(parcel => <div key={parcel.id} className={`aspect-square border p-1 text-[9px] ${parcel.status === "occupied" ? "border-primary/50 bg-primary/10" : parcel.status === "locked" ? "border-border/40 bg-muted/20 text-muted-foreground" : "border-border bg-card"}`} title={`${parcel.land_use} · ${parcel.status}`}><span className="block text-xs">{parcel.status === "occupied" ? "🏠" : parcel.status === "locked" ? "🔒" : "·"}</span>{parcel.parcel_x + 1}:{parcel.parcel_y + 1}</div>)}</div></section>
          {selectedUrbanCell?.status === "developing" && <section className="border border-primary/25 bg-primary/5 p-3"><div className="mb-2 flex items-center justify-between text-xs"><span>Urbanizace pole</span><strong>{selectedUrbanCell.development_progress} %</strong></div><Progress value={selectedUrbanCell.development_progress} className="h-2"/><p className="mt-2 text-xs text-muted-foreground">Postupuje při uzavření každého kola.</p></section>}
        </div>}

        {!selectedCity && expansionCity && <div className="mt-6 border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary"/><h3 className="text-base">Rozšířit {expansionCity.name}</h3></div>
          <p className="mt-2 text-xs text-muted-foreground">Město tlačí na hranice z {growthPressure} %. Nové pole přidá 16 parcel po dokončení urbanizace.</p>
          <div className="my-3 grid grid-cols-2 gap-2 text-xs"><div className="border border-border p-2"><span className="text-muted-foreground">Zlato</span><strong className="block">{100 + cityCells.length * 50}</strong></div><div className="border border-border p-2"><span className="text-muted-foreground">Produkce</span><strong className="block">{80 + cityCells.length * 40}</strong></div></div>
          <Button className="w-full" disabled={expanding || growthPressure < 70 || selected.biome_family === "sea" || selected.is_passable === false} onClick={expandCity}>{expanding ? "Zakládám…" : growthPressure < 70 ? `Nízký tlak (${growthPressure} %)` : "Zahájit rozšíření"}</Button>
        </div>}
        {!selectedCity && !expansionCity && <div className="mt-6 border border-border p-4 text-sm text-muted-foreground"><p>Na tomto poli není město ani možný směr rozšíření.</p><p className="mt-2 text-xs">Pro růst vyberte volné pole přímo sousedící s vaším městem.</p></div>}
      </aside>}
      {!tiles.length && <div className="absolute inset-0 grid place-items-center text-center"><div className="map-floating-control p-6"><Castle className="mx-auto mb-2 h-7 w-7 text-primary"/><p className="font-display text-primary">Mapa zatím nemá žádná pole.</p></div></div>}
    </div>
  );
}