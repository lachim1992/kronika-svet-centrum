import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Building2, Loader2, Plus, Sparkles, Hammer, Shield, Landmark, Coins,
  Factory, Church, ArrowRight, Clock, CheckCircle2, ImageIcon, ArrowUp, Star, Crown,
} from "lucide-react";

interface Props {
  sessionId: string;
  cityId: string;
  cityName: string;
  settlementLevel: string;
  realm: any;
  currentPlayerName: string;
  currentTurn: number;
  isOwner: boolean;
  onRefetch?: () => void;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode }> = {
  economic: { label: "Ekonomické", icon: <Coins className="h-3.5 w-3.5" /> },
  military: { label: "Vojenské", icon: <Shield className="h-3.5 w-3.5" /> },
  cultural: { label: "Kulturní", icon: <Landmark className="h-3.5 w-3.5" /> },
  infrastructure: { label: "Infrastruktura", icon: <Factory className="h-3.5 w-3.5" /> },
};

const SETTLEMENT_ORDER = ["HAMLET", "TOWNSHIP", "CITY", "POLIS"];

const EFFECT_LABELS: Record<string, string> = {
  food_income: "🌾 Obilí", wood_income: "🪵 Dřevo", stone_income: "🪨 Kámen",
  iron_income: "⚙️ Železo", wealth_income: "💰 Bohatství", stability_bonus: "🛡️ Stabilita",
  influence_bonus: "👑 Vliv", population_growth: "👥 Růst populace",
  manpower_bonus: "⚔️ Branná síla", defense_bonus: "🏰 Obrana",
  grain_production: "🌾 Obilí", iron_production: "⚙️ Železo",
  wood_production: "🪵 Dřevo", stone_production: "🪨 Kámen",
  wealth: "💰 Zlato", stability: "🛡️ Stabilita", influence: "👑 Vliv",
  defense: "🏰 Obrana", recruitment: "⚔️ Rekrutace", military_quality: "🗡️ Kvalita vojsk",
  military_garrison: "🛡️ Posádka", morale_bonus: "💪 Morálka",
  trade_bonus: "📦 Obchod", granary_capacity: "🏺 Sýpka",
  population_capacity: "🏠 Kapacita", legitimacy: "⚖️ Legitimita",
  cleric_attraction: "✝️ Duchovní", burgher_attraction: "🏘️ Měšťané",
  disease_resistance: "💊 Zdraví", siege_power: "🪨 Obléhání",
  siege_resistance: "🏰 Odolnost", build_speed: "⏱️ Rychlost stavby",
  famine_resistance: "🌾 Odolnost hladu", cavalry_bonus: "🐴 Jízda",
  ranged_bonus: "🏹 Střelci", mobility: "🏃 Mobilita", vision: "👁️ Výhled",
  espionage_defense: "🕵️ Kontrašpionáž", recruitment_bonus: "⚔️ Rekrutace+",
  special_production: "✨ Speciální", naval_power: "⚓ Námořní síla",
  research: "📚 Výzkum",
};

