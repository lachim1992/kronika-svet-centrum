import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Castle, Flag, Home, Layers3, Minus, Plus, Shield, Sparkles, Trees, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { dispatchCommand } from "@/lib/commands";
import { gridDistance, projectCell, squareDiamondPoints } from "@/lib/mapTopology";

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn?: number;
  onCityClick?: (cityId: string) => void;
  gridKind?: "hex6" | "square4";
}

type Tile = { id: string; q: number; r: number; grid_x: number | null; grid_y: number | null; biome_family: string; owner_player: string | null; mean_height: number | null; is_passable: boolean };
type City = { id: string; name: string; province_q: number; province_r: number; grid_x: number | null; grid_y: number | null; owner_player: string; settlement_level: string; population_total: number; housing_capacity: number; development_level: number; birth_rate: number; death_rate: number; migration_pressure: number };
type Node = { id: string; name: string; hex_q: number; hex_r: number; grid_x: number | null; grid_y: number | null; node_type: string; node_tier: string };
type Army = { id: string; name: string; hex_q: number; hex_r: number; grid_x: number | null; grid_y: number | null; player_name: string; soldiers: number; morale: number };
type PathCell = { x?: number; y?: number; q?: number; r?: number };
type Route = { route_id: string | null; path_cells: PathCell[] | null; hex_path: PathCell[] | null };
type UrbanCell = { id: string; city_id: string; grid_x: number; grid_y: number; cell_role: string; status: string; development_progress: number; claim_order: number };
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

const LAND_USE_COLOR: Record<string, string> = {
  open: "var(--map-parcel-open)", residential: "var(--map-parcel-home)", commercial: "var(--map-parcel-market)",
  industrial: "var(--map-parcel-industry)", civic: "var(--map-city-own)", military: "var(--map-city-rival)",
  sacred: "var(--map-focus)", infrastructure: "var(--map-route)",
};

