import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEMAND_BASKETS, TRADE_IDEOLOGIES, GUILD_PROGRESSION, MACRO_DERIVATION, TRADE_FLOW_STATUSES, NODE_CAPABILITY_MAP } from "@/lib/goodsCatalog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Search, Package, ShoppingCart, ArrowLeftRight, BarChart3, BookOpen, Layers } from "lucide-react";

interface Props {
  sessionId: string;
}

const GoodsEconomyDebugPanel = ({ sessionId }: Props) => {
  const [search, setSearch] = useState("");

  // Fetch goods catalog
  const { data: goods } = useQuery({
    queryKey: ["goods-catalog"],
    queryFn: async () => {
      const { data } = await supabase.from("goods").select("*").order("production_stage");
      return data || [];
    },
  });

  // Fetch variants
  const { data: variants } = useQuery({
    queryKey: ["good-variants"],
    queryFn: async () => {
      const { data } = await supabase.from("good_variants").select("*").order("parent_good_key");
      return data || [];
    },
  });

  // Fetch recipes
  const { data: recipes } = useQuery({
    queryKey: ["production-recipes"],
    queryFn: async () => {
      const { data } = await supabase.from("production_recipes").select("*").order("required_role");
      return data || [];
    },
  });

  // Fetch resource types
  const { data: resourceTypes } = useQuery({
    queryKey: ["resource-types"],
    queryFn: async () => {
      const { data } = await supabase.from("resource_types").select("*").order("category");
      return data || [];
    },
  });

  // Fetch demand baskets for this session
  const { data: demandData } = useQuery({
    queryKey: ["demand-baskets", sessionId],
    queryFn: async () => {
      const { data } = await supabase.from("demand_baskets").select("*").eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(100);
      return data || [];
    },
  });

  // Fetch trade flows for this session
  const { data: flowData } = useQuery({
    queryKey: ["trade-flows", sessionId],
    queryFn: async () => {
      const { data } = await supabase.from("trade_flows").select("*").eq("session_id", sessionId).order("trade_pressure", { ascending: false }).limit(100);
      return data || [];
    },
  });

  // Fetch node inventories
  const { data: inventoryData } = useQuery({
    queryKey: ["node-inventory", sessionId],
    queryFn: async () => {
      const { data } = await supabase.from("node_inventory").select("*, province_nodes!inner(session_id, label, node_subtype)").limit(200);
      return (data || []).filter((d: any) => d.province_nodes?.session_id === sessionId);
    },
  });

  const filteredGoods = (goods || []).filter((g: any) =>
    !search || g.key.includes(search.toLowerCase()) || g.display_name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredRecipes = (recipes || []).filter((r: any) =>
    !search || r.recipe_key.includes(search.toLowerCase()) || r.output_good_key.includes(search.toLowerCase())
  );

  const stageColors: Record<string, string> = {
    raw: "bg-emerald-500/20 text-emerald-400",
    processed: "bg-blue-500/20 text-blue-400",
    final: "bg-amber-500/20 text-amber-400",
    luxury: "bg-purple-500/20 text-purple-400",
  };

  const roleColors: Record<string, string> = {
    source: "bg-emerald-500/20 text-emerald-400",
    processing: "bg-blue-500/20 text-blue-400",
    urban: "bg-amber-500/20 text-amber-400",
    guild: "bg-purple-500/20 text-purple-400",
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          📦 Goods Economy v4.1
          <InfoTip>Debug panel pro goods-based ekonomiku. Zobrazuje katalog zboží, recepty, demand baskets, trade flows a inventáře.</InfoTip>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{goods?.length || 0} goods</Badge>
            <Badge variant="outline" className="text-[10px]">{variants?.length || 0} variants</Badge>
            <Badge variant="outline" className="text-[10px]">{recipes?.length || 0} recipes</Badge>
            <Badge variant="outline" className="text-[10px]">{resourceTypes?.length || 0} resources</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Hledat goods, recepty..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <Tabs defaultValue="goods" className="space-y-2">
          <TabsList className="h-8 text-[11px]">
            <TabsTrigger value="goods" className="text-[11px] gap-1"><Package className="h-3 w-3" />Goods</TabsTrigger>
            <TabsTrigger value="recipes" className="text-[11px] gap-1"><Layers className="h-3 w-3" />Recepty</TabsTrigger>
            <TabsTrigger value="demand" className="text-[11px] gap-1"><ShoppingCart className="h-3 w-3" />Demand</TabsTrigger>
            <TabsTrigger value="flows" className="text-[11px] gap-1"><ArrowLeftRight className="h-3 w-3" />Flows</TabsTrigger>
            <TabsTrigger value="macro" className="text-[11px] gap-1"><BarChart3 className="h-3 w-3" />Macro</TabsTrigger>
            <TabsTrigger value="reference" className="text-[11px] gap-1"><BookOpen className="h-3 w-3" />Reference</TabsTrigger>
          </TabsList>

          {/* GOODS TAB */}
          <TabsContent value="goods" className="space-y-2">
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] w-[140px]">Key</TableHead>
                    <TableHead className="text-[10px]">Název</TableHead>
                    <TableHead className="text-[10px]">Stage</TableHead>
                    <TableHead className="text-[10px]">Tier</TableHead>
                    <TableHead className="text-[10px]">Basket</TableHead>
                    <TableHead className="text-[10px]">Cena</TableHead>
                    <TableHead className="text-[10px]">📦</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGoods.map((g: any) => (
                    <TableRow key={g.id} className="text-[11px]">
                      <TableCell className="font-mono text-[10px] py-1">{g.key}</TableCell>
                      <TableCell className="py-1">{g.display_name}</TableCell>
                      <TableCell className="py-1">
                        <Badge className={`text-[9px] ${stageColors[g.production_stage] || ""}`}>{g.production_stage}</Badge>
                      </TableCell>
                      <TableCell className="py-1 text-[10px]">{g.market_tier}</TableCell>
                      <TableCell className="py-1 text-[10px]">{g.demand_basket || "—"}</TableCell>
                      <TableCell className="py-1 font-mono text-[10px]">{g.base_price_numeric}</TableCell>
                      <TableCell className="py-1">{g.storable ? "✓" : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Variants */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold py-1 px-2 hover:bg-muted/50 rounded w-full">
                <ChevronDown className="h-3 w-3" />
                Flavor Variants ({variants?.length || 0})
              </CollapsibleTrigger>
              <CollapsibleContent className="max-h-[200px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Parent</TableHead>
                      <TableHead className="text-[10px]">Variant</TableHead>
                      <TableHead className="text-[10px]">Název</TableHead>
                      <TableHead className="text-[10px]">Qual</TableHead>
                      <TableHead className="text-[10px]">Prestige</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(variants || []).map((v: any) => (
                      <TableRow key={v.id} className="text-[11px]">
                        <TableCell className="font-mono text-[10px] py-1">{v.parent_good_key}</TableCell>
                        <TableCell className="font-mono text-[10px] py-1">{v.variant_key}</TableCell>
                        <TableCell className="py-1">{v.display_name}</TableCell>
                        <TableCell className="py-1 font-mono">{v.quality_modifier > 0 ? `+${v.quality_modifier}` : v.quality_modifier}</TableCell>
                        <TableCell className="py-1 font-mono">{v.prestige_modifier > 0 ? `+${v.prestige_modifier}` : v.prestige_modifier}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* RECIPES TAB */}
          <TabsContent value="recipes" className="max-h-[450px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Recipe</TableHead>
                  <TableHead className="text-[10px]">Output</TableHead>
                  <TableHead className="text-[10px]">Qty</TableHead>
                  <TableHead className="text-[10px]">Role</TableHead>
                  <TableHead className="text-[10px]">Tags</TableHead>
                  <TableHead className="text-[10px]">Inputs</TableHead>
                  <TableHead className="text-[10px]">Labor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecipes.map((r: any) => (
                  <TableRow key={r.id} className="text-[11px]">
                    <TableCell className="font-mono text-[10px] py-1">{r.recipe_key}</TableCell>
                    <TableCell className="py-1">{r.output_good_key}</TableCell>
                    <TableCell className="py-1 font-mono">{r.output_quantity}</TableCell>
                    <TableCell className="py-1">
                      <Badge className={`text-[9px] ${roleColors[r.required_role] || ""}`}>{r.required_role}</Badge>
                    </TableCell>
                    <TableCell className="py-1 text-[10px]">{(r.required_tags || []).join(", ")}</TableCell>
                    <TableCell className="py-1 text-[10px] font-mono">
                      {(r.input_items || []).map((i: any) => `${i.qty}×${i.key}`).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="py-1 font-mono">{r.labor_cost}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          {/* DEMAND TAB */}
          <TabsContent value="demand" className="space-y-3">
            <h4 className="text-xs font-semibold">Demand Basket Definice</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DEMAND_BASKETS.map(b => (
                <div key={b.key} className="rounded-lg border p-2 text-[10px] space-y-1">
                  <div className="font-semibold">{b.icon} {b.label}</div>
                  <div className="text-muted-foreground">Tier {b.tier}</div>
                  <div className="text-muted-foreground">{b.description}</div>
                  <div className="flex gap-1 flex-wrap pt-1">
                    <span title="Rolníci">🧑‍🌾{b.socialWeights.peasants}</span>
                    <span title="Měšťané">🏪{b.socialWeights.burghers}</span>
                    <span title="Klerici">⛪{b.socialWeights.clerics}</span>
                    <span title="Válečníci">⚔️{b.socialWeights.warriors}</span>
                  </div>
                </div>
              ))}
            </div>

            {demandData && demandData.length > 0 && (
              <>
                <h4 className="text-xs font-semibold pt-2">Live Demand Data ({demandData.length} záznamů)</h4>
                <div className="max-h-[200px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Basket</TableHead>
                        <TableHead className="text-[10px]">Tier</TableHead>
                        <TableHead className="text-[10px]">Needed</TableHead>
                        <TableHead className="text-[10px]">Fulfilled</TableHead>
                        <TableHead className="text-[10px]">Satisfaction</TableHead>
                        <TableHead className="text-[10px]">Turn</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {demandData.map((d: any) => (
                        <TableRow key={d.id} className="text-[11px]">
                          <TableCell className="py-1">{d.basket_key}</TableCell>
                          <TableCell className="py-1">{d.tier}</TableCell>
                          <TableCell className="py-1 font-mono">{d.quantity_needed}</TableCell>
                          <TableCell className="py-1 font-mono">{d.quantity_fulfilled}</TableCell>
                          <TableCell className="py-1">
                            <span className={d.satisfaction_score > 0.7 ? "text-green-500" : d.satisfaction_score > 0.3 ? "text-yellow-500" : "text-red-500"}>
                              {(d.satisfaction_score * 100).toFixed(0)}%
                            </span>
                          </TableCell>
                          <TableCell className="py-1">{d.turn_number}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>

          {/* FLOWS TAB */}
          <TabsContent value="flows" className="space-y-3">
            <h4 className="text-xs font-semibold">Trade Flow Status Definice</h4>
            <div className="flex gap-2 flex-wrap">
              {TRADE_FLOW_STATUSES.map(s => (
                <div key={s.key} className="flex items-center gap-1.5 text-[10px]">
                  <span className={`w-2 h-2 rounded-full ${s.color.replace("text-", "bg-")}`} />
                  <span className="font-semibold">{s.label}</span>
                  <span className="text-muted-foreground">— {s.description}</span>
                </div>
              ))}
            </div>

            {flowData && flowData.length > 0 ? (
              <div className="max-h-[300px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Good</TableHead>
                      <TableHead className="text-[10px]">Type</TableHead>
                      <TableHead className="text-[10px]">Volume</TableHead>
                      <TableHead className="text-[10px]">Pressure</TableHead>
                      <TableHead className="text-[10px]">Maturity</TableHead>
                      <TableHead className="text-[10px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flowData.map((f: any) => {
                      const statusDef = TRADE_FLOW_STATUSES.find(s => s.key === f.status);
                      return (
                        <TableRow key={f.id} className="text-[11px]">
                          <TableCell className="py-1 font-mono text-[10px]">{f.good_key}</TableCell>
                          <TableCell className="py-1">{f.flow_type}</TableCell>
                          <TableCell className="py-1 font-mono">{f.volume_per_turn}</TableCell>
                          <TableCell className="py-1 font-mono">{f.trade_pressure?.toFixed(1)}</TableCell>
                          <TableCell className="py-1 font-mono">{f.maturity}</TableCell>
                          <TableCell className="py-1">
                            <Badge variant="outline" className={`text-[9px] ${statusDef?.color || ""}`}>{f.status}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Žádné trade flows v této hře (engine je zatím negeneruje).</p>
            )}
          </TabsContent>

          {/* MACRO TAB */}
          <TabsContent value="macro" className="space-y-3">
            <h4 className="text-xs font-semibold">Macro Integration — jak goods feedují top bar</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(MACRO_DERIVATION).map(([key, m]) => (
                <div key={key} className="rounded-lg border p-3 text-[10px] space-y-1">
                  <div className="font-semibold text-sm">{m.label}</div>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {m.sources.map((s, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-primary shrink-0">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* REFERENCE TAB */}
          <TabsContent value="reference" className="space-y-3">
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold py-1">
                <ChevronDown className="h-3 w-3" />
                Trade Ideologie ({TRADE_IDEOLOGIES.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Ideologie</TableHead>
                      <TableHead className="text-[10px]">Flow ×</TableHead>
                      <TableHead className="text-[10px]">Clo</TableHead>
                      <TableHead className="text-[10px]">Cechy</TableHead>
                      <TableHead className="text-[10px]">Stát</TableHead>
                      <TableHead className="text-[10px]">Import</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {TRADE_IDEOLOGIES.map(t => (
                      <TableRow key={t.key} className="text-[11px]">
                        <TableCell className="py-1">{t.icon} {t.label}</TableCell>
                        <TableCell className="py-1 font-mono">{t.merchantFlowMult}×</TableCell>
                        <TableCell className="py-1 font-mono">{(t.tariffBase * 100).toFixed(0)}%</TableCell>
                        <TableCell className="py-1">{t.guildPower}</TableCell>
                        <TableCell className="py-1">{t.stateCapture}</TableCell>
                        <TableCell className="py-1">{t.importOpenness}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold py-1">
                <ChevronDown className="h-3 w-3" />
                Guild Progression (Lv.1-5)
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Level</TableHead>
                      <TableHead className="text-[10px]">Quality+</TableHead>
                      <TableHead className="text-[10px]">Branch</TableHead>
                      <TableHead className="text-[10px]">Famous %</TableHead>
                      <TableHead className="text-[10px]">Export+</TableHead>
                      <TableHead className="text-[10px]">Capture+</TableHead>
                      <TableHead className="text-[10px]">Politika</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {GUILD_PROGRESSION.map(g => (
                      <TableRow key={g.level} className="text-[11px]">
                        <TableCell className="py-1 font-mono">{g.level}</TableCell>
                        <TableCell className="py-1 font-mono">+{g.qualityBoost}</TableCell>
                        <TableCell className="py-1">{g.branchUnlock ? "✓" : "—"}</TableCell>
                        <TableCell className="py-1 font-mono">{(g.famousGoodChance * 100).toFixed(0)}%</TableCell>
                        <TableCell className="py-1 font-mono">+{(g.exportReach * 100).toFixed(0)}%</TableCell>
                        <TableCell className="py-1 font-mono">+{(g.marketCapture * 100).toFixed(0)}%</TableCell>
                        <TableCell className="py-1">{g.politicalWeight}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold py-1">
                <ChevronDown className="h-3 w-3" />
                Node → Capability Tags Mapping
              </CollapsibleTrigger>
              <CollapsibleContent className="max-h-[300px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Subtype</TableHead>
                      <TableHead className="text-[10px]">Role</TableHead>
                      <TableHead className="text-[10px]">Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(NODE_CAPABILITY_MAP).map(([key, val]) => (
                      <TableRow key={key} className="text-[11px]">
                        <TableCell className="py-1 font-mono text-[10px]">{key}</TableCell>
                        <TableCell className="py-1">
                          <Badge className={`text-[9px] ${roleColors[val.role] || ""}`}>{val.role}</Badge>
                        </TableCell>
                        <TableCell className="py-1 text-[10px]">{val.tags.join(", ") || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default GoodsEconomyDebugPanel;