const CityBuildingsPanel = ({
  sessionId, cityId, cityName, settlementLevel, realm,
  currentPlayerName, currentTurn, isOwner, onRefetch,
}: Props) => {
  const [buildings, setBuildings] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [civBuildings, setCivBuildings] = useState<any[]>([]);
  const [civBuildingTags, setCivBuildingTags] = useState<string[]>([]);
  const [generatingCivBuildings, setGeneratingCivBuildings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMyth, setAiMyth] = useState("");
  const [aiVisual, setAiVisual] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [activeCategory, setActiveCategory] = useState("economic");
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFlavor, setEditFlavor] = useState("");
  const [editArchStyle, setEditArchStyle] = useState("");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [bRes, tRes, civRes] = await Promise.all([
      supabase.from("city_buildings").select("*").eq("city_id", cityId).order("created_at"),
      supabase.from("building_templates").select("*").order("category, name"),
      supabase.from("civ_identity").select("special_buildings, building_tags")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
    ]);
    setBuildings(bRes.data || []);
    setTemplates(tRes.data || []);
    setCivBuildings((civRes.data?.special_buildings as any[]) || []);
    setCivBuildingTags((civRes.data?.building_tags as string[]) || []);
    setLoading(false);
  }, [cityId, sessionId, currentPlayerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const settlementIdx = SETTLEMENT_ORDER.indexOf(settlementLevel);

  const availableTemplates = templates.filter(t => {
    const reqIdx = SETTLEMENT_ORDER.indexOf(t.required_settlement_level);
    return reqIdx <= settlementIdx;
  });

  const categorized = availableTemplates.reduce<Record<string, any[]>>((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  const alreadyBuilt = new Set(buildings.filter(b => b.template_id).map(b => b.template_id));

  /** New civilizational economy cost check:
   * cost_wealth → deducted from gold_reserve (Wealth)
   * cost_wood + cost_stone + cost_iron → merged into production_reserve (Production)
   */
  const getProductionCost = (costs: any) => (costs.cost_wood || 0) + (costs.cost_stone || 0) + (costs.cost_iron || 0);
  const canAfford = (costs: { cost_wealth?: number; cost_wood?: number; cost_stone?: number; cost_iron?: number }) =>
    realm &&
    (realm.gold_reserve || 0) >= (costs.cost_wealth || 0) &&
    (realm.production_reserve || 0) >= getProductionCost(costs);

  // Get upgrade info for a building
  const getUpgradeInfo = (b: any) => {
    const currentLevel = b.current_level || 1;
    const maxLevel = b.max_level || (b.is_ai_generated ? 5 : 3);
    const levelData = (b.level_data && Array.isArray(b.level_data) ? b.level_data : []) as any[];
    
    if (currentLevel >= maxLevel) return null;
    
    const nextLevel = levelData.find((l: any) => l.level === currentLevel + 1);
    if (!nextLevel) {
      // For template buildings, check template level_data
      const template = templates.find(t => t.id === b.template_id);
      const templateLevelData = template?.level_data || [];
      const tNext = (Array.isArray(templateLevelData) ? templateLevelData : []).find((l: any) => l.level === currentLevel + 1);
      if (!tNext) return null;
      return tNext;
    }
    return nextLevel;
  };

  const getUpgradeCost = (b: any, nextLevel: any) => {
    const costMult = nextLevel.cost_mult || Math.pow(2, (nextLevel.level || 2) - 1);
    return {
      cost_wealth: Math.round((b.cost_wealth || 0) * costMult),
      cost_wood: Math.round((b.cost_wood || 0) * costMult),
      cost_stone: Math.round((b.cost_stone || 0) * costMult),
      cost_iron: Math.round((b.cost_iron || 0) * costMult),
    };
  };

  const handleUpgrade = async (b: any) => {
    const nextLevelInfo = getUpgradeInfo(b);
    if (!nextLevelInfo) return;
    
    const costs = getUpgradeCost(b, nextLevelInfo);
    if (!canAfford(costs)) { toast.error("Nedostatek surovin pro vylepšení!"); return; }

    setUpgradingId(b.id);
    const newLevel = (b.current_level || 1) + 1;
    const maxLevel = b.max_level || (b.is_ai_generated ? 5 : 3);
    const isWonderConversion = b.is_ai_generated && newLevel === 5;

    // Deduct resources
    await supabase.from("realm_resources").update({
      gold_reserve: Math.max(0, (realm.gold_reserve || 0) - costs.cost_wealth),
      wood_reserve: Math.max(0, (realm.wood_reserve || 0) - costs.cost_wood),
      stone_reserve: Math.max(0, (realm.stone_reserve || 0) - costs.cost_stone),
      iron_reserve: Math.max(0, (realm.iron_reserve || 0) - costs.cost_iron),
    } as any).eq("id", realm.id);

    // Update building
    const newName = nextLevelInfo.name || b.name;
    const newEffects = nextLevelInfo.effects || b.effects;

    const updateData: any = {
      current_level: newLevel,
      name: newName,
      effects: newEffects,
    };

    if (isWonderConversion) {
      updateData.is_wonder = true;
      // Create a wonder entry
      const { data: wonder } = await supabase.from("wonders").insert({
        session_id: sessionId,
        name: newName,
        description: b.description || "",
        owner_player: currentPlayerName,
        city_id: cityId,
        era: "current",
        status: "completed",
        effects: {
          ...newEffects,
          global_influence: 10,
          diplomatic_prestige: 15,
        },
        completed_turn: currentTurn,
        image_url: b.image_url,
        image_prompt: b.image_prompt,
      }).select("id").single();

      if (wonder) {
        updateData.wonder_id = wonder.id;
      }

      // Create chronicle event
      await dispatchCommand({
        sessionId, turnNumber: currentTurn,
        actor: { name: currentPlayerName, type: "player" },
        commandType: "WONDER_COMPLETED",
        commandPayload: {
          cityId, cityName,
          wonderName: newName,
          chronicleText: `🏛️ V městě **${cityName}** se stavba **${b.name}** transformovala v **Div světa: ${newName}**! Tato legendární stavba nyní vyzařuje vliv po celém světě.`,
        },
      });

      toast.success(`🏛️ ${newName} se stal Divem světa!`, {
        description: "Stavba byla přepsána do divů světa s globálními bonusy.",
        duration: 6000,
      });
    } else {
      const chronicleText = `Ve městě **${cityName}** byla budova **${b.name}** vylepšena na **${newName}** (úroveň ${newLevel}).${nextLevelInfo.unlock ? ` Nový bonus: ${nextLevelInfo.unlock}` : ""}`;
      await dispatchCommand({
        sessionId, turnNumber: currentTurn,
        actor: { name: currentPlayerName, type: "player" },
        commandType: "UPGRADE_BUILDING",
        commandPayload: { cityId, cityName, buildingName: newName, level: newLevel, chronicleText },
      });

      toast.success(`⬆️ ${newName} — úroveň ${newLevel}!`, {
        description: nextLevelInfo.unlock || undefined,
      });
    }

    await supabase.from("city_buildings").update(updateData).eq("id", b.id);

    setUpgradingId(null);
    onRefetch?.();
    fetchData();
  };

  const handleBuild = async (template: any) => {
    if (!canAfford(template)) { toast.error("Nedostatek surovin!"); return; }
    if (template.is_unique && alreadyBuilt.has(template.id)) { toast.error("Tato stavba je unikátní a již stojí."); return; }
    setSaving(true);

    await supabase.from("realm_resources").update({
      gold_reserve: (realm.gold_reserve || 0) - template.cost_wealth,
      wood_reserve: (realm.wood_reserve || 0) - template.cost_wood,
      stone_reserve: (realm.stone_reserve || 0) - template.cost_stone,
      iron_reserve: (realm.iron_reserve || 0) - template.cost_iron,
    } as any).eq("id", realm.id);

    await supabase.from("city_buildings").insert({
      session_id: sessionId,
      city_id: cityId,
      template_id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      cost_wealth: template.cost_wealth,
      cost_wood: template.cost_wood,
      cost_stone: template.cost_stone,
      cost_iron: template.cost_iron,
      build_duration: template.build_turns,
      build_started_turn: currentTurn,
      effects: template.effects,
      flavor_text: template.flavor_text,
      status: template.build_turns <= 1 ? "completed" : "building",
      completed_turn: template.build_turns <= 1 ? currentTurn : null,
      current_level: 1,
      max_level: template.max_level || 3,
      level_data: template.level_data || [],
    } as any);

    const chronicleText = `V městě **${cityName}** byla zahájena výstavba: **${template.name}**. ${template.flavor_text || template.description}`;
    await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: currentPlayerName, type: "player" },
      commandType: "BUILD_BUILDING",
      commandPayload: { cityId, cityName, buildingName: template.name, chronicleText },
    });

    toast.success(`🏗️ Stavba "${template.name}" zahájena!`);
    setSaving(false);
    onRefetch?.();
    fetchData();
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-building", {
        body: {
          sessionId, cityId, cityName, cityLevel: settlementLevel,
          playerDescription: aiPrompt,
          buildingMyth: aiMyth || undefined,
          visualDescription: aiVisual || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      if (realm) {
        await supabase.from("realm_resources").update({
          gold_reserve: Math.max(0, (realm.gold_reserve || 0) - (data.cost_wealth || 0)),
          wood_reserve: Math.max(0, (realm.wood_reserve || 0) - (data.cost_wood || 0)),
          stone_reserve: Math.max(0, (realm.stone_reserve || 0) - (data.cost_stone || 0)),
          iron_reserve: Math.max(0, (realm.iron_reserve || 0) - (data.cost_iron || 0)),
        } as any).eq("id", realm.id);
      }

      const buildDuration = data.build_duration || 1;
      await supabase.from("city_buildings").insert({
        session_id: sessionId, city_id: cityId,
        name: data.name || "Nová stavba",
        description: data.description || "",
        category: data.category || "economic",
        cost_wealth: data.cost_wealth || 0,
        cost_wood: data.cost_wood || 0,
        cost_stone: data.cost_stone || 0,
        cost_iron: data.cost_iron || 0,
        build_duration: buildDuration,
        build_started_turn: currentTurn,
        effects: data.effects || {},
        flavor_text: data.flavor_text || null,
        founding_myth: data.founding_myth || null,
        image_prompt: data.image_prompt || null,
        image_url: data.image_url || null,
        is_ai_generated: true,
        is_arena: data.is_arena || false,
        building_tags: data.building_tags || [],
        status: buildDuration <= 1 ? "completed" : "building",
        completed_turn: buildDuration <= 1 ? currentTurn : null,
        current_level: 1,
        max_level: 5,
        level_data: data.level_data || [],
      } as any);

      const chronicleText = `V městě **${cityName}** vzniká unikátní stavba: **${data.name}**. ${data.founding_myth || data.description || ""}`;
      await dispatchCommand({
        sessionId, turnNumber: currentTurn,
        actor: { name: currentPlayerName, type: "player" },
        commandType: "BUILD_BUILDING",
        commandPayload: { cityId, cityName, buildingName: data.name, chronicleText, isAiGenerated: true },
      });

      toast.success(`✨ AI stavba "${data.name}" vytvořena! (5 úrovní, Lvl5 = Div světa)`);
      setAiPrompt(""); setAiMyth(""); setAiVisual("");
      setShowAI(false);
      onRefetch?.();
      fetchData();
    } catch (e: any) {
      toast.error("AI generování selhalo: " + (e.message || "neznámá chyba"));
    } finally {
      setAiGenerating(false);
    }
  };

  // Check if a civ building tag is already built in this city
  const civBuildingBuiltTags = new Set(
    buildings.filter(b => b.building_tags?.some((t: string) => civBuildings.some(cb => cb.tag === t)))
      .flatMap(b => (b.building_tags || []) as string[])
  );

  const handleBuildCivBuilding = async (cb: any) => {
    if (!realm || saving) return;
    if (!canAfford({ cost_wealth: cb.cost_wealth, cost_wood: cb.cost_wood, cost_stone: cb.cost_stone, cost_iron: cb.cost_iron })) {
      toast.error("Nedostatek surovin!"); return;
    }
    setSaving(true);
    await supabase.from("realm_resources").update({
      gold_reserve: (realm.gold_reserve || 0) - (cb.cost_wealth || 0),
      wood_reserve: (realm.wood_reserve || 0) - (cb.cost_wood || 0),
      stone_reserve: (realm.stone_reserve || 0) - (cb.cost_stone || 0),
      iron_reserve: (realm.iron_reserve || 0) - (cb.cost_iron || 0),
    } as any).eq("id", realm.id);

    const buildDuration = cb.build_duration || 4;
    await supabase.from("city_buildings").insert({
      session_id: sessionId, city_id: cityId,
      name: cb.name,
      description: cb.description || "",
      category: cb.category || "cultural",
      cost_wealth: cb.cost_wealth || 0,
      cost_wood: cb.cost_wood || 0,
      cost_stone: cb.cost_stone || 0,
      cost_iron: cb.cost_iron || 0,
      build_duration: buildDuration,
      build_started_turn: currentTurn,
      effects: cb.effects || {},
      flavor_text: cb.flavor_text || null,
      founding_myth: cb.founding_myth || null,
      image_prompt: cb.image_prompt || null,
      is_ai_generated: true,
      building_tags: [cb.tag],
      status: buildDuration <= 1 ? "completed" : "building",
      completed_turn: buildDuration <= 1 ? currentTurn : null,
      current_level: 1,
      max_level: 5,
      level_data: cb.level_data || [],
    } as any);

    const chronicleText = `V městě **${cityName}** začala výstavba civilizační budovy: **${cb.name}**. ${cb.founding_myth || cb.description || ""}`;
    await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: currentPlayerName, type: "player" },
      commandType: "BUILD_BUILDING",
      commandPayload: { cityId, cityName, buildingName: cb.name, chronicleText, isAiGenerated: true, isPremium: true },
    });

    toast.success(`👑 Civilizační stavba "${cb.name}" zahájena!`);
    setSaving(false);
    onRefetch?.();
    fetchData();
  };

  const handleSaveVisual = async (b: any) => {
    await supabase.from("city_buildings").update({
      flavor_text: editFlavor || b.flavor_text,
      architectural_style: editArchStyle || b.architectural_style,
    } as any).eq("id", b.id);
    // Also update wiki_entry if exists
    await supabase.from("wiki_entries").update({
      summary: editFlavor || b.flavor_text || b.description,
    } as any).eq("entity_id", b.id).eq("entity_type", "building");
    setEditingId(null);
    toast.success("Vizuální popis uložen.");
    fetchData();
  };

  const handleRegenerateImage = async (b: any) => {
    setRegeneratingId(b.id);
    try {
      const { data, error } = await supabase.functions.invoke("encyclopedia-image", {
        body: {
          entityType: b.is_arena ? "arena" : "building",
          entityName: b.name,
          entityId: b.id,
          sessionId,
          description: b.architectural_style || b.flavor_text || b.description,
          flavorText: b.founding_myth || "",
        },
      });
      if (error) throw error;
      if (data?.imageUrl) {
        await supabase.from("city_buildings").update({
          image_url: data.imageUrl,
          image_prompt: data.imagePrompt,
        } as any).eq("id", b.id);
        // Sync to wiki
        await supabase.from("wiki_entries").update({
          image_url: data.imageUrl,
          image_prompt: data.imagePrompt,
        } as any).eq("entity_id", b.id).eq("entity_type", "building");
        toast.success("Nový obrázek vygenerován!");
        fetchData();
      } else {
        toast.error("Generování obrázku selhalo.");
      }
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "neznámá chyba"));
    } finally {
      setRegeneratingId(null);
    }
  };

  const activeBuildings = buildings.filter(b => b.status === "completed");
  const constructing = buildings.filter(b => b.status === "building");

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const BuildingCard = ({ b, isConstructing = false }: { b: any; isConstructing?: boolean }) => {
    const effects = (b.effects && typeof b.effects === "object") ? b.effects : {};
    const turnsLeft = isConstructing ? Math.max(0, b.build_started_turn + b.build_duration - currentTurn) : 0;
    const currentLevel = b.current_level || 1;
    const maxLevel = b.max_level || (b.is_ai_generated ? 5 : 3);
    const upgradeInfo = !isConstructing ? getUpgradeInfo(b) : null;
    const upgradeCosts = upgradeInfo ? getUpgradeCost(b, upgradeInfo) : null;
    const canUpgrade = upgradeCosts ? canAfford(upgradeCosts) : false;
    const isWonderLevel = b.is_wonder;

    return (
      <div className={`rounded-lg border overflow-hidden ${
        isWonderLevel ? "border-yellow-500/50 bg-gradient-to-br from-yellow-500/5 to-amber-500/10" :
        isConstructing ? "border-muted bg-muted/20" : "border-border"
      }`}>
        {b.image_url && (
          <div className="relative w-full h-32 overflow-hidden">
            <img src={b.image_url} alt={b.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
            {isWonderLevel && (
              <div className="absolute top-2 right-2">
                <Badge className="bg-yellow-500/90 text-black text-[9px] gap-0.5">
                  <Crown className="h-2.5 w-2.5" />Div světa
                </Badge>
              </div>
            )}
          </div>
        )}
        <div className="p-3">
          <div className="flex items-center gap-2">
            {isWonderLevel ? (
              <Crown className="h-4 w-4 text-yellow-500 shrink-0" />
            ) : isConstructing ? (
              <Hammer className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-display font-semibold">{b.name}</p>
              <p className="text-[10px] text-muted-foreground">{b.description}</p>
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">{b.category}</Badge>
            {b.is_ai_generated && !isWonderLevel && <Badge variant="secondary" className="text-[9px]">✨ AI</Badge>}
            {isConstructing && (
              <Badge variant="outline" className="text-[10px]">
                🏗️ {turnsLeft > 0 ? `${turnsLeft} kol` : "Dokončuje se"}
              </Badge>
            )}
          </div>

          {/* Level indicator */}
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[9px] text-muted-foreground">Úroveň:</span>
            <div className="flex gap-0.5">
              {Array.from({ length: maxLevel }).map((_, i) => (
                <div key={i} className={`w-3 h-1.5 rounded-sm ${
                  i < currentLevel
                    ? (i === 4 ? "bg-yellow-500" : "bg-primary")
                    : "bg-muted"
                }`} />
              ))}
            </div>
            <span className="text-[9px] font-semibold text-primary">{currentLevel}/{maxLevel}</span>
            {b.is_ai_generated && currentLevel < 5 && (
              <span className="text-[8px] text-yellow-500/70 ml-1">Lvl5 = Div světa</span>
            )}
          </div>

          {b.flavor_text && (
            <p className="text-[10px] text-muted-foreground/70 italic mt-1">„{b.flavor_text}"</p>
          )}
          {b.founding_myth && (
            <div className="mt-2 p-2 rounded bg-muted/30 border border-border/50">
              <p className="text-[9px] text-muted-foreground font-display mb-0.5">📜 MÝTUS</p>
              <p className="text-[10px] text-muted-foreground/80 italic">{b.founding_myth}</p>
            </div>
          )}

          {/* Current effects */}
          {Object.keys(effects).filter(k => effects[k] && Number(effects[k]) > 0).length > 0 && (
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {Object.entries(effects).filter(([, v]) => Number(v) > 0).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-[9px]">
                  {EFFECT_LABELS[k] || k.replace(/_/g, " ")}: +{String(v)}
                </Badge>
              ))}
            </div>
          )}

          {/* Upgrade section */}
          {isOwner && upgradeInfo && !isConstructing && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-display font-semibold flex items-center gap-1">
                    <ArrowUp className="h-3 w-3 text-primary" />
                    Vylepšit na: {upgradeInfo.name} (Lvl{(currentLevel || 1) + 1})
                    {b.is_ai_generated && currentLevel + 1 === 5 && (
                      <Badge className="bg-yellow-500/80 text-black text-[8px] ml-1 gap-0.5">
                        <Star className="h-2 w-2" />Div světa!
                      </Badge>
                    )}
                  </p>
                  {upgradeInfo.unlock && (
                    <p className="text-[9px] text-primary/80 mt-0.5">🔓 {upgradeInfo.unlock}</p>
                  )}
                  {upgradeCosts && (
                    <div className="flex gap-1 text-[9px] text-muted-foreground mt-0.5">
                      {upgradeCosts.cost_wealth > 0 && <span>💰{upgradeCosts.cost_wealth}</span>}
                      {upgradeCosts.cost_wood > 0 && <span>🪵{upgradeCosts.cost_wood}</span>}
                      {upgradeCosts.cost_stone > 0 && <span>🪨{upgradeCosts.cost_stone}</span>}
                      {upgradeCosts.cost_iron > 0 && <span>⚙️{upgradeCosts.cost_iron}</span>}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={b.is_ai_generated && currentLevel + 1 === 5 ? "default" : "outline"}
                  className={`h-7 text-[10px] gap-1 shrink-0 ${
                    b.is_ai_generated && currentLevel + 1 === 5 ? "bg-yellow-600 hover:bg-yellow-700 text-black" : ""
                  }`}
                  disabled={!canUpgrade || upgradingId === b.id}
                  onClick={() => handleUpgrade(b)}
                >
                  {upgradingId === b.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowUp className="h-3 w-3" />
                  )}
                  {b.is_ai_generated && currentLevel + 1 === 5 ? "Povýšit na Div" : "Vylepšit"}
                </Button>
              </div>
            </div>
          )}

          {/* Visual editing section */}
          {isOwner && !isConstructing && (
            <div className="mt-2 pt-2 border-t border-border/50">
              {editingId === b.id ? (
                <div className="space-y-2">
                  <div>
                    <Label className="text-[9px] text-muted-foreground">Popis architektury</Label>
                    <Textarea
                      value={editArchStyle}
                      onChange={e => setEditArchStyle(e.target.value)}
                      placeholder="Kamenné sloupy, korintské hlavice, otevřená tribuna..."
                      className="text-[10px] h-14 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[9px] text-muted-foreground">Atmosféra / flavor</Label>
                    <Input
                      value={editFlavor}
                      onChange={e => setEditFlavor(e.target.value)}
                      placeholder="Monumentální aréna zalitá sluncem..."
                      className="text-[10px] h-7 mt-0.5"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-6 text-[9px] gap-1"
                      onClick={() => { handleSaveVisual(b); }}>
                      <CheckCircle2 className="h-2.5 w-2.5" />Uložit
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-[9px] gap-1"
                      disabled={regeneratingId === b.id}
                      onClick={() => { handleSaveVisual(b).then(() => handleRegenerateImage(b)); }}>
                      {regeneratingId === b.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ImageIcon className="h-2.5 w-2.5" />}
                      Uložit & přegenerovat obrázek
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[9px]"
                      onClick={() => setEditingId(null)}>Zrušit</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-6 text-[9px] gap-1"
                    onClick={() => {
                      setEditingId(b.id);
                      setEditFlavor(b.flavor_text || "");
                      setEditArchStyle((b as any).architectural_style || "");
                    }}>
                    <Sparkles className="h-2.5 w-2.5" />Upravit vizuál
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[9px] gap-1"
                    disabled={regeneratingId === b.id}
                    onClick={() => handleRegenerateImage(b)}>
                    {regeneratingId === b.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ImageIcon className="h-2.5 w-2.5" />}
                    Přegenerovat obrázek
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />Stavby města
          <Badge variant="secondary" className="text-[10px] ml-auto">{activeBuildings.length} aktivních</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeBuildings.length > 0 && (
          <div className="space-y-2">
            {activeBuildings.map(b => <BuildingCard key={b.id} b={b} />)}
          </div>
        )}

        {constructing.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-display font-semibold flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />Ve výstavbě
            </p>
            {constructing.map(b => <BuildingCard key={b.id} b={b} isConstructing />)}
          </div>
        )}

        {/* ═══ CIVILIZAČNÍ PRÉMIOVÉ BUDOVY — Generate if missing ═══ */}
        {isOwner && civBuildings.length === 0 && civBuildingTags.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-primary/30">
            <p className="text-xs font-display font-semibold flex items-center gap-1.5 text-primary">
              <Crown className="h-3.5 w-3.5" />Civilizační budovy (exkluzivní)
            </p>
            <p className="text-[10px] text-muted-foreground">
              Vaše civilizace má unikátní building tagy ({civBuildingTags.join(", ")}), ale budovy ještě nebyly navrženy.
            </p>
            <Button size="sm" variant="outline" className="w-full text-xs gap-1 border-primary/40 text-primary"
              disabled={generatingCivBuildings}
              onClick={async () => {
                setGeneratingCivBuildings(true);
                try {
                  const { error } = await supabase.functions.invoke("generate-civ-buildings", {
                    body: { sessionId, playerName: currentPlayerName },
                  });
                  if (error) throw error;
                  toast.success("Civilizační budovy vygenerovány!");
                  fetchData();
                } catch (e: any) {
                  toast.error("Generování selhalo: " + (e.message || "neznámá chyba"));
                } finally {
                  setGeneratingCivBuildings(false);
                }
              }}>
              {generatingCivBuildings ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {generatingCivBuildings ? "Generuji…" : "Navrhnout civilizační budovy (AI)"}
            </Button>
          </div>
        )}
        {/* ═══ CIVILIZAČNÍ PRÉMIOVÉ BUDOVY — Display ═══ */}
        {isOwner && civBuildings.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-primary/30">
            <p className="text-xs font-display font-semibold flex items-center gap-1.5 text-primary">
              <Crown className="h-3.5 w-3.5" />Civilizační budovy (exkluzivní)
            </p>
            <p className="text-[10px] text-muted-foreground">
              Prémiové budovy unikátní pro vaši civilizaci. Silnější efekty, vyšší náklady, 5 úrovní → Div světa.
            </p>
            {civBuildings.map((cb, i) => {
              const alreadyBuiltHere = civBuildingBuiltTags.has(cb.tag);
              const affordable = canAfford({ cost_wealth: cb.cost_wealth, cost_wood: cb.cost_wood, cost_stone: cb.cost_stone, cost_iron: cb.cost_iron });
              const effects = cb.effects || {};

              // Unlock conditions
              const reqLevel = cb.required_settlement_level || "HAMLET";
              const reqBuildingsCount = cb.required_buildings_count || 0;
              const reqLevelIdx = SETTLEMENT_ORDER.indexOf(reqLevel);
              const meetsLevelReq = settlementIdx >= reqLevelIdx;
              const meetsBuiltReq = activeBuildings.length >= reqBuildingsCount;
              const isLocked = !meetsLevelReq || !meetsBuiltReq;

              const lockReasons: string[] = [];
              if (!meetsLevelReq) lockReasons.push(`Vyžaduje úroveň ${reqLevel}`);
              if (!meetsBuiltReq) lockReasons.push(`Vyžaduje ${reqBuildingsCount} postavených budov (máš ${activeBuildings.length})`);

              return (
                <div key={i} className={`p-3 rounded-lg border transition-colors ${
                  alreadyBuiltHere ? "border-muted bg-muted/10 opacity-50" :
                  isLocked ? "border-muted/50 bg-muted/5 opacity-60" :
                  "border-primary/30 bg-primary/5 hover:border-primary/50"
                }`}>
                  <div className="flex items-center gap-2">
                    <Crown className={`h-4 w-4 shrink-0 ${isLocked ? "text-muted-foreground" : "text-primary"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-display font-semibold">{cb.name}</p>
                      <p className="text-[10px] text-muted-foreground">{cb.description}</p>
                      {cb.level_data?.length > 0 && (
                        <p className="text-[9px] text-primary/60 mt-0.5">
                          5 úrovní: {cb.level_data.slice(0, 3).map((l: any) => l.name).join(" → ")}…→ {cb.level_data[cb.level_data.length - 1]?.name}
                        </p>
                      )}
                    </div>
                    <Badge className="text-[9px] shrink-0 bg-primary/20 text-primary border-primary/30">👑 Prémiová</Badge>
                    {alreadyBuiltHere ? (
                      <Badge variant="secondary" className="text-[9px] shrink-0">Postaveno</Badge>
                    ) : isLocked ? (
                      <Badge variant="outline" className="text-[9px] shrink-0 text-muted-foreground">🔒 Zamčeno</Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                        disabled={saving || !affordable} onClick={() => handleBuildCivBuilding(cb)}>
                        <Hammer className="h-3 w-3" />Stavět
                      </Button>
                    )}
                  </div>
                  {isLocked && lockReasons.length > 0 && (
                    <div className="mt-1.5 flex gap-1 flex-wrap">
                      {lockReasons.map((r, ri) => (
                        <Badge key={ri} variant="outline" className="text-[8px] text-muted-foreground border-muted">
                          🔒 {r}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {cb.flavor_text && (
                    <p className="text-[10px] text-muted-foreground/70 italic mt-1">„{cb.flavor_text}"</p>
                  )}
                  <div className="flex gap-2 mt-1.5 flex-wrap items-center">
                    <div className="flex gap-1 text-[9px] text-muted-foreground">
                      {cb.cost_wealth > 0 && <span>💰{cb.cost_wealth}</span>}
                      {cb.cost_wood > 0 && <span>🪵{cb.cost_wood}</span>}
                      {cb.cost_stone > 0 && <span>🪨{cb.cost_stone}</span>}
                      {cb.cost_iron > 0 && <span>⚙️{cb.cost_iron}</span>}
                      <span>⏱️{cb.build_duration}k</span>
                    </div>
                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                    <div className="flex gap-1 text-[9px] flex-wrap">
                      {Object.entries(effects).filter(([, v]) => Number(v) > 0).map(([k, v]) => (
                        <Badge key={k} variant="outline" className="text-[8px] border-primary/30 text-primary">
                          {EFFECT_LABELS[k] || k.replace(/_/g, " ")} +{String(v)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isOwner && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <p className="text-xs font-display font-semibold flex items-center gap-1">
                <Plus className="h-3 w-3" />Nová stavba
              </p>
              <Button
                size="sm"
                variant={showAI ? "default" : "outline"}
                className="h-6 text-[10px] gap-1"
                onClick={() => setShowAI(!showAI)}
              >
                <Sparkles className="h-3 w-3" />{showAI ? "Šablony" : "Navrhnout vlastní (AI, 5 Lvl)"}
              </Button>
            </div>

            {showAI ? (
              <div className="space-y-3">
                <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-[10px] text-yellow-200/80">
                    <Star className="h-3 w-3 inline mr-1" />
                    AI stavba má <strong>5 úrovní</strong>. Na úrovni 5 se promění v <strong>Div světa</strong> s globálními bonusy a zápisem do kroniky!
                  </p>
                </div>

                <div className="space-y-2">
                  <div>
                    <Label className="text-[11px] font-display">Co chcete postavit? *</Label>
                    <Textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                      placeholder="Např. Věž strážců – vysoká kamenná věž na okraji osady..." rows={2} className="text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-display">Zakladatelský mýtus (volitelné)</Label>
                    <Textarea value={aiMyth} onChange={e => setAiMyth(e.target.value)}
                      placeholder="Podle legendy první kámen položil sám praotec kmene..." rows={2} className="text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-display flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" />Vizuální popis (volitelné)
                    </Label>
                    <Input value={aiVisual} onChange={e => setAiVisual(e.target.value)}
                      placeholder="Tmavý kámen, vysoká špička, gotický styl..." className="text-xs mt-1" />
                  </div>
                </div>

                <Button size="sm" onClick={handleAIGenerate} disabled={aiGenerating || !aiPrompt.trim()} className="w-full text-xs gap-1">
                  {aiGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {aiGenerating ? "Generuji návrh..." : "Vygenerovat návrh (5 úrovní)"}
                </Button>
              </div>
            ) : (
              <Tabs value={activeCategory} onValueChange={setActiveCategory}>
                <TabsList className="h-7 w-full">
                  {Object.entries(CATEGORY_META).map(([key, meta]) => (
                    <TabsTrigger key={key} value={key} className="text-[10px] gap-1 px-2">
                      {meta.icon}{meta.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {Object.entries(CATEGORY_META).map(([catKey]) => (
                  <TabsContent key={catKey} value={catKey} className="mt-2 space-y-2">
                    {(categorized[catKey] || []).length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic text-center py-3">
                        Žádné šablony v této kategorii pro úroveň {settlementLevel}.
                      </p>
                    )}
                    {(categorized[catKey] || []).map(t => {
                      const built = t.is_unique && alreadyBuilt.has(t.id);
                      const affordable = canAfford(t);
                      const levelData = Array.isArray(t.level_data) ? t.level_data : [];
                      return (
                        <div key={t.id} className={`p-3 rounded-lg border transition-colors ${
                          built ? "border-muted bg-muted/10 opacity-50" : "border-border hover:border-primary/40"
                        }`}>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-display font-semibold">{t.name}</p>
                              <p className="text-[10px] text-muted-foreground">{t.description}</p>
                              {levelData.length > 1 && (
                                <p className="text-[9px] text-primary/60 mt-0.5">
                                  3 úrovně: {levelData.map((l: any) => l.name).join(" → ")}
                                </p>
                              )}
                            </div>
                            {built ? (
                              <Badge variant="secondary" className="text-[9px] shrink-0">Postaveno</Badge>
                            ) : (
                              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 shrink-0"
                                disabled={saving || !affordable} onClick={() => handleBuild(t)}>
                                <Hammer className="h-3 w-3" />Stavět
                              </Button>
                            )}
                          </div>
                          <div className="flex gap-2 mt-1.5 flex-wrap items-center">
                            <div className="flex gap-1 text-[9px] text-muted-foreground">
                              {t.cost_wealth > 0 && <span>💰{t.cost_wealth}</span>}
                              {t.cost_wood > 0 && <span>🪵{t.cost_wood}</span>}
                              {t.cost_stone > 0 && <span>🪨{t.cost_stone}</span>}
                              {t.cost_iron > 0 && <span>⚙️{t.cost_iron}</span>}
                              <span>⏱️{t.build_turns}k</span>
                            </div>
                            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                            <div className="flex gap-1 text-[9px] flex-wrap">
                              {Object.entries(t.effects || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => (
                                <Badge key={k} variant="outline" className="text-[8px]">
                                  {EFFECT_LABELS[k] || k.replace(/_/g, " ")} +{String(v)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        )}

        {buildings.length === 0 && !isOwner && (
          <p className="text-xs text-muted-foreground italic text-center py-4">Město zatím nemá žádné stavby.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default CityBuildingsPanel;
