import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Coins, Flag } from "lucide-react";

interface Props {
  sessionId: string;
  playerName: string;
}

interface Contribution {
  node_id: string;
  node_name: string;
  status: "trade_open" | "annexed" | "protected" | "vassalized";
  basket_key: string;
  good_key: string | null;
  raw_quantity: number;
  effective_quantity: number;
  route_safety: number;
}

const STATUS_LABEL: Record<string, string> = {
  trade_open: "Obchod",
  protected: "Pod ochranou",
  vassalized: "Vazal",
  annexed: "Anektováno",
};

export default function NeutralNodeContributionPanel({ sessionId, playerName }: Props) {
  const [rows, setRows] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [nodesRes, outputsRes, linksRes] = await Promise.all([
      supabase.from("province_nodes").select("id, name, is_neutral, controlled_by, discovered").eq("session_id", sessionId),
      supabase.from("world_node_outputs").select("node_id, basket_key, good_key, quantity, exportable_ratio").eq("session_id", sessionId),
      supabase.from("node_trade_links").select("node_id, link_status, route_safety").eq("session_id", sessionId).eq("player_name", playerName),
    ]);
    const nodes = nodesRes.data || [];
    const outputs = outputsRes.data || [];
    const links = linksRes.data || [];

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const linkById = new Map(links.map((l) => [l.node_id, l]));
    const outputsByNode = new Map<string, typeof outputs>();
    for (const o of outputs) {
      if (!outputsByNode.has(o.node_id)) outputsByNode.set(o.node_id, []);
      outputsByNode.get(o.node_id)!.push(o);
    }

    const result: Contribution[] = [];
    for (const node of nodes) {
      const outs = outputsByNode.get(node.id) || [];
      if (outs.length === 0) continue;

      // Annexed by player
      if (!node.is_neutral && node.controlled_by === playerName) {
        for (const o of outs) {
          result.push({
            node_id: node.id,
            node_name: node.name,
            status: "annexed",
            basket_key: o.basket_key,
            good_key: o.good_key,
            raw_quantity: Number(o.quantity || 0),
            effective_quantity: Number(o.quantity || 0),
            route_safety: 1,
          });
        }
        continue;
      }

      // Trade-linked neutral
      if (!node.is_neutral || !node.discovered) continue;
      const link = linkById.get(node.id);
      if (!link || !["trade_open", "protected", "vassalized"].includes(link.link_status)) continue;
      const safety = Number(link.route_safety ?? 1);
      for (const o of outs) {
        const raw = Number(o.quantity || 0);
        const eff = raw * Number(o.exportable_ratio || 0.4) * safety;
        if (eff <= 0) continue;
        result.push({
          node_id: node.id,
          node_name: node.name,
          status: link.link_status as Contribution["status"],
          basket_key: o.basket_key,
          good_key: o.good_key,
          raw_quantity: raw,
          effective_quantity: eff,
          route_safety: safety,
        });
      }
    }

    result.sort((a, b) => b.effective_quantity - a.effective_quantity);
    setRows(result);
    setLoading(false);
  }, [sessionId, playerName]);

  useEffect(() => { load(); }, [load]);

  const totalByBasket = new Map<string, number>();
  for (const r of rows) {
    totalByBasket.set(r.basket_key, (totalByBasket.get(r.basket_key) || 0) + r.effective_quantity);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Coins className="h-4 w-4" /> Příspěvek z neutrálních uzlů
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Načítání…</div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Zatím žádný příspěvek z neutrálních uzlů. Otevři obchod nebo anektuj objevený uzel.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(totalByBasket.entries()).map(([bk, q]) => (
                <Badge key={bk} variant="secondary" className="text-[10px] font-mono">
                  {bk}: +{q.toFixed(1)}
                </Badge>
              ))}
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Uzel</th>
                    <th className="text-left px-2 py-1.5 font-medium">Stav</th>
                    <th className="text-left px-2 py-1.5 font-medium">Koš / zboží</th>
                    <th className="text-right px-2 py-1.5 font-medium">Surové</th>
                    <th className="text-right px-2 py-1.5 font-medium">Efektivní</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1.5 font-medium">{r.node_name}</td>
                      <td className="px-2 py-1.5">
                        <span className="inline-flex items-center gap-1">
                          {r.status === "annexed" && <Flag className="h-3 w-3 text-primary" />}
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">
                        {r.good_key || r.basket_key}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{r.raw_quantity.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold">
                        {r.effective_quantity.toFixed(1)}
                        {r.status !== "annexed" && (
                          <span className="text-[9px] text-muted-foreground ml-1">×{r.route_safety.toFixed(2)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
