/**
 * EconomyFlowOverlay — v4.2 goods-based trade visualization.
 * Replaces legacy StrategicMapOverlay, RouteCorridorsOverlay, TradeNetworkOverlay.
 * Shows: trade flows color-coded by goods category, route utilization, city satisfaction badges.
 */
import { useState, useEffect, useCallback, useMemo, memo } from "react";
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

/* Map good_key → category */
const GOOD_CATEGORY: Record<string, string> = {
  wheat: "food", grain: "food", fish: "food", game: "food", bread: "food",
  baked_staples: "food", preserved_food: "food", feast_food: "food",
  iron: "raw", stone: "raw", timber: "raw", copper: "raw", salt: "raw",
  herbs: "raw", resin: "raw", marble: "raw",
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

interface Props {
  sessionId: string;
  offsetX: number;
  offsetY: number;
  visible: boolean;
  categories?: Set<string>; // filter: which categories to show
}

const EconomyFlowOverlay = memo(({ sessionId, offsetX, offsetY, visible, categories }: Props) => {
  const [flows, setFlows] = useState<TradeFlow[]>([]);
  const [baskets, setBaskets] = useState<CityBasket[]>([]);
  const [cityPositions, setCityPositions] = useState<Map<string, CityPos>>(new Map());
  const [flowPaths, setFlowPaths] = useState<FlowPathHex[]>([]);
  const [routeMap, setRouteMap] = useState<Map<string, RouteInfo>>(new Map());

  const loadData = useCallback(async () => {
    if (!visible) return;
    const [flowsRes, basketsRes, citiesRes, fpRes, routesRes] = await Promise.all([
      supabase.from("trade_flows")
        .select("id, good_key, source_city_id, target_city_id, volume_per_turn, route_path_id, status")
        .eq("session_id", sessionId).eq("status", "active"),
      supabase.from("city_market_baskets")
        .select("city_id, basket_key, local_supply, local_demand, domestic_satisfaction")
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

  // Filter flows by category
  const visibleFlows = useMemo(() => {
    if (!categories || categories.size === 0) return flows;
    return flows.filter(f => categories.has(getGoodCategory(f.good_key)));
  }, [flows, categories]);

  // Aggregate flows by source-target pair for line rendering
  const aggregatedFlows = useMemo(() => {
    const m = new Map<string, { category: string; totalVolume: number; routePathId: string | null; sourceId: string; targetId: string }>();
    for (const f of visibleFlows) {
      const cat = getGoodCategory(f.good_key);
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
  }, [visibleFlows]);

  if (!visible) return null;

  return (
    <g className="economy-flow-overlay">
      {/* Trade flow lines */}
      {aggregatedFlows.map((flow, i) => {
        const src = cityPositions.get(flow.sourceId);
        const tgt = cityPositions.get(flow.targetId);
        if (!src || !tgt) return null;

        const color = CATEGORY_COLORS[flow.category] || CATEGORY_COLORS.raw;
        const width = Math.max(1.5, Math.min(5, 1 + flow.totalVolume / 3));

        // Try hex path via route
        let points: string | null = null;
        let controlDash: string | undefined;
        if (flow.routePathId) {
          const hexPath = routeHexPathMap.get(flow.routePathId);
          const route = routeMap.get(flow.routePathId);
          if (hexPath && hexPath.length >= 2) {
            points = hexPath.map(h => {
              const p = hexToPixel(h.q, h.r);
              return `${p.x + offsetX},${p.y + offsetY}`;
            }).join(" ");
          }
          if (route) {
            controlDash = CONTROL_DASH[route.control_state];
          }
        }

        // Fallback: direct line
        if (!points) {
          const pS = hexToPixel(src.q, src.r);
          const pT = hexToPixel(tgt.q, tgt.r);
          points = `${pS.x + offsetX},${pS.y + offsetY} ${pT.x + offsetX},${pT.y + offsetY}`;
        }

        // Arrow marker id
        const markerId = `arrow-${flow.category}`;

        return (
          <g key={`flow-${i}`}>
            <polyline
              points={points}
              fill="none"
              stroke={CONTROL_COLOR_OVERRIDE[routeMap.get(flow.routePathId || "")?.control_state || ""] || color}
              strokeWidth={width}
              strokeOpacity={0.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={controlDash}
              style={{ pointerEvents: "none" }}
            />
            {/* Direction indicator: small circle at 70% of path */}
            {(() => {
              const pS = hexToPixel(src.q, src.r);
              const pT = hexToPixel(tgt.q, tgt.r);
              const t = 0.7;
              const mx = pS.x + (pT.x - pS.x) * t + offsetX;
              const my = pS.y + (pT.y - pS.y) * t + offsetY;
              return (
                <circle cx={mx} cy={my} r={3} fill={color} fillOpacity={0.9} style={{ pointerEvents: "none" }} />
              );
            })()}
          </g>
        );
      })}

      {/* City satisfaction badges */}
      {Array.from(cityPositions.values()).map(city => {
        const sat = citySatisfaction.get(city.id);
        if (sat == null) return null;
        const pos = hexToPixel(city.q, city.r);
        const cx = pos.x + offsetX;
        const cy = pos.y + offsetY - 20; // above the city
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
    </g>
  );
});

EconomyFlowOverlay.displayName = "EconomyFlowOverlay";
export default EconomyFlowOverlay;
export { CATEGORY_COLORS, getGoodCategory };
