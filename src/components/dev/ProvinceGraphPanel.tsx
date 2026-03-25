import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Loader2, Network, RefreshCw, MapPin, Landmark, Shield, Anchor, Store, Mountain, Wheat, Route, Church, Package, Home, TrendingUp, Coins, Building2, Plus } from "lucide-react";
import DevNodeSpawner from "@/components/dev/DevNodeSpawner";
import { toast } from "sonner";
import { FLOW_ROLE_LABELS, HINTERLAND_LABELS } from "@/lib/strategicGraph";
import { MACRO_LAYER_ICONS, getImportanceLabel, getImportanceColor, getIsolationSeverity, ISOLATION_PENALTY_LABELS, STRATEGIC_RESOURCE_ICONS, STRATEGIC_RESOURCE_LABELS, STRATEGIC_TIER_LABELS, STRATEGIC_TIER_DB_COLUMNS } from "@/lib/economyFlow";
import { MINOR_NODE_TYPES, MICRO_NODE_TYPES } from "@/lib/nodeTypes";
import { supabase } from "@/integrations/supabase/client";
import { useProvinceGraph, type ProvinceNode, type ProvinceEdge, type StrategicNode, type ProvinceRoute } from "@/hooks/useProvinceGraph";

interface Props { sessionId: string; }

const GRAPH_COLORS = [
  "hsl(210,60%,50%)", "hsl(30,70%,50%)", "hsl(120,50%,40%)", "hsl(0,60%,50%)",
  "hsl(270,50%,50%)", "hsl(60,60%,45%)", "hsl(180,50%,40%)", "hsl(330,50%,50%)",
  "hsl(150,50%,40%)", "hsl(45,60%,50%)",
];

const NODE_TYPE_ICONS: Record<string, { icon: typeof Landmark; label: string; color: string }> = {
  primary_city: { icon: Landmark, label: "Hlavní město", color: "text-yellow-400" },
  secondary_city: { icon: Landmark, label: "Město", color: "text-yellow-300" },
  fortress: { icon: Shield, label: "Pevnost", color: "text-red-400" },
  port: { icon: Anchor, label: "Přístav", color: "text-blue-400" },
  trade_hub: { icon: Store, label: "Tržiště", color: "text-emerald-400" },
  pass: { icon: Mountain, label: "Průsmyk", color: "text-stone-400" },
  resource_node: { icon: Wheat, label: "Zdroj", color: "text-amber-400" },
  village_cluster: { icon: Home, label: "Vesnice", color: "text-orange-300" },
  religious_center: { icon: Church, label: "Chrám", color: "text-purple-400" },
  logistic_hub: { icon: Package, label: "Logistika", color: "text-cyan-400" },
};

const NODE_TYPE_SHAPES: Record<string, string> = {
  primary_city: "★", fortress: "◆", port: "⚓", trade_hub: "●", pass: "▲", resource_node: "■",
};

const ROUTE_COLORS: Record<string, string> = {
  land_road: "hsl(40,60%,55%)", river_route: "hsl(200,70%,55%)", sea_lane: "hsl(210,80%,60%)",
  mountain_pass: "hsl(0,50%,50%)", caravan_route: "hsl(30,70%,50%)",
};

const ROUTE_LABELS: Record<string, string> = {
  land_road: "Silnice", river_route: "Říční", sea_lane: "Námořní", mountain_pass: "Průsmyk", caravan_route: "Karavana",
};

/** Get subtype icon from node_tier + node_subtype */
function getSubtypeIcon(tier: string, subtype: string): string {
  if (tier === "minor") {
    const def = MINOR_NODE_TYPES.find(t => t.key === subtype);
    return def?.icon || "🏘️";
  }
  if (tier === "micro") {
    const def = MICRO_NODE_TYPES.find(t => t.key === subtype);
    return def?.icon || "📍";
  }
  if (tier === "major") {
    const map: Record<string, string> = { city: "🏙️", fortress: "🏰", trade_hub: "🏪", guard_station: "⚔️" };
    return map[subtype] || "★";
  }
  return "●";
}

