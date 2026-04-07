import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Download, Copy, AlertTriangle, CheckCircle, XCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

// ═══════════════════════════════════════════
// CAUSAL MAP DATA
// ═══════════════════════════════════════════

type LinkStatus = "active" | "partial" | "blind" | "planned";

interface CausalLink {
  from: string;
  to: string;
  effect: string;
  status: LinkStatus;
  where: string; // file/function where implemented
}

const CAUSAL_LINKS: CausalLink[] = [
  // HEX → NODE
  { from: "biome_family", to: "movement_cost", effect: "BIOME_TRAVERSAL_COST lookup (plains=1.0 … mountain=12.0)", status: "active", where: "physics.ts → hexTraversalCost" },
  { from: "mean_height", to: "movement_cost", effect: "+5× per unit above 0.7", status: "active", where: "physics.ts → hexTraversalCost" },
  { from: "has_river + !has_bridge", to: "movement_cost", effect: "+3.0 traversal penalty", status: "active", where: "physics.ts → hexTraversalCost" },
  { from: "is_passable", to: "movement_cost", effect: "false → Infinity (impassable)", status: "active", where: "physics.ts → hexTraversalCost" },
  { from: "coastal", to: "movement_cost", effect: "×0.9 discount (coastal trade)", status: "active", where: "physics.ts → hexTraversalCost" },
  { from: "infrastructure_level", to: "movement_cost", effect: "−15%/−30%/−45% per level", status: "active", where: "physics.ts → hexTraversalCost" },
  { from: "biome_family", to: "node_suggestion", effect: "suggestMinorType / suggestMicroType", status: "active", where: "nodeTypes.ts" },
  { from: "biome_match", to: "node_production", effect: "Match=1.0×, Mismatch=0.6×", status: "active", where: "nodeTypes.ts → computeNodeProduction" },
  // NODE → ECONOMY
  { from: "node_type", to: "base_production", effect: "BASE_PRODUCTION lookup (resource=8, village=6, …)", status: "active", where: "economyFlow.ts" },
  { from: "flow_role", to: "trade_efficiency", effect: "ROLE_TRADE_EFFICIENCY (hub=1.0, gateway=0.8, …)", status: "active", where: "economyFlow.ts" },
  { from: "upgrade_level", to: "node_production", effect: "×(1 + (level−1) × upgradeBonus)", status: "active", where: "nodeTypes.ts → computeNodeProduction" },
  { from: "node_upkeep", to: "supplies/wealth drain", effect: "Per-tier fixed upkeep (supplies + wealth)", status: "active", where: "nodeTypes.ts" },
  // ROUTE → FLOW
  { from: "route.path_dirty", to: "recompute trigger", effect: "Dirty routes recomputed in compute-hex-flows", status: "active", where: "compute-hex-flows/index.ts" },
  { from: "flow_path.total_cost", to: "route efficiency", effect: "Higher cost = worse trade throughput", status: "active", where: "compute-economy-flow" },
  { from: "flow_path.bottleneck", to: "route vulnerability", effect: "Highest single-hex cost = chokepoint", status: "active", where: "compute-hex-flows" },
  { from: "route.control_state=blocked", to: "skip computation", effect: "Blocked routes skipped in path calc", status: "active", where: "compute-hex-flows" },
  // CONTROL & POLITICS
  { from: "controlled_by (hostile)", to: "movement_cost", effect: "×1.5 in foreign territory", status: "active", where: "physics.ts → hexTraversalCost" },
  { from: "has_fortress (own)", to: "movement_cost", effect: "×0.7 safe corridor", status: "active", where: "physics.ts → hexTraversalCost" },
  { from: "has_fortress (enemy)", to: "movement_cost", effect: "×2.5 massive choke", status: "active", where: "physics.ts → hexTraversalCost" },
  { from: "is_contested", to: "movement_cost", effect: "×1.8 penalty", status: "active", where: "physics.ts → hexTraversalCost" },
  { from: "trade_density", to: "movement_cost", effect: "×max(0.6, 1−density×0.004) established corridor discount", status: "active", where: "physics.ts → hexTraversalCost" },
  // MACRO REGIONS
  { from: "climate_band", to: "node output", effect: "0.5× (arctic) to 1.1× (warm)", status: "active", where: "compute-economy-flow" },
  { from: "elevation_band", to: "farming penalty", effect: "0.35× in mountains, 1.5× mining bonus", status: "active", where: "compute-economy-flow" },
  { from: "moisture_band", to: "faith bonus", effect: "1.3× faith for religious nodes in wetlands", status: "active", where: "compute-economy-flow" },
  // POPULATION → NODES (indirect)
  { from: "mobilization_rate", to: "workforce_ratio", effect: "Over-mobilization: penalty = (mob−max)×2, cap 80%", status: "active", where: "economyConstants.ts" },
  { from: "workforce_ratio", to: "production output", effect: "Node production × effective_workforce_ratio", status: "active", where: "process-turn" },
  // BLIND / PARTIAL
  { from: "civ_identity modifiers", to: "node production", effect: "production_modifier, wealth_modifier etc.", status: "partial", where: "physics.ts (defined) — NOT applied in compute-economy-flow" },
  { from: "strategic_resource tier", to: "combat bonuses", effect: "gameplayEffects per tier (iron +10% etc.)", status: "blind", where: "economyFlow.ts (defined) — NOT consumed by resolve-battle" },
  { from: "strategic_resource tier", to: "build cost discount", effect: "marble −10%/−20% build cost", status: "blind", where: "economyFlow.ts (defined) — NOT consumed by build logic" },
  { from: "node.bonusEffect text", to: "engine", effect: "Descriptive only — no mechanical application", status: "blind", where: "nodeTypes.ts" },
  { from: "preferredBiomes", to: "node placement AI", effect: "AI uses for suggestMajorType only, not economic bonus", status: "partial", where: "nodeTypes.ts → AI faction turn" },
  { from: "micro.strategicResourcePool", to: "resource spawn", effect: "rollStrategicResource with spawnChance", status: "active", where: "nodeTypes.ts + generate-hex" },
  { from: "node.maxUpgrade", to: "upgrade cap", effect: "Major=5, Minor=5, Micro=2-3 — enforced in UI", status: "partial", where: "UI only — no server validation" },
  // GOODS ECONOMY v4.1 — new causal links
  { from: "resource_deposits", to: "source_node_output", effect: "Hex resource yield × quality → raw goods extraction", status: "active", where: "compute-province-nodes + compute-economy-flow" },
  { from: "capability_tags", to: "recipe_eligibility", effect: "Node tags auto-assigned from subtype+biome, match recipe required_tags", status: "active", where: "compute-province-nodes (auto) + compute-economy-flow" },
  { from: "production_role", to: "goods_chain_position", effect: "source→processing→urban→guild pipeline", status: "active", where: "compute-province-nodes (auto)" },
  { from: "guild_level", to: "branch_unlock + quality", effect: "Lv.3+ unlocks luxury/famous tier recipes", status: "planned", where: "goodsCatalog.ts" },
  { from: "specialization_scores", to: "famous_good_chance", effect: "Cumulative branch mastery → variant unlock probability", status: "planned", where: "province_nodes.specialization_scores" },
  { from: "demand_basket_satisfaction", to: "city_stability", effect: "Unfulfilled tier 1-2 baskets → stability penalty", status: "planned", where: "demand_baskets table" },
  { from: "trade_pressure", to: "trade_flow_creation", effect: "High pressure → new city-to-city flows", status: "planned", where: "compute-trade-flows (planned)" },
  { from: "commercial_retention", to: "wealth_tax_base", effect: "Higher domestic fulfillment → stronger market tax", status: "planned", where: "realm_resources.commercial_retention" },
  { from: "commercial_capture", to: "export_income", effect: "Serving foreign demand → capture bonus wealth", status: "planned", where: "realm_resources.commercial_capture" },
  { from: "trade_ideology", to: "merchant_flow + tariffs", effect: "5 ideologies with mechanical multipliers", status: "planned", where: "realm_resources.trade_ideology + goodsCatalog.ts" },
  { from: "goods_output", to: "macro_production", effect: "Aggregated chain output → top-bar Production", status: "planned", where: "compute-economy-flow (planned)" },
  { from: "market_tax + transit_tax", to: "macro_wealth", effect: "Tax components → top-bar Wealth", status: "planned", where: "realm_resources tax columns" },
  { from: "storable_goods_surplus", to: "macro_supplies", effect: "Storable goods balance → top-bar Supplies", status: "planned", where: "goods.storable + node_inventory" },
  { from: "ritual_basket_fulfillment", to: "macro_faith", effect: "Ritual basket satisfaction → top-bar Faith", status: "planned", where: "demand_baskets (planned)" },
  { from: "luxury_famous_output", to: "macro_prestige", effect: "Luxury/famous goods volume → top-bar Prestige", status: "planned", where: "goods.market_tier + trade_flows" },
];

