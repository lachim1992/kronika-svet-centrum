import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Crown, Sparkles, Loader2, Save, Wheat, Trees, Mountain, Pickaxe, Coins, Users, Swords, Shield, Bike, Baby, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ModifierDef {
  key: string;
  label: string;
  icon: React.ElementType;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  category: string;
}

const MODIFIER_DEFS: ModifierDef[] = [
  // Production
  { key: "grain_modifier", label: "Obilí", icon: Wheat, min: -0.15, max: 0.25, step: 0.01, format: v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, category: "Produkce" },
  { key: "wood_modifier", label: "Dřevo", icon: Trees, min: -0.15, max: 0.25, step: 0.01, format: v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, category: "Produkce" },
  { key: "stone_modifier", label: "Kámen", icon: Mountain, min: -0.15, max: 0.25, step: 0.01, format: v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, category: "Produkce" },
  { key: "iron_modifier", label: "Železo", icon: Pickaxe, min: -0.15, max: 0.25, step: 0.01, format: v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, category: "Produkce" },
  { key: "wealth_modifier", label: "Bohatství", icon: Coins, min: -0.15, max: 0.25, step: 0.01, format: v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, category: "Produkce" },
  // Population
  { key: "pop_growth_modifier", label: "Růst populace", icon: Baby, min: -0.01, max: 0.02, step: 0.001, format: v => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`, category: "Populace" },
  { key: "initial_burgher_ratio", label: "Měšťané (start)", icon: Users, min: -0.15, max: 0.20, step: 0.01, format: v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, category: "Populace" },
  { key: "initial_cleric_ratio", label: "Klerici (start)", icon: Users, min: -0.10, max: 0.15, step: 0.01, format: v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, category: "Populace" },
  // Military
  { key: "morale_modifier", label: "Morálka vojsk", icon: Swords, min: -5, max: 10, step: 1, format: v => `${v >= 0 ? "+" : ""}${v}`, category: "Vojenství" },
  { key: "mobilization_speed", label: "Rychlost mobilizace", icon: Swords, min: 0.5, max: 1.5, step: 0.1, format: v => `×${v.toFixed(1)}`, category: "Vojenství" },
  { key: "cavalry_bonus", label: "Jezdectvo", icon: Swords, min: 0, max: 0.3, step: 0.01, format: v => `+${Math.round(v * 100)}%`, category: "Vojenství" },
  { key: "fortification_bonus", label: "Fortifikace", icon: Shield, min: 0, max: 0.25, step: 0.01, format: v => `+${Math.round(v * 100)}%`, category: "Vojenství" },
  // Stability
  { key: "stability_modifier", label: "Stabilita", icon: Shield, min: -10, max: 10, step: 1, format: v => `${v >= 0 ? "+" : ""}${v}`, category: "Stabilita" },
];

const CATEGORY_LABELS: Record<string, string> = {
  "Produkce": "⚒️ Produkce surovin",
  "Populace": "👥 Populace & demografie",
  "Vojenství": "⚔️ Vojenství & boj",
  "Stabilita": "🛡️ Stabilita & diplomacie",
};

interface FactionDesignerProps {
  sessionId: string;
  playerName: string;
  onComplete?: () => void;
  /** If true, shown inline in wizard mode (compact) */
  wizardMode?: boolean;
}

const FactionDesigner = ({ sessionId, playerName, onComplete, wizardMode }: FactionDesignerProps) => {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modifiers, setModifiers] = useState<Record<string, any>>({});
  const [hasPreview, setHasPreview] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [existingIdentity, setExistingIdentity] = useState<any>(null);

  // Load existing identity
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("civ_identity")
        .select("*")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .maybeSingle();
      if (data) {
        setExistingIdentity(data);
        setModifiers(data);
        setPrompt(data.source_description || "");
        setHasPreview(true);
      }
    })();
  }, [sessionId, playerName]);

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Popište svou civilizaci"); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-civ-identity", {
        body: { sessionId, playerName, civDescription: prompt },
      });
      if (error) throw error;
      setModifiers(data);
      setHasPreview(true);
      setEditOpen(false);
      toast.success("Frakce vygenerována — zkontrolujte modifikátory");
    } catch (e: any) {
      toast.error("Generování selhalo: " + (e.message || "neznámá chyba"));
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // The generation already saved to DB, but if user edited, we need to update
      const updateData: Record<string, any> = {};
      for (const def of MODIFIER_DEFS) {
        if (modifiers[def.key] !== undefined) updateData[def.key] = modifiers[def.key];
      }
      updateData.display_name = modifiers.display_name || null;
      updateData.flavor_summary = modifiers.flavor_summary || null;
      updateData.culture_tags = modifiers.culture_tags || [];
      updateData.urban_style = modifiers.urban_style || "organic";
      updateData.society_structure = modifiers.society_structure || "tribal";
      updateData.military_doctrine = modifiers.military_doctrine || "defensive";
      updateData.economic_focus = modifiers.economic_focus || "agrarian";
      updateData.building_tags = modifiers.building_tags || [];

      await supabase.from("civ_identity").upsert({
        session_id: sessionId,
        player_name: playerName,
        ...updateData,
        source_description: prompt,
      }, { onConflict: "session_id,player_name" });

      // Sync to civilizations table
      const { data: civRow } = await supabase.from("civilizations")
        .select("id").eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();
      if (civRow) {
        await supabase.from("civilizations").update({
          civ_name: modifiers.display_name || playerName,
          core_myth: prompt,
        }).eq("id", civRow.id);
      } else {
        await supabase.from("civilizations").insert({
          session_id: sessionId,
          player_name: playerName,
          civ_name: modifiers.display_name || playerName,
          core_myth: prompt,
          civ_bonuses: {},
        });
      }

      toast.success("Frakce uložena a napojena na herní engine!");
      onComplete?.();
    } catch (e: any) {
      toast.error("Uložení selhalo: " + (e.message || "neznámá chyba"));
    }
    setSaving(false);
  };

  const updateModifier = (key: string, value: number) => {
    setModifiers(prev => ({ ...prev, [key]: value }));
  };

  // Group modifiers by category
  const categories = Object.entries(
    MODIFIER_DEFS.reduce((acc, def) => {
      if (!acc[def.category]) acc[def.category] = [];
      acc[def.category].push(def);
      return acc;
    }, {} as Record<string, ModifierDef[]>)
  );

  // Compute balance score
  const prodSum = (modifiers.grain_modifier || 0) + (modifiers.wood_modifier || 0) + (modifiers.stone_modifier || 0) + (modifiers.iron_modifier || 0) + (modifiers.wealth_modifier || 0);
  const isOverBudget = prodSum > 0.35;

  return (
    <div className={`space-y-4 ${wizardMode ? "" : "p-4"}`}>
      {!wizardMode && (
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
            <Crown className="h-7 w-7 text-illuminated" />
            Návrh frakce
          </h1>
          <p className="text-sm text-muted-foreground">Popište svůj národ — AI vygeneruje mechanické bonusy</p>
        </div>
      )}

      {/* Prompt input */}
      <div className="manuscript-card p-4 space-y-3">
        <label className="text-sm font-display font-semibold">Popište svou civilizaci</label>
        <Textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Jsme horský kmen lovců a pastevců, kteří ovládli práci se železem. Naši jezdci na divokých koních jsou postrachem nížin. Stavíme kamenné pevnosti na horských průsmycích a obchodujeme se vzácnými kovy..."
          rows={4}
          className="resize-none"
        />
        <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="w-full h-11 font-display">
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {generating ? "Generuji frakci..." : hasPreview ? "Přegenerovat" : "Vygenerovat frakci"}
        </Button>
      </div>

      {/* Preview */}
      {hasPreview && (
        <div className="manuscript-card p-4 space-y-4">
          {/* Identity header */}
          {modifiers.display_name && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-illuminated" />
                <Input
                  value={modifiers.display_name || ""}
                  onChange={e => setModifiers(prev => ({ ...prev, display_name: e.target.value }))}
                  className="font-display text-lg font-bold h-8 border-none bg-transparent p-0"
                />
              </div>
              {modifiers.flavor_summary && (
                <p className="text-sm text-muted-foreground italic">{modifiers.flavor_summary}</p>
              )}
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {modifiers.culture_tags?.map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
            {modifiers.urban_style && <Badge variant="outline" className="text-xs">🏘️ {modifiers.urban_style}</Badge>}
            {modifiers.society_structure && <Badge variant="outline" className="text-xs">👑 {modifiers.society_structure}</Badge>}
            {modifiers.military_doctrine && <Badge variant="outline" className="text-xs">⚔️ {modifiers.military_doctrine}</Badge>}
            {modifiers.economic_focus && <Badge variant="outline" className="text-xs">💰 {modifiers.economic_focus}</Badge>}
          </div>

          {/* Quick modifier summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MODIFIER_DEFS.map(def => {
              const val = modifiers[def.key];
              if (val === undefined || val === null || val === 0) return null;
              const Icon = def.icon;
              const isPositive = def.key === "mobilization_speed" ? val > 1 : val > 0;
              return (
                <div key={def.key} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${isPositive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
                  <Icon className="h-3 w-3" />
                  <span className="font-medium">{def.label}</span>
                  <span className="ml-auto font-mono">{def.format(val)}</span>
                </div>
              );
            })}
          </div>

          {isOverBudget && (
            <p className="text-xs text-destructive font-medium">⚠️ Produkční bonusy přesahují limit (+35%). Upravte hodnoty.</p>
          )}

          {/* Editable sliders */}
          <Collapsible open={editOpen} onOpenChange={setEditOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full text-xs gap-1">
                {editOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {editOpen ? "Skrýt detaily" : "Upravit modifikátory ručně"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-3">
              {categories.map(([cat, defs]) => (
                <div key={cat} className="space-y-2">
                  <p className="text-xs font-display font-semibold text-muted-foreground">{CATEGORY_LABELS[cat] || cat}</p>
                  {defs.map(def => {
                    const val = modifiers[def.key] ?? (def.key === "mobilization_speed" ? 1 : 0);
                    const Icon = def.icon;
                    return (
                      <div key={def.key} className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs w-28 shrink-0">{def.label}</span>
                        <Slider
                          value={[val]}
                          onValueChange={([v]) => updateModifier(def.key, Math.round(v / def.step) * def.step)}
                          min={def.min}
                          max={def.max}
                          step={def.step}
                          className="flex-1"
                        />
                        <span className="text-xs font-mono w-16 text-right">{def.format(val)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Building tags */}
              {modifiers.building_tags?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-display font-semibold text-muted-foreground">🏗️ Speciální budovy</p>
                  <div className="flex flex-wrap gap-1">
                    {modifiers.building_tags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Save */}
          <Button onClick={handleSave} disabled={saving || isOverBudget} className="w-full h-11 font-display" size="lg">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? "Ukládám..." : existingIdentity ? "Aktualizovat frakci" : "Potvrdit a uložit frakci"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default FactionDesigner;
