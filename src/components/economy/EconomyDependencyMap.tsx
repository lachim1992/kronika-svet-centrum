import { useState, useEffect } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  realm?: any;
  cities?: any[];
  armies?: any[];
  sessionId?: string;
  playerName?: string;
}

interface FlowNode {
  id: string;
  label: string;
  value: string;
  description: string;
  color: string;
  outputs: string[];
  tier: number; // 0=source, 1=processing, 2=urban, 3=market, 4=macro
}

const EconomyDependencyMap = ({ realm, cities = [], armies = [], sessionId, playerName }: Props) => {
  const [goodsCount, setGoodsCount] = useState(0);
  const [recipesCount, setRecipesCount] = useState(0);
  const [flowsCount, setFlowsCount] = useState(0);
  const [inventoryTotal, setInventoryTotal] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    const fetchLive = async () => {
      const [g, r, f, inv] = await Promise.all([
        supabase.from("goods" as any).select("key", { count: "exact", head: true }),
        supabase.from("production_recipes" as any).select("id", { count: "exact", head: true }),
        supabase.from("trade_flows" as any).select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("node_inventory" as any).select("quantity").eq("session_id", sessionId),
      ]);
      setGoodsCount(g.count || 0);
      setRecipesCount(r.count || 0);
      setFlowsCount(f.count || 0);
      setInventoryTotal(((inv.data as any[]) || []).reduce((s: number, r: any) => s + (r.quantity || 0), 0));
    };
    fetchLive();
  }, [sessionId]);

  const totalPop = cities.reduce((s, c) => s + (c.population_total || 0), 0);
  const totalProduction = realm?.total_production ?? 0;
  const totalWealth = realm?.total_wealth ?? 0;
  const grainReserve = realm?.grain_reserve ?? 0;
  const faith = realm?.faith ?? 0;
  const goldReserve = realm?.gold_reserve ?? 0;
  const taxMarket = realm?.tax_market ?? 0;
  const taxTransit = realm?.tax_transit ?? 0;
  const taxExtraction = realm?.tax_extraction ?? 0;
  const retention = realm?.commercial_retention ?? 0;
  const capture = realm?.commercial_capture ?? 0;

  const tiers: { label: string; nodes: FlowNode[] }[] = [
    {
      label: "🏔️ Extrakce",
      nodes: [
        {
          id: "hex_resources", label: "⛏️ Hex suroviny", tier: 0,
          value: `${inventoryTotal} ks`, description: "Přírodní zdroje na hexech: rudy, dřevo, obilí, kámen. Množství a kvalita závisí na biomu.",
          color: "bg-amber-500/10 border-amber-500/30", outputs: ["source_nodes"],
        },
        {
          id: "source_nodes", label: "🏭 Source Nodes", tier: 0,
          value: "", description: "Uzly s rolí 'source' těží suroviny. Výtěžek = base_yield × quality × workforce.",
          color: "bg-orange-500/10 border-orange-500/30", outputs: ["processing_nodes"],
        },
      ],
    },
    {
      label: "⚙️ Zpracování",
      nodes: [
        {
          id: "processing_nodes", label: "🔧 Processing Nodes", tier: 1,
          value: `${recipesCount} receptů`, description: "Přeměňují raw suroviny na zpracované polotovary dle receptů. Efektivita závisí na capability_tags.",
          color: "bg-blue-500/10 border-blue-500/30", outputs: ["urban_nodes"],
        },
      ],
    },
    {
      label: "🏙️ Městská výroba",
      nodes: [
        {
          id: "urban_nodes", label: "🏘️ Urban Nodes", tier: 2,
          value: `${goodsCount} goods`, description: "Města vyrábí finální goods: chléb, textil, zbraně, luxus. Guildy zvyšují kvalitu a odemykají varianty.",
          color: "bg-violet-500/10 border-violet-500/30", outputs: ["city_market"],
        },
        {
          id: "guild_nodes", label: "🏛️ Guildy", tier: 2,
          value: "", description: "Cechová tradice → branch mastery → slavné goods. Varianty dekorují, ale nepřebíjí systémovou ekonomiku.",
          color: "bg-purple-500/10 border-purple-500/30", outputs: ["city_market"],
        },
      ],
    },
    {
      label: "🛒 Trh & Obchod",
      nodes: [
        {
          id: "city_market", label: "🏪 Městský trh", tier: 3,
          value: "", description: "Agreguje nabídku a poptávku goods. Demand baskets per social layer (staple, variety, ritual, prestige).",
          color: "bg-emerald-500/10 border-emerald-500/30", outputs: ["demand_baskets", "trade_pressure"],
        },
        {
          id: "demand_baskets", label: "📦 Demand Baskets", tier: 3,
          value: "", description: "Need (tier 1-2) → Upgrade (tier 3) → Prestige (tier 4-5). Spokojenost vrstev závisí na naplnění košů.",
          color: "bg-lime-500/10 border-lime-500/30", outputs: ["macro_pop", "macro_stability"],
        },
        {
          id: "trade_pressure", label: "📊 Trade Pressure", tier: 3,
          value: `${flowsCount} toků`, description: "Tlak = (need × 1.0) + (upgrade × 0.6) + (variety × 0.4) − price_delta − friction. Vytváří obchodní toky.",
          color: "bg-cyan-500/10 border-cyan-500/30", outputs: ["trade_flows"],
        },
        {
          id: "trade_flows", label: "🔄 Trade Flows", tier: 3,
          value: "", description: "City-to-city toky: trial → active → dominant. Závisí na trade_ideology (open_merchant, crown_mercantile, guild_protectionist).",
          color: "bg-teal-500/10 border-teal-500/30", outputs: ["retention", "capture"],
        },
      ],
    },
    {
      label: "💎 Fiskální zachycení",
      nodes: [
        {
          id: "retention", label: "🏠 Retention", tier: 4,
          value: `${(retention * 100).toFixed(0)}%`, description: "Domácí retention = podíl poptávky naplněné domácí produkcí. Vyšší = silnější domácí ekonomika.",
          color: retention > 0.5 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-amber-500/10 border-amber-500/30",
          outputs: ["taxation"],
        },
        {
          id: "capture", label: "🎯 Capture", tier: 4,
          value: `${(capture * 100).toFixed(0)}%`, description: "Exportní capture = podíl cizí poptávky naplněné vaším exportem. Zdroj příjmu z mezinárodního obchodu.",
          color: "bg-yellow-500/10 border-yellow-500/30", outputs: ["taxation"],
        },
        {
          id: "taxation", label: "🏛️ Taxation", tier: 4,
          value: `${(taxMarket + taxTransit + taxExtraction).toFixed(1)}`,
          description: `Market: ${taxMarket.toFixed(1)} | Transit: ${taxTransit.toFixed(1)} | Extraction: ${taxExtraction.toFixed(1)}`,
          color: "bg-yellow-500/10 border-yellow-500/30", outputs: ["macro_wealth"],
        },
      ],
    },
    {
      label: "⭐ Makro agregáty (top bar)",
      nodes: [
        {
          id: "macro_prod", label: "⚒️ Produkce", tier: 5,
          value: totalProduction.toFixed(1),
          description: "Agregovaný výkon produkčních chainů (source + processing + urban efficiency).",
          color: "bg-primary/10 border-primary/30", outputs: [],
        },
        {
          id: "macro_wealth", label: "💰 Bohatství", tier: 5,
          value: `${Math.round(goldReserve)}`,
          description: "Fiskálně zachycená tržní aktivita (pop_tax + market_tax + transit + extraction + capture).",
          color: "bg-primary/10 border-primary/30", outputs: [],
        },
        {
          id: "macro_supplies", label: "🌾 Zásoby", tier: 5,
          value: `${Math.round(grainReserve)}`,
          description: "Agregovaná rezerva skladovatelných survival/logistics goods.",
          color: "bg-primary/10 border-primary/30", outputs: [],
        },
        {
          id: "macro_faith", label: "⛪ Víra", tier: 5,
          value: `${Math.round(faith)}`,
          description: "Síla ritual economy: naplnění ritual basketů + cleric satisfaction.",
          color: "bg-primary/10 border-primary/30", outputs: [],
        },
        {
          id: "macro_pop", label: "👥 Populace", tier: 5,
          value: totalPop.toLocaleString(),
          description: "Demografická odezva na ekonomické podmínky: staple fulfillment + urban pull.",
          color: "bg-primary/10 border-primary/30", outputs: [],
        },
        {
          id: "macro_stability", label: "🛡️ Stabilita", tier: 5,
          value: "", description: "Průměr city_stability. Ovlivněna demand basket satisfaction.",
          color: "bg-primary/10 border-primary/30", outputs: [],
        },
      ],
    },
  ];

  const allNodes = tiers.flatMap(t => t.nodes);

  const keyRelations = [
    { from: "⛏️", to: "🏭", label: "biom → resource_deposits" },
    { from: "🏭", to: "🔧", label: "raw → processed (recepty)" },
    { from: "🔧", to: "🏘️", label: "polotovary → final goods" },
    { from: "🏛️", to: "🏪", label: "guild quality + varianty" },
    { from: "🏪", to: "📦", label: "nabídka vs. poptávka košů" },
    { from: "📦", to: "👥", label: "staple fulfillment → růst" },
    { from: "📊", to: "🔄", label: "tlak → trial → active flow" },
    { from: "🔄", to: "🏠", label: "domácí vs. importní podíl" },
    { from: "🔄", to: "🎯", label: "export podíl cizí poptávky" },
    { from: "🏛️ Tax", to: "💰", label: `+${(taxMarket + taxTransit + taxExtraction).toFixed(1)}/kolo` },
    { from: "🎯", to: "💰", label: `capture +${(capture * 100).toFixed(0)}%` },
  ];

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          🔗 Mapa závislostí — Goods Economy v4.1
          <InfoTip>Zobrazuje kompletní produkční řetězec: hex → source → processing → urban/guild → city market → demand/trade → fiscal capture → makro agregáty (top bar). Živé hodnoty z DB.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-4">
        {tiers.map((tier, ti) => (
          <div key={ti}>
            <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              {tier.label}
              {ti < tiers.length - 1 && <ArrowDown className="h-3 w-3 ml-auto text-muted-foreground/50" />}
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {tier.nodes.map(node => (
                <div
                  key={node.id}
                  className={`rounded-lg border p-3 text-xs space-y-1 ${node.color}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-sm">{node.label}</span>
                    {node.value && (
                      <span className="font-mono font-bold text-primary text-sm">{node.value}</span>
                    )}
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{node.description}</p>
                  {node.outputs.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                      {node.outputs.map(o => {
                        const target = allNodes.find(n => n.id === o);
                        return (
                          <span key={o} className="text-[10px] bg-muted/60 rounded px-1.5 py-0.5 font-medium">
                            {target?.label.split(" ").slice(1).join(" ") || o}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Key relationships */}
        <div className="border-t border-border pt-3 space-y-1.5">
          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Klíčové vztahy (živá data)</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
            {keyRelations.map((c, i) => (
              <div key={i} className="flex items-center gap-1 text-muted-foreground">
                <span className="font-medium text-foreground">{c.from}</span>
                <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                <span className="font-medium text-foreground">{c.to}</span>
                <span className="text-[10px]">({c.label})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Design rule */}
        <div className="bg-muted/40 rounded-lg p-3 text-[10px] text-muted-foreground space-y-0.5">
          <div className="font-semibold text-foreground text-[11px]">Pravidlo:</div>
          <div>Goods economy = simulační vrstva; makro ukazatele = strategický dashboard.</div>
          <div>Varianty dekorují a ovlivňují, ale nepřebíjí ekonomiku systémových goods.</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EconomyDependencyMap;
