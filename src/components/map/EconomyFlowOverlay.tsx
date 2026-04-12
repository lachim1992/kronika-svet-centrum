/**
 * EconomyFlowOverlay — v4.2 economy visualization.
 * 
 * Shows THREE types of flows:
 *   1. Local logistics: resource_node → city node (production flows along roads)
 *   2. Inter-city trade: trade_flows between cities (resolved via route infrastructure)
 *   3. Caravan/trade hub routes: trade_hub → city connections
 * 
 * Two view modes:
 *   - "goods": Color-coded by goods category (food/raw/luxury/manufactured)
 *   - "macro": Aggregate pillars (Produkce/Bohatství/Zásoby/Obchod)
 * 
 * Features:
 *   - Animated particles along routes
 *   - Auto-production pulsating halos
 *   - Export arrows from cities with surplus
 *   - City satisfaction badges
 *   - Route control state visualization
 *   - Fallback to road approximation when exact path missing
 */
import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}

/* ── Category colors ── */
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
  trade:      "hsl(280, 55%, 55%)",
  export:     "hsl(330, 60%, 55%)",
};

/* ── Flow layer colors (for local logistics / trade categories in macro) ── */
const FLOW_LAYER_COLORS: Record<string, string> = {
  local_logistics: "hsl(30, 60%, 50%)",
  inter_city_trade: "hsl(280, 55%, 55%)",
  caravan: "hsl(45, 80%, 55%)",
  fortress: "hsl(0, 50%, 50%)",
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

function satColor(pct: number): string {
  if (pct >= 0.7) return "hsl(120, 55%, 45%)";
  if (pct >= 0.4) return "hsl(45, 80%, 55%)";
  return "hsl(0, 65%, 50%)";
}

/* ── Data types ── */
interface RouteWithNodes {
  routeId: string;
  nodeA: string;
  nodeB: string;
  routeType: string;
  controlState: string;
  // Node A info
  nameA: string;
  typeA: string;
  cityIdA: string | null;
  hexQA: number;
  hexRA: number;
  prodA: number;
  // Node B info
  nameB: string;
  typeB: string;
  cityIdB: string | null;
  hexQB: number;
  hexRB: number;
  prodB: number;
  // Resolved hex path
  hexPath: Array<{ q: number; r: number }> | null;
}

interface TradeFlow {
  id: string;
  good_key: string;
  source_city_id: string;
  target_city_id: string;
  volume_per_turn: number;
  status: string;
  route_path_id: string | null;
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
  nodeId: string;
  q: number;
  r: number;
  name: string;
}

interface Particle {
  pathPoints: Array<{ x: number; y: number }>;
  progress: number;
  speed: number;
  color: string;
  size: number;
}

/* Resolved visual flow */
interface VisualFlow {
  key: string;
  pixelPath: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  dash: string | undefined;
  volume: number;
  category: string;   // goods category or macro category
  flowType: string;    // local_logistics | inter_city_trade | caravan
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

const CITY_NODE_TYPES = new Set(["primary_city", "secondary_city"]);
const RESOURCE_NODE_TYPES = new Set(["resource_node", "village_cluster"]);

const EconomyFlowOverlay = memo(({ sessionId, offsetX, offsetY, visible, categories, viewMode = "goods" }: Props) => {
  const [routes, setRoutes] = useState<RouteWithNodes[]>([]);
  const [tradeFlows, setTradeFlows] = useState<TradeFlow[]>([]);
  const [baskets, setBaskets] = useState<CityBasket[]>([]);
  const [cityPositions, setCityPositions] = useState<Map<string, CityPos>>(new Map());

  // Animation
  const [particles, setParticles] = useState<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [haloPhase, setHaloPhase] = useState(0);

  const loadData = useCallback(async () => {
    if (!visible) return;

    // Load routes with node info + hex paths in a single join-like approach
    const [routesRes, flowPathsRes, tradeRes, basketsRes] = await Promise.all([
      supabase.from("province_routes")
        .select(`
          id, node_a, node_b, route_type, control_state,
          node_a_ref:province_nodes!province_routes_node_a_fkey(id, name, node_type, hex_q, hex_r, city_id, production_output),
          node_b_ref:province_nodes!province_routes_node_b_fkey(id, name, node_type, hex_q, hex_r, city_id, production_output)
        `)
        .eq("session_id", sessionId),
      supabase.from("flow_paths")
        .select("route_id, hex_path")
        .eq("session_id", sessionId),
      supabase.from("trade_flows")
        .select("id, good_key, source_city_id, target_city_id, volume_per_turn, status, route_path_id")
        .eq("session_id", sessionId)
        .eq("status", "active"),
      supabase.from("city_market_baskets")
        .select("city_id, basket_key, local_supply, local_demand, domestic_satisfaction, auto_supply, export_surplus")
        .eq("session_id", sessionId),
    ]);

    // Build hex_path lookup by route_id
    const hexPathMap = new Map<string, Array<{ q: number; r: number }>>();
    if (flowPathsRes.data) {
      for (const fp of flowPathsRes.data as any[]) {
        if (!fp.route_id || !fp.hex_path || fp.hex_path.length < 2) continue;
        if (!hexPathMap.has(fp.route_id)) {
          hexPathMap.set(fp.route_id, fp.hex_path.map((h: any) => ({ q: h.q, r: h.r })));
        }
      }
    }

    // Process routes
    if (routesRes.data) {
      const processed: RouteWithNodes[] = [];
      for (const r of routesRes.data as any[]) {
        const nA = r.node_a_ref;
        const nB = r.node_b_ref;
        if (!nA || !nB) continue;

        const hexPath = hexPathMap.get(r.id) || null;

        processed.push({
          routeId: r.id,
          nodeA: r.node_a,
          nodeB: r.node_b,
          routeType: r.route_type,
          controlState: r.control_state || "open",
          nameA: nA.name, typeA: nA.node_type, cityIdA: nA.city_id,
          hexQA: nA.hex_q, hexRA: nA.hex_r, prodA: nA.production_output || 0,
          nameB: nB.name, typeB: nB.node_type, cityIdB: nB.city_id,
          hexQB: nB.hex_q, hexRB: nB.hex_r, prodB: nB.production_output || 0,
          hexPath,
        });
      }
      setRoutes(processed);
    }

    setTradeFlows((tradeRes.data || []) as TradeFlow[]);
    setBaskets((basketsRes.data || []) as CityBasket[]);

    // Build city positions from nodes with city_id
    if (routesRes.data) {
      const m = new Map<string, CityPos>();
      for (const r of routesRes.data as any[]) {
        for (const n of [r.node_a_ref, r.node_b_ref]) {
          if (n?.city_id && CITY_NODE_TYPES.has(n.node_type) && !m.has(n.city_id)) {
            m.set(n.city_id, { id: n.city_id, nodeId: n.id, q: n.hex_q, r: n.hex_r, name: n.name });
          }
        }
      }
      setCityPositions(m);
    }
  }, [sessionId, visible]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── City aggregations ──
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

  const cityAutoProduction = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of baskets) {
      m.set(b.city_id, (m.get(b.city_id) || 0) + (b.auto_supply || 0));
    }
    return m;
  }, [baskets]);

  const cityExportSurplus = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of baskets) {
      const surplus = b.export_surplus || 0;
      if (surplus > 0) m.set(b.city_id, (m.get(b.city_id) || 0) + surplus);
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

  // ── Build city_id → node_id lookup ──
  const cityToNodeId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [cityId, pos] of cityPositions) m.set(cityId, pos.nodeId);
    return m;
  }, [cityPositions]);

  // ── Build node_id → route lookup for trade flow resolution ──
  const nodeRouteIndex = useMemo(() => {
    // Map: "nodeA-nodeB" → route (both directions)
    const m = new Map<string, RouteWithNodes>();
    for (const r of routes) {
      m.set(`${r.nodeA}-${r.nodeB}`, r);
      m.set(`${r.nodeB}-${r.nodeA}`, r);
    }
    return m;
  }, [routes]);

  // ── Resolve pixel path from hex path or fallback ──
  function resolvePixelPath(
    hexPath: Array<{ q: number; r: number }> | null,
    fallbackQA: number, fallbackRA: number,
    fallbackQB: number, fallbackRB: number,
  ): Array<{ x: number; y: number }> {
    if (hexPath && hexPath.length >= 2) {
      return hexPath.map(h => {
        const p = hexToPixel(h.q, h.r);
        return { x: p.x + offsetX, y: p.y + offsetY };
      });
    }
    // Fallback: direct line
    const pA = hexToPixel(fallbackQA, fallbackRA);
    const pB = hexToPixel(fallbackQB, fallbackRB);
    return [
      { x: pA.x + offsetX, y: pA.y + offsetY },
      { x: pB.x + offsetX, y: pB.y + offsetY },
    ];
  }

  // ── Build visual flows ──
  const visualFlows = useMemo(() => {
    const result: VisualFlow[] = [];

    // 1. LOCAL LOGISTICS: resource_node/village → city_node
    for (const route of routes) {
      const isResourceA = RESOURCE_NODE_TYPES.has(route.typeA);
      const isResourceB = RESOURCE_NODE_TYPES.has(route.typeB);
      const isCityA = CITY_NODE_TYPES.has(route.typeA);
      const isCityB = CITY_NODE_TYPES.has(route.typeB);

      let flowType = "";
      let volume = 0;

      if ((isResourceA && isCityB) || (isResourceB && isCityA)) {
        flowType = "local_logistics";
        volume = isResourceA ? route.prodA : route.prodB;
      } else if (route.routeType === "caravan_route") {
        flowType = "caravan";
        volume = Math.max(route.prodA, route.prodB, 2);
      } else if (route.typeA === "fortress" || route.typeB === "fortress") {
        flowType = "fortress";
        volume = 1.5;
      } else if (isCityA && isCityB) {
        // City-to-city infrastructure route — will be covered by trade_flows
        continue;
      } else {
        continue;
      }

      if (volume <= 0) continue;

      const pixelPath = resolvePixelPath(
        route.hexPath,
        route.hexQA, route.hexRA,
        route.hexQB, route.hexRB,
      );

      let color: string;
      if (viewMode === "macro") {
        color = flowType === "local_logistics" ? MACRO_COLORS.production :
                flowType === "caravan" ? MACRO_COLORS.wealth :
                FLOW_LAYER_COLORS[flowType] || MACRO_COLORS.supply;
      } else {
        color = FLOW_LAYER_COLORS[flowType] || CATEGORY_COLORS.raw;
      }

      if (CONTROL_COLOR_OVERRIDE[route.controlState]) {
        color = CONTROL_COLOR_OVERRIDE[route.controlState]!;
      }

      const width = Math.max(1.5, Math.min(5, 1 + volume / 5));
      const dash = CONTROL_DASH[route.controlState];

      result.push({
        key: `local-${route.routeId}`,
        pixelPath, color, width, dash, volume,
        category: flowType === "local_logistics" ? "production" : flowType === "caravan" ? "wealth" : "supply",
        flowType,
      });
    }

    // 2. INTER-CITY TRADE FLOWS
    // Group by source-target pair
    const tradePairs = new Map<string, { goodKeys: string[]; totalVolume: number; sourceCity: string; targetCity: string }>();
    for (const tf of tradeFlows) {
      const pairKey = `${tf.source_city_id}-${tf.target_city_id}`;
      const cur = tradePairs.get(pairKey);
      if (cur) {
        cur.totalVolume += tf.volume_per_turn;
        cur.goodKeys.push(tf.good_key);
      } else {
        tradePairs.set(pairKey, {
          goodKeys: [tf.good_key],
          totalVolume: tf.volume_per_turn,
          sourceCity: tf.source_city_id,
          targetCity: tf.target_city_id,
        });
      }
    }

    for (const [pairKey, pair] of tradePairs) {
      const srcPos = cityPositions.get(pair.sourceCity);
      const tgtPos = cityPositions.get(pair.targetCity);
      if (!srcPos || !tgtPos) continue;

      // Try to find a route between the city nodes
      const srcNodeId = cityToNodeId.get(pair.sourceCity);
      const tgtNodeId = cityToNodeId.get(pair.targetCity);

      let pixelPath: Array<{ x: number; y: number }> | null = null;
      let controlState = "open";

      if (srcNodeId && tgtNodeId) {
        const directRoute = nodeRouteIndex.get(`${srcNodeId}-${tgtNodeId}`);
        if (directRoute) {
          pixelPath = resolvePixelPath(directRoute.hexPath, srcPos.q, srcPos.r, tgtPos.q, tgtPos.r);
          controlState = directRoute.controlState;
        }
      }

      // Fallback: try multi-hop via intermediate fortress/trade_hub
      if (!pixelPath && srcNodeId && tgtNodeId) {
        // Find routes from srcNode and tgtNode, see if they share a neighbor
        const srcNeighborRoutes = routes.filter(r => r.nodeA === srcNodeId || r.nodeB === srcNodeId);
        const tgtNeighborRoutes = routes.filter(r => r.nodeA === tgtNodeId || r.nodeB === tgtNodeId);
        const srcNeighborIds = new Set(srcNeighborRoutes.map(r => r.nodeA === srcNodeId ? r.nodeB : r.nodeA));
        
        let found = false;
        for (const tgtRoute of tgtNeighborRoutes) {
          const intermediateNode = tgtRoute.nodeA === tgtNodeId ? tgtRoute.nodeB : tgtRoute.nodeA;
          if (srcNeighborIds.has(intermediateNode)) {
            // Found a 2-hop path src → intermediate → tgt
            const srcRoute = srcNeighborRoutes.find(r =>
              (r.nodeA === srcNodeId && r.nodeB === intermediateNode) ||
              (r.nodeB === srcNodeId && r.nodeA === intermediateNode)
            );
            if (srcRoute) {
              const path1 = resolvePixelPath(srcRoute.hexPath, srcRoute.hexQA, srcRoute.hexRA, srcRoute.hexQB, srcRoute.hexRB);
              const path2 = resolvePixelPath(tgtRoute.hexPath, tgtRoute.hexQA, tgtRoute.hexRA, tgtRoute.hexQB, tgtRoute.hexRB);
              // Merge paths (remove duplicate middle point)
              pixelPath = [...path1, ...path2.slice(1)];
              controlState = srcRoute.controlState === "open" && tgtRoute.controlState === "open" ? "open" : "contested";
              found = true;
              break;
            }
          }
        }

        // Ultimate fallback: direct line
        if (!found) {
          pixelPath = resolvePixelPath(null, srcPos.q, srcPos.r, tgtPos.q, tgtPos.r);
        }
      }

      if (!pixelPath) {
        pixelPath = resolvePixelPath(null, srcPos.q, srcPos.r, tgtPos.q, tgtPos.r);
      }

      // Determine color
      let color: string;
      if (viewMode === "macro") {
        color = MACRO_COLORS.trade;
      } else {
        // Use dominant good category
        const catCounts = new Map<string, number>();
        for (const gk of pair.goodKeys) {
          const cat = getGoodCategory(gk);
          catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
        }
        let maxCat = "raw";
        let maxCount = 0;
        for (const [cat, count] of catCounts) {
          if (count > maxCount) { maxCat = cat; maxCount = count; }
        }
        color = CATEGORY_COLORS[maxCat] || CATEGORY_COLORS.raw;
      }

      if (CONTROL_COLOR_OVERRIDE[controlState]) {
        color = CONTROL_COLOR_OVERRIDE[controlState]!;
      }

      const width = Math.max(2, Math.min(6, 1.5 + pair.totalVolume / 2));
      const dash = CONTROL_DASH[controlState];

      // Filter by categories in goods mode
      if (viewMode === "goods" && categories && categories.size > 0) {
        const hasMatchingGood = pair.goodKeys.some(gk => categories.has(getGoodCategory(gk)));
        if (!hasMatchingGood) continue;
      }

      result.push({
        key: `trade-${pairKey}`,
        pixelPath, color, width, dash,
        volume: pair.totalVolume,
        category: "trade",
        flowType: "inter_city_trade",
      });
    }

    return result;
  }, [routes, tradeFlows, cityPositions, cityToNodeId, nodeRouteIndex, viewMode, categories, offsetX, offsetY]);

  // ── Filter by macro categories ──
  const filteredFlows = useMemo(() => {
    if (viewMode === "macro" && categories && categories.size > 0) {
      return visualFlows.filter(f => categories.has(f.category));
    }
    // In goods mode, local logistics always shown
    if (viewMode === "goods" && categories && categories.size > 0) {
      return visualFlows.filter(f => f.flowType !== "inter_city_trade" || true); // trade already filtered above
    }
    return visualFlows;
  }, [visualFlows, viewMode, categories]);

  // ── Generate particles ──
  useEffect(() => {
    if (!visible || filteredFlows.length === 0) {
      setParticles([]);
      return;
    }

    const newParticles: Particle[] = [];
    for (const flow of filteredFlows) {
      if (flow.pixelPath.length < 2) continue;
      const count = Math.max(1, Math.min(4, Math.round(flow.volume / 3)));
      for (let i = 0; i < count; i++) {
        newParticles.push({
          pathPoints: flow.pixelPath,
          progress: i / count,
          speed: 0.08 + Math.random() * 0.04,
          color: flow.color,
          size: Math.max(2, Math.min(4, 1.5 + flow.volume / 6)),
        });
      }
    }
    setParticles(newParticles);
  }, [filteredFlows, visible]);

  // ── Animate ──
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

  function getPointOnPath(path: Array<{ x: number; y: number }>, t: number): { x: number; y: number } {
    if (path.length < 2) return path[0] || { x: 0, y: 0 };
    let totalLen = 0;
    const segLens: number[] = [];
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      segLens.push(Math.sqrt(dx * dx + dy * dy));
      totalLen += segLens[segLens.length - 1];
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

  if (!visible) return null;

  const haloScale = 0.5 + 0.5 * Math.sin(haloPhase);
  const haloOpacity = 0.15 + 0.1 * Math.sin(haloPhase);

  return (
    <g className="economy-flow-overlay">
      <defs>
        <filter id="glow-production" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

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
        const color = MACRO_COLORS.production;

        return (
          <g key={`halo-${city.id}`} style={{ pointerEvents: "none" }}>
            <circle cx={cx} cy={cy} r={radius}
              fill="none" stroke={color}
              strokeWidth={1.5 + normalizedProd * 2}
              strokeOpacity={haloOpacity}
              filter="url(#glow-production)"
            />
            <circle cx={cx} cy={cy} r={radius * 0.7}
              fill={color} fillOpacity={haloOpacity * 0.3}
            />
          </g>
        );
      })}

      {/* Flow lines */}
      {filteredFlows.map(flow => (
        <polyline
          key={`line-${flow.key}`}
          points={flow.pixelPath.map(p => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={flow.color}
          strokeWidth={flow.width}
          strokeOpacity={0.55}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={flow.dash}
          style={{ pointerEvents: "none" }}
        />
      ))}

      {/* Animated particles */}
      {particles.map((p, i) => {
        const pos = getPointOnPath(p.pathPoints, p.progress);
        return (
          <circle key={`p-${i}`} cx={pos.x} cy={pos.y} r={p.size}
            fill={p.color} fillOpacity={0.9} style={{ pointerEvents: "none" }}
          />
        );
      })}

      {/* Direction arrows */}
      {filteredFlows.map(flow => {
        if (flow.pixelPath.length < 2) return null;
        const pos70 = getPointOnPath(flow.pixelPath, 0.7);
        const pos72 = getPointOnPath(flow.pixelPath, 0.72);
        const angle = Math.atan2(pos72.y - pos70.y, pos72.x - pos70.x);
        const arrowSize = 4 + flow.width;
        return (
          <polygon
            key={`arrow-${flow.key}`}
            points={`0,${-arrowSize / 2} ${arrowSize},0 0,${arrowSize / 2}`}
            fill={flow.color} fillOpacity={0.8}
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
        const color = MACRO_COLORS.export;

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
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={color} strokeWidth={1 + normalizedSurplus * 1.5}
                    strokeOpacity={0.6 + haloScale * 0.2} strokeLinecap="round"
                  />
                  <polygon
                    points={`0,${-tipSize / 2} ${tipSize},0 0,${tipSize / 2}`}
                    fill={color} fillOpacity={0.7}
                    transform={`translate(${x2},${y2}) rotate(${deg})`}
                  />
                </g>
              );
            })}
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
export { CATEGORY_COLORS, MACRO_COLORS, FLOW_LAYER_COLORS, getGoodCategory };
export type { ViewMode as EconomyViewMode };
