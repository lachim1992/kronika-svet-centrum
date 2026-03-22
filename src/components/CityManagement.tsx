import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, Coins, Shield, Swords, Palette, Church, Route,
  Plus, Loader2, Hammer, Crown, Wheat, Trees, Mountain, Anvil, Users,
  Sparkles, TrendingUp, Castle, ScrollText, BookOpen, ImageIcon,
} from "lucide-react";
import CityGovernancePanel from "@/components/city/CityGovernancePanel";
import CityDemographyPanel from "@/components/city/CityDemographyPanel";

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface BuildingTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  flavor_text: string | null;
  cost_wood: number;
  cost_stone: number;
  cost_iron: number;
  cost_wealth: number;
  build_turns: number;
  required_settlement_level: string;
  effects: Record<string, number>;
  is_unique: boolean;
}

interface CityBuilding {
  id: string;
  city_id: string;
  template_id: string | null;
  name: string;
  category: string;
  description: string;
  flavor_text: string | null;
  effects: Record<string, number>;
  is_ai_generated: boolean;
  image_url: string | null;
  founding_myth: string | null;
  status: string;
  build_started_turn: number;
  build_duration: number;
  completed_turn: number | null;
}

interface CityManagementProps {
  sessionId: string;
  cityId: string;
  currentPlayerName: string;
  currentTurn: number;
  onBack: () => void;
  onRefetch?: () => void;
}

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  economic: { label: "Ekonomické", icon: <Coins className="h-4 w-4" />, color: "text-yellow-400" },
  military: { label: "Vojenské", icon: <Swords className="h-4 w-4" />, color: "text-red-400" },
  cultural: { label: "Kulturní", icon: <Palette className="h-4 w-4" />, color: "text-purple-400" },
  religious: { label: "Náboženské", icon: <Church className="h-4 w-4" />, color: "text-blue-400" },
  infrastructure: { label: "Infrastruktura", icon: <Route className="h-4 w-4" />, color: "text-green-400" },
};

const EFFECT_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  food_income: { label: "Obilí", icon: <Wheat className="h-3 w-3" /> },
  wood_income: { label: "Dřevo", icon: <Trees className="h-3 w-3" /> },
  stone_income: { label: "Kámen", icon: <Mountain className="h-3 w-3" /> },
  iron_income: { label: "Železo", icon: <Anvil className="h-3 w-3" /> },
  wealth_income: { label: "Bohatství", icon: <Coins className="h-3 w-3" /> },
  stability_bonus: { label: "Stabilita", icon: <Shield className="h-3 w-3" /> },
  stability: { label: "Stabilita", icon: <Shield className="h-3 w-3" /> },
  influence_bonus: { label: "Vliv", icon: <TrendingUp className="h-3 w-3" /> },
  influence: { label: "Vliv", icon: <TrendingUp className="h-3 w-3" /> },
  population_growth: { label: "Růst pop.", icon: <Users className="h-3 w-3" /> },
  population_capacity: { label: "Kapacita pop.", icon: <Users className="h-3 w-3" /> },
  manpower_bonus: { label: "Vojenská síla", icon: <Swords className="h-3 w-3" /> },
  manpower: { label: "Vojenská síla", icon: <Swords className="h-3 w-3" /> },
  defense_bonus: { label: "Obrana", icon: <Shield className="h-3 w-3" /> },
  defense: { label: "Obrana", icon: <Shield className="h-3 w-3" /> },
  granary_capacity: { label: "Kapacita sýpky", icon: <Wheat className="h-3 w-3" /> },
  production: { label: "Produkce", icon: <Anvil className="h-3 w-3" /> },
  garrison: { label: "Posádka", icon: <Swords className="h-3 w-3" /> },
};

