import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import { Loader2 } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  sessionId: string;
  playerName: string;
}

const TIER_LABELS: Record<number, string> = { 1: "Staple", 2: "Variety", 3: "Upgrade", 4: "Prestige", 5: "Luxury" };
const TIER_COLORS: Record<number, string> = { 1: "bg-emerald-500", 2: "bg-blue-500", 3: "bg-amber-500", 4: "bg-purple-500", 5: "bg-yellow-500" };

const GoodsDemandSubTab = ({ sessionId, playerName }: Props) => {
  const [goods, setGoods] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [demandBaskets, setDemandBaskets] = useState<any[]>([]);
  const [marketSummary, setMarketSummary] = useState<any[]>([]);
  const [tradeFlows, setTradeFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [g, r, d, m, t] = await Promise.all([
        supabase.from("goods").select("*").order("tier").limit(100),
        supabase.from("production_recipes").select("*").limit(200),
        supabase.from("demand_baskets").select("*").eq("session_id", sessionId).limit(200),
        supabase.from("city_market_summary").select("*").eq("session_id", sessionId).limit(500),
        supabase.from("trade_flows").select("*").eq("session_id", sessionId).limit(200),
      ]);
      setGoods(g.data || []);
      setRecipes(r.data || []);
      setDemandBaskets(d.data || []);
      setMarketSummary(m.data || []);
      setTradeFlows(t.data || []);
      setLoading(false);
    };
    fetch();
  }, [sessionId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  // Group goods by tier
  const goodsByTier = goods.reduce((acc: Record<number, any[]>, g) => {
    const t = g.tier || 1;
    if (!acc[t]) acc[t] = [];
    acc[t].push(g);
    return acc;
  }, {});

  // Demand fulfillment per city
  const basketsByCity = demandBaskets.reduce((acc: Record<string, any[]>, b) => {
    if (!acc[b.city_id]) acc[b.city_id] = [];
    acc[b.city_id].push(b);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Tabs defaultValue="goods">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="goods">📦 Goods ({goods.length})</TabsTrigger>
          <TabsTrigger value="recipes">🔧 Recepty ({recipes.length})</TabsTrigger>
          <TabsTrigger value="demand">📊 Demand ({demandBaskets.length})</TabsTrigger>
          <TabsTrigger value="trade">🔄 Toky ({tradeFlows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="goods" className="space-y-3 mt-3">
          {Object.entries(goodsByTier).map(([tier, items]) => (
            <Card key={tier}>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${TIER_COLORS[Number(tier)] || "bg-muted"}`} />
                  Tier {tier}: {TIER_LABELS[Number(tier)] || "Unknown"} ({(items as any[]).length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {(items as any[]).map((g: any) => (
                    <Badge key={g.key} variant="secondary" className="text-[10px] gap-1">
                      {g.icon || "📦"} {g.label}
                      {g.storable && <span className="text-[8px] text-muted-foreground">📥</span>}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="recipes" className="mt-3">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs px-3">Recept</TableHead>
                    <TableHead className="text-xs px-3">Vstupy</TableHead>
                    <TableHead className="text-xs px-3">Výstup</TableHead>
                    <TableHead className="text-xs px-3 text-center">Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipes.slice(0, 50).map((r: any) => {
                    const inputs = (r.inputs as any[] || []);
                    const outputs = (r.outputs as any[] || []);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs px-3 font-semibold">{r.recipe_key}</TableCell>
                        <TableCell className="text-[10px] px-3">
                          {inputs.map((i: any, idx: number) => (
                            <span key={idx}>{i.good_key}×{i.qty}{idx < inputs.length - 1 ? " + " : ""}</span>
                          ))}
                        </TableCell>
                        <TableCell className="text-[10px] px-3">
                          {outputs.map((o: any, idx: number) => (
                            <span key={idx} className="font-semibold">{o.good_key}×{o.qty}{idx < outputs.length - 1 ? " + " : ""}</span>
                          ))}
                        </TableCell>
                        <TableCell className="text-center px-3">
                          <Badge variant="outline" className="text-[9px]">{r.production_role}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="demand" className="space-y-3 mt-3">
          {Object.entries(basketsByCity).length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Žádné demand baskets — spusťte compute-trade-flows</CardContent></Card>
          ) : (
            Object.entries(basketsByCity).map(([cityId, baskets]) => (
              <Card key={cityId}>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs">🏙️ {cityId.slice(0, 8)}… ({(baskets as any[]).length} košů)</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-1 space-y-2">
                  {(baskets as any[]).map((b: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-24 truncate font-semibold">{b.basket_type}</span>
                      <Progress value={(b.satisfaction || 0) * 100} className="h-1.5 flex-1" />
                      <span className="font-mono w-10 text-right">{((b.satisfaction || 0) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="trade" className="mt-3">
          <Card>
            <CardContent className="p-0">
              {tradeFlows.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Žádné obchodní toky</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs px-3">Status</TableHead>
                      <TableHead className="text-xs px-3">Good</TableHead>
                      <TableHead className="text-xs px-3 text-right">Objem</TableHead>
                      <TableHead className="text-xs px-3 text-right">Pressure</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tradeFlows.slice(0, 30).map((f: any) => (
                      <TableRow key={f.id}>
                        <TableCell className="px-3">
                          <Badge variant={f.status === "dominant" ? "default" : "secondary"} className="text-[9px]">{f.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs px-3 font-semibold">{f.good_key}</TableCell>
                        <TableCell className="text-xs px-3 text-right font-mono">{(f.volume || 0).toFixed(1)}</TableCell>
                        <TableCell className="text-xs px-3 text-right font-mono">{(f.pressure_score || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GoodsDemandSubTab;