// ═══════════════════════════════════════════
// CONSTANTS TABLE DATA
// ═══════════════════════════════════════════

interface ConstantEntry {
  category: string;
  name: string;
  value: string;
  source: string;
  editable: boolean;
}

const CONSTANTS: ConstantEntry[] = [
  // Biome costs
  { category: "Biom → Traversal Cost", name: "plains / grassland", value: "1.0", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "river_valley / delta", value: "1.0", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "coastal", value: "1.2", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "steppe", value: "1.3", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "wetland", value: "1.8", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "forest", value: "2.0", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "dense_forest", value: "3.0", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "hills", value: "3.5", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "swamp", value: "4.0", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "tundra", value: "4.5", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "desert", value: "6.0", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "mountain", value: "12.0", source: "physics.ts", editable: true },
  { category: "Biom → Traversal Cost", name: "ocean", value: "50.0", source: "physics.ts", editable: true },
  // Hex modifiers
  { category: "Hex modifikátory", name: "River (no bridge) penalty", value: "+3.0", source: "physics.ts", editable: true },
  { category: "Hex modifikátory", name: "Height penalty (>0.7)", value: "(h−0.7)×5", source: "physics.ts", editable: true },
  { category: "Hex modifikátory", name: "Infra discount L1/L2/L3", value: "−15% / −30% / −45%", source: "physics.ts", editable: true },
  { category: "Hex modifikátory", name: "Foreign territory", value: "×1.5", source: "physics.ts", editable: true },
  { category: "Hex modifikátory", name: "Own fortress", value: "×0.7", source: "physics.ts", editable: true },
  { category: "Hex modifikátory", name: "Enemy fortress", value: "×2.5", source: "physics.ts", editable: true },
  { category: "Hex modifikátory", name: "Contested hex", value: "×1.8", source: "physics.ts", editable: true },
  { category: "Hex modifikátory", name: "Coastal bonus", value: "×0.9", source: "physics.ts", editable: true },
  { category: "Hex modifikátory", name: "Trade density max discount", value: "×0.6 (at density 100)", source: "physics.ts", editable: true },
  // Node production
  { category: "Node base production", name: "resource_node", value: "8", source: "economyFlow.ts", editable: true },
  { category: "Node base production", name: "village_cluster", value: "6", source: "economyFlow.ts", editable: true },
  { category: "Node base production", name: "port", value: "5", source: "economyFlow.ts", editable: true },
  { category: "Node base production", name: "primary_city", value: "4", source: "economyFlow.ts", editable: true },
  { category: "Node base production", name: "secondary_city / logistic_hub", value: "3", source: "economyFlow.ts", editable: true },
  { category: "Node base production", name: "trade_hub / religious_center", value: "2", source: "economyFlow.ts", editable: true },
  { category: "Node base production", name: "fortress", value: "1", source: "economyFlow.ts", editable: true },
  // Role multipliers
  { category: "Role → Trade Efficiency", name: "hub", value: "1.0", source: "economyFlow.ts", editable: true },
  { category: "Role → Trade Efficiency", name: "gateway", value: "0.8", source: "economyFlow.ts", editable: true },
  { category: "Role → Trade Efficiency", name: "regulator", value: "0.6", source: "economyFlow.ts", editable: true },
  { category: "Role → Trade Efficiency", name: "producer", value: "0.3", source: "economyFlow.ts", editable: true },
  { category: "Role → Trade Efficiency", name: "neutral", value: "0.2", source: "economyFlow.ts", editable: true },
  // Biome match
  { category: "Biome match produkce", name: "Match", value: "1.0×", source: "nodeTypes.ts", editable: true },
  { category: "Biome match produkce", name: "Mismatch", value: "0.6×", source: "nodeTypes.ts", editable: true },
  // Upkeep
  { category: "Major Upkeep (🌾/💰)", name: "Město", value: "10 / 6", source: "nodeTypes.ts", editable: true },
  { category: "Major Upkeep (🌾/💰)", name: "Hrad", value: "8 / 4", source: "nodeTypes.ts", editable: true },
  { category: "Major Upkeep (🌾/💰)", name: "Obchodní stanice", value: "6 / 8", source: "nodeTypes.ts", editable: true },
  { category: "Major Upkeep (🌾/💰)", name: "Strážní stanice", value: "6 / 3", source: "nodeTypes.ts", editable: true },
  // Collapse
  { category: "Kolaps — severity", name: "Minor (importance <30)", value: "30% efektů", source: "physics.ts", editable: true },
  { category: "Kolaps — severity", name: "Moderate (30-60)", value: "60% efektů", source: "physics.ts", editable: true },
  { category: "Kolaps — severity", name: "Critical (>60)", value: "100% efektů", source: "physics.ts", editable: true },
  // A* pathfinding
  { category: "Pathfinding", name: "Max range (A*)", value: "40 hexů (default), 50 v compute-hex-flows", source: "physics.ts", editable: true },
  { category: "Pathfinding", name: "Heuristic", value: "Axial hex distance (admissible)", source: "physics.ts", editable: false },
  { category: "Pathfinding", name: "Adjacency validation", value: "Strict — reject paths with non-adjacent steps", source: "compute-hex-flows", editable: false },
];

// ═══════════════════════════════════════════
// IMPLEMENTATION AUDIT
// ═══════════════════════════════════════════

interface AuditItem {
  feature: string;
  status: "implemented" | "partial" | "missing" | "ui_only";
  serverFile: string;
  clientFile: string;
  notes: string;
}

const AUDIT_ITEMS: AuditItem[] = [
  { feature: "Biome traversal cost", status: "implemented", serverFile: "physics.ts", clientFile: "hexPathfinding.ts", notes: "Plně zrcadleno server ↔ klient" },
  { feature: "A* hex pathfinding", status: "implemented", serverFile: "physics.ts", clientFile: "hexPathfinding.ts", notes: "Server = kanonické cesty, klient = preview" },
  { feature: "Flow path computation", status: "implemented", serverFile: "compute-hex-flows/index.ts", clientFile: "—", notes: "Pouze server. Klient čte z flow_paths tabulky" },
  { feature: "Route dirty flag + recompute", status: "implemented", serverFile: "compute-hex-flows + triggers", clientFile: "—", notes: "DB triggery na node/hex/building změny" },
  { feature: "Node production (Minor/Micro)", status: "implemented", serverFile: "compute-economy-flow", clientFile: "nodeTypes.ts", notes: "Klient mirror pro UI preview" },
  { feature: "Node upkeep (supplies/wealth)", status: "implemented", serverFile: "compute-economy-flow", clientFile: "nodeTypes.ts", notes: "Odečítáno v process-turn" },
  { feature: "Macro-regional modifiers", status: "implemented", serverFile: "compute-economy-flow", clientFile: "—", notes: "Climate, elevation, moisture → node output" },
  { feature: "Trade density corridor discount", status: "implemented", serverFile: "physics.ts", clientFile: "—", notes: "cumulative_trade_flow → hex cost reduction" },
  { feature: "Collapse chain effects", status: "implemented", serverFile: "collapse-chain/index.ts", clientFile: "—", notes: "Kaskáda na 2 skoky v grafu cest" },
  { feature: "Province control snapshots", status: "implemented", serverFile: "commit-turn (step 12a/e)", clientFile: "—", notes: "Per-turn dominance, supply_health, route_access" },
  { feature: "Workforce → production penalty", status: "implemented", serverFile: "process-turn", clientFile: "economyConstants.ts", notes: "Over-mobilization reduces production" },
  { feature: "Infrastructure level → cost discount", status: "partial", serverFile: "physics.ts (reads)", clientFile: "—", notes: "infrastructure_level defaultuje na 0 — zatím žádná budova ho nemění" },
  { feature: "Civ identity → node production", status: "partial", serverFile: "physics.ts (defined)", clientFile: "—", notes: "Modifikátory definovány ale NEAPLIKOVÁNY v compute-economy-flow" },
  { feature: "Strategic resource → combat", status: "missing", serverFile: "—", clientFile: "economyFlow.ts (defined)", notes: "gameplayEffects popsány ale resolve-battle je nepoužívá" },
  { feature: "Strategic resource → build costs", status: "missing", serverFile: "—", clientFile: "economyFlow.ts (defined)", notes: "marble/timber discounts nepropojeny do build logic" },
  { feature: "bonusEffect text → engine", status: "missing", serverFile: "—", clientFile: "nodeTypes.ts", notes: "Popisné texty — žádný mechanický efekt" },
  { feature: "Node maxUpgrade validation", status: "ui_only", serverFile: "—", clientFile: "nodeTypes.ts", notes: "Enforced jen v UI, server nevaliduje" },
  { feature: "Road visualization ↔ flow_paths", status: "implemented", serverFile: "flow_paths tabulka", clientFile: "RoadNetworkOverlay.tsx", notes: "Striktně z DB, bez fallbacků" },
  { feature: "Emergent urbanization", status: "missing", serverFile: "—", clientFile: "—", notes: "Trade flow akumulace má generovat minor zástavbu — nepropojeno" },
  { feature: "Toll collection (regulators)", status: "partial", serverFile: "process-turn", clientFile: "—", notes: "Definováno v designu, implementace nejistá" },
  // GOODS ECONOMY v4.1 — planned features
  { feature: "Goods production chain (source→processing→urban→guild)", status: "missing", serverFile: "compute-economy-flow (planned)", clientFile: "goodsCatalog.ts", notes: "Architektura připravena, engine nezpracovává recipes" },
  { feature: "Demand basket computation", status: "missing", serverFile: "compute-economy-flow (planned)", clientFile: "goodsCatalog.ts", notes: "DB tabulka demand_baskets vytvořena, engine neplní" },
  { feature: "Trade pressure engine", status: "missing", serverFile: "compute-trade-flows (planned)", clientFile: "goodsCatalog.ts", notes: "Vzorec definován, edge function neexistuje" },
  { feature: "Commercial retention/capture", status: "missing", serverFile: "process-turn (planned)", clientFile: "—", notes: "Sloupce přidány do realm_resources" },
  { feature: "Macro aggregation from goods", status: "missing", serverFile: "process-turn (planned)", clientFile: "goodsCatalog.ts", notes: "Top-bar stats mají být odvozeny z goods layer" },
  { feature: "Quality inheritance (variants)", status: "missing", serverFile: "—", clientFile: "goodsCatalog.ts", notes: "Pravidlo: variants dekorují, nepřepisují parent ekonomiku" },
  { feature: "Node capability tags", status: "partial", serverFile: "—", clientFile: "goodsCatalog.ts", notes: "Mapping definován v goodsCatalog.ts, DB sloupec přidán" },
  { feature: "Guild specialization memory", status: "missing", serverFile: "—", clientFile: "—", notes: "specialization_scores jsonb na province_nodes — engine nepoužívá" },
];

// ═══════════════════════════════════════════
// STATUS HELPERS
// ═══════════════════════════════════════════

const statusIcon = (s: string) => {
  switch (s) {
    case "active": case "implemented": return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    case "partial": case "ui_only": return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
    case "blind": case "missing": return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    default: return <Eye className="h-3.5 w-3.5 text-muted-foreground" />;
  }
};

const statusBadge = (s: string) => {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default", implemented: "default",
    partial: "secondary", ui_only: "secondary",
    blind: "destructive", missing: "destructive",
    planned: "outline",
  };
  return <Badge variant={variants[s] || "outline"} className="text-[10px]">{s}</Badge>;
};

// ═══════════════════════════════════════════
// CONFIGURATOR EDITOR
// ═══════════════════════════════════════════

interface ConfigSection {
  id: string;
  label: string;
  rows: Array<{ key: string; value: string; description: string }>;
}

const DEFAULT_CONFIG: ConfigSection[] = [
  {
    id: "biome_costs", label: "⛰️ Biome Traversal Costs",
    rows: [
      { key: "plains", value: "1.0", description: "Planiny, louky" },
      { key: "coastal", value: "1.2", description: "Pobřeží" },
      { key: "steppe", value: "1.3", description: "Step" },
      { key: "wetland", value: "1.8", description: "Mokřady" },
      { key: "forest", value: "2.0", description: "Les" },
      { key: "dense_forest", value: "3.0", description: "Hustý les" },
      { key: "hills", value: "3.5", description: "Kopce" },
      { key: "swamp", value: "4.0", description: "Bažina" },
      { key: "tundra", value: "4.5", description: "Tundra" },
      { key: "desert", value: "6.0", description: "Poušť" },
      { key: "mountain", value: "12.0", description: "Hory" },
      { key: "ocean", value: "50.0", description: "Oceán" },
    ],
  },
  {
    id: "hex_modifiers", label: "🗺️ Hex Modifiers",
    rows: [
      { key: "river_no_bridge", value: "3.0", description: "Penalty za řeku bez mostu" },
      { key: "height_threshold", value: "0.7", description: "Výšková hranice pro penalty" },
      { key: "height_multiplier", value: "5.0", description: "Násobitel výškové penalty" },
      { key: "infra_discount_l1", value: "0.15", description: "Infrastruktura L1 sleva" },
      { key: "infra_discount_l2", value: "0.30", description: "Infrastruktura L2 sleva" },
      { key: "infra_discount_l3", value: "0.45", description: "Infrastruktura L3 sleva" },
      { key: "foreign_territory", value: "1.5", description: "Multiplikátor v cizím území" },
      { key: "own_fortress", value: "0.7", description: "Vlastní pevnost = koridor" },
      { key: "enemy_fortress", value: "2.5", description: "Nepřátelská pevnost = choke" },
      { key: "contested_hex", value: "1.8", description: "Sporný hex penalty" },
      { key: "coastal_bonus", value: "0.9", description: "Pobřežní obchodní bonus" },
      { key: "trade_density_max_discount", value: "0.6", description: "Min. multiplikátor při plné hustotě" },
    ],
  },
  {
    id: "node_production", label: "⚒️ Node Base Production",
    rows: [
      { key: "resource_node", value: "8", description: "Surovinový uzel" },
      { key: "village_cluster", value: "6", description: "Vesnice" },
      { key: "port", value: "5", description: "Přístav" },
      { key: "primary_city", value: "4", description: "Hlavní město" },
      { key: "secondary_city", value: "3", description: "Sekundární město" },
      { key: "logistic_hub", value: "3", description: "Logistický hub" },
      { key: "trade_hub", value: "2", description: "Obchodní hub" },
      { key: "religious_center", value: "2", description: "Náboženské centrum" },
      { key: "fortress", value: "1", description: "Pevnost" },
    ],
  },
  {
    id: "role_efficiency", label: "🔗 Role Trade Efficiency",
    rows: [
      { key: "hub", value: "1.0", description: "Centrální uzel" },
      { key: "gateway", value: "0.8", description: "Brána" },
      { key: "regulator", value: "0.6", description: "Regulátor" },
      { key: "producer", value: "0.3", description: "Producent" },
      { key: "neutral", value: "0.2", description: "Neutrální" },
    ],
  },
  {
    id: "collapse", label: "💥 Collapse Effects",
    rows: [
      { key: "trade_hub_wealth", value: "-50", description: "Wealth modifier při pádu trade hub" },
      { key: "food_basin_food", value: "-40", description: "Food modifier při pádu food basin" },
      { key: "sacred_faith", value: "-30", description: "Faith modifier při pádu sacred node" },
      { key: "fortress_morale", value: "-25", description: "Morale modifier při pádu fortress" },
      { key: "hop_radius", value: "2", description: "Radius šíření kolapsu (skoky v grafu)" },
    ],
  },
  {
    id: "pathfinding", label: "🧭 Pathfinding",
    rows: [
      { key: "max_range", value: "40", description: "Výchozí max radius A*" },
      { key: "max_range_hex_flows", value: "50", description: "Max radius v compute-hex-flows" },
      { key: "biome_match_mult", value: "1.0", description: "Produkce při shodě biomu" },
      { key: "biome_mismatch_mult", value: "0.6", description: "Produkce při neshodě biomu" },
    ],
  },
];

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

