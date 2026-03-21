import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Network, RefreshCw, MapPin, ArrowRightLeft, Landmark, Shield, Anchor, Store, Mountain, Wheat } from "lucide-react";
import { toast } from "sonner";
import { useProvinceGraph, type ProvinceNode, type ProvinceEdge, type StrategicNode } from "@/hooks/useProvinceGraph";

interface Props {
  sessionId: string;
}

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
};

const NODE_TYPE_SHAPES: Record<string, string> = {
  primary_city: "★",
  fortress: "◆",
  port: "⚓",
  trade_hub: "●",
  pass: "▲",
  resource_node: "■",
};

/* ─── SVG graph vis with strategic nodes ─── */
function ProvinceGraphSVG({ nodes, edges, strategicNodes, showNodes }: {
  nodes: ProvinceNode[]; edges: ProvinceEdge[]; strategicNodes: StrategicNode[]; showNodes: boolean;
}) {
  if (nodes.length === 0) return <p className="text-xs text-muted-foreground text-center py-6">Žádné provincie</p>;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const qs = nodes.map(n => n.center_q);
  const rs = nodes.map(n => n.center_r);
  const allQs = showNodes ? [...qs, ...strategicNodes.map(s => s.hex_q)] : qs;
  const allRs = showNodes ? [...rs, ...strategicNodes.map(s => s.hex_r)] : rs;
  const minQ = Math.min(...allQs), maxQ = Math.max(...allQs);
  const minR = Math.min(...allRs), maxR = Math.max(...allRs);
  const rangeQ = maxQ - minQ || 1;
  const rangeR = maxR - minR || 1;
  const W = 560, H = 400, PAD = 55;

  const toXY = (q: number, r: number) => ({
    x: PAD + ((q - minQ) / rangeQ) * (W - PAD * 2),
    y: PAD + ((r - minR) / rangeR) * (H - PAD * 2),
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-border rounded-lg bg-card">
      {/* Province edges */}
      {edges.map(e => {
        const a = nodeMap.get(e.province_a);
        const b = nodeMap.get(e.province_b);
        if (!a || !b) return null;
        const pa = toXY(a.center_q, a.center_r), pb = toXY(b.center_q, b.center_r);
        return (
          <line key={e.id} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke="hsl(var(--muted-foreground))" strokeWidth={Math.max(1, e.border_length / 3)}
            opacity={0.3} strokeDasharray={e.is_contested ? "4 2" : undefined} />
        );
      })}

      {/* Strategic nodes — connections to province center */}
      {showNodes && strategicNodes.map(sn => {
        const prov = nodeMap.get(sn.province_id);
        if (!prov) return null;
        const pc = toXY(prov.center_q, prov.center_r);
        const ns = toXY(sn.hex_q, sn.hex_r);
        return (
          <line key={`link-${sn.id}`} x1={pc.x} y1={pc.y} x2={ns.x} y2={ns.y}
            stroke={GRAPH_COLORS[prov.color_index % GRAPH_COLORS.length]}
            strokeWidth={0.5} opacity={0.3} strokeDasharray="2 2" />
        );
      })}

      {/* Province circles */}
      {nodes.map(n => {
        const p = toXY(n.center_q, n.center_r);
        const r = 10 + Math.min(n.hex_count / 4, 15);
        const color = GRAPH_COLORS[n.color_index % GRAPH_COLORS.length];
        return (
          <g key={n.id}>
            <circle cx={p.x} cy={p.y} r={r} fill={color} opacity={0.5} stroke="white" strokeWidth={1.5} />
            <text x={p.x} y={p.y + r + 11} textAnchor="middle" fontSize="7.5"
              fill="hsl(var(--foreground))" fontWeight="600">
              {n.name.length > 16 ? n.name.slice(0, 14) + "…" : n.name}
            </text>
            <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="8" fill="white" fontWeight="700">
              {n.hex_count}
            </text>
          </g>
        );
      })}

      {/* Strategic node markers */}
      {showNodes && strategicNodes.map(sn => {
        const p = toXY(sn.hex_q, sn.hex_r);
        const cfg = NODE_TYPE_ICONS[sn.node_type];
        const shape = NODE_TYPE_SHAPES[sn.node_type] || "●";
        const prov = nodeMap.get(sn.province_id);
        const provColor = prov ? GRAPH_COLORS[prov.color_index % GRAPH_COLORS.length] : "gray";
        return (
          <g key={sn.id}>
            <circle cx={p.x} cy={p.y} r={6} fill="hsl(var(--card))" stroke={provColor} strokeWidth={1.5} />
            <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="8" fill={provColor} fontWeight="700">
              {shape}
            </text>
            <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="6"
              fill="hsl(var(--muted-foreground))">
              {sn.name.length > 18 ? sn.name.slice(0, 16) + "…" : sn.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Strategic node card ─── */
function StrategicNodeCard({ node }: { node: StrategicNode }) {
  const cfg = NODE_TYPE_ICONS[node.node_type] || NODE_TYPE_ICONS.resource_node;
  const Icon = cfg.icon;
  return (
    <Card className="border-border">
      <CardHeader className="pb-1 pt-2 px-3">
        <CardTitle className="text-[11px] font-display flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
          {node.name}
          <Badge variant="outline" className="text-[7px] ml-auto">{cfg.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2 space-y-1">
        <div className="grid grid-cols-5 gap-1 text-[9px]">
          {[
            { l: "Strat", v: node.strategic_value },
            { l: "Ekon", v: node.economic_value },
            { l: "Obrana", v: node.defense_value },
            { l: "Mobil", v: node.mobility_relevance },
            { l: "Zásoby", v: node.supply_relevance },
          ].map(s => (
            <div key={s.l} className="bg-muted/40 rounded p-0.5 text-center">
              <span className="text-muted-foreground block text-[7px]">{s.l}</span>
              <span className="font-bold">{s.v}</span>
            </div>
          ))}
        </div>
        <p className="text-[8px] text-muted-foreground">
          Hex: ({node.hex_q}, {node.hex_r})
          {node.metadata?.resource_type && ` · ${node.metadata.resource_type}`}
          {node.metadata?.elevation && ` · elev:${node.metadata.elevation}`}
          {node.metadata?.adjacent_provinces && ` · ${node.metadata.adjacent_provinces} soused`}
        </p>
      </CardContent>
    </Card>
  );
}

/* ─── Province detail card ─── */
function ProvinceCard({ node, strategicNodes }: { node: ProvinceNode; strategicNodes: StrategicNode[] }) {
  const tp = node.terrain_profile;
  const ep = node.economic_profile;
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
          <div className="bg-muted/40 rounded p-1 text-center">
            <span className="text-muted-foreground block">Hexů</span>
            <span className="font-bold">{node.hex_count}</span>
          </div>
          <div className="bg-muted/40 rounded p-1 text-center">
            <span className="text-muted-foreground block">Strat.</span>
            <span className="font-bold">{node.strategic_value}</span>
          </div>
          <div className="bg-muted/40 rounded p-1 text-center">
            <span className="text-muted-foreground block">Nodů</span>
            <span className="font-bold">{myNodes.length}</span>
          </div>
        </div>
        {tp.dominant_biome && (
          <p className="text-[9px] text-muted-foreground">
            Dominantní: <span className="font-semibold text-foreground">{tp.dominant_biome}</span>
            {tp.coastal_hexes ? ` · ${tp.coastal_hexes} pobřeží` : ""}
          </p>
        )}
        {ep.farmland_score !== undefined && (
          <div className="flex gap-2 text-[9px] text-muted-foreground">
            <span>🌾{ep.farmland_score}</span>
            <span>🪵{ep.timber_score}</span>
            <span>⛏{ep.mineral_score}</span>
            <span>🚢{ep.trade_potential}</span>
          </div>
        )}
        {myNodes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {myNodes.map(n => {
              const cfg = NODE_TYPE_ICONS[n.node_type];
              return (
                <Badge key={n.id} variant="secondary" className="text-[7px] gap-0.5">
                  {NODE_TYPE_SHAPES[n.node_type] || "●"} {cfg?.label || n.node_type}
                </Badge>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Main panel ─── */
export default function ProvinceGraphPanel({ sessionId }: Props) {
  const { nodes, edges, strategicNodes, loading, computing, loadGraph, computeGraph, computeNodes } = useProvinceGraph(sessionId);
  const [showNodes, setShowNodes] = useState(true);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  const handleComputeGraph = async () => {
    try {
      const result = await computeGraph();
      toast.success(`Graf: ${result?.adjacency_edges || 0} hran, ${result?.hexes_assigned || 0} hexů`);
    } catch (e: any) { toast.error("Chyba: " + e.message); }
  };

  const handleComputeNodes = async () => {
    try {
      const result = await computeNodes();
      toast.success(`Nody: ${result?.nodes_created || 0} vytvořeno`);
    } catch (e: any) { toast.error("Chyba: " + e.message); }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Network className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Province Graph</h3>
        <Badge variant="outline" className="text-[9px]">Phase 2</Badge>
        <Badge variant="secondary" className="text-[9px] ml-auto">
          {nodes.length} prov · {edges.length} hran · {strategicNodes.length} nodů
        </Badge>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => loadGraph()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Načíst
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleComputeGraph} disabled={computing}>
          <Network className="h-3 w-3" /> Graf
        </Button>
        <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={handleComputeNodes} disabled={computing}>
          {computing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Landmark className="h-3 w-3" />}
          Nody
        </Button>
        <Button size="sm" variant={showNodes ? "secondary" : "ghost"} className="h-7 text-xs gap-1 ml-auto"
          onClick={() => setShowNodes(!showNodes)}>
          {showNodes ? "Skrýt nody" : "Zobrazit nody"}
        </Button>
      </div>

      <Tabs defaultValue="graph">
        <TabsList className="h-7">
          <TabsTrigger value="graph" className="text-[10px] h-6">Graf</TabsTrigger>
          <TabsTrigger value="provinces" className="text-[10px] h-6">Provincie</TabsTrigger>
          <TabsTrigger value="nodes" className="text-[10px] h-6">Strat. nody</TabsTrigger>
          <TabsTrigger value="adjacency" className="text-[10px] h-6">Sousednosti</TabsTrigger>
        </TabsList>

        <TabsContent value="graph" className="mt-2">
          <ProvinceGraphSVG nodes={nodes} edges={edges} strategicNodes={strategicNodes} showNodes={showNodes} />
        </TabsContent>

        <TabsContent value="provinces" className="mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {nodes.map(n => <ProvinceCard key={n.id} node={n} strategicNodes={strategicNodes} />)}
          </div>
        </TabsContent>

        <TabsContent value="nodes" className="mt-2">
          {strategicNodes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Žádné strategické nody. Klikněte "Nody" pro generování.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {strategicNodes.map(n => <StrategicNodeCard key={n.id} node={n} />)}
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
                          {Object.entries(e.border_terrain).map(([b, c]) => `${b}:${c}`).join(", ")}
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
      </Tabs>
    </section>
  );
}
