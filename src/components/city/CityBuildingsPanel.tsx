import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "sonner";
import {
  Building2, Loader2, Plus, Sparkles, Hammer, Shield, Landmark, Coins,
  Factory, Church, ArrowRight, Clock, CheckCircle2,
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
  religious: { label: "Náboženské", icon: <Church className="h-3.5 w-3.5" /> },
  infrastructure: { label: "Infrastruktura", icon: <Factory className="h-3.5 w-3.5" /> },
};

const SETTLEMENT_ORDER = ["HAMLET", "TOWNSHIP", "CITY", "POLIS"];

const CityBuildingsPanel = ({
  sessionId, cityId, cityName, settlementLevel, realm,
  currentPlayerName, currentTurn, isOwner, onRefetch,
}: Props) => {
  const [buildings, setBuildings] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [activeCategory, setActiveCategory] = useState("economic");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [bRes, tRes] = await Promise.all([
      supabase.from("city_buildings").select("*").eq("city_id", cityId).order("created_at"),
      supabase.from("building_templates").select("*").order("category, name"),
    ]);
    setBuildings(bRes.data || []);
    setTemplates(tRes.data || []);
    setLoading(false);
  }, [cityId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const settlementIdx = SETTLEMENT_ORDER.indexOf(settlementLevel);

  // Filter templates available for current settlement level
  const availableTemplates = templates.filter(t => {
    const reqIdx = SETTLEMENT_ORDER.indexOf(t.required_settlement_level);
    return reqIdx <= settlementIdx;
  });

  const categorized = availableTemplates.reduce<Record<string, any[]>>((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  const alreadyBuilt = new Set(buildings.filter(b => b.template_id).map(b => b.template_id));

  const canAfford = (t: any) => realm &&
    (realm.gold_reserve || 0) >= t.cost_wealth &&
    (realm.wood_reserve || 0) >= t.cost_wood &&
    (realm.stone_reserve || 0) >= t.cost_stone &&
    (realm.iron_reserve || 0) >= t.cost_iron;

  const handleBuild = async (template: any) => {
    if (!canAfford(template)) { toast.error("Nedostatek surovin!"); return; }
    if (template.is_unique && alreadyBuilt.has(template.id)) { toast.error("Tato stavba je unikátní a již stojí."); return; }
    setSaving(true);

    // Deduct resources
    await supabase.from("realm_resources").update({
      gold_reserve: (realm.gold_reserve || 0) - template.cost_wealth,
      wood_reserve: (realm.wood_reserve || 0) - template.cost_wood,
      stone_reserve: (realm.stone_reserve || 0) - template.cost_stone,
      iron_reserve: (realm.iron_reserve || 0) - template.cost_iron,
    } as any).eq("id", realm.id);

    // Insert building
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
    });

    // Chronicle
    await supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `V městě **${cityName}** byla zahájena výstavba: **${template.name}**. ${template.flavor_text || template.description}`,
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
          session_id: sessionId,
          city_id: cityId,
          city_name: cityName,
          settlement_level: settlementLevel,
          player_name: currentPlayerName,
          prompt: aiPrompt,
          current_turn: currentTurn,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`✨ AI stavba "${data?.name || "nová stavba"}" vytvořena!`);
      setAiPrompt("");
      setShowAI(false);
      onRefetch?.();
      fetchData();
    } catch (e: any) {
      toast.error("AI generování selhalo: " + (e.message || "neznámá chyba"));
    } finally {
      setAiGenerating(false);
    }
  };

  const activeBuildings = buildings.filter(b => b.status === "completed");
  const constructing = buildings.filter(b => b.status === "building");

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />Stavby města
          <Badge variant="secondary" className="text-[10px] ml-auto">{activeBuildings.length} aktivních</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active buildings */}
        {activeBuildings.length > 0 && (
          <div className="space-y-2">
            {activeBuildings.map(b => {
              const effects = (b.effects && typeof b.effects === "object") ? b.effects : {};
              return (
                <div key={b.id} className="p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-display font-semibold">{b.name}</p>
                      <p className="text-[10px] text-muted-foreground">{b.description}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{b.category}</Badge>
                    {b.is_ai_generated && <Badge variant="secondary" className="text-[9px]">✨ AI</Badge>}
                  </div>
                  {b.flavor_text && (
                    <p className="text-[10px] text-muted-foreground/70 italic mt-1">„{b.flavor_text}"</p>
                  )}
                  {Object.keys(effects).length > 0 && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {Object.entries(effects).map(([k, v]) => (
                        <Badge key={k} variant="outline" className="text-[9px]">
                          {k.replace(/_/g, " ")}: +{String(v)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Under construction */}
        {constructing.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-display font-semibold flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />Ve výstavbě
            </p>
            {constructing.map(b => {
              const turnsLeft = Math.max(0, b.build_started_turn + b.build_duration - currentTurn);
              return (
                <div key={b.id} className="p-3 rounded-lg border border-muted bg-muted/20 animate-pulse">
                  <div className="flex items-center gap-2">
                    <Hammer className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-display font-semibold">{b.name}</p>
                      <p className="text-[10px] text-muted-foreground">{b.description}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      🏗️ {turnsLeft > 0 ? `${turnsLeft} kol` : "Dokončuje se"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Build new — template picker */}
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
                <Sparkles className="h-3 w-3" />{showAI ? "Šablony" : "AI stavba"}
              </Button>
            </div>

            {showAI ? (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground">
                  Popište stavbu, kterou chcete vytvořit. AI navrhne mechaniky, popis a příběh.
                </p>
                <Textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="Např.: Starodávná observatoř na vrcholu kopce, kde mudrci pozorují hvězdy a předpovídají budoucnost..."
                  rows={3}
                  className="text-xs"
                />
                <Button
                  size="sm"
                  onClick={handleAIGenerate}
                  disabled={aiGenerating || !aiPrompt.trim()}
                  className="w-full text-xs gap-1"
                >
                  {aiGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {aiGenerating ? "Generuji stavbu..." : "Vygenerovat AI stavbu"}
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
                      return (
                        <div
                          key={t.id}
                          className={`p-3 rounded-lg border transition-colors ${
                            built ? "border-muted bg-muted/10 opacity-50" : "border-border hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-display font-semibold">{t.name}</p>
                              <p className="text-[10px] text-muted-foreground">{t.description}</p>
                            </div>
                            {built ? (
                              <Badge variant="secondary" className="text-[9px] shrink-0">Postaveno</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] gap-1 shrink-0"
                                disabled={saving || !affordable}
                                onClick={() => handleBuild(t)}
                              >
                                <Hammer className="h-3 w-3" />Stavět
                              </Button>
                            )}
                          </div>
                          {/* Costs */}
                          <div className="flex gap-2 mt-1.5 flex-wrap items-center">
                            <div className="flex gap-1 text-[9px] text-muted-foreground">
                              {t.cost_wealth > 0 && <span>💰{t.cost_wealth}</span>}
                              {t.cost_wood > 0 && <span>🪵{t.cost_wood}</span>}
                              {t.cost_stone > 0 && <span>🪨{t.cost_stone}</span>}
                              {t.cost_iron > 0 && <span>⚙️{t.cost_iron}</span>}
                              <span>⏱️{t.build_turns}k</span>
                            </div>
                            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                            <div className="flex gap-1 text-[9px]">
                              {Object.entries(t.effects || {}).map(([k, v]) => (
                                <Badge key={k} variant="outline" className="text-[8px]">
                                  {k.replace(/_/g, " ")} +{String(v)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          {t.flavor_text && (
                            <p className="text-[9px] text-muted-foreground/60 italic mt-1">„{t.flavor_text}"</p>
                          )}
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
