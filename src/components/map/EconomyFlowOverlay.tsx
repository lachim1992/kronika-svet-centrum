/**
 * EconomyFlowOverlay — v4.2 dual-mode economy visualization.
 * 
 * Two view modes:
 *   - "goods": Trade flows color-coded by goods category (food/raw/luxury/manufactured)
 *   - "macro": Aggregate pillars (Produkce/Bohatství/Zásoby) derived from v4.2 data
 * 
 * Features:
 *   - Animated particles along trade routes
 *   - Static polylines as base layer
 *   - Auto-production pulsating halos around cities
 *   - Export arrows from cities with surplus
 *   - City satisfaction badges
 *   - Route control state visualization (open/contested/blocked/embargoed)
 */
import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}

/* ── Goods category colors ── */
const CATEGORY_COLORS: Record<string, string> = {
  food:         "hsl(120, 55%, 45%)",
  raw:          "hsl(30, 55%, 45%)",
  luxury:       "hsl(45, 85%, 55%)",
  manufactured: "hsl(210, 60%, 55%)",
};

/* ── Macro pillar colors ── */
const MACRO_COLORS: Record<string, string> = {
  production: "hsl(120, 60%, 50%)",
  wealth:     "hsl(45, 85%, 55%)",
  supply:     "hsl(210, 65%, 55%)",
  export:     "hsl(280, 55%, 55%)",
};

/* Map good_key → category */
const GOOD_CATEGORY: Record<string, string> = {
  wheat: "food", grain: "food", fish: "food", game: "food", bread: "food",
  baked_staples: "food", preserved_food: "food", feast_food: "food",
  iron: "raw", stone: "raw", timber: "raw", copper: "raw", salt: "raw",
  herbs: "raw", resin: "raw", marble: "raw", raw_ore: "raw", raw_stone: "raw",
  gold: "luxury", silk: "luxury", spices: "luxury", wine: "luxury",
  dye: "luxury", incense: "luxury", gems: "luxury", jewelry: "luxury",
  tools: "manufactured", weapons: "manufactured", armor: "manufactured",
  pottery: "manufactured", textiles: "manufactured", cloth: "manufactured",
};

function getGoodCategory(goodKey: string): string {
  return GOOD_CATEGORY[goodKey] || "raw";
}

/* ── Control state styles ── */
const CONTROL_DASH: Record<string, string | undefined> = {
  open: undefined,
  contested: "6,4",
  blocked: "4,4",
  embargoed: "2,4",
};
const CONTROL_COLOR_OVERRIDE: Record<string, string | undefined> = {
  blocked: "hsl(0, 70%, 50%)",
  embargoed: "hsl(270, 50%, 50%)",
};

/* ── Satisfaction color ── */
function satColor(pct: number): string {
  if (pct >= 0.7) return "hsl(120, 55%, 45%)";
  if (pct >= 0.4) return "hsl(45, 80%, 55%)";
  return "hsl(0, 65%, 50%)";
}

interface TradeFlow {
  id: string;
  good_key: string;
  source_city_id: string;
  target_city_id: string;
  volume_per_turn: number;
  route_path_id: string | null;
  status: string;
}

interface CityBasket {
  city_id: string;
  basket_key: string;
  local_supply: number | null;
  local_demand: number | null;
  domestic_satisfaction: number | null;
  auto_supply: number | null;
  export_surplus: number | null;
}

interface CityPos {
  id: string;
  q: number;
  r: number;
  name: string;
}

interface FlowPathHex {
  route_id: string;
  hex_path: Array<{ q: number; r: number }>;
}

interface RouteInfo {
  id: string;
  control_state: string;
}

/* ── Particle state ── */
interface Particle {
  pathPoints: Array<{ x: number; y: number }>;
  progress: number;  // 0..1
  speed: number;
  color: string;
  size: number;
}

export type ViewMode = "goods" | "macro";

interface Props {
  sessionId: string;
  offsetX: number;
  offsetY: number;
  visible: boolean;
  categories?: Set<string>;
  viewMode?: ViewMode;
}