const SETTLEMENT_ORDER = ["HAMLET", "TOWNSHIP", "CITY", "POLIS"];
const SETTLEMENT_LABELS: Record<string, string> = { HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis" };
const MAX_SLOTS: Record<string, number> = { HAMLET: 3, TOWNSHIP: 5, CITY: 8, POLIS: 12 };
const SETTLEMENT_POP_THRESHOLDS: Record<string, number> = { HAMLET: 0, TOWNSHIP: 2000, CITY: 5000, POLIS: 10000 };

// ═══════════════════════════════════════════
// SECTIONS
// ═══════════════════════════════════════════

type Section = "overview" | "buildings" | "build-new" | "economy" | "demography" | "decrees";

const SECTIONS: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Přehled", icon: <Castle className="h-4 w-4" /> },
  { key: "buildings", label: "Stavby", icon: <Building2 className="h-4 w-4" /> },
  { key: "demography", label: "Demografie", icon: <Users className="h-4 w-4" /> },
  { key: "economy", label: "Ekonomika", icon: <Coins className="h-4 w-4" /> },
  { key: "decrees", label: "Dekrety", icon: <ScrollText className="h-4 w-4" /> },
];

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

const CityManagement = ({ sessionId, cityId, currentPlayerName, currentTurn, onBack, onRefetch }: CityManagementProps) => {
  const [section, setSection] = useState<Section>("overview");
  const [city, setCity] = useState<any>(null);
  const [buildings, setBuildings] = useState<CityBuilding[]>([]);
  const [templates, setTemplates] = useState<BuildingTemplate[]>([]);
  const [realm, setRealm] = useState<any>(null);
  const [declarations, setDeclarations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Wiki / ChroWiki state
  const [wikiImage, setWikiImage] = useState<string | null>(null);
  const [wikiSummary, setWikiSummary] = useState<string | null>(null);
  const [wikiDescription, setWikiDescription] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);

  // AI build form
  const [aiDescription, setAiDescription] = useState("");
  const [aiMyth, setAiMyth] = useState("");
  const [aiVisual, setAiVisual] = useState("");
  const [aiPreview, setAiPreview] = useState<any>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [building, setBuilding] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [cityRes, buildingsRes, templatesRes, realmRes, declRes, wikiRes] = await Promise.all([
      supabase.from("cities").select("*").eq("id", cityId).maybeSingle(),
      supabase.from("city_buildings").select("*").eq("city_id", cityId).order("created_at"),
      supabase.from("building_templates").select("*").order("category, name"),
      supabase.from("realm_resources").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
      supabase.from("declarations").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).order("created_at", { ascending: false }).limit(10),
      supabase.from("wiki_entries").select("image_url, summary, ai_description").eq("session_id", sessionId).eq("entity_type", "city").eq("entity_id", cityId).maybeSingle(),
    ]);
    setCity(cityRes.data);
    setBuildings((buildingsRes.data || []) as unknown as CityBuilding[]);
    setTemplates((templatesRes.data || []) as unknown as BuildingTemplate[]);
    setRealm(realmRes.data);
    setDeclarations(declRes.data || []);
    if (wikiRes.data) {
      setWikiImage(wikiRes.data.image_url);
      setWikiSummary(wikiRes.data.summary);
      setWikiDescription(wikiRes.data.ai_description);
    }
    setLoading(false);
  }, [cityId, sessionId, currentPlayerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxSlots = MAX_SLOTS[city?.settlement_level || "HAMLET"] || 3;
  const usedSlots = buildings.length;
  const canBuild = usedSlots < maxSlots;

  const getProductionCost = (costs: any) => (costs.cost_wood || 0) + (costs.cost_stone || 0) + (costs.cost_iron || 0);
  const canAfford = (costs: { cost_wood: number; cost_stone: number; cost_iron: number; cost_wealth: number }) => {
    if (!realm) return false;
    return (realm.production_reserve || 0) >= getProductionCost(costs) &&
           (realm.gold_reserve || 0) >= costs.cost_wealth;
  };

  const buildFromTemplate = async (t: BuildingTemplate) => {
    if (!canBuild) { toast.error("Nemáte volné stavební sloty!"); return; }
    if (!canAfford(t)) { toast.error("Nedostatek surovin!"); return; }

    setBuilding(true);
    try {
      // Deduct resources (new economy)
      const prodCost = (t.cost_wood || 0) + (t.cost_stone || 0) + (t.cost_iron || 0);
      await supabase.from("realm_resources").update({
        production_reserve: Math.max(0, (realm.production_reserve || 0) - prodCost),
        gold_reserve: (realm.gold_reserve || 0) - t.cost_wealth,
      } as any).eq("id", realm.id);

      await supabase.from("city_buildings").insert({
        session_id: sessionId,
        city_id: cityId,
        template_id: t.id,
        name: t.name,
        category: t.category,
        description: t.description,
        flavor_text: t.flavor_text,
        cost_wood: t.cost_wood,
        cost_stone: t.cost_stone,
        cost_iron: t.cost_iron,
        cost_wealth: t.cost_wealth,
        effects: t.effects,
        is_ai_generated: false,
        status: t.build_turns <= 1 ? "completed" : "building",
        build_started_turn: currentTurn,
        build_duration: t.build_turns,
        completed_turn: t.build_turns <= 1 ? currentTurn : null,
      } as any);

      toast.success(`🏗️ Stavba "${t.name}" zahájena!`);
      fetchData();
    } catch (e: any) {
      toast.error("Chyba při stavbě: " + e.message);
    }
    setBuilding(false);
  };

  const handleAIGenerate = async () => {
    if (!aiDescription.trim()) { toast.error("Popište, co chcete postavit"); return; }
    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-building", {
        body: {
          sessionId, cityId,
          playerDescription: aiDescription,
          buildingMyth: aiMyth,
          visualDescription: aiVisual,
          cityName: city?.name,
          cityLevel: city?.settlement_level,
          biome: city?.province,
        },
      });
      if (error) throw error;
      setAiPreview(data);
      toast.success("AI návrh vygenerován – zkontrolujte a potvrďte!");
    } catch (e: any) {
      toast.error("Generování selhalo: " + e.message);
    }
    setAiGenerating(false);
  };

  const confirmAIBuild = async () => {
    if (!aiPreview || !canBuild) return;
    if (!canAfford(aiPreview)) { toast.error("Nedostatek surovin!"); return; }
    setBuilding(true);
    try {
      const aiProdCost = (aiPreview.cost_wood || 0) + (aiPreview.cost_stone || 0) + (aiPreview.cost_iron || 0);
      await supabase.from("realm_resources").update({
        production_reserve: Math.max(0, (realm.production_reserve || 0) - aiProdCost),
        gold_reserve: (realm.gold_reserve || 0) - aiPreview.cost_wealth,
      } as any).eq("id", realm.id);

      await supabase.from("city_buildings").insert({
        session_id: sessionId,
        city_id: cityId,
        name: aiPreview.name,
        category: aiPreview.category,
        description: aiPreview.description,
        flavor_text: aiPreview.flavor_text,
        founding_myth: aiPreview.founding_myth,
        cost_wood: aiPreview.cost_wood,
        cost_stone: aiPreview.cost_stone,
        cost_iron: aiPreview.cost_iron,
        cost_wealth: aiPreview.cost_wealth,
        effects: aiPreview.effects,
        is_ai_generated: true,
        image_prompt: aiPreview.image_prompt,
        status: aiPreview.build_duration <= 1 ? "completed" : "building",
        build_started_turn: currentTurn,
        build_duration: aiPreview.build_duration,
        completed_turn: aiPreview.build_duration <= 1 ? currentTurn : null,
      } as any);

      toast.success(`🏗️ "${aiPreview.name}" zahájena!`);
      setAiPreview(null);
      setAiDescription("");
      setAiMyth("");
      setAiVisual("");
      setSection("buildings");
      fetchData();
    } catch (e: any) {
      toast.error("Chyba: " + e.message);
    }
    setBuilding(false);
  };

  // ── Aggregated building effects ──
  const totalEffects: Record<string, number> = {};
  for (const b of buildings.filter(b => b.status === "completed")) {
    for (const [k, v] of Object.entries(b.effects || {})) {
      totalEffects[k] = (totalEffects[k] || 0) + (typeof v === "number" ? v : 0);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!city) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Město nenalezeno</p>
        <Button variant="ghost" onClick={onBack} className="mt-4">Zpět</Button>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  return (
    <div className="flex h-full min-h-[70vh]">
      {/* ── SIDEBAR ── */}
      <div className="w-56 shrink-0 border-r border-border bg-secondary/30 p-3 space-y-1">
        <Button variant="ghost" size="sm" onClick={onBack} className="w-full justify-start gap-2 mb-3 text-xs">
          <ArrowLeft className="h-3 w-3" />Zpět na říši
        </Button>

        <div className="px-2 py-3 border-b border-border mb-2">
          <h2 className="font-display font-bold text-sm truncate">{city.name}</h2>
          <p className="text-[10px] text-muted-foreground">{SETTLEMENT_LABELS[city.settlement_level] || city.level} • {city.owner_player}</p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <span>👥 {(city.population_total || 0).toLocaleString()}</span>
            <span>🛡️ {city.city_stability}</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{usedSlots}/{maxSlots} slotů</span>
          </div>
        </div>

        {SECTIONS.map(s => (
          <Button
            key={s.key}
            variant={section === s.key ? "secondary" : "ghost"}
            size="sm"
            className={`w-full justify-start gap-2 text-xs ${section === s.key ? "bg-primary/10 text-primary font-semibold" : ""}`}
            onClick={() => setSection(s.key)}
          >
            {s.icon}{s.label}
          </Button>
        ))}

        {canBuild && (
          <Button
            variant="default"
            size="sm"
            className="w-full justify-start gap-2 text-xs mt-4"
            onClick={() => setSection("build-new")}
          >
            <Plus className="h-3 w-3" />Nová stavba
          </Button>
        )}
      </div>

      {/* ── DETAIL PANEL ── */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {/* OVERVIEW */}
        {section === "overview" && (
          <div className="space-y-4">
            {/* ── HERO IMAGE ── */}
            <div className="relative rounded-xl overflow-hidden border border-border">
              <div className="relative h-[160px] md:h-[220px]">
                {wikiImage ? (
                  <img src={wikiImage} alt={city.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/10 via-muted to-primary/5 flex items-center justify-center">
                    {generatingImage ? (
                      <Loader2 className="h-10 w-10 text-muted-foreground/30 animate-spin" />
                    ) : (
                      <Castle className="h-12 w-12 text-muted-foreground/20" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h2 className="text-xl md:text-2xl font-display font-bold">{city.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px]">{SETTLEMENT_LABELS[city.settlement_level] || city.level}</Badge>
                    <span className="text-xs text-muted-foreground">{city.owner_player}</span>
                  </div>
                </div>
                {/* Generate image button */}
                {!wikiImage && !generatingImage && (
                  <Button
                    size="sm" variant="secondary"
                    className="absolute top-2 right-2 h-7 text-[10px] gap-1 opacity-80 hover:opacity-100"
                    onClick={async () => {
                      setGeneratingImage(true);
                      try {
                        const { data } = await supabase.functions.invoke("generate-entity-media", {
                          body: {
                            sessionId, entityId: cityId, entityType: "city",
                            entityName: city.name, kind: "cover",
                            imagePrompt: [city.flavor_prompt, city.name, city.province, ...(city.tags || [])].filter(Boolean).join(", "),
                            createdBy: "city_management",
                          },
                        });
                        if (data?.imageUrl) {
                          setWikiImage(data.imageUrl);
                          await supabase.from("wiki_entries").update({ image_url: data.imageUrl } as any)
                            .eq("session_id", sessionId).eq("entity_type", "city").eq("entity_id", cityId);
                        }
                      } catch (e) { console.error(e); }
                      setGeneratingImage(false);
                    }}
                  >
                    <ImageIcon className="h-3 w-3" />Generovat obraz
                  </Button>
                )}
              </div>
            </div>

            {/* ── CHROWIKI EXCERPT ── */}
            {(wikiSummary || wikiDescription) && (
              <Card className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />Kronika města
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {wikiSummary && (
                    <p className="text-sm italic text-muted-foreground leading-relaxed">{wikiSummary}</p>
                  )}
                  {wikiDescription && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{wikiDescription}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Populace" value={(city.population_total || 0).toLocaleString()} icon={<Users className="h-4 w-4" />}
                tip="Rolníci, měšťané, klérus. Roste s budovami a stabilitou." />
              <StatCard label="Stabilita" value={city.city_stability} icon={<Shield className="h-4 w-4" />}
                tip="Pod 40 hrozí vzpoury. Zvyšuje se budovami a dekrety." className={city.city_stability < 40 ? "border-destructive/50" : ""} />
              <StatCard label="Stavby" value={`${usedSlots}/${maxSlots}`} icon={<Building2 className="h-4 w-4" />}
                tip={`Aktuální/maximální sloty. Více slotů odemknete upgradem na vyšší úroveň sídla.`} />
              <StatCard label="Úroveň" value={SETTLEMENT_LABELS[city.settlement_level] || city.level} icon={<Crown className="h-4 w-4" />}
                tip="Osada → Městečko → Město → Polis. Vyšší úroveň = více slotů a ekonomických bonusů." />
            </div>

            {/* ── Settlement Upgrade Progress ── */}
            {(() => {
              const currentLevel = city.settlement_level || "HAMLET";
              const currentIdx = SETTLEMENT_ORDER.indexOf(currentLevel);
              const nextLevel = currentIdx < SETTLEMENT_ORDER.length - 1 ? SETTLEMENT_ORDER[currentIdx + 1] : null;
              if (!nextLevel) return null;
              const nextThreshold = SETTLEMENT_POP_THRESHOLDS[nextLevel];
              const currentPop = city.population_total || 0;
              const prevThreshold = SETTLEMENT_POP_THRESHOLDS[currentLevel] || 0;
              const progress = Math.min(100, Math.max(0, ((currentPop - prevThreshold) / (nextThreshold - prevThreshold)) * 100));
              return (
                <Card className="border-primary/30">
                  <CardContent className="pt-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-display">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Postup k povýšení na <span className="font-bold text-primary">{SETTLEMENT_LABELS[nextLevel]}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {currentPop.toLocaleString()} / {nextThreshold.toLocaleString()} obyvatel
                      </span>
                    </div>
                    <div className="w-full rounded-full h-2.5" style={{ background: 'hsl(var(--muted))' }}>
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%`, background: 'hsl(var(--primary))' }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Při dosažení {nextThreshold.toLocaleString()} obyvatel se město automaticky povýší — odemkne {MAX_SLOTS[nextLevel]} stavebních slotů a vyšší kapacitu bydlení.
                    </p>
                  </CardContent>
                </Card>
              );
            })()}

            {/* ── CITY GOVERNANCE (Food, Labor, Districts, Factions) ── */}
            <CityGovernancePanel
              sessionId={sessionId}
              city={city}
              realm={realm}
              currentPlayerName={currentPlayerName}
              currentTurn={currentTurn}
              isOwner={true}
              onRefetch={() => fetchData()}
            />

            {/* Building effects summary */}
            {Object.keys(totalEffects).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />Bonusy ze staveb
                    <InfoTip>Součet efektů ze všech dokončených budov v tomto městě.</InfoTip>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(totalEffects).filter(([, v]) => v > 0).map(([key, val]) => {
                      const meta = EFFECT_LABELS[key];
                      if (!meta) return null;
                      return (
                        <Badge key={key} variant="secondary" className="gap-1 text-xs">
                          {meta.icon}
                          {meta.label}: +{val}
                        </Badge>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Active buildings list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display">Postavené budovy</CardTitle>
              </CardHeader>
              <CardContent>
                {buildings.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Zatím žádné stavby. Klikněte na „Nová stavba" v menu.</p>
                ) : (
                  <div className="space-y-2">
                    {buildings.map(b => (
                      <BuildingRow key={b.id} building={b} currentTurn={currentTurn} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* BUILDINGS LIST */}
        {section === "buildings" && (
          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />Stavby ({usedSlots}/{maxSlots})
            </h2>
            {buildings.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground italic">Zatím žádné stavby.</p>
                  <Button variant="default" size="sm" className="mt-3 gap-1" onClick={() => setSection("build-new")}>
                    <Plus className="h-3 w-3" />Postavit první budovu
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {buildings.map(b => (
                  <BuildingCard key={b.id} building={b} currentTurn={currentTurn} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* BUILD NEW */}
        {section === "build-new" && (
          <div className="space-y-6">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <Hammer className="h-5 w-5 text-primary" />Nová stavba
              <InfoTip>Vyberte z katalogu nebo navrhněte vlastní stavbu pomocí AI.</InfoTip>
            </h2>

            {!canBuild && (
              <Card className="border-destructive/50">
                <CardContent className="py-4 text-center text-sm text-destructive">
                  Nemáte volné stavební sloty ({usedSlots}/{maxSlots}). Upgradujte sídlo pro více slotů.
                </CardContent>
              </Card>
            )}

            {/* Resources bar */}
            {realm && (
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="flex items-center gap-1">⚒️ Produkce: <strong>{Math.round(realm.production_reserve || 0)}</strong></span>
                <span className="flex items-center gap-1">💰 Bohatství: <strong>{Math.round(realm.gold_reserve || 0)}</strong></span>
                <span className="flex items-center gap-1">🌾 Zásoby: <strong>{Math.round(realm.grain_reserve || 0)}</strong></span>
              </div>
            )}

            {/* Catalog */}
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-sm">📖 Katalog staveb</h3>
              {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                const catTemplates = templates.filter(t => t.category === cat);
                if (catTemplates.length === 0) return null;
                const meetLevel = (t: BuildingTemplate) => SETTLEMENT_ORDER.indexOf(city.settlement_level) >= SETTLEMENT_ORDER.indexOf(t.required_settlement_level);
                return (
                  <div key={cat} className="space-y-2">
                    <h4 className={`text-xs font-display font-semibold flex items-center gap-1.5 ${meta.color}`}>
                      {meta.icon}{meta.label}
                    </h4>
                    <div className="grid gap-2 md:grid-cols-2">
                      {catTemplates.map(t => {
                        const affordable = canAfford(t);
                        const levelOk = meetLevel(t);
                        const alreadyBuilt = buildings.some(b => b.template_id === t.id);
                        const disabled = !canBuild || !affordable || !levelOk || building || (t.is_unique && alreadyBuilt);
                        return (
                          <Card key={t.id} className={`${disabled ? "opacity-50" : "hover:border-primary/50 transition-colors"}`}>
                            <CardContent className="p-3 space-y-2">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-display font-semibold text-sm">{t.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{t.description}</p>
                                </div>
                                {!levelOk && <Badge variant="outline" className="text-[9px] shrink-0">Min. {SETTLEMENT_LABELS[t.required_settlement_level]}</Badge>}
                              </div>
                              {t.flavor_text && <p className="text-[10px] italic text-muted-foreground">„{t.flavor_text}"</p>}
                              {/* Costs — unified economy */}
                              <div className="flex flex-wrap gap-2 text-[10px]">
                                {((t.cost_wood || 0) + (t.cost_stone || 0) + (t.cost_iron || 0)) > 0 && (
                                  <span className="flex items-center gap-0.5 text-orange-400">⚒{(t.cost_wood || 0) + (t.cost_stone || 0) + (t.cost_iron || 0)}</span>
                                )}
                                {t.cost_wealth > 0 && <span className="flex items-center gap-0.5 text-yellow-400">💰{t.cost_wealth}</span>}
                                {t.build_turns > 1 && <span>⏱️ {t.build_turns} kol</span>}
                              </div>
                              {/* Effects */}
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(t.effects).filter(([, v]) => v > 0).map(([k, v]) => {
                                  const m = EFFECT_LABELS[k];
                                  return m ? <Badge key={k} variant="secondary" className="text-[9px] gap-0.5">{m.icon}+{v}</Badge> : null;
                                })}
                              </div>
                              <Button size="sm" disabled={disabled} onClick={() => buildFromTemplate(t)} className="w-full h-7 text-xs gap-1">
                                {building ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hammer className="h-3 w-3" />}
                                {alreadyBuilt ? "Již postaveno" : !affordable ? "Nedostatek surovin" : "Postavit"}
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* AI Custom Build */}
            <div className="space-y-3 pt-4 border-t border-border">
              <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />Navrhnout vlastní stavbu (AI)
                <InfoTip>Popište, co chcete postavit – funkci, vzhled, zakladatelský mýtus. AI navrhne název, efekty, cenu i příběh.</InfoTip>
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium mb-1 block">Co chcete postavit? *</label>
                  <Textarea value={aiDescription} onChange={e => setAiDescription(e.target.value)} placeholder="Např. Věž strážců – vysoká kamenná věž na okraji osady, sloužící jako hlídka a útočiště..." className="text-sm min-h-[80px]" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Zakladatelský mýtus (volitelné)</label>
                  <Textarea value={aiMyth} onChange={e => setAiMyth(e.target.value)} placeholder="Podle legendy první kámen položil sám praotec kmene..." className="text-sm min-h-[60px]" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Vizuální popis (volitelné)</label>
                  <Input value={aiVisual} onChange={e => setAiVisual(e.target.value)} placeholder="Tmavý kámen, vysoká špička, gotický styl..." className="text-sm" />
                </div>
                <Button onClick={handleAIGenerate} disabled={aiGenerating || !canBuild} className="gap-1.5">
                  {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Vygenerovat návrh
                </Button>
              </div>

              {/* AI Preview */}
              {aiPreview && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-display flex items-center gap-2">
                      {CATEGORY_META[aiPreview.category]?.icon}
                      {aiPreview.name}
                      <Badge variant="secondary" className="text-[9px]">{CATEGORY_META[aiPreview.category]?.label}</Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">{aiPreview.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {aiPreview.flavor_text && <p className="text-xs italic text-muted-foreground">„{aiPreview.flavor_text}"</p>}
                    {aiPreview.founding_myth && (
                      <div className="text-xs bg-background/50 rounded p-2 border border-border">
                        <span className="font-display font-semibold text-[10px] text-primary block mb-1">📜 Zakladatelský mýtus</span>
                        {aiPreview.founding_myth}
                      </div>
                    )}
                    {/* Costs — unified economy */}
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="font-semibold">Cena:</span>
                      {((aiPreview.cost_wood || 0) + (aiPreview.cost_stone || 0) + (aiPreview.cost_iron || 0)) > 0 && (
                        <span className="flex items-center gap-0.5 text-orange-400">⚒ {(aiPreview.cost_wood || 0) + (aiPreview.cost_stone || 0) + (aiPreview.cost_iron || 0)} Produkce</span>
                      )}
                      {aiPreview.cost_wealth > 0 && <span className="flex items-center gap-0.5 text-yellow-400">💰 {aiPreview.cost_wealth} Bohatství</span>}
                      <span>⏱️ {aiPreview.build_duration} kol</span>
                    </div>
                    {/* Effects */}
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(aiPreview.effects || {}).filter(([, v]) => (v as number) > 0).map(([k, v]) => {
                        const m = EFFECT_LABELS[k];
                        return m ? <Badge key={k} variant="secondary" className="text-[9px] gap-0.5">{m.icon}+{v as number}</Badge> : null;
                      })}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={confirmAIBuild} disabled={building || !canAfford(aiPreview)} className="gap-1.5 flex-1">
                        {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />}
                        {!canAfford(aiPreview) ? "Nedostatek surovin" : "Potvrdit a postavit"}
                      </Button>
                      <Button variant="outline" onClick={() => setAiPreview(null)}>Zrušit</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* DEMOGRAPHY */}
        {section === "demography" && city && (
          <CityDemographyPanel
            sessionId={sessionId}
            city={city}
            currentPlayerName={currentPlayerName}
            currentTurn={currentTurn}
            isOwner={true}
            onRefetch={() => fetchData()}
          />
        )}

        {/* ECONOMY */}
        {section === "economy" && (
          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />Ekonomika města
              <InfoTip>Přehled příjmů a bonusů, které generují stavby v tomto městě.</InfoTip>
            </h2>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display">Produkce ze staveb</CardTitle>
                <CardDescription className="text-xs">Pouze dokončené stavby generují bonusy.</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(totalEffects).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Žádné dokončené stavby.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(totalEffects).filter(([, v]) => v > 0).map(([key, val]) => {
                      const meta = EFFECT_LABELS[key];
                      if (!meta) return null;
                      return (
                        <div key={key} className="flex items-center gap-2 p-2 rounded bg-secondary/50 border border-border">
                          {meta.icon}
                          <div>
                            <p className="text-[10px] text-muted-foreground">{meta.label}</p>
                            <p className="font-semibold text-sm text-primary">+{val}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Per-building breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display">Rozpis po budovách</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {buildings.filter(b => b.status === "completed").map(b => (
                  <div key={b.id} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                    <span className="font-medium">{b.name}</span>
                    <div className="flex gap-1">
                      {Object.entries(b.effects || {}).filter(([, v]) => (v as number) > 0).map(([k, v]) => {
                        const m = EFFECT_LABELS[k];
                        return m ? <span key={k} className="flex items-center gap-0.5 text-muted-foreground">{m.icon}+{v as number}</span> : null;
                      })}
                    </div>
                  </div>
                ))}
                {buildings.filter(b => b.status === "completed").length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Žádné dokončené stavby.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* DECREES */}
        {section === "decrees" && (
          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />Dekrety a vyhlášení
              <InfoTip>Vaše vyhlášení a dekrety. Nové dekrety vytvořte v záložce „Správa říše → Vyhlášení".</InfoTip>
            </h2>
            {declarations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <ScrollText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground italic">Zatím žádné dekrety. Vytvořte je v záložce Správa říše.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {declarations.map(d => (
                  <Card key={d.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-1">
                        <p className="font-display font-semibold text-sm">{d.title || d.declaration_type}</p>
                        <Badge variant="outline" className="text-[9px]">Kolo {d.turn_number}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">{d.epic_text || d.original_text}</p>
                      {d.effects && Array.isArray(d.effects) && d.effects.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {d.effects.map((e: any, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[9px]">{e.effect_type}: {e.magnitude > 0 ? "+" : ""}{e.magnitude}</Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════

function StatCard({ label, value, icon, tip, className = "" }: { label: string; value: any; icon: React.ReactNode; tip: string; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {icon}
          <span>{label}</span>
          <InfoTip>{tip}</InfoTip>
        </div>
        <p className="font-display font-bold text-lg">{value}</p>
      </CardContent>
    </Card>
  );
}

function BuildingRow({ building: b, currentTurn }: { building: CityBuilding; currentTurn: number }) {
  const cat = CATEGORY_META[b.category];
  const isBuilding = b.status === "building";
  const turnsLeft = isBuilding ? Math.max(0, (b.build_started_turn + b.build_duration) - currentTurn) : 0;

  return (
    <div className="flex items-center gap-3 p-2 rounded border border-border bg-background">
      <div className={`shrink-0 ${cat?.color || ""}`}>{cat?.icon || <Building2 className="h-4 w-4" />}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{b.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">{b.description}</p>
      </div>
      {isBuilding ? (
        <Badge variant="outline" className="text-[9px] shrink-0 gap-1">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          {turnsLeft > 0 ? `${turnsLeft} kol` : "Dokončuje se"}
        </Badge>
      ) : (
        <Badge variant="secondary" className="text-[9px] shrink-0">✓ Hotovo</Badge>
      )}
    </div>
  );
}

function BuildingCard({ building: b, currentTurn }: { building: CityBuilding; currentTurn: number }) {
  const cat = CATEGORY_META[b.category];
  const isBuilding = b.status === "building";
  const turnsLeft = isBuilding ? Math.max(0, (b.build_started_turn + b.build_duration) - currentTurn) : 0;

  return (
    <Card className={isBuilding ? "border-primary/30" : ""}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={cat?.color || ""}>{cat?.icon || <Building2 className="h-4 w-4" />}</div>
            <div>
              <p className="font-display font-semibold text-sm">{b.name}</p>
              <p className="text-[10px] text-muted-foreground">{cat?.label}</p>
            </div>
          </div>
          {isBuilding ? (
            <Badge variant="outline" className="text-[9px] gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {turnsLeft > 0 ? `ještě ${turnsLeft} kol` : "Dokončuje se"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[9px]">✓</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{b.description}</p>
        {b.flavor_text && <p className="text-[10px] italic text-muted-foreground">„{b.flavor_text}"</p>}
        {b.founding_myth && (
          <div className="text-[10px] bg-secondary/30 rounded p-2 border border-border">
            <span className="font-display font-semibold text-primary block mb-0.5">📜 Mýtus</span>
            {b.founding_myth}
          </div>
        )}
        {/* Effects */}
        <div className="flex flex-wrap gap-1">
          {Object.entries(b.effects || {}).filter(([, v]) => (v as number) > 0).map(([k, v]) => {
            const m = EFFECT_LABELS[k];
            return m ? <Badge key={k} variant="secondary" className="text-[9px] gap-0.5">{m.icon}+{v as number}</Badge> : null;
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default CityManagement;
