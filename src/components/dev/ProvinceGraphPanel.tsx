import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Network, RefreshCw, MapPin, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { useProvinceGraph, type ProvinceNode, type ProvinceEdge } from "@/hooks/useProvinceGraph";

interface Props {
  sessionId: string;
}

const GRAPH_COLORS = [
  "hsl(210,60%,50%)", "hsl(30,70%,50%)", "hsl(120,50%,40%)", "hsl(0,60%,50%)",
  "hsl(270,50%,50%)", "hsl(60,60%,45%)", "hsl(180,50%,40%)", "hsl(330,50%,50%)",
  "hsl(150,50%,40%)", "hsl(45,60%,50%)",
];

/* ─── SVG graph vis ─── */
function ProvinceGraphSVG({ nodes, edges }: { nodes: ProvinceNode[]; edges: ProvinceEdge[] }) {
  if (nodes.length === 0) return <p className="text-xs text-muted-foreground text-center py-6">Žádné provincie</p>;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  // Layout: use center_q/r as coordinates
  const qs = nodes.map(n => n.center_q);
  const rs = nodes.map(n => n.center_r);
  const minQ = Math.min(...qs), maxQ = Math.max(...qs);
  const minR = Math.min(...rs), maxR = Math.max(...rs);
  const rangeQ = maxQ - minQ || 1;
  const rangeR = maxR - minR || 1;
  const W = 500, H = 360, PAD = 50;

  const pos = (n: ProvinceNode) => ({
    x: PAD + ((n.center_q - minQ) / rangeQ) * (W - PAD * 2),
    y: PAD + ((n.center_r - minR) / rangeR) * (H - PAD * 2),
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-border rounded-lg bg-card">
      {/* Edges */}
      {edges.map(e => {
        const a = nodeMap.get(e.province_a);
        const b = nodeMap.get(e.province_b);
        if (!a || !b) return null;
        const pa = pos(a), pb = pos(b);
        return (
          <line key={e.id} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke="hsl(var(--muted-foreground))" strokeWidth={Math.max(1, e.border_length / 3)}
            opacity={0.4} strokeDasharray={e.is_contested ? "4 2" : undefined} />
        );
      })}
      {/* Edge labels */}
      {edges.map(e => {
        const a = nodeMap.get(e.province_a);
        const b = nodeMap.get(e.province_b);
        if (!a || !b) return null;
        const pa = pos(a), pb = pos(b);
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
        return (
          <text key={`lbl-${e.id}`} x={mx} y={my - 4} textAnchor="middle" fontSize="8"
            fill="hsl(var(--muted-foreground))" opacity={0.7}>
            {e.border_length}
          </text>
        );
      })}
      {/* Nodes */}
      {nodes.map(n => {
        const p = pos(n);
        const r = 8 + Math.min(n.hex_count, 20);
        const color = GRAPH_COLORS[n.color_index % GRAPH_COLORS.length];
        return (
          <g key={n.id}>
            <circle cx={p.x} cy={p.y} r={r} fill={color} opacity={0.7} stroke="white" strokeWidth={1.5} />
            <text x={p.x} y={p.y + r + 10} textAnchor="middle" fontSize="8"
              fill="hsl(var(--foreground))" fontWeight="600">
              {n.name.length > 14 ? n.name.slice(0, 12) + "…" : n.name}
            </text>
            <text x={p.x} y={p.y + r + 19} textAnchor="middle" fontSize="7"
              fill="hsl(var(--muted-foreground))">
              {n.owner_player.length > 12 ? n.owner_player.slice(0, 10) + "…" : n.owner_player}
            </text>
            <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="8" fill="white" fontWeight="700">
              {n.hex_count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Province detail card ─── */
function ProvinceCard({ node }: { node: ProvinceNode }) {
  const tp = node.terrain_profile;
  const ep = node.economic_profile;
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
            <span className="text-muted-foreground block">Elev.</span>
            <span className="font-bold">{tp.avg_elevation ?? "?"}</span>
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
      </CardContent>
    </Card>
  );
}

/* ─── Main panel ─── */
export default function ProvinceGraphPanel({ sessionId }: Props) {
  const { nodes, edges, loading, computing, loadGraph, computeGraph } = useProvinceGraph(sessionId);
  const [view, setView] = useState<"graph" | "list">("graph");

  useEffect(() => { loadGraph(); }, [loadGraph]);

  const handleCompute = async () => {
    try {
      const result = await computeGraph();
      toast.success(`Graf vypočten: ${result?.adjacency_edges || 0} hran, ${result?.hexes_assigned || 0} hexů přiřazeno`);
    } catch (e: any) {
      toast.error("Chyba: " + e.message);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Network className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Province Graph</h3>
        <Badge variant="outline" className="text-[9px]">Phase 1</Badge>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant={view === "graph" ? "default" : "outline"} className="h-6 text-[10px] px-2"
            onClick={() => setView("graph")}>Graf</Button>
          <Button size="sm" variant={view === "list" ? "default" : "outline"} className="h-6 text-[10px] px-2"
            onClick={() => setView("list")}>Seznam</Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => loadGraph()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Načíst
        </Button>
        <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={handleCompute} disabled={computing}>
          {computing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Network className="h-3 w-3" />}
          Vypočítat graf
        </Button>
        <Badge variant="secondary" className="text-[9px] ml-auto">
          {nodes.length} provincií · {edges.length} hran
        </Badge>
      </div>

      {view === "graph" ? (
        <ProvinceGraphSVG nodes={nodes} edges={edges} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {nodes.map(n => <ProvinceCard key={n.id} node={n} />)}
        </div>
      )}

      {/* Adjacency table */}
      {edges.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-display font-semibold flex items-center gap-1">
            <ArrowRightLeft className="h-3 w-3" /> Sousednosti
          </h4>
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
        </div>
      )}

      {nodes.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Zatím žádný graf. Klikněte "Vypočítat graf" pro analýzu hexů.
        </p>
      )}
    </section>
  );
}
