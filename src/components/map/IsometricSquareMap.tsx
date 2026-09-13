import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Castle, Home, Layers3, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { projectCell, squareDiamondPoints } from "@/lib/mapTopology";

interface Props {
  sessionId: string;
  playerName: string;
  onCityClick?: (cityId: string) => void;
}

type Tile = { id: string; grid_x: number; grid_y: number; biome_family: string; owner_player: string | null; mean_height: number | null };
type City = { id: string; name: string; grid_x: number; grid_y: number; owner_player: string; settlement_level: string; population_total: number | null };
type Node = { id: string; name: string; grid_x: number; grid_y: number; node_type: string; node_tier: string };
type Route = { route_id: string | null; path_cells: Array<{ x: number; y: number }> | null };

const TILE_SIZE = 42;
const BIOMES: Record<string, [string, string]> = {
  sea: ["#1592a6", "#0b5f72"], plains: ["#6c8f3b", "#466d2d"], forest: ["#35682e", "#1d4328"],
  hills: ["#8a7445", "#5d4b30"], mountains: ["#787b79", "#484d4c"], desert: ["#c6a75b", "#98783e"],
  swamp: ["#486753", "#29483e"], tundra: ["#8da2a0", "#627a7b"],
};

export default function IsometricSquareMap({ sessionId, playerName, onCityClick }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 40 });
  const [selected, setSelected] = useState<Tile | null>(null);

  const load = useCallback(async () => {
    const [tileRes, cityRes, nodeRes, routeRes] = await Promise.all([
      supabase.from("province_hexes").select("id, grid_x, grid_y, biome_family, owner_player, mean_height").eq("session_id", sessionId).not("grid_x", "is", null).not("grid_y", "is", null).limit(4000),
      supabase.from("cities").select("id, name, grid_x, grid_y, owner_player, settlement_level, population_total").eq("session_id", sessionId).not("grid_x", "is", null).not("grid_y", "is", null),
      supabase.from("province_nodes").select("id, name, grid_x, grid_y, node_type, node_tier").eq("session_id", sessionId).eq("is_active", true).not("grid_x", "is", null).not("grid_y", "is", null),
      supabase.from("flow_paths").select("route_id, path_cells").eq("session_id", sessionId).not("path_cells", "is", null),
    ]);
    setTiles((tileRes.data || []) as Tile[]);
    setCities((cityRes.data || []) as City[]);
    setNodes((nodeRes.data || []) as Node[]);
    setRoutes((routeRes.data || []) as unknown as Route[]);
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  const center = useMemo(() => {
    if (!tiles.length) return { x: 0, y: 0 };
    const points = tiles.map(t => projectCell("square4", { a: t.grid_x, b: t.grid_y }, TILE_SIZE));
    return { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length };
  }, [tiles]);

  const home = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setPan({ x: el.clientWidth / 2 - center.x, y: el.clientHeight * 0.35 - center.y });
  }, [center]);
  useEffect(() => { if (tiles.length) home(); }, [tiles.length, home]);

  const at = (x: number, y: number) => {
    const p = projectCell("square4", { a: x, b: y }, TILE_SIZE);
    return { x: p.x + pan.x, y: p.y + pan.y };
  };

  return (
    <div ref={viewportRef} className="relative h-full w-full overflow-hidden bg-[#07171d] select-none"
      onPointerDown={(e) => { dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const d = dragRef.current; if (d) setPan({ x: d.panX + (e.clientX - d.x) / zoom, y: d.panY + (e.clientY - d.y) / zoom }); }}
      onPointerUp={() => { dragRef.current = null; }}
      onWheel={(e) => { e.preventDefault(); setZoom(z => Math.max(.45, Math.min(2.2, z * (e.deltaY > 0 ? .9 : 1.1)))); }}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(30,110,94,.18),transparent_55%)]" />
      <svg className="h-full w-full">
        <defs>
          <filter id="iso-shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity=".35" /></filter>
          <pattern id="iso-water" width="30" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 Q7 0 15 4 T30 4" fill="none" stroke="#72d8d6" strokeWidth="1" opacity=".22"><animate attributeName="stroke-dashoffset" values="0;30" dur="5s" repeatCount="indefinite" /></path></pattern>
        </defs>
        <g transform={`scale(${zoom})`}>
          {[...tiles].sort((a,b) => (a.grid_x+a.grid_y)-(b.grid_x+b.grid_y)).map(tile => {
            const p = at(tile.grid_x, tile.grid_y); const colors = BIOMES[tile.biome_family] || BIOMES.plains;
            const active = selected?.id === tile.id;
            return <g key={tile.id} onClick={(e) => { e.stopPropagation(); setSelected(tile); }} className="cursor-pointer">
              <polygon points={squareDiamondPoints(p, TILE_SIZE)} fill={colors[0]} stroke={active ? "#efc75e" : colors[1]} strokeWidth={active ? 2.4 : 1} />
              <polygon points={squareDiamondPoints(p, TILE_SIZE - 2)} fill={`url(#iso-${tile.biome_family})`} opacity=".55" />
              {tile.biome_family === "sea" && <polygon points={squareDiamondPoints(p, TILE_SIZE - 4)} fill="url(#iso-water)" />}
              {tile.biome_family === "forest" && <text x={p.x} y={p.y + 2} textAnchor="middle" fontSize="17" className="pointer-events-none">🌲</text>}
              {tile.biome_family === "mountains" && <text x={p.x} y={p.y + 2} textAnchor="middle" fontSize="19" className="pointer-events-none">⛰️</text>}
            </g>;
          })}
          {routes.flatMap(route => Array.isArray(route.path_cells) && route.path_cells.length > 1 ? [<polyline key={route.route_id || JSON.stringify(route.path_cells)} points={route.path_cells.map(c => { const p=at(c.x,c.y); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#d3aa5d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".9" className="iso-active-route" />] : [])}
          {nodes.map(node => { const p=at(node.grid_x,node.grid_y); return <g key={node.id} transform={`translate(${p.x},${p.y-12})`} filter="url(#iso-shadow)"><circle r="13" fill="#14242a" stroke="#d7b35a" /><text y="4" textAnchor="middle" fontSize="13">{node.node_tier === "major" ? "🏛️" : "⚒️"}</text><title>{node.name}</title></g>; })}
          {cities.map(city => { const p=at(city.grid_x,city.grid_y); const own=city.owner_player===playerName; return <g key={city.id} transform={`translate(${p.x},${p.y-21})`} className="cursor-pointer" onDoubleClick={() => onCityClick?.(city.id)} filter="url(#iso-shadow)"><path d="M-17 14 L-17 -8 L-10 -8 L-10 -17 L-3 -17 L-3 -9 L5 -9 L5 -20 L13 -20 L13 14 Z" fill={own ? "#e1bb61" : "#b95343"} stroke="#172126" strokeWidth="2"/><path d="M-20 14 H17 L11 21 H-14 Z" fill="#263c32"/><text y="36" textAnchor="middle" fill="#fff4d0" fontSize="10" fontWeight="700" stroke="#081013" strokeWidth="3" paintOrder="stroke">{city.name}</text></g>; })}
        </g>
      </svg>
      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg border border-amber-300/20 bg-slate-950/80 p-1 shadow-xl backdrop-blur-md">
        <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.max(.45,z-.15))}><Minus className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={home}><Home className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.min(2.2,z+.15))}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-md border border-amber-300/20 bg-slate-950/75 px-3 py-2 text-xs text-slate-200 backdrop-blur-md"><Layers3 className="h-4 w-4 text-amber-300" /><span>Čtvercová síť · izometrické zobrazení</span></div>
      {selected && <div className="absolute bottom-4 left-4 rounded-lg border border-amber-300/25 bg-slate-950/85 p-3 text-xs shadow-xl backdrop-blur-md"><div className="font-serif text-sm text-amber-200">{selected.biome_family}</div><div className="text-slate-400">Pole {selected.grid_x}, {selected.grid_y}</div></div>}
      {!tiles.length && <div className="absolute inset-0 grid place-items-center text-center"><div className="rounded-xl border border-amber-300/20 bg-slate-950/80 p-6"><Castle className="mx-auto mb-2 h-7 w-7 text-amber-300"/><p className="font-serif text-amber-100">Čtvercový svět čeká na vygenerování mapy.</p><p className="mt-1 text-xs text-slate-400">Souřadnicový model je aktivní; staré hexové světy se nemění.</p></div></div>}
    </div>
  );
}