export default function IsometricSquareMap({ sessionId, playerName, currentTurn = 1, onCityClick, gridKind = "hex6" }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
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
  const [expanding, setExpanding] = useState(false);

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
    setZoom(1); setPan({ x: element.clientWidth / 2 - center.x, y: element.clientHeight * 0.35 - center.y }); setSelected(null);
  }, [center]);
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
  const selectedCity = selectedUrbanCell ? cityById.get(selectedUrbanCell.city_id) : undefined;
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

  const at = (a: number, b: number) => { const point = projectCell("square4", { a, b }, TILE_SIZE); return { x: point.x + pan.x, y: point.y + pan.y }; };
  const focusTile = (tile: Tile) => {
    const element = viewportRef.current; if (!element) return;
    const cell = tileCell(tile); const projected = projectCell("square4", cell, TILE_SIZE); const targetZoom = 1.65;
    setSelected(tile); setZoom(targetZoom);
    setPan({ x: element.clientWidth * 0.38 / targetZoom - projected.x, y: element.clientHeight * 0.46 / targetZoom - projected.y });
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
    return <g className="iso-parcel-grid">
      {cellParcels.map(parcel => {
        const dx = (parcel.parcel_x - parcel.parcel_y) * 5.1;
        const dy = (parcel.parcel_x + parcel.parcel_y - 3) * 2.55;
        const fill = parcel.status === "locked" ? "var(--map-parcel-locked)" : LAND_USE_COLOR[parcel.land_use] || LAND_USE_COLOR.open;
        return <g key={parcel.id} transform={`translate(${centerPoint.x + dx},${centerPoint.y + dy})`}>
          <polygon points={squareDiamondPoints({ x: 0, y: 0 }, 5)} fill={fill} stroke="var(--map-marker-edge)" strokeWidth=".45" opacity={parcel.status === "locked" ? .45 : .92} />
          {parcel.status === "occupied" && <path d="M-2 1 V-4 L0 -6 L2 -4 V1 Z" fill="var(--map-label)" stroke="var(--map-marker-edge)" strokeWidth=".5" />}
        </g>;
      })}
      {urbanCell.status === "developing" && <circle cx={centerPoint.x} cy={centerPoint.y} r="18" fill="none" stroke="var(--map-focus)" strokeWidth="2" strokeDasharray={`${Math.max(1, urbanCell.development_progress)} 100`} pathLength="100" className="iso-growth-ring" />}
    </g>;
  };

  return (
    <div ref={viewportRef} className="relative h-full w-full overflow-hidden bg-map select-none"
      onPointerDown={(event) => { dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const drag = dragRef.current; if (!drag) return; const dx = event.clientX - drag.x; const dy = event.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; setPan({ x: drag.panX + dx / zoom, y: drag.panY + dy / zoom }); }}
      onPointerUp={() => { dragRef.current = null; }}
      onWheel={(event) => { event.preventDefault(); setZoom(value => Math.max(.45, Math.min(2.4, value * (event.deltaY > 0 ? .9 : 1.1)))); }}>
      <svg className="h-full w-full">
        <defs>
          <filter id="iso-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".35" /></filter>
          <pattern id="iso-water" width="30" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 Q7 0 15 4 T30 4" fill="none" stroke="var(--map-water-glint)" strokeWidth="1" opacity=".22"><animate attributeName="stroke-dashoffset" values="0;30" dur="5s" repeatCount="indefinite" /></path></pattern>
        </defs>
        <g transform={`scale(${zoom})`} className="transition-transform duration-500 ease-out">
          {sortedTiles.map(tile => {
            const cell = tileCell(tile); const point = at(cell.a, cell.b); const colors = BIOMES[tile.biome_family] || BIOMES.plains;
            const active = selected?.id === tile.id; const urbanCell = urbanByCell.get(`${cell.a},${cell.b}`);
            return <g key={tile.id} onClick={(event) => { event.stopPropagation(); if (!dragRef.current?.moved) focusTile(tile); }} className="cursor-pointer">
              <polygon points={squareDiamondPoints(point, TILE_SIZE)} fill={colors[0]} stroke={active ? "var(--map-focus)" : colors[1]} strokeWidth={active ? 2.8 : 1} className={active ? "iso-selected-tile" : "transition-colors duration-200"} />
              <polygon points={squareDiamondPoints(point, TILE_SIZE - 2)} fill={`url(#iso-${tile.biome_family})`} opacity=".55" />
              {tile.biome_family === "sea" && <polygon points={squareDiamondPoints(point, TILE_SIZE - 4)} fill="url(#iso-water)" />}
              {tile.biome_family.includes("forest") && !urbanCell && <Trees x={point.x - 8} y={point.y - 11} width="16" height="16" fill="var(--map-forest-edge)" stroke="var(--map-label)" strokeWidth=".8" />}
              {urbanCell && zoom >= 1.3 && renderParcelGrid(urbanCell, point)}
            </g>;
          })}
          {routes.flatMap(route => { const path = gridKind === "square4" && Array.isArray(route.path_cells) ? route.path_cells : route.hex_path; return Array.isArray(path) && path.length > 1 ? [<polyline key={route.route_id || JSON.stringify(path)} points={path.map(cell => { const point = at(cell.x ?? cell.q ?? 0, cell.y ?? cell.r ?? 0); return `${point.x},${point.y}`; }).join(" ")} fill="none" stroke="var(--map-route)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".9" className="iso-active-route" />] : []; })}
          {nodes.map(node => { const cell = entityCell(node); const point = at(cell.a, cell.b); return <g key={node.id} transform={`translate(${point.x},${point.y - 12})`} filter="url(#iso-shadow)" className="iso-node-bob"><circle r="13" fill="var(--map-marker)" stroke="var(--map-focus)" /><text y="4" textAnchor="middle" fontSize="13">{node.node_tier === "major" ? "🏛️" : "⚒️"}</text><title>{node.name}</title></g>; })}
          {cities.map(city => {
            const core = urbanCells.find(cell => cell.city_id === city.id && cell.cell_role === "core"); const cell = core ? { a: core.grid_x, b: core.grid_y } : entityCell(city); const point = at(cell.a, cell.b);
            const own = city.owner_player === playerName; const scale = Math.min(1.45, .72 + Math.log10(Math.max(100, city.population_total)) * .18); const houses = Math.max(2, Math.min(6, Math.ceil(city.population_total / 700)));
            return <g key={city.id} transform={`translate(${point.x},${point.y - 15}) scale(${scale})`} className="cursor-pointer iso-city-cluster" onClick={(event) => { event.stopPropagation(); const tile = tiles.find(candidate => { const c = tileCell(candidate); return c.a === cell.a && c.b === cell.b; }); if (tile) focusTile(tile); }} filter="url(#iso-shadow)">
              {Array.from({ length: houses }, (_, index) => { const x = (index % 3) * 9 - 9; const y = Math.floor(index / 3) * 7 - 4; const height = 8 + (index % 2) * 4; return <g key={index} transform={`translate(${x},${y})`}><path d={`M-4 4 V${-height + 3} L0 ${-height} L4 ${-height + 3} V4 Z`} fill={own ? "var(--map-city-own)" : "var(--map-city-rival)"} stroke="var(--map-marker-edge)" strokeWidth="1"/><rect x="-1" y={-height + 5} width="2" height="3" fill="var(--map-window)" className="iso-window"/></g>; })}
              <path d="M-17 11 H17 L11 17 H-14 Z" fill="var(--map-city-base)" />
              <path d="M12 -16 V7 M12 -16 Q22 -13 15 -7 Q20 -4 12 -2" fill="var(--map-city-rival)" stroke="var(--map-marker-edge)" strokeWidth="1" className="iso-city-flag" />
              <circle cx="-8" cy="-16" r="2" fill="var(--map-smoke)" className="iso-smoke iso-smoke-one"/><circle cx="-6" cy="-21" r="2.5" fill="var(--map-smoke)" className="iso-smoke iso-smoke-two"/>
              <text y="29" textAnchor="middle" fill="var(--map-label)" fontSize="8" fontWeight="700" stroke="var(--map-label-edge)" strokeWidth="2.5" paintOrder="stroke">{city.name}</text>
              {city.population_total > city.housing_capacity && <circle cx="-17" cy="-13" r="4" fill="var(--map-focus)" className="iso-growth-pulse"><title>Tlak na růst</title></circle>}
            </g>;
          })}
          {armies.map(army => { const cell = entityCell(army); const point = at(cell.a, cell.b); const own = army.player_name === playerName; return <g key={army.id} transform={`translate(${point.x + 19},${point.y - 34})`} filter="url(#iso-shadow)" className="iso-army-bob"><circle r="11" fill={own ? "var(--map-city-own)" : "var(--map-city-rival)"} stroke="var(--map-marker-edge)" strokeWidth="2"/><Shield x="-6" y="-6" width="12" height="12" fill="none" stroke="var(--map-marker-edge)"/><Flag x="5" y="-20" width="14" height="14" fill="var(--map-route)" stroke="var(--map-marker-edge)"/><title>{army.name} · {army.soldiers} vojáků · morálka {army.morale}</title></g>; })}
        </g>
      </svg>

      <div className="map-floating-control absolute bottom-4 right-4 z-30 flex items-center gap-1 p-1">
        <Button size="icon" variant="ghost" aria-label="Oddálit" onClick={() => setZoom(value => Math.max(.45, value - .15))}><Minus className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Celá mapa" onClick={home}><Home className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Přiblížit" onClick={() => setZoom(value => Math.min(2.4, value + .15))}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="map-floating-control absolute left-4 top-4 z-20 flex items-center gap-2 px-3 py-2 text-xs"><Layers3 className="h-4 w-4 text-primary"/><span>{gridKind === "square4" ? "Čtvercová síť" : "Původní svět"} · izometrické zobrazení</span></div>

      {selected && <aside className="map-tile-detail animate-slide-in-right absolute bottom-0 right-0 top-0 z-40 w-full overflow-y-auto border-l border-primary/20 bg-background/95 p-5 shadow-2xl backdrop-blur-xl sm:w-[380px]">
        <Button size="icon" variant="ghost" className="absolute right-3 top-3" aria-label="Zavřít detail" onClick={() => setSelected(null)}><X className="h-4 w-4"/></Button>
        <div className="pr-10">
          <p className="text-[10px] font-semibold uppercase text-primary">Pole {selectedCell?.a}, {selectedCell?.b}</p>
          <h2 className="mt-1 text-xl capitalize">{selected.biome_family.replace("_", " ")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{selected.owner_player || "Neutrální území"} · {selected.is_passable === false ? "Neprůchodné" : "Průchodné"}</p>
        </div>

        {selectedCity && <div className="mt-5 space-y-4">
          <div className="border-y border-border/70 py-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-display text-lg">{selectedCity.name}</p><p className="text-xs text-muted-foreground">{selectedCity.settlement_level} · úroveň {selectedCity.development_level}</p></div><Button size="sm" variant="outline" onClick={() => onCityClick?.(selectedCity.id)}>Otevřít město <ArrowUpRight className="ml-1 h-3.5 w-3.5"/></Button></div>
          </div>
          <section><div className="mb-2 flex justify-between text-xs"><span>Zaplnění města</span><strong>{growthPressure} %</strong></div><Progress value={growthPressure} className="h-2"/><div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><div><strong className="block text-foreground">{selectedCity.population_total.toLocaleString("cs-CZ")}</strong><span className="text-muted-foreground">obyvatel</span></div><div><strong className="block text-foreground">{occupiedParcels}/{cityParcelCount}</strong><span className="text-muted-foreground">parcel</span></div><div><strong className="block text-foreground">{netGrowth >= 0 ? "+" : ""}{netGrowth}</strong><span className="text-muted-foreground">růst/kolo</span></div></div></section>
          <section><h3 className="mb-2 text-sm">Parcely tohoto pole</h3><div className="grid grid-cols-4 gap-1.5">{selectedParcels.sort((a,b) => a.parcel_y-b.parcel_y || a.parcel_x-b.parcel_x).map(parcel => <div key={parcel.id} className={`aspect-square border p-1 text-[9px] ${parcel.status === "occupied" ? "border-primary/50 bg-primary/10" : parcel.status === "locked" ? "border-border/40 bg-muted/20 text-muted-foreground" : "border-border bg-card"}`} title={`${parcel.land_use} · ${parcel.status}`}><span className="block text-xs">{parcel.status === "occupied" ? "🏠" : parcel.status === "locked" ? "🔒" : "·"}</span>{parcel.parcel_x + 1}:{parcel.parcel_y + 1}</div>)}</div></section>
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