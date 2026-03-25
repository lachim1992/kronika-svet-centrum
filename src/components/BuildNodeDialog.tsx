import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Hammer, Sparkles } from "lucide-react";
import {
  type NodeTier, NODE_TIER_LABELS,
  MINOR_NODE_TYPES, MICRO_NODE_TYPES, MAJOR_NODE_TYPES,
  suggestMinorType, suggestMicroType, suggestMajorType,
  getCompatibleMinorTypes, getCompatibleMicroTypes, getCompatibleMajorTypes,
  rollStrategicResource, computeNodeProduction, totalProduction,
  type MinorNodeDef, type MicroNodeDef, type MajorNodeDef,
} from "@/lib/nodeTypes";
import { STRATEGIC_RESOURCE_META } from "@/lib/economyFlow";

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  playerName: string;
  hexQ: number;
  hexR: number;
  biome: string;
  provinceId: string | null;
  /** If building a micronode, this is the parent minor node */
  parentNodeId?: string;
  parentNodeName?: string;
  /** Dev mode = no cost, no biome restriction */
  devMode?: boolean;
  /** Which tier to build */
  forceTier?: NodeTier;
  onBuilt?: () => void;
}

const BuildNodeDialog = ({
  open, onClose, sessionId, playerName, hexQ, hexR, biome,
  provinceId, parentNodeId, parentNodeName, devMode, forceTier, onBuilt,
}: Props) => {
  const defaultTier = forceTier || (parentNodeId ? "micro" : "minor");
  const [tier, setTier] = useState<NodeTier>(defaultTier);
  const [selectedType, setSelectedType] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [building, setBuilding] = useState(false);

  // Suggest type based on biome
  const suggestedType = tier === "major" ? suggestMajorType(biome) : tier === "minor" ? suggestMinorType(biome) : suggestMicroType(biome);

  // Get compatible types
  const compatibleMajor = useMemo(() =>
    devMode ? MAJOR_NODE_TYPES : getCompatibleMajorTypes(biome),
  [biome, devMode]);
  const compatibleMinor = useMemo(() =>
    devMode ? MINOR_NODE_TYPES : getCompatibleMinorTypes(biome),
  [biome, devMode]);
  const compatibleMicro = useMemo(() =>
    devMode ? MICRO_NODE_TYPES : getCompatibleMicroTypes(biome),
  [biome, devMode]);

  const activeType = selectedType || suggestedType;
  const activeDef = tier === "major"
    ? MAJOR_NODE_TYPES.find(t => t.key === activeType)
    : tier === "minor"
    ? MINOR_NODE_TYPES.find(t => t.key === activeType)
    : MICRO_NODE_TYPES.find(t => t.key === activeType);

  const previewProduction = activeDef && tier !== "major" ? computeNodeProduction(tier, activeType, 1, biome) : null;

  const handleBuild = async () => {
    if (!activeDef) return;
    setBuilding(true);
    try {
      // Roll strategic resource for micronodes
      let spawnedResource: string | null = null;
      if (tier === "micro") {
        const microDef = MICRO_NODE_TYPES.find(t => t.key === activeType);
        if (microDef) spawnedResource = rollStrategicResource(microDef);
      }

      const nodeName = customName.trim() || activeDef.label;

      // Determine node_type for DB
      let dbNodeType: string;
      if (tier === "major") {
        const majorDef = MAJOR_NODE_TYPES.find(t => t.key === activeType);
        dbNodeType = majorDef?.dbNodeType || "primary_city";
      } else {
        const nodeTypeMap: Record<string, string> = {
          village: "village_cluster", lumber_camp: "resource_node", fishing_village: "port",
          mining_camp: "resource_node", pastoral_camp: "village_cluster", trade_post: "trade_hub",
          shrine: "religious_center", watchtower: "fortress",
          field: "resource_node", sawmill: "resource_node", mine: "resource_node",
          hunting_ground: "resource_node", fishery: "resource_node", quarry: "resource_node",
          vineyard: "resource_node", herbalist: "religious_center", smithy: "resource_node",
          outpost: "fortress", resin_collector: "resource_node", salt_pan: "resource_node",
        };
        dbNodeType = nodeTypeMap[activeType] || "village_cluster";
      }

      const prod = tier !== "major" ? computeNodeProduction(tier, activeType, 1, biome) : { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 0, faith: 0 };

      const flowRole = tier === "major"
        ? (activeType === "city" ? "hub" : activeType === "trade_hub" ? "hub" : activeType === "fortress" ? "gateway" : "regulator")
        : tier === "micro" ? "producer" : "neutral";

      const { error } = await supabase.from("province_nodes").insert({
        session_id: sessionId,
        province_id: provinceId || "00000000-0000-0000-0000-000000000000",
        name: nodeName,
        hex_q: hexQ,
        hex_r: hexR,
        node_type: dbNodeType,
        node_tier: tier,
        node_subtype: activeType,
        node_class: tier === "major" ? "major" : tier === "micro" ? "transit" : "minor",
        is_major: tier === "major",
        is_active: true,
        parent_node_id: parentNodeId || null,
        controlled_by: playerName,
        built_by: playerName,
        built_turn: 0,
        biome_at_build: biome,
        upgrade_level: 1,
        max_upgrade_level: tier === "major" ? 5 : (activeDef as any).maxUpgrade || 3,
        production_base: totalProduction(prod),
        production_output: prod.grain + prod.wood + prod.stone + prod.iron,
        wealth_output: prod.wealth,
        faith_output: prod.faith,
        food_value: prod.grain,
        strategic_resource_type: spawnedResource,
        spawned_strategic_resource: spawnedResource,
        strategic_resource_tier: spawnedResource ? 1 : 0,
        flow_role: flowRole,
        population: tier === "major" ? 200 : tier === "minor" ? 50 : 0,
        resource_output: prod,
      } as any);

      if (error) throw error;

      if (spawnedResource) {
        const meta = (STRATEGIC_RESOURCE_META as any)[spawnedResource];
        toast.success(`${nodeName} postaveno! Nalezena surovina: ${meta?.icon || "?"} ${meta?.label || spawnedResource}`, { duration: 5000 });
      } else {
        toast.success(`${nodeName} postaveno na (${hexQ}, ${hexR})`);
      }

      onBuilt?.();
      onClose();
    } catch (err: any) {
      toast.error("Chyba: " + (err.message || "Nepodařilo se postavit"));
    } finally {
      setBuilding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-base">
            <Hammer className="h-5 w-5 text-primary" />
            Postavit {tier === "major" ? "sídlo" : tier === "minor" ? "osadu" : tier === "micro" ? "zázemí" : "uzel"} na ({hexQ}, {hexR})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Biome info */}
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="text-[10px]">{biome}</Badge>
            {parentNodeName && (
              <span className="text-muted-foreground">→ Parent: <strong>{parentNodeName}</strong></span>
            )}
            {devMode && <Badge variant="destructive" className="text-[9px]">DEV</Badge>}
          </div>

          {/* Tier selector (only in dev mode) */}
          {devMode && !forceTier && (
            <div className="space-y-1">
              <label className="text-xs font-display font-semibold">Tier</label>
              <Select value={tier} onValueChange={(v) => { setTier(v as NodeTier); setSelectedType(""); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor" className="text-xs">Minor (osada)</SelectItem>
                  <SelectItem value="micro" className="text-xs">Micro (zázemí)</SelectItem>
                  <SelectItem value="major" className="text-xs">Major (město/hrad)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Type selector */}
          <div className="space-y-1">
            <label className="text-xs font-display font-semibold">
              Typ {tier === "major" ? "sídla" : tier === "minor" ? "osady" : "zázemí"}
              <span className="text-muted-foreground font-normal ml-2">
                (doporučeno: {(tier === "major" ? MAJOR_NODE_TYPES : tier === "minor" ? MINOR_NODE_TYPES : MICRO_NODE_TYPES).find(t => t.key === suggestedType)?.icon} {(tier === "major" ? MAJOR_NODE_TYPES : tier === "minor" ? MINOR_NODE_TYPES : MICRO_NODE_TYPES).find(t => t.key === suggestedType)?.label})
              </span>
            </label>
            <Select value={activeType} onValueChange={setSelectedType}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(tier === "major" ? compatibleMajor : tier === "minor" ? compatibleMinor : compatibleMicro).map(t => (
                  <SelectItem key={t.key} value={t.key} className="text-xs">
                    {t.icon} {t.label}
                    {t.key === suggestedType && " ⭐"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom name */}
          <div className="space-y-1">
            <label className="text-xs font-display font-semibold">Název (volitelný)</label>
            <Input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder={activeDef?.label || ""}
              className="h-8 text-xs"
            />
          </div>

          {/* Preview */}
          {activeDef && previewProduction && (
            <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
              <p className="text-xs font-display font-semibold">{activeDef.icon} {activeDef.label}</p>
              <p className="text-[10px] text-muted-foreground">{activeDef.description}</p>

              <div className="grid grid-cols-3 gap-1 mt-2">
                {Object.entries(previewProduction).map(([key, val]) => val > 0 && (
                  <div key={key} className="flex items-center gap-1 text-[10px]">
                    <span>{key === "grain" ? "🌾" : key === "wood" ? "🪵" : key === "stone" ? "🪨" : key === "iron" ? "⛏️" : key === "wealth" ? "💰" : "⛪"}</span>
                    <span className="font-mono font-semibold">{val}</span>
                    <span className="text-muted-foreground">{key}</span>
                  </div>
                ))}
              </div>

              {'bonusEffect' in activeDef && (activeDef as MinorNodeDef).bonusEffect && (
                <p className="text-[10px] text-primary mt-1">{(activeDef as MinorNodeDef).bonusEffect}</p>
              )}

              {tier === "micro" && (activeDef as MicroNodeDef).strategicResourcePool.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] mt-1">
                  <Sparkles className="h-3 w-3 text-yellow-500" />
                  <span className="text-muted-foreground">
                    Šance na surovinu: {Math.round((activeDef as MicroNodeDef).spawnChance * 100)}% —
                    {(activeDef as MicroNodeDef).strategicResourcePool.map(r => {
                      const meta = (STRATEGIC_RESOURCE_META as any)[r];
                      return ` ${meta?.icon || "?"} ${meta?.label || r}`;
                    }).join(",")}
                  </span>
                </div>
              )}

              {/* Biome match warning */}
              {!devMode && !(activeDef as any).preferredBiomes?.some((pb: string) => biome.toLowerCase().includes(pb)) && (
                <p className="text-[10px] text-destructive mt-1">
                  ⚠️ Biom "{biome}" není ideální — produkce snížena o 40%
                </p>
              )}
            </div>
          )}

          {/* Build button */}
          <Button className="w-full font-display gap-2" disabled={building || !activeDef} onClick={handleBuild}>
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />}
            Postavit {activeDef?.icon} {activeDef?.label || ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BuildNodeDialog;