const TIER_SIZES: Record<string, number> = { major: 10, minor: 6.5, micro: 4 };
const TIER_STROKE: Record<string, string> = {
  major: "hsl(var(--primary))",
  minor: "hsl(45,80%,55%)",
  micro: "hsl(140,60%,50%)",
};
/* ─── SVG graph vis ─── */
function ProvinceGraphSVG({ nodes, edges, strategicNodes, routes, showNodes, showRoutes }: {
  nodes: ProvinceNode[]; edges: ProvinceEdge[]; strategicNodes: StrategicNode[]; routes: ProvinceRoute[];
  showNodes: boolean; showRoutes: boolean;
}) {
  if (nodes.length === 0) return <p className="text-xs text-muted-foreground text-center py-6">Žádné provincie</p>;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const snodeMap = new Map(strategicNodes.map(n => [n.id, n]));
  const qs = nodes.map(n => n.center_q);
  const rs = nodes.map(n => n.center_r);
  const allQs = showNodes ? [...qs, ...strategicNodes.map(s => s.hex_q)] : qs;
  const allRs = showNodes ? [...rs, ...strategicNodes.map(s => s.hex_r)] : rs;
  const minQ = Math.min(...allQs), maxQ = Math.max(...allQs);
  const minR = Math.min(...allRs), maxR = Math.max(...allRs);
  const rangeQ = maxQ - minQ || 1, rangeR = maxR - minR || 1;
  const W = 560, H = 400, PAD = 55;
  const toXY = (q: number, r: number) => ({
    x: PAD + ((q - minQ) / rangeQ) * (W - PAD * 2),
    y: PAD + ((r - minR) / rangeR) * (H - PAD * 2),
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-border rounded-lg bg-card">
      {edges.map(e => {
        const a = nodeMap.get(e.province_a), b = nodeMap.get(e.province_b);
        if (!a || !b) return null;
        const pa = toXY(a.center_q, a.center_r), pb = toXY(b.center_q, b.center_r);
        return <line key={e.id} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
          stroke="hsl(var(--muted-foreground))" strokeWidth={Math.max(1, e.border_length / 3)}
          opacity={0.15} strokeDasharray={e.is_contested ? "4 2" : undefined} />;
      })}

      {showRoutes && routes.map(r => {
        const na = snodeMap.get(r.node_a), nb = snodeMap.get(r.node_b);
        if (!na || !nb) return null;
        const pa = toXY(na.hex_q, na.hex_r), pb = toXY(nb.hex_q, nb.hex_r);
        const color = ROUTE_COLORS[r.route_type] || "hsl(var(--muted-foreground))";
        const w = r.control_state === "blocked" ? 0.5 : Math.max(1, r.capacity_value / 3);
        const dash = r.route_type === "sea_lane" ? "6 3" : r.route_type === "caravan_route" ? "3 2" : undefined;
        return <line key={`rt-${r.id}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
          stroke={color} strokeWidth={w} opacity={r.control_state === "blocked" ? 0.2 : 0.6} strokeDasharray={dash} />;
      })}

      {/* Parent-child links (hierarchy backbone) */}
      {showNodes && strategicNodes.map(sn => {
        if (!sn.parent_node_id) return null;
        const parent = snodeMap.get(sn.parent_node_id);
        if (!parent) return null;
        const pa = toXY(sn.hex_q, sn.hex_r), pb = toXY(parent.hex_q, parent.hex_r);
        const tierColor = TIER_STROKE[sn.node_tier || "minor"];
        return <line key={`hier-${sn.id}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
          stroke={tierColor} strokeWidth={0.8} opacity={0.4} strokeDasharray="3 2" />;
      })}

      {/* Province center → major node links (faint) */}
      {showNodes && !showRoutes && strategicNodes.filter(sn => sn.node_tier === "major" || sn.is_major).map(sn => {
        const prov = nodeMap.get(sn.province_id);
        if (!prov) return null;
        const pc = toXY(prov.center_q, prov.center_r), ns = toXY(sn.hex_q, sn.hex_r);
        return <line key={`lk-${sn.id}`} x1={pc.x} y1={pc.y} x2={ns.x} y2={ns.y}
          stroke={GRAPH_COLORS[prov.color_index % GRAPH_COLORS.length]} strokeWidth={0.5} opacity={0.2} strokeDasharray="2 2" />;
      })}

      {nodes.map(n => {
        const p = toXY(n.center_q, n.center_r);
        const r = 10 + Math.min(n.hex_count / 4, 15);
        const color = GRAPH_COLORS[n.color_index % GRAPH_COLORS.length];
        return (
          <g key={n.id}>
            <circle cx={p.x} cy={p.y} r={r} fill={color} opacity={0.5} stroke="white" strokeWidth={1.5} />
            <text x={p.x} y={p.y + r + 11} textAnchor="middle" fontSize="7.5" fill="hsl(var(--foreground))" fontWeight="600">
              {n.name.length > 16 ? n.name.slice(0, 14) + "…" : n.name}
            </text>
            <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="8" fill="white" fontWeight="700">{n.hex_count}</text>
          </g>
        );
      })}

      {showNodes && strategicNodes.map(sn => {
        const p = toXY(sn.hex_q, sn.hex_r);
        const tier = sn.node_tier || "minor";
        const nodeR = TIER_SIZES[tier] || 6;
        const strokeColor = TIER_STROKE[tier] || "hsl(var(--muted-foreground))";
        const resType = sn.strategic_resource_type;
        const resIcon = resType ? (STRATEGIC_RESOURCE_ICONS[resType as keyof typeof STRATEGIC_RESOURCE_ICONS] || "") : "";
        const icon = resIcon || (sn.node_subtype ? getSubtypeIcon(tier, sn.node_subtype) : (NODE_TYPE_SHAPES[sn.node_type] || "●"));
        const hasResource = !!resType;

        return (
          <g key={sn.id}>
            <circle cx={p.x} cy={p.y} r={nodeR}
              fill="hsl(var(--card))" stroke={hasResource ? "hsl(45,90%,55%)" : strokeColor}
              strokeWidth={tier === "major" ? 2.5 : tier === "minor" ? 1.8 : 1} />
            <text x={p.x} y={p.y + (tier === "micro" ? 2.5 : 3.5)} textAnchor="middle"
              fontSize={tier === "major" ? "10" : tier === "minor" ? "7" : "5.5"}
              fill={strokeColor} fontWeight="700">
              {icon}
            </text>
            {tier !== "micro" && (
              <text x={p.x} y={p.y - nodeR - 2} textAnchor="middle" fontSize="5.5" fill="hsl(var(--muted-foreground))">
                {sn.name.length > 18 ? sn.name.slice(0, 16) + "…" : sn.name}
              </text>
            )}
            {hasResource && (
              <text x={p.x} y={p.y + nodeR + 7} textAnchor="middle" fontSize="5" fill="hsl(45,90%,55%)" fontWeight="600">
                T{sn.strategic_resource_tier}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Cards ─── */
function StrategicNodeCard({ node, allNodes }: { node: StrategicNode; allNodes: StrategicNode[] }) {
  const cfg = NODE_TYPE_ICONS[node.node_type] || NODE_TYPE_ICONS.resource_node;
  const Icon = cfg.icon;
  const parentNode = node.parent_node_id ? allNodes.find(n => n.id === node.parent_node_id) : null;
  const childNodes = allNodes.filter(n => n.parent_node_id === node.id);
  const roleLabel = FLOW_ROLE_LABELS[node.flow_role] || node.flow_role;
  const hintLabel = HINTERLAND_LABELS[node.hinterland_level] ?? `Lv${node.hinterland_level}`;
  const resOut = node.resource_output || {};
  const hasResOutput = Object.values(resOut).some(v => v > 0);

  const ROLE_COLORS: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground",
    regulator: "bg-red-500/20 text-red-300",
    gateway: "bg-yellow-500/20 text-yellow-300",
    producer: "bg-emerald-500/20 text-emerald-300",
    hub: "bg-blue-500/20 text-blue-300",
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-1 pt-2 px-3">
        <CardTitle className="text-[11px] font-display flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
          {node.node_tier && node.node_subtype && (
            <span className="text-xs">{getSubtypeIcon(node.node_tier, node.node_subtype)}</span>
          )}
          {node.name}
          {node.node_tier && (
            <Badge variant="outline" className="text-[7px]">
              {node.node_tier === "minor" ? "osada" : node.node_tier === "micro" ? "zázemí" : "major"} lv.{node.upgrade_level || 1}
            </Badge>
          )}
          <Badge variant="outline" className="text-[7px] ml-auto">{cfg.label}</Badge>
          <Badge className={`text-[7px] ${ROLE_COLORS[node.flow_role] || ROLE_COLORS.neutral}`}>
            {roleLabel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2 space-y-1.5">
        {/* Core stats */}
        <div className="grid grid-cols-5 gap-1 text-[9px]">
          {[{ l: "Strat", v: node.strategic_value }, { l: "Ekon", v: node.economic_value },
            { l: "Obrana", v: node.defense_value }, { l: "Mobil", v: node.mobility_relevance },
            { l: "Zásoby", v: node.supply_relevance }].map(s => (
            <div key={s.l} className="bg-muted/40 rounded p-0.5 text-center">
              <span className="text-muted-foreground block text-[7px]">{s.l}</span>
              <span className="font-bold">{s.v}</span>
            </div>
          ))}
        </div>

        {/* Regulation & urbanization row */}
        <div className="grid grid-cols-4 gap-1 text-[9px]">
          <div className="bg-muted/40 rounded p-0.5 text-center">
            <span className="text-muted-foreground block text-[7px]">Průchod</span>
            <span className="font-bold">{Math.round(node.throughput_military * 100)}%</span>
          </div>
          <div className="bg-muted/40 rounded p-0.5 text-center">
            <span className="text-muted-foreground block text-[7px]">Clo</span>
            <span className="font-bold">{Math.round(node.toll_rate * 100)}%</span>
          </div>
          <div className="bg-muted/40 rounded p-0.5 text-center">
            <span className="text-muted-foreground block text-[7px]">Urbanizace</span>
            <span className="font-bold">{Math.round(node.urbanization_score)}</span>
          </div>
          <div className="bg-muted/40 rounded p-0.5 text-center">
            <span className="text-muted-foreground block text-[7px]">Zástavba</span>
            <span className="font-bold">{hintLabel}</span>
          </div>
        </div>

        {/* Resource output */}
        {hasResOutput && (
          <div className="flex flex-wrap gap-1.5 text-[8px]">
            {resOut.grain > 0 && <span>🌾{resOut.grain}</span>}
            {resOut.wood > 0 && <span>🪵{resOut.wood}</span>}
            {resOut.stone > 0 && <span>🧱{resOut.stone}</span>}
            {resOut.iron > 0 && <span>⛏{resOut.iron}</span>}
            {resOut.wealth > 0 && <span>💰{resOut.wealth}</span>}
          </div>
        )}

        {/* Trade flow + hierarchy */}
        <div className="flex items-center gap-2 text-[8px] text-muted-foreground flex-wrap">
          <span>Hex: ({node.hex_q}, {node.hex_r})</span>
          <span>· Tok: {Math.round(node.cumulative_trade_flow)}</span>
          {node.is_major && <Badge variant="secondary" className="text-[6px] h-3">MAJOR</Badge>}
          {!node.is_active && <Badge variant="destructive" className="text-[6px] h-3">NEAKTIVNÍ</Badge>}
        </div>

        {/* Parent / children */}
        {parentNode && (
          <p className="text-[8px] text-muted-foreground">
            ↑ Rodič: <span className="text-foreground font-semibold">{parentNode.name}</span>
          </p>
        )}
        {childNodes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {childNodes.map(c => (
              <Badge key={c.id} variant="outline" className="text-[6px]">
                ↓ {c.name}
              </Badge>
            ))}
          </div>
        )}

        {node.strategic_resource_type && (
          <div className="flex items-center gap-1.5 p-1.5 rounded border border-yellow-500/30 bg-yellow-500/10">
            <span className="text-sm">{STRATEGIC_RESOURCE_ICONS[node.strategic_resource_type as keyof typeof STRATEGIC_RESOURCE_ICONS] || "📦"}</span>
            <span className="text-[9px] font-semibold text-yellow-300">
              {STRATEGIC_RESOURCE_LABELS[node.strategic_resource_type as keyof typeof STRATEGIC_RESOURCE_LABELS] || node.strategic_resource_type}
            </span>
            <Badge variant="outline" className="text-[6px] ml-auto">
              {STRATEGIC_TIER_LABELS[node.strategic_resource_tier] || `Tier ${node.strategic_resource_tier}`}
            </Badge>
          </div>
        )}

        {node.metadata?.resource_type && !node.strategic_resource_type && (
          <p className="text-[7px] text-muted-foreground">Surovina: {node.metadata.resource_type}</p>
        )}
      </CardContent>
    </Card>
  );
}

function RouteCard({ route, strategicNodes }: { route: ProvinceRoute; strategicNodes: StrategicNode[] }) {
  const na = strategicNodes.find(n => n.id === route.node_a);
  const nb = strategicNodes.find(n => n.id === route.node_b);
  const sc: Record<string, string> = { open: "text-emerald-400", contested: "text-yellow-400", blocked: "text-red-400" };
  return (
    <Card className="border-border">
      <CardHeader className="pb-1 pt-2 px-3">
        <CardTitle className="text-[11px] font-display flex items-center gap-1.5">
          <Route className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{na?.name || "?"} → {nb?.name || "?"}</span>
          <Badge variant="outline" className="text-[7px] ml-auto">{ROUTE_LABELS[route.route_type] || route.route_type}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2 space-y-1">
        <div className="grid grid-cols-5 gap-1 text-[9px]">
          {[{ l: "Kapacita", v: route.capacity_value }, { l: "Vojenský", v: route.military_relevance },
            { l: "Ekon", v: route.economic_relevance }, { l: "Zranit.", v: route.vulnerability_score },
            { l: "Úroveň", v: route.upgrade_level }].map(s => (
            <div key={s.l} className="bg-muted/40 rounded p-0.5 text-center">
              <span className="text-muted-foreground block text-[7px]">{s.l}</span>
              <span className="font-bold">{s.v}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[8px] text-muted-foreground">
          <span className={sc[route.control_state] || ""}>{route.control_state}</span>
          <span>· Cena: {route.build_cost}</span>
          {route.metadata?.distance && <span>· Vzdál: {Math.round(route.metadata.distance)}</span>}
          {route.metadata?.cross_province && <span>· Přeshr.</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function ProvinceCard({ node, strategicNodes }: { node: ProvinceNode; strategicNodes: StrategicNode[] }) {
  const tp = node.terrain_profile, ep = node.economic_profile;
  const myNodes = strategicNodes.filter(s => s.province_id === node.id);
  return (
    <Card className="border-border">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-display flex items-center gap-1.5">
          <MapPin className="h-3 w-3" style={{ color: GRAPH_COLORS[node.color_index % GRAPH_COLORS.length] }} />
          {node.name}
          <Badge variant="outline" className="text-[8px] ml-auto">{node.owner_player}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-1.5">
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          {[{ l: "Hexů", v: node.hex_count }, { l: "Strat.", v: node.strategic_value }, { l: "Nodů", v: myNodes.length }].map(s => (
            <div key={s.l} className="bg-muted/40 rounded p-1 text-center">
              <span className="text-muted-foreground block">{s.l}</span>
              <span className="font-bold">{s.v}</span>
            </div>
          ))}
        </div>
        {tp.dominant_biome && (
          <p className="text-[9px] text-muted-foreground">
            Dominantní: <span className="font-semibold text-foreground">{tp.dominant_biome}</span>
            {tp.coastal_hexes ? ` · ${tp.coastal_hexes} pobřeží` : ""}
          </p>
        )}
        {ep.farmland_score !== undefined && (
          <div className="flex gap-2 text-[9px] text-muted-foreground">
            <span>🌾{ep.farmland_score}</span><span>🪵{ep.timber_score}</span>
            <span>⛏{ep.mineral_score}</span><span>🚢{ep.trade_potential}</span>
          </div>
        )}
        {myNodes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {myNodes.map(n => (
              <Badge key={n.id} variant="secondary" className="text-[7px] gap-0.5">
                {NODE_TYPE_SHAPES[n.node_type] || "●"} {NODE_TYPE_ICONS[n.node_type]?.label || n.node_type}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Economy Flow Card ─── */
function EconomyFlowCard({ node, allNodes }: { node: StrategicNode; allNodes: StrategicNode[] }) {
  const cfg = NODE_TYPE_ICONS[node.node_type] || NODE_TYPE_ICONS.resource_node;
  const Icon = cfg.icon;
  const n = node as any; // extended fields
  const prod = n.production_output ?? 0;
  const wealth = n.wealth_output ?? 0;
  const cap = n.capacity_score ?? 0;
  const importance = n.importance_score ?? 0;
  const isolation = n.isolation_penalty ?? 0;
  const impLabel = getImportanceLabel(importance);
  const impColor = getImportanceColor(importance);
  const isoSev = getIsolationSeverity(isolation);
  const isoLabel = ISOLATION_PENALTY_LABELS[isoSev];
  const maxVal = Math.max(prod, wealth, cap, 1);

  return (
    <Card className="border-border">
      <CardHeader className="pb-1 pt-2 px-3">
        <CardTitle className="text-[11px] font-display flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
          <span className="truncate">{node.name}</span>
          <Badge className={`text-[7px] ml-auto ${impColor}`}>{impLabel}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2 space-y-1.5">
        {/* Macro layers */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[9px]">
            <span className="w-3">{MACRO_LAYER_ICONS.production}</span>
            <span className="w-14 text-muted-foreground">Produkce</span>
            <Progress value={Math.min(100, (prod / maxVal) * 100)} className="h-1.5 flex-1" />
            <span className="font-bold w-8 text-right">{prod.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px]">
            <span className="w-3">{MACRO_LAYER_ICONS.wealth}</span>
            <span className="w-14 text-muted-foreground">Bohatství</span>
            <Progress value={Math.min(100, (wealth / maxVal) * 100)} className="h-1.5 flex-1" />
            <span className="font-bold w-8 text-right">{wealth.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px]">
            <span className="w-3">{MACRO_LAYER_ICONS.capacity}</span>
            <span className="w-14 text-muted-foreground">Kapacita</span>
            <Progress value={Math.min(100, (cap / maxVal) * 100)} className="h-1.5 flex-1" />
            <span className="font-bold w-8 text-right">{cap.toFixed(1)}</span>
          </div>
        </div>

        {/* Importance + connectivity */}
        <div className="grid grid-cols-3 gap-1 text-[9px]">
          <div className="bg-muted/40 rounded p-0.5 text-center">
            <span className="text-muted-foreground block text-[7px]">Importance</span>
            <span className={`font-bold ${impColor}`}>{importance.toFixed(1)}</span>
          </div>
          <div className="bg-muted/40 rounded p-0.5 text-center">
            <span className="text-muted-foreground block text-[7px]">Konektivita</span>
            <span className="font-bold">{(n.connectivity_score ?? 0).toFixed(2)}</span>
          </div>
          <div className="bg-muted/40 rounded p-0.5 text-center">
            <span className="text-muted-foreground block text-[7px]">Přístup</span>
            <span className="font-bold">{(n.route_access_factor ?? 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Isolation */}
        {isolation > 0 && (
          <div className="flex items-center gap-1.5 text-[8px]">
            <span className="text-red-400">⚠️ {isoLabel}</span>
            <span className="text-muted-foreground">(-{Math.round(isolation * 100)}%)</span>
          </div>
        )}

        {/* Incoming production for major */}
        {node.is_major && (n.incoming_production ?? 0) > 0 && (
          <p className="text-[8px] text-muted-foreground">
            Příchozí produkce: <span className="text-foreground font-bold">{(n.incoming_production ?? 0).toFixed(1)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Realm Economy Summary ─── */
function RealmEconomySummary({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    supabase.from("realm_resources")
      .select("player_name, total_production, total_wealth, total_capacity, total_importance, strategic_iron_tier, strategic_horses_tier, strategic_salt_tier, strategic_copper_tier, strategic_gold_tier, strategic_marble_tier, strategic_gems_tier, strategic_timber_tier, strategic_obsidian_tier, strategic_silk_tier, strategic_incense_tier")
      .eq("session_id", sessionId)
      .then(({ data }) => setData(data));
  }, [sessionId]);

  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">Žádná data. Spusťte výpočet ekonomiky.</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {data.map((r: any) => (
        <Card key={r.player_name} className="border-border">
          <CardHeader className="pb-1 pt-2 px-3">
            <CardTitle className="text-[11px] font-display flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              {r.player_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 space-y-1.5">
            <div className="grid grid-cols-4 gap-1 text-[9px]">
              {[
                { l: "Produkce", v: r.total_production?.toFixed(1), icon: MACRO_LAYER_ICONS.production },
                { l: "Bohatství", v: r.total_wealth?.toFixed(1), icon: MACRO_LAYER_ICONS.wealth },
                { l: "Kapacita", v: r.total_capacity?.toFixed(1), icon: MACRO_LAYER_ICONS.capacity },
                { l: "Importance", v: r.total_importance?.toFixed(1), icon: "⭐" },
              ].map(s => (
                <div key={s.l} className="bg-muted/40 rounded p-0.5 text-center">
                  <span className="text-muted-foreground block text-[7px]">{s.icon} {s.l}</span>
                  <span className="font-bold">{s.v ?? 0}</span>
                </div>
              ))}
            </div>
            {/* Strategic tiers */}
            <div className="flex flex-wrap gap-1.5 text-[8px]">
              {Object.entries(STRATEGIC_TIER_DB_COLUMNS).map(([key, col]) => {
                const v = r[col];
                return v > 0 ? (
                  <Badge key={key} variant="outline" className="text-[7px]">
                    {STRATEGIC_RESOURCE_ICONS[key as keyof typeof STRATEGIC_RESOURCE_ICONS]} {STRATEGIC_TIER_LABELS[v]}
                  </Badge>
                ) : null;
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─── Main panel ─── */
export default function ProvinceGraphPanel({ sessionId }: Props) {
  const { nodes, edges, strategicNodes, routes, loading, computing, loadGraph, computeGraph, computeNodes, computeRoutes } = useProvinceGraph(sessionId);
  const [showNodes, setShowNodes] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [computingEcon, setComputingEcon] = useState(false);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  const handleComputeGraph = async () => {
    try { const r = await computeGraph(); toast.success(`Graf: ${r?.adjacency_edges || 0} hran, ${r?.hexes_assigned || 0} hexů`); }
    catch (e: any) { toast.error("Chyba: " + e.message); }
  };
  const handleComputeNodes = async () => {
    try { const r = await computeNodes(); toast.success(`Nody: ${r?.nodes_created || 0} vytvořeno`); }
    catch (e: any) { toast.error("Chyba: " + e.message); }
  };
  const handleComputeRoutes = async () => {
    try { const r = await computeRoutes(); toast.success(`Trasy: ${r?.routes_created || 0} vytvořeno`); }
    catch (e: any) { toast.error("Chyba: " + e.message); }
  };
  const handleComputeEconomy = async () => {
    setComputingEcon(true);
    try {
      const { data, error } = await supabase.functions.invoke("compute-economy-flow", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      toast.success(`Ekonomika: ${data?.nodes_computed || 0} uzlů spočítáno`);
      // Reload to see updated values
      await loadGraph();
    } catch (e: any) {
      toast.error("Chyba ekonomiky: " + e.message);
    } finally {
      setComputingEcon(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Network className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Province Graph</h3>
        <Badge variant="outline" className="text-[9px]">Phase 3</Badge>
        <Badge variant="secondary" className="text-[9px] ml-auto">
          {nodes.length} prov · {edges.length} hran · {strategicNodes.length} nodů · {routes.length} tras
        </Badge>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => loadGraph()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Načíst
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleComputeGraph} disabled={computing}>
          <Network className="h-3 w-3" /> Graf
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleComputeNodes} disabled={computing}>
          <Landmark className="h-3 w-3" /> Nody
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleComputeRoutes} disabled={computing}>
          {computing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Route className="h-3 w-3" />} Trasy
        </Button>
        <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={handleComputeEconomy} disabled={computingEcon}>
          {computingEcon ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />} Ekonomika
        </Button>
        <div className="flex gap-1 ml-auto">
          <Button size="sm" variant={showNodes ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setShowNodes(!showNodes)}>
            {showNodes ? "Skrýt nody" : "Nody"}
          </Button>
          <Button size="sm" variant={showRoutes ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setShowRoutes(!showRoutes)}>
            {showRoutes ? "Skrýt trasy" : "Trasy"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="graph">
        <TabsList className="h-7">
          <TabsTrigger value="graph" className="text-[10px] h-6">Graf</TabsTrigger>
          <TabsTrigger value="provinces" className="text-[10px] h-6">Provincie</TabsTrigger>
          <TabsTrigger value="nodes" className="text-[10px] h-6">Strat. nody</TabsTrigger>
          <TabsTrigger value="routes" className="text-[10px] h-6">Trasy ({routes.length})</TabsTrigger>
          <TabsTrigger value="economy" className="text-[10px] h-6">⚒️ Ekonomika</TabsTrigger>
          <TabsTrigger value="adjacency" className="text-[10px] h-6">Sousednosti</TabsTrigger>
          <TabsTrigger value="spawner" className="text-[10px] h-6">📍 Spawner</TabsTrigger>
        </TabsList>

        <TabsContent value="graph" className="mt-2">
          <ProvinceGraphSVG nodes={nodes} edges={edges} strategicNodes={strategicNodes} routes={routes} showNodes={showNodes} showRoutes={showRoutes} />
          {showRoutes && routes.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(ROUTE_LABELS).map(([key, label]) => {
                const count = routes.filter(r => r.route_type === key).length;
                if (count === 0) return null;
                return (
                  <div key={key} className="flex items-center gap-1 text-[8px]">
                    <div className="w-4 h-0.5 rounded" style={{ background: ROUTE_COLORS[key] }} />
                    <span className="text-muted-foreground">{label} ({count})</span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="provinces" className="mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {nodes.map(n => <ProvinceCard key={n.id} node={n} strategicNodes={strategicNodes} />)}
          </div>
        </TabsContent>

        <TabsContent value="nodes" className="mt-2">
          {strategicNodes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Žádné strategické nody. Klikněte "Nody".</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {strategicNodes.map(n => <StrategicNodeCard key={n.id} node={n} allNodes={strategicNodes} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="routes" className="mt-2">
          {routes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Žádné trasy. Klikněte "Trasy".</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {routes.map(r => <RouteCard key={r.id} route={r} strategicNodes={strategicNodes} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="economy" className="mt-2 space-y-3">
          <h4 className="text-xs font-semibold flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5 text-primary" /> Realm Totals
          </h4>
          <RealmEconomySummary sessionId={sessionId} />

          <h4 className="text-xs font-semibold flex items-center gap-1.5 mt-4">
            <TrendingUp className="h-3.5 w-3.5 text-primary" /> Flow per Node
          </h4>
          {strategicNodes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Žádné nody. Spusťte "Nody" a "Ekonomika".</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[...strategicNodes]
                .sort((a, b) => ((b as any).importance_score ?? 0) - ((a as any).importance_score ?? 0))
                .map(n => <EconomyFlowCard key={n.id} node={n} allNodes={strategicNodes} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="adjacency" className="mt-2">
          {edges.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1 px-1">Provincie A</th>
                    <th className="text-left py-1 px-1">Provincie B</th>
                    <th className="text-center py-1 px-1">Hranice</th>
                    <th className="text-left py-1 px-1">Terén</th>
                  </tr>
                </thead>
                <tbody>
                  {edges.map(e => {
                    const a = nodes.find(n => n.id === e.province_a);
                    const b = nodes.find(n => n.id === e.province_b);
                    return (
                      <tr key={e.id} className="border-b border-border/50">
                        <td className="py-1 px-1 font-semibold">{a?.name || "?"}</td>
                        <td className="py-1 px-1 font-semibold">{b?.name || "?"}</td>
                        <td className="py-1 px-1 text-center">{e.border_length}</td>
                        <td className="py-1 px-1 text-muted-foreground">
                          {Object.entries(e.border_terrain).map(([t, c]) => `${t}:${c}`).join(", ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Žádné sousednosti</p>
          )}
        </TabsContent>

        <TabsContent value="spawner" className="mt-2">
          <DevNodeSpawner sessionId={sessionId} onRefetch={loadGraph} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