const HexNodeMechanicsPanel = ({ sessionId }: { sessionId: string }) => {
  const [configState, setConfigState] = useState<ConfigSection[]>(DEFAULT_CONFIG);
  const [notes, setNotes] = useState("");

  const grouped = useMemo(() => {
    const map = new Map<string, CausalLink[]>();
    for (const link of CAUSAL_LINKS) {
      const cat = link.from.split(".")[0].split("_")[0] || "hex";
      const group = link.status === "blind" ? "🔴 Slepé" : link.status === "partial" ? "🟡 Částečné" : "🟢 Aktivní";
      const arr = map.get(group) || [];
      arr.push(link);
      map.set(group, arr);
    }
    return map;
  }, []);

  const constGrouped = useMemo(() => {
    const map = new Map<string, ConstantEntry[]>();
    for (const c of CONSTANTS) {
      const arr = map.get(c.category) || [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return map;
  }, []);

  const updateConfigValue = (sectionId: string, key: string, value: string) => {
    setConfigState(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, rows: s.rows.map(r => r.key === key ? { ...r, value } : r) }
        : s
    ));
  };

  const exportJSON = () => {
    const obj: Record<string, Record<string, number>> = {};
    for (const section of configState) {
      obj[section.id] = {};
      for (const row of section.rows) {
        obj[section.id][row.key] = parseFloat(row.value) || 0;
      }
    }
    const json = JSON.stringify({ hex_node_system: obj, notes }, null, 2);
    navigator.clipboard.writeText(json);
    toast.success("JSON zkopírován do schránky");
  };

  const exportMarkdown = () => {
    let md = "# Hex & Node System — Návrh konfigurace\n\n";
    for (const section of configState) {
      md += `## ${section.label}\n\n`;
      md += "| Klíč | Hodnota | Popis |\n|------|---------|-------|\n";
      for (const row of section.rows) {
        md += `| ${row.key} | ${row.value} | ${row.description} |\n`;
      }
      md += "\n";
    }
    if (notes) {
      md += `## Poznámky\n\n${notes}\n`;
    }
    navigator.clipboard.writeText(md);
    toast.success("Markdown zkopírován do schránky");
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          🔬 Hex & Node Mechanics Analyzer
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <Tabs defaultValue="causal" className="w-full">
          <TabsList className="w-full grid grid-cols-5 h-8">
            <TabsTrigger value="causal" className="text-[10px]">Kauzální mapa</TabsTrigger>
            <TabsTrigger value="audit" className="text-[10px]">Audit</TabsTrigger>
            <TabsTrigger value="constants" className="text-[10px]">Konstanty</TabsTrigger>
            <TabsTrigger value="data" className="text-[10px]">Data audit</TabsTrigger>
            <TabsTrigger value="editor" className="text-[10px]">Konfigurátor</TabsTrigger>
          </TabsList>

          {/* CAUSAL MAP */}
          <TabsContent value="causal" className="mt-2 space-y-1">
            <p className="text-[10px] text-muted-foreground mb-2">
              Kauzální vazby: co ovlivňuje co v hex/node systému. 🟢 Aktivní = plně propojené, 🟡 Částečné = definováno ale ne plně využito, 🔴 Slepé = existuje ale nic neovlivňuje.
            </p>
            {[...grouped.entries()].map(([group, links]) => (
              <Collapsible key={group} defaultOpen={group.includes("Slepé")}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 w-full text-left text-xs font-semibold py-1.5 px-2 rounded hover:bg-muted/50">
                    <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    {group} ({links.length})
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0.5 pl-2">
                  {links.map((link, i) => (
                    <div key={i} className="flex items-start gap-2 text-[10px] py-0.5 px-2 rounded hover:bg-muted/30">
                      {statusIcon(link.status)}
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-primary">{link.from}</span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="font-mono text-foreground">{link.to}</span>
                        <p className="text-muted-foreground">{link.effect}</p>
                        <p className="text-muted-foreground/60 italic">{link.where}</p>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </TabsContent>

          {/* AUDIT */}
          <TabsContent value="audit" className="mt-2">
            <p className="text-[10px] text-muted-foreground mb-2">
              Co je reálně propojené v kódu vs. co je jen definice.
            </p>
            <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
              {AUDIT_ITEMS.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/30 border-b border-border/30">
                  {statusIcon(item.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{item.feature}</span>
                      {statusBadge(item.status)}
                    </div>
                    <div className="flex gap-4 text-muted-foreground mt-0.5">
                      <span>Server: <code className="text-[9px]">{item.serverFile}</code></span>
                      <span>Klient: <code className="text-[9px]">{item.clientFile}</code></span>
                    </div>
                    <p className="text-muted-foreground/80 mt-0.5">{item.notes}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
              {(["implemented", "partial", "missing", "ui_only"] as const).map(s => (
                <div key={s} className="flex items-center gap-1">
                  {statusIcon(s)}
                  <span>{s}: {AUDIT_ITEMS.filter(a => a.status === s).length}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* CONSTANTS */}
          <TabsContent value="constants" className="mt-2">
            <p className="text-[10px] text-muted-foreground mb-2">
              Všechny hardcoded hodnoty na jednom místě.
            </p>
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {[...constGrouped.entries()].map(([cat, entries]) => (
                <Collapsible key={cat}>
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 w-full text-left text-xs font-semibold py-1.5 px-2 rounded hover:bg-muted/50">
                      <ChevronDown className="h-3 w-3" />
                      {cat} ({entries.length})
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 space-y-0.5">
                    {entries.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] py-0.5">
                        <span className="font-mono w-40 shrink-0">{c.name}</span>
                        <code className="bg-muted/60 px-1.5 py-0.5 rounded text-primary font-mono">{c.value}</code>
                        <span className="text-muted-foreground/60 text-[9px]">{c.source}</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </TabsContent>

          {/* DATA AUDIT */}
          <TabsContent value="data" className="mt-2">
            <DataAuditSection sessionId={sessionId} />
          </TabsContent>

          {/* CONFIGURATOR */}
          <TabsContent value="editor" className="mt-2 space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Uprav hodnoty a exportuj jako JSON nebo Markdown pro nový systém.
            </p>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {configState.map(section => (
                <Collapsible key={section.id} defaultOpen>
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 w-full text-left text-xs font-semibold py-1.5 px-2 rounded hover:bg-muted/50">
                      <ChevronDown className="h-3 w-3" />
                      {section.label}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-2 space-y-0.5">
                    {section.rows.map(row => (
                      <div key={row.key} className="flex items-center gap-2 text-[10px] py-0.5">
                        <span className="font-mono w-44 shrink-0 text-muted-foreground">{row.key}</span>
                        <Input
                          className="h-6 w-20 text-[10px] font-mono"
                          value={row.value}
                          onChange={e => updateConfigValue(section.id, row.key, e.target.value)}
                        />
                        <span className="text-muted-foreground/60 text-[9px]">{row.description}</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Poznámky / Návrh změn</label>
              <Textarea
                className="text-[10px] font-mono mt-1 h-24"
                placeholder="Napiš sem komentáře, navrhované změny mechanik, nové vazby..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportJSON} className="gap-1.5 text-[10px]">
                <Copy className="h-3 w-3" /> Export JSON
              </Button>
              <Button size="sm" variant="outline" onClick={exportMarkdown} className="gap-1.5 text-[10px]">
                <Download className="h-3 w-3" /> Export Markdown
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

// ═══════════════════════════════════════════
// DATA AUDIT (live queries)
// ═══════════════════════════════════════════

function DataAuditSection({ sessionId }: { sessionId: string }) {
  const { data: stats } = useQuery({
    queryKey: ["hex-node-data-audit", sessionId],
    queryFn: async () => {
      const [hexes, nodes, routes, flowPaths, regions] = await Promise.all([
        supabase.from("province_hexes").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("province_nodes").select("id, node_type, node_tier, flow_role, is_active, upgrade_level, importance_score", { count: "exact" }).eq("session_id", sessionId),
        supabase.from("province_routes").select("id, route_type, path_dirty, control_state", { count: "exact" }).eq("session_id", sessionId),
        supabase.from("flow_paths").select("id, flow_type, total_cost, path_length", { count: "exact" }).eq("session_id", sessionId),
        supabase.from("macro_regions").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
      ]);

      // Compute node breakdowns
      const nodeData = nodes.data || [];
      const tierBreakdown: Record<string, number> = {};
      const typeBreakdown: Record<string, number> = {};
      const roleBreakdown: Record<string, number> = {};
      let inactiveNodes = 0;
      let avgImportance = 0;
      for (const n of nodeData) {
        tierBreakdown[n.node_tier || "unknown"] = (tierBreakdown[n.node_tier || "unknown"] || 0) + 1;
        typeBreakdown[n.node_type || "unknown"] = (typeBreakdown[n.node_type || "unknown"] || 0) + 1;
        roleBreakdown[n.flow_role || "unknown"] = (roleBreakdown[n.flow_role || "unknown"] || 0) + 1;
        if (!n.is_active) inactiveNodes++;
        avgImportance += (n.importance_score || 0);
      }
      avgImportance = nodeData.length > 0 ? Math.round(avgImportance / nodeData.length * 10) / 10 : 0;

      // Route breakdowns
      const routeData = routes.data || [];
      let dirtyRoutes = 0;
      let blockedRoutes = 0;
      const routeTypes: Record<string, number> = {};
      for (const r of routeData) {
        if (r.path_dirty) dirtyRoutes++;
        if (r.control_state === "blocked") blockedRoutes++;
        routeTypes[r.route_type || "unknown"] = (routeTypes[r.route_type || "unknown"] || 0) + 1;
      }

      // Flow path stats
      const fpData = flowPaths.data || [];
      let avgCost = 0, avgLength = 0;
      for (const fp of fpData) {
        avgCost += (fp.total_cost || 0);
        avgLength += (fp.path_length || 0);
      }
      if (fpData.length > 0) {
        avgCost = Math.round(avgCost / fpData.length * 10) / 10;
        avgLength = Math.round(avgLength / fpData.length * 10) / 10;
      }

      return {
        hexCount: hexes.count || 0,
        nodeCount: nodes.count || 0,
        routeCount: routes.count || 0,
        flowPathCount: flowPaths.count || 0,
        regionCount: regions.count || 0,
        tierBreakdown, typeBreakdown, roleBreakdown,
        inactiveNodes, avgImportance,
        dirtyRoutes, blockedRoutes, routeTypes,
        avgCost, avgLength,
      };
    },
    staleTime: 30000,
  });

  if (!stats) return <p className="text-[10px] text-muted-foreground">Načítání...</p>;

  const renderMap = (m: Record<string, number>) => (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
        <Badge key={k} variant="outline" className="text-[9px] font-mono">{k}: {v}</Badge>
      ))}
    </div>
  );

  return (
    <div className="space-y-3 text-[10px]">
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Hexy", value: stats.hexCount },
          { label: "Uzly", value: stats.nodeCount },
          { label: "Trasy", value: stats.routeCount },
          { label: "Flow paths", value: stats.flowPathCount },
          { label: "Makro regiony", value: stats.regionCount },
        ].map(s => (
          <div key={s.label} className="bg-muted/30 rounded p-2 text-center">
            <div className="text-lg font-bold text-primary">{s.value}</div>
            <div className="text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div>
          <span className="font-semibold">Node Tiers:</span>
          {renderMap(stats.tierBreakdown)}
        </div>
        <div>
          <span className="font-semibold">Node Types:</span>
          {renderMap(stats.typeBreakdown)}
        </div>
        <div>
          <span className="font-semibold">Flow Roles:</span>
          {renderMap(stats.roleBreakdown)}
        </div>
        <div>
          <span className="font-semibold">Route Types:</span>
          {renderMap(stats.routeTypes)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/30 rounded p-2">
          <div className="font-semibold">Neaktivní uzly</div>
          <div className={stats.inactiveNodes > 0 ? "text-yellow-500 font-bold" : "text-green-500"}>{stats.inactiveNodes}</div>
        </div>
        <div className="bg-muted/30 rounded p-2">
          <div className="font-semibold">Dirty routes</div>
          <div className={stats.dirtyRoutes > 0 ? "text-yellow-500 font-bold" : "text-green-500"}>{stats.dirtyRoutes}</div>
        </div>
        <div className="bg-muted/30 rounded p-2">
          <div className="font-semibold">Blocked routes</div>
          <div className={stats.blockedRoutes > 0 ? "text-red-500 font-bold" : "text-green-500"}>{stats.blockedRoutes}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/30 rounded p-2">
          <div className="font-semibold">Ø Importance</div>
          <div>{stats.avgImportance}</div>
        </div>
        <div className="bg-muted/30 rounded p-2">
          <div className="font-semibold">Ø Path cost</div>
          <div>{stats.avgCost}</div>
        </div>
        <div className="bg-muted/30 rounded p-2">
          <div className="font-semibold">Ø Path length</div>
          <div>{stats.avgLength} hexů</div>
        </div>
      </div>
    </div>
  );
}

export default HexNodeMechanicsPanel;
