import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Castle, Flag, Home, Layers3, Minus, Plus, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { projectCell, squareDiamondPoints } from "@/lib/mapTopology";

interface Props {
  sessionId: string;
  playerName: string;
  onCityClick?: (cityId: string) => void;
  gridKind?: "hex6" | "square4";
}

type Tile = { id: string; q: number; r: number; grid_x: number | null; grid_y: number | null; biome_family: string; owner_player: string | null; mean_height: number | null };
type City = { id: string; name: string; province_q: number; province_r: number; grid_x: number | null; grid_y: number | null; owner_player: string; settlement_level: string; population_total: number | null };
type Node = { id: string; name: string; hex_q: number; hex_r: number; grid_x: number | null; grid_y: number | null; node_type: string; node_tier: string };
type Army = { id: string; name: string; hex_q: number; hex_r: number; grid_x: number | null; grid_y: number | null; player_name: string; soldiers: number; morale: number };
type PathCell = { x?: number; y?: number; q?: number; r?: number };
type Route = { route_id: string | null; path_cells: PathCell[] | null; hex_path: PathCell[] | null };

const TILE_SIZE = 42;
const BIOMES: Record<string, [string, string]> = {
  sea: ["var(--map-water)", "var(--map-water-edge)"], plains: ["var(--map-plains)", "var(--map-plains-edge)"],
  grassland: ["var(--map-plains)", "var(--map-plains-edge)"], forest: ["var(--map-forest)", "var(--map-forest-edge)"],
  dense_forest: ["var(--map-forest)", "var(--map-forest-edge)"], hills: ["var(--map-hills)", "var(--map-hills-edge)"],
  mountains: ["var(--map-mountain)", "var(--map-mountain-edge)"], mountain: ["var(--map-mountain)", "var(--map-mountain-edge)"],
  desert: ["var(--map-desert)", "var(--map-desert-edge)"], swamp: ["var(--map-swamp)", "var(--map-swamp-edge)"],
  tundra: ["var(--map-tundra)", "var(--map-tundra-edge)"],
};