const EconomyFlowOverlay = memo(({ sessionId, offsetX, offsetY, visible, categories, viewMode = "goods" }: Props) => {
  const [flows, setFlows] = useState<TradeFlow[]>([]);
  const [baskets, setBaskets] = useState<CityBasket[]>([]);
  const [cityPositions, setCityPositions] = useState<Map<string, CityPos>>(new Map());
  const [flowPaths, setFlowPaths] = useState<FlowPathHex[]>([]);
  const [routeMap, setRouteMap] = useState<Map<string, RouteInfo>>(new Map());

  // Animation
  const [particles, setParticles] = useState<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [haloPhase, setHaloPhase] = useState(0);

  const loadData = useCallback(async () => {
    if (!visible) return;
    const [flowsRes, basketsRes, citiesRes, fpRes, routesRes] = await Promise.all([
      supabase.from("trade_flows")
        .select("id, good_key, source_city_id, target_city_id, volume_per_turn, route_path_id, status")
        .eq("session_id", sessionId).eq("status", "active"),
      supabase.from("city_market_baskets")
        .select("city_id, basket_key, local_supply, local_demand, domestic_satisfaction, auto_supply, export_surplus")
        .eq("session_id", sessionId),
      supabase.from("cities")
        .select("id, name, province_q, province_r")
        .eq("session_id", sessionId),
      supabase.from("flow_paths")
        .select("route_id, hex_path")
        .eq("session_id", sessionId),
      supabase.from("province_routes")
        .select("id, control_state")
        .eq("session_id", sessionId),
    ]);
    setFlows((flowsRes.data || []) as TradeFlow[]);
    setBaskets((basketsRes.data || []) as CityBasket[]);
    if (citiesRes.data) {
      const m = new Map<string, CityPos>();
      for (const c of citiesRes.data as any[]) {
        if (c.province_q != null && c.province_r != null) {
          m.set(c.id, { id: c.id, q: c.province_q, r: c.province_r, name: c.name });
        }
      }
      setCityPositions(m);
    }
    if (fpRes.data) {
      const best = new Map<string, FlowPathHex>();
      for (const fp of fpRes.data as any[]) {
        if (!fp.route_id || !fp.hex_path || fp.hex_path.length < 2) continue;
        if (!best.has(fp.route_id)) {
          best.set(fp.route_id, { route_id: fp.route_id, hex_path: fp.hex_path });
        }
      }
      setFlowPaths(Array.from(best.values()));
    }
    if (routesRes.data) {
      const m = new Map<string, RouteInfo>();
      for (const r of routesRes.data as RouteInfo[]) m.set(r.id, r);
      setRouteMap(m);
    }
  }, [sessionId, visible]);

  useEffect(() => { loadData(); }, [loadData]);

  // Route hex path lookup
  const routeHexPathMap = useMemo(() => {
    const m = new Map<string, Array<{ q: number; r: number }>>();
    for (const fp of flowPaths) m.set(fp.route_id, fp.hex_path);
    return m;
  }, [flowPaths]);

  // City satisfaction aggregation
  const citySatisfaction = useMemo(() => {
    const m = new Map<string, { totalSup: number; totalDem: number }>();
    for (const b of baskets) {
      const cur = m.get(b.city_id) || { totalSup: 0, totalDem: 0 };
      cur.totalSup += b.local_supply || 0;
      cur.totalDem += b.local_demand || 0;
      m.set(b.city_id, cur);
    }
    const result = new Map<string, number>();
    for (const [cityId, { totalSup, totalDem }] of m) {
      result.set(cityId, totalDem > 0 ? Math.min(1, totalSup / totalDem) : 1);
    }
    return result;
  }, [baskets]);

  // City auto-production aggregation (for halo)
  const cityAutoProduction = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of baskets) {
      m.set(b.city_id, (m.get(b.city_id) || 0) + (b.auto_supply || 0));
    }
    return m;
  }, [baskets]);

  // City export surplus aggregation
  const cityExportSurplus = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of baskets) {
      const surplus = b.export_surplus || 0;
      if (surplus > 0) {
        m.set(b.city_id, (m.get(b.city_id) || 0) + surplus);
      }
    }
    return m;
  }, [baskets]);

  const maxAutoProduction = useMemo(() => {
    let max = 1;
    for (const v of cityAutoProduction.values()) if (v > max) max = v;
    return max;
  }, [cityAutoProduction]);

  const maxExportSurplus = useMemo(() => {
    let max = 1;
    for (const v of cityExportSurplus.values()) if (v > max) max = v;
    return max;
  }, [cityExportSurplus]);

  // Filter flows by category
  const visibleFlows = useMemo(() => {
    if (!categories || categories.size === 0) return flows;
    return flows.filter(f => categories.has(getGoodCategory(f.good_key)));
  }, [flows, categories]);

  // Aggregate flows by source-target pair for line rendering
  const aggregatedFlows = useMemo(() => {
    const m = new Map<string, { category: string; totalVolume: number; routePathId: string | null; sourceId: string; targetId: string }>();
    for (const f of visibleFlows) {
      const cat = viewMode === "goods" ? getGoodCategory(f.good_key) : "supply";
      const key = `${f.source_city_id}-${f.target_city_id}-${cat}`;
      const cur = m.get(key);
      if (cur) {
        cur.totalVolume += f.volume_per_turn;
        if (!cur.routePathId && f.route_path_id) cur.routePathId = f.route_path_id;
      } else {
        m.set(key, { category: cat, totalVolume: f.volume_per_turn, routePathId: f.route_path_id, sourceId: f.source_city_id, targetId: f.target_city_id });
      }
    }
    return Array.from(m.values());
  }, [visibleFlows, viewMode]);

  // Build pixel paths for flows (for both lines and particles)
  const flowPixelPaths = useMemo(() => {
    return aggregatedFlows.map(flow => {
      const src = cityPositions.get(flow.sourceId);
      const tgt = cityPositions.get(flow.targetId);
      if (!src || !tgt) return null;

      let pixelPath: Array<{ x: number; y: number }> = [];
      let controlState = "open";

      if (flow.routePathId) {
        const hexPath = routeHexPathMap.get(flow.routePathId);
        const route = routeMap.get(flow.routePathId);
        if (hexPath && hexPath.length >= 2) {
          pixelPath = hexPath.map(h => {
            const p = hexToPixel(h.q, h.r);
            return { x: p.x + offsetX, y: p.y + offsetY };
          });
        }
        if (route) controlState = route.control_state;
      }

      if (pixelPath.length < 2) {
        const pS = hexToPixel(src.q, src.r);
        const pT = hexToPixel(tgt.q, tgt.r);
        pixelPath = [
          { x: pS.x + offsetX, y: pS.y + offsetY },
          { x: pT.x + offsetX, y: pT.y + offsetY },
        ];
      }

      const colors = viewMode === "goods" ? CATEGORY_COLORS : MACRO_COLORS;
      const color = CONTROL_COLOR_OVERRIDE[controlState] || colors[flow.category] || colors.supply;
      const width = Math.max(1.5, Math.min(5, 1 + flow.totalVolume / 3));
      const dash = CONTROL_DASH[controlState];

      return { ...flow, pixelPath, color, width, dash, controlState };
    }).filter(Boolean) as Array<{
      category: string; totalVolume: number; routePathId: string | null;
      sourceId: string; targetId: string;
      pixelPath: Array<{ x: number; y: number }>; color: string; width: number;
      dash: string | undefined; controlState: string;
    }>;
  }, [aggregatedFlows, cityPositions, routeHexPathMap, routeMap, offsetX, offsetY, viewMode]);

  // Generate particles from pixel paths
  useEffect(() => {
    if (!visible || flowPixelPaths.length === 0) {
      setParticles([]);
      return;
    }

    const newParticles: Particle[] = [];
    for (const fp of flowPixelPaths) {
      // Number of particles proportional to volume
      const count = Math.max(1, Math.min(4, Math.round(fp.totalVolume / 2)));
      for (let i = 0; i < count; i++) {
        newParticles.push({
          pathPoints: fp.pixelPath,
          progress: (i / count), // spread evenly
          speed: 0.08 + Math.random() * 0.04, // progress per second
          color: fp.color,
          size: Math.max(2, Math.min(4, 1.5 + fp.totalVolume / 5)),
        });
      }
    }
    setParticles(newParticles);
  }, [flowPixelPaths, visible]);

  // Animate particles + halo
  useEffect(() => {
    if (!visible) return;

    const animate = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      setParticles(prev => prev.map(p => ({
        ...p,
        progress: (p.progress + p.speed * dt) % 1,
      })));

      setHaloPhase(prev => (prev + dt * 1.5) % (Math.PI * 2));

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible]);

  // Helper: get position along a polyline path at progress t (0..1)
  function getPointOnPath(path: Array<{ x: number; y: number }>, t: number): { x: number; y: number } {
    if (path.length < 2) return path[0] || { x: 0, y: 0 };

    // Calculate total length
    let totalLen = 0;
    const segLens: number[] = [];
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      segLens.push(len);
      totalLen += len;
    }
    if (totalLen === 0) return path[0];

    let target = t * totalLen;
    let accumulated = 0;
    for (let i = 0; i < segLens.length; i++) {
      if (accumulated + segLens[i] >= target) {
        const localT = (target - accumulated) / segLens[i];
        return {
          x: path[i].x + (path[i + 1].x - path[i].x) * localT,
          y: path[i].y + (path[i + 1].y - path[i].y) * localT,
        };
      }
      accumulated += segLens[i];
    }
    return path[path.length - 1];
  }

  // Route utilization from trade flows
  const routeUtilization = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of flows) {
      if (f.route_path_id) {
        m.set(f.route_path_id, (m.get(f.route_path_id) || 0) + f.volume_per_turn);
      }
    }
    return m;
  }, [flows]);

  const maxUtilization = useMemo(() => {
    let max = 1;
    for (const v of routeUtilization.values()) if (v > max) max = v;
    return max;
  }, [routeUtilization]);

  if (!visible) return null;

  const haloScale = 0.5 + 0.5 * Math.sin(haloPhase);
  const haloOpacity = 0.15 + 0.1 * Math.sin(haloPhase);

  return (
    <g className="economy-flow-overlay">
      {/* Defs for glow filters */}
      <defs>
        <filter id="glow-production" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Route utilization glow on road paths */}
      {flowPaths.map(fp => {
        const util = routeUtilization.get(fp.route_id) || 0;
        if (util <= 0) return null;
        const intensity = Math.min(1, util / maxUtilization);
        const hexPath = fp.hex_path;
        if (hexPath.length < 2) return null;
        const points = hexPath.map(h => {
          const p = hexToPixel(h.q, h.r);
          return `${p.x + offsetX},${p.y + offsetY}`;
        }).join(" ");

        return (
          <polyline
            key={`util-${fp.route_id}`}
            points={points}
            fill="none"
            stroke={`hsl(45, 90%, ${50 + intensity * 20}%)`}
            strokeWidth={1 + intensity * 3}
            strokeOpacity={0.15 + intensity * 0.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Auto-production halos around cities */}
      {Array.from(cityPositions.values()).map(city => {
        const autoProd = cityAutoProduction.get(city.id) || 0;
        if (autoProd <= 0) return null;
        const pos = hexToPixel(city.q, city.r);
        const cx = pos.x + offsetX;
        const cy = pos.y + offsetY;
        const normalizedProd = Math.min(1, autoProd / maxAutoProduction);
        const baseRadius = 12 + normalizedProd * 16;
        const radius = baseRadius + haloScale * 4;
        const color = viewMode === "goods" ? CATEGORY_COLORS.food : MACRO_COLORS.production;

        return (
          <g key={`halo-${city.id}`} style={{ pointerEvents: "none" }}>
            <circle
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={color}
              strokeWidth={1.5 + normalizedProd * 2}
              strokeOpacity={haloOpacity}
              filter="url(#glow-production)"
            />
            <circle
              cx={cx} cy={cy} r={radius * 0.7}
              fill={color}
              fillOpacity={haloOpacity * 0.3}
            />
          </g>
        );
      })}

      {/* Trade flow static lines */}
      {flowPixelPaths.map((flow, i) => {
        const points = flow.pixelPath.map(p => `${p.x},${p.y}`).join(" ");

        return (
          <polyline
            key={`flow-line-${i}`}
            points={points}
            fill="none"
            stroke={flow.color}
            strokeWidth={flow.width}
            strokeOpacity={0.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={flow.dash}
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Animated particles */}
      {particles.map((p, i) => {
        const pos = getPointOnPath(p.pathPoints, p.progress);
        return (
          <circle
            key={`particle-${i}`}
            cx={pos.x} cy={pos.y}
            r={p.size}
            fill={p.color}
            fillOpacity={0.9}
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Direction arrows on flows (at 70% of path) */}
      {flowPixelPaths.map((flow, i) => {
        if (flow.pixelPath.length < 2) return null;
        const pos70 = getPointOnPath(flow.pixelPath, 0.7);
        const pos72 = getPointOnPath(flow.pixelPath, 0.72);
        const angle = Math.atan2(pos72.y - pos70.y, pos72.x - pos70.x);
        const arrowSize = 4 + flow.width;

        return (
          <polygon
            key={`arrow-${i}`}
            points={`0,${-arrowSize / 2} ${arrowSize},0 0,${arrowSize / 2}`}
            fill={flow.color}
            fillOpacity={0.8}
            transform={`translate(${pos70.x},${pos70.y}) rotate(${angle * 180 / Math.PI})`}
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Export arrows from cities with surplus */}
      {Array.from(cityPositions.values()).map(city => {
        const surplus = cityExportSurplus.get(city.id) || 0;
        if (surplus <= 0) return null;
        const pos = hexToPixel(city.q, city.r);
        const cx = pos.x + offsetX;
        const cy = pos.y + offsetY;
        const normalizedSurplus = Math.min(1, surplus / maxExportSurplus);
        const arrowLen = 12 + normalizedSurplus * 14;
        const color = viewMode === "goods" ? "hsl(280, 55%, 55%)" : MACRO_COLORS.export;

        // Radial arrows pointing outward (3 directions: NE, E, SE)
        const angles = [-60, 0, 60];
        return (
          <g key={`export-${city.id}`} style={{ pointerEvents: "none" }}>
            {angles.map((deg, j) => {
              const rad = (deg * Math.PI) / 180;
              const startR = 14;
              const x1 = cx + Math.cos(rad) * startR;
              const y1 = cy + Math.sin(rad) * startR;
              const x2 = cx + Math.cos(rad) * (startR + arrowLen);
              const y2 = cy + Math.sin(rad) * (startR + arrowLen);
              const tipSize = 3 + normalizedSurplus * 2;

              return (
                <g key={j}>
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={color}
                    strokeWidth={1 + normalizedSurplus * 1.5}
                    strokeOpacity={0.6 + haloScale * 0.2}
                    strokeLinecap="round"
                  />
                  <polygon
                    points={`0,${-tipSize / 2} ${tipSize},0 0,${tipSize / 2}`}
                    fill={color}
                    fillOpacity={0.7}
                    transform={`translate(${x2},${y2}) rotate(${deg})`}
                  />
                </g>
              );
            })}
            {/* Surplus badge */}
            <rect x={cx + 10} y={cy - 25} width={28} height={10} rx={3}
              fill="hsl(280, 40%, 15%)" fillOpacity={0.85} />
            <text x={cx + 24} y={cy - 19} textAnchor="middle" dominantBaseline="middle"
              fill={color} fontSize="7" fontWeight="700">
              +{surplus.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* City satisfaction badges */}
      {Array.from(cityPositions.values()).map(city => {
        const sat = citySatisfaction.get(city.id);
        if (sat == null) return null;
        const pos = hexToPixel(city.q, city.r);
        const cx = pos.x + offsetX;
        const cy = pos.y + offsetY - 20;
        const pct = Math.round(sat * 100);
        const fill = satColor(sat);

        return (
          <g key={`sat-${city.id}`} style={{ pointerEvents: "none" }}>
            <rect x={cx - 12} y={cy - 5} width={24} height={10} rx={4}
              fill="hsl(0, 0%, 8%)" fillOpacity={0.85} />
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
              fill={fill} fontSize="7" fontWeight="700">
              {pct}%
            </text>
          </g>
        );
      })}
    </g>
  );
});

EconomyFlowOverlay.displayName = "EconomyFlowOverlay";
export default EconomyFlowOverlay;
export { CATEGORY_COLORS, MACRO_COLORS, getGoodCategory };
export type { ViewMode as EconomyViewMode };
