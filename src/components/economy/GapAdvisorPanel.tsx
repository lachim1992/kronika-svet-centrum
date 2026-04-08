import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import { Loader2, Sparkles, AlertTriangle, TrendingUp, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  playerName: string;
  cities: any[];
}

interface Recommendation {
  title: string;
  description: string;
  priority: "critical" | "important" | "improvement";
  impact: string;
  targetCity?: string;
  actionType: string;
}

const PRIORITY_META: Record<string, { label: string; color: string; icon: string }> = {
  critical: { label: "KRITICKÉ", color: "text-destructive", icon: "🔴" },
  important: { label: "DŮLEŽITÉ", color: "text-amber-500", icon: "🟡" },
  improvement: { label: "VYLEPŠENÍ", color: "text-blue-500", icon: "🔵" },
};

const ACTION_ICONS: Record<string, string> = {
  build: "🏗️", trade: "🔄", recipe: "🔧", policy: "📜", military: "⚔️",
};

const GapAdvisorPanel = ({ sessionId, playerName, cities }: Props) => {
  const [gaps, setGaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [advising, setAdvising] = useState(false);

  const myCityIds = useMemo(() => new Set(
    cities.filter(c => c.owner_player === playerName).map(c => c.id)
  ), [cities, playerName]);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      // Get node IDs for player's cities
      const { data: nodes } = await supabase
        .from("province_nodes")
        .select("id, city_id, name")
        .eq("session_id", sessionId)
        .not("city_id", "is", null);

      const myNodeIds = (nodes || [])
        .filter((n: any) => myCityIds.has(n.city_id))
        .map((n: any) => n.id);

      const nodeToName = new Map((nodes || []).map((n: any) => [n.id, n.name]));
      const nodeToCityId = new Map((nodes || []).map((n: any) => [n.id, n.city_id]));

      if (myNodeIds.length === 0) { setGaps([]); setLoading(false); return; }

      const [basketsRes, marketRes] = await Promise.all([
        supabase.from("demand_baskets")
          .select("basket_key, fulfillment_type, quantity_needed, quantity_fulfilled, satisfaction_score, city_id, tier")
          .eq("session_id", sessionId)
          .in("city_id", myNodeIds)
          .limit(500),
        supabase.from("city_market_summary")
          .select("good_key, supply_volume, demand_volume, city_node_id")
          .eq("session_id", sessionId)
          .in("city_node_id", myNodeIds)
          .limit(500),
      ]);

      // Build gap list from demand baskets
      const basketGaps = (basketsRes.data || [])
        .filter((b: any) => b.quantity_fulfilled < b.quantity_needed * 0.8)
        .map((b: any) => {
          const cityId = nodeToCityId.get(b.city_id);
          const cityName = cities.find((c: any) => c.id === cityId)?.name || nodeToName.get(b.city_id) || "?";
          const deficit = b.quantity_needed - b.quantity_fulfilled;
          const satPct = b.quantity_needed > 0 ? b.quantity_fulfilled / b.quantity_needed : 1;
          return {
            key: b.basket_key,
            fulfillmentType: b.fulfillment_type,
            tier: b.tier,
            deficit,
            satPct,
            cityName,
            needed: b.quantity_needed,
            fulfilled: b.quantity_fulfilled,
          };
        })
        .sort((a: any, b: any) => {
          // Sort: need > upgrade > prestige, then by deficit
          const ftOrder: Record<string, number> = { need: 0, upgrade: 1, prestige: 2 };
          const ftDiff = (ftOrder[a.fulfillmentType] ?? 3) - (ftOrder[b.fulfillmentType] ?? 3);
          if (ftDiff !== 0) return ftDiff;
          return b.deficit - a.deficit;
        });

      setGaps(basketGaps);
      setLoading(false);
    };
    fetch();
  }, [sessionId, myCityIds, cities]);

  const handleAskAdvisor = async () => {
    setAdvising(true);
    try {
      const { data, error } = await supabase.functions.invoke("economy-advisor", {
        body: { sessionId, playerName },
      });
      if (error) throw error;
      setRecommendations(data?.recommendations || []);
      setAiSummary(data?.summary || "");
    } catch (e: any) {
      if (e?.message?.includes("429") || e?.status === 429) {
        toast.error("Příliš mnoho požadavků, zkuste později");
      } else if (e?.message?.includes("402") || e?.status === 402) {
        toast.error("Nedostatek kreditů pro AI");
      } else {
        toast.error("Chyba AI poradce", { description: e?.message });
      }
    } finally {
      setAdvising(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Gap list */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            🎯 Chybějící zboží ({gaps.length})
            <InfoTip>Zboží kde poptávka převyšuje nabídku o víc než 20%. Seřazeno dle urgence — NEED vrstva nejdřív.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 space-y-2 max-h-72 overflow-y-auto">
          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">✅ Všechna poptávka je dostatečně pokryta!</p>
          ) : gaps.map((g, i) => {
            const ftMeta = PRIORITY_META[g.fulfillmentType === "need" ? "critical" : g.fulfillmentType === "upgrade" ? "important" : "improvement"];
            return (
              <div key={`${g.key}-${g.cityName}-${i}`} className="rounded-lg border border-border/40 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{ftMeta.icon}</span>
                    <span className="text-sm font-semibold">{g.key}</span>
                    <Badge variant="outline" className={`text-[8px] ${ftMeta.color}`}>
                      {g.fulfillmentType?.toUpperCase()}
                    </Badge>
                  </div>
                  <span className={`text-sm font-mono font-bold ${g.satPct >= 0.5 ? "text-amber-500" : "text-destructive"}`}>
                    {(g.satPct * 100).toFixed(0)}%
                  </span>
                </div>
                <Progress value={g.satPct * 100} className="h-1.5" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>🏙️ {g.cityName}</span>
                  <span>Deficit: <span className="text-destructive font-semibold">{g.deficit.toFixed(0)}</span> ({g.fulfilled.toFixed(0)}/{g.needed.toFixed(0)})</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* AI Advisor */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Ekonomický poradce
            <InfoTip>AI analyzuje vaši poptávku, produkci a dostupné recepty a navrhne konkrétní kroky.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 space-y-3">
          <Button
            onClick={handleAskAdvisor}
            disabled={advising}
            className="w-full gap-2"
            variant={recommendations.length > 0 ? "outline" : "default"}
          >
            {advising ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {advising ? "Analyzuji ekonomiku…" : recommendations.length > 0 ? "Znovu analyzovat" : "Zeptej se poradce"}
          </Button>

          {aiSummary && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
              {aiSummary}
            </div>
          )}

          {recommendations.map((rec, i) => {
            const pMeta = PRIORITY_META[rec.priority] || PRIORITY_META.improvement;
            return (
              <div key={i} className="rounded-lg border border-border/40 p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-lg">{ACTION_ICONS[rec.actionType] || "📌"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{rec.title}</span>
                      <Badge variant="outline" className={`text-[8px] ${pMeta.color}`}>{pMeta.label}</Badge>
                      {rec.targetCity && (
                        <Badge variant="secondary" className="text-[8px]">🏙️ {rec.targetCity}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{rec.description}</p>
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-primary">
                      <TrendingUp className="h-3 w-3" />
                      <span>{rec.impact}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default GapAdvisorPanel;