export default function IsometricSquareMap({ sessionId, playerName, onCityClick, gridKind = "hex6" }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [armies, setArmies] = useState<Army[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 40 });
  const [selected, setSelected] = useState<Tile | null>(null);

  const load = useCallback(async () => {
    const [tileRes, cityRes, nodeRes, routeRes, armyRes] = await Promise.all([
      supabase.from("province_hexes").select("id, q, r, grid_x, grid_y, biome_family, owner_player, mean_height").eq("session_id", sessionId).limit(4000),
      supabase.from("cities").select("id, name, province_q, province_r, grid_x, grid_y, owner_player, settlement_level, population_total").eq("session_id", sessionId),
      supabase.from("province_nodes").select("id, name, hex_q, hex_r, grid_x, grid_y, node_type, node_tier").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("flow_paths").select("route_id, path_cells, hex_path").eq("session_id", sessionId),
      supabase.from("military_stacks").select("id, name, hex_q, hex_r, grid_x, grid_y, player_name, soldiers, morale").eq("session_id", sessionId).eq("is_active", true).eq("is_deployed", true),
    ]);
    setTiles((tileRes.data || []) as Tile[]);
    setCities((cityRes.data || []) as City[]);
    setNodes((nodeRes.data || []) as Node[]);
    setRoutes((routeRes.data || []) as unknown as Route[]);
    setArmies((armyRes.data || []) as Army[]);
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  const center = useMemo(() => {
    if (!tiles.length) return { x: 0, y: 0 };
    const points = tiles.map(t => projectCell("square4", tileCell(t), TILE_SIZE));
    return { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length };
  }, [tiles]);

  const home = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setPan({ x: el.clientWidth / 2 - center.x, y: el.clientHeight * 0.35 - center.y });
  }, [center]);
  useEffect(() => { if (tiles.length) home(); }, [tiles.length, home]);

  const tileCell = (tile: Tile) => ({ a: gridKind === "square4" && tile.grid_x !== null ? tile.grid_x : tile.q, b: gridKind === "square4" && tile.grid_y !== null ? tile.grid_y : tile.r });
  const entityCell = (entity: { grid_x: number | null; grid_y: number | null; hex_q?: number; hex_r?: number; province_q?: number; province_r?: number }) => ({
    a: gridKind === "square4" && entity.grid_x !== null ? entity.grid_x : entity.hex_q ?? entity.province_q ?? 0,
    b: gridKind === "square4" && entity.grid_y !== null ? entity.grid_y : entity.hex_r ?? entity.province_r ?? 0,
  });
  const routeCells = (route: Route) => gridKind === "square4" && Array.isArray(route.path_cells) ? route.path_cells : route.hex_path;
  const sortedTiles = useMemo(() => [...tiles].sort((a, b) => {
    const ac = tileCell(a); const bc = tileCell(b);
    return (ac.a + ac.b) - (bc.a + bc.b);
  }), [tiles, gridKind]);

  const at = (x: number, y: number) => {
    const p = projectCell("square4", { a: x, b: y }, TILE_SIZE);
    return { x: p.x + pan.x, y: p.y + pan.y };
  };

  return (
    <div ref={viewportRef} className="relative h-full w-full overflow-hidden bg-map select-none"
      onPointerDown={(e) => { dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const d = dragRef.current; if (d) setPan({ x: d.panX + (e.clientX - d.x) / zoom, y: d.panY + (e.clientY - d.y) / zoom }); }}
      onPointerUp={() => { dragRef.current = null; }}
      onWheel={(e) => { e.preventDefault(); setZoom(z => Math.max(.45, Math.min(2.2, z * (e.deltaY > 0 ? .9 : 1.1)))); }}>
      <svg className="h-full w-full">
        <defs>
          <filter id="iso-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".35" /></filter>
          <pattern id="iso-water" width="30" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 Q7 0 15 4 T30 4" fill="none" stroke="#72d8d6" strokeWidth="1" opacity=".22"><animate attributeName="stroke-dashoffset" values="0;30" dur="5s" repeatCount="indefinite" /></path></pattern>
        </defs>
        <g transform={`scale(${zoom})`}>
          {sortedTiles.map(tile => {
            const cell = tileCell(tile); const p = at(cell.a, cell.b); const colors = BIOMES[tile.biome_family] || BIOMES.plains;
            const active = selected?.id === tile.id;
            return <g key={tile.id} onClick={(e) => { e.stopPropagation(); setSelected(tile); }} className="cursor-pointer">
              <polygon points={squareDiamondPoints(p, TILE_SIZE)} fill={colors[0]} stroke={active ? "var(--map-focus)" : colors[1]} strokeWidth={active ? 2.4 : 1} />
              <polygon points={squareDiamondPoints(p, TILE_SIZE - 2)} fill={`url(#iso-${tile.biome_family})`} opacity=".55" />
              {tile.biome_family === "sea" && <polygon points={squareDiamondPoints(p, TILE_SIZE - 4)} fill="url(#iso-water)" />}
              {tile.biome_family === "forest" && <text x={p.x} y={p.y + 2} textAnchor="middle" fontSize="17" className="pointer-events-none">🌲</text>}
              {tile.biome_family === "mountains" && <text x={p.x} y={p.y + 2} textAnchor="middle" fontSize="19" className="pointer-events-none">⛰️</text>}
            </g>;
          })}
          {routes.flatMap(route => { const path = routeCells(route); return Array.isArray(path) && path.length > 1 ? [<polyline key={route.route_id || JSON.stringify(path)} points={path.map(c => { const p=at(c.x ?? c.q ?? 0,c.y ?? c.r ?? 0); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="var(--map-route)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".9" className="iso-active-route" />] : []; })}
          {nodes.map(node => { const cell=entityCell(node); const p=at(cell.a,cell.b); return <g key={node.id} transform={`translate(${p.x},${p.y-12})`} filter="url(#iso-shadow)"><circle r="13" fill="var(--map-marker)" stroke="var(--map-focus)" /><text y="4" textAnchor="middle" fontSize="13">{node.node_tier === "major" ? "🏛️" : "⚒️"}</text><title>{node.name}</title></g>; })}
          {cities.map(city => { const cell=entityCell(city); const p=at(cell.a,cell.b); const own=city.owner_player===playerName; return <g key={city.id} transform={`translate(${p.x},${p.y-21})`} className="cursor-pointer" onClick={(event) => { event.stopPropagation(); onCityClick?.(city.id); }} filter="url(#iso-shadow)"><path d="M-17 14 L-17 -8 L-10 -8 L-10 -17 L-3 -17 L-3 -9 L5 -9 L5 -20 L13 -20 L13 14 Z" fill={own ? "var(--map-city-own)" : "var(--map-city-rival)"} stroke="var(--map-marker-edge)" strokeWidth="2"/><path d="M-20 14 H17 L11 21 H-14 Z" fill="var(--map-city-base)"/><text y="36" textAnchor="middle" fill="var(--map-label)" fontSize="10" fontWeight="700" stroke="var(--map-label-edge)" strokeWidth="3" paintOrder="stroke">{city.name}</text></g>; })}
          {armies.map(army => { const cell=entityCell(army); const p=at(cell.a,cell.b); const own=army.player_name===playerName; return <g key={army.id} transform={`translate(${p.x+16},${p.y-30})`} filter="url(#iso-shadow)"><circle r="11" fill={own ? "var(--map-city-own)" : "var(--map-city-rival)"} stroke="var(--map-marker-edge)" strokeWidth="2"/><Shield x="-6" y="-6" width="12" height="12" fill="none" stroke="var(--map-marker-edge)"/><Flag x="5" y="-20" width="14" height="14" fill="var(--map-route)" stroke="var(--map-marker-edge)"/><title>{army.name} · {army.soldiers} vojáků · morálka {army.morale}</title></g>; })}
        </g>
      </svg>
      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg border border-amber-300/20 bg-slate-950/80 p-1 shadow-xl backdrop-blur-md">
        <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.max(.45,z-.15))}><Minus className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={home}><Home className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.min(2.2,z+.15))}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="map-floating-control absolute left-4 top-4 flex items-center gap-2 px-3 py-2 text-xs"><Layers3 className="h-4 w-4 text-primary" /><span>{gridKind === "square4" ? "Čtvercová síť" : "Původní svět"} · izometrické zobrazení</span></div>
      {selected && <div className="map-floating-control absolute bottom-4 left-4 p-3 text-xs"><div className="font-display text-sm text-primary">{selected.biome_family}</div><div className="text-muted-foreground">Pole {tileCell(selected).a}, {tileCell(selected).b}</div></div>}
      {!tiles.length && <div className="absolute inset-0 grid place-items-center text-center"><div className="map-floating-control p-6"><Castle className="mx-auto mb-2 h-7 w-7 text-primary"/><p className="font-display text-primary">Mapa zatím nemá žádná pole.</p></div></div>}
    </div>
  );
}
