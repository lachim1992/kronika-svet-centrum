import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Flame, Crown, Coins, Warehouse, Flag, Skull, Loader2, Scroll, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Demand {
  type: string;
  label: string;
  cost_percent?: number;
}

interface Uprising {
  id: string;
  session_id: string;
  city_id: string;
  player_name: string;
  turn_triggered: number;
  escalation_level: number;
  status: string;
  crowd_text: string | null;
  advisor_analysis: string | null;
  demands: Demand[];
  player_response_text: string | null;
  chosen_concession: string | null;
  city_name?: string;
  famine_consecutive_turns?: number;
  population_total?: number;
  city_stability?: number;
}

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn: number;
  onResolved?: () => void;
}

const CONCESSION_ICONS: Record<string, React.ElementType> = {
  pay_wealth: Coins,
  open_stores: Warehouse,
  cede_city: Flag,
  abdicate: Skull,
  forced_secession: Flame,
};

const CONCESSION_DESCRIPTIONS: Record<string, string> = {
  pay_wealth: "Otevřete pokladnu a vyplaťte lid. Ztratíte % bohatství, ale získáte čas.",
  open_stores: "Uvolníte VŠECHNY zásoby surovin. Hladomor okamžitě skončí, ale ekonomika bude zničena.",
  cede_city: "Město přejde pod nezávislou správu. Ztratíte území, ale zachráníte říši.",
  abdicate: "Vzdáte se vlády. V singleplayeru konec hry, v multiplayeru ztráta vedení.",
  forced_secession: "Město se odtrhne samo — nejhorší výsledek eskalace.",
};

const UprisingDialog = ({ sessionId, playerName, currentTurn, onResolved }: Props) => {
  const [uprising, setUprising] = useState<Uprising | null>(null);
  const [open, setOpen] = useState(false);
  const [playerResponse, setPlayerResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [selectedConcession, setSelectedConcession] = useState<string | null>(null);

  // Poll for active uprisings
  useEffect(() => {
    const check = async () => {
      const { data } = await supabase
        .from("city_uprisings")
        .select("*")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .in("status", ["pending", "escalated"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        // Fetch city info
        const { data: city } = await supabase
          .from("cities")
          .select("name, population_total, city_stability, famine_consecutive_turns")
          .eq("id", data.city_id)
          .single();

        const demands = Array.isArray(data.demands) ? data.demands : 
          (typeof data.demands === "string" ? JSON.parse(data.demands) : []);

        setUprising({
          ...data,
          demands: demands as Demand[],
          city_name: city?.name || "Neznámé město",
          famine_consecutive_turns: city?.famine_consecutive_turns || 0,
          population_total: city?.population_total || 0,
          city_stability: city?.city_stability || 0,
        });
        setOpen(true);

        // Generate AI text if not yet generated
        if (!data.crowd_text) {
          generateAIText(data.id, data.city_id, data.escalation_level);
        }
      } else {
        setUprising(null);
        setOpen(false);
      }
    };

    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [sessionId, playerName, currentTurn]);

  const generateAIText = async (uprisingId: string, cityId: string, escalationLevel: number) => {
    setGeneratingAI(true);
    try {
      const { data: city } = await supabase
        .from("cities")
        .select("name, population_total, city_stability, famine_consecutive_turns, settlement_level, famine_severity")
        .eq("id", cityId)
        .single();

      const { data: realm } = await supabase
        .from("realm_resources")
        .select("grain_reserve, gold_reserve, wood_reserve, stone_reserve, iron_reserve")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .maybeSingle();

      const { data: stacks } = await supabase
        .from("military_stacks")
        .select("name, power")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .eq("is_active", true);

      const systemPrompt = `Jsi kronikář a královský poradce v historické strategické hře. Piš česky, epickým ale srozumitelným stylem.
Generuješ DVĚ části:
1. CROWD_TEXT: Hlas lidu — co říkají vzbouřenci, jejich emoce, požadavky. 3-5 vět.
2. ADVISOR_ANALYSIS: Analýza poradců — co vedlo k situaci, jaké kroky mohou pomoci (rozpuštění armád, vzdání se měst, změna politiky). 4-6 vět s konkrétními doporučeními.

Odpověz POUZE ve formátu JSON: {"crowd_text": "...", "advisor_analysis": "..."}`;

      const userPrompt = `Město: ${city?.name}, populace: ${city?.population_total}, stabilita: ${city?.city_stability}%, hladomor: ${city?.famine_consecutive_turns} kol, úroveň: ${city?.settlement_level}.
Eskalace vzpoury: ${escalationLevel}/3.
Zásoby říše: obilí ${realm?.grain_reserve || 0}, zlato ${realm?.gold_reserve || 0}, dřevo ${realm?.wood_reserve || 0}, kámen ${realm?.stone_reserve || 0}, železo ${realm?.iron_reserve || 0}.
Armády: ${(stacks || []).map(s => `${s.name} (síla ${s.power})`).join(", ") || "žádné"}.
Vygeneruj hlas lidu a analýzu poradců.`;

      const { data: aiResult } = await supabase.functions.invoke("ai-invoke", {
        body: { sessionId, turnNumber: currentTurn, systemPrompt, userPrompt, maxTokens: 800 },
      });

      let crowdText = "Lid je rozhořčen a žádá okamžitou nápravu!";
      let advisorAnalysis = "Poradci doporučují okamžité řešení potravinové krize.";

      if (aiResult?.content) {
        try {
          const cleaned = aiResult.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);
          crowdText = parsed.crowd_text || crowdText;
          advisorAnalysis = parsed.advisor_analysis || advisorAnalysis;
        } catch {
          crowdText = aiResult.content.substring(0, 300);
        }
      }

      await supabase.from("city_uprisings").update({
        crowd_text: crowdText,
        advisor_analysis: advisorAnalysis,
      }).eq("id", uprisingId);

      setUprising(prev => prev ? { ...prev, crowd_text: crowdText, advisor_analysis: advisorAnalysis } : null);
    } catch (e) {
      console.error("AI generation failed:", e);
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleConcession = async () => {
    if (!uprising || !selectedConcession) return;
    setLoading(true);

    try {
      const effects: Record<string, any> = {};

      if (selectedConcession === "pay_wealth") {
        const demand = uprising.demands.find(d => d.type === "pay_wealth");
        const costPercent = demand?.cost_percent || 30;
        const { data: realm } = await supabase
          .from("realm_resources")
          .select("gold_reserve")
          .eq("session_id", sessionId)
          .eq("player_name", playerName)
          .maybeSingle();
        const loss = Math.round((realm?.gold_reserve || 0) * costPercent / 100);
        await supabase.from("realm_resources").update({
          gold_reserve: Math.max(0, (realm?.gold_reserve || 0) - loss),
        }).eq("session_id", sessionId).eq("player_name", playerName);
        effects.wealth_lost = loss;

        // Stabilize: clear famine, boost stability, 3-turn cooldown
        const cooldownUntil = currentTurn + 3;
        await supabase.from("cities").update({
          famine_consecutive_turns: 0,
          famine_turn: false,
          famine_severity: 0,
          city_stability: Math.min(100, (uprising.city_stability || 30) + 20),
          uprising_cooldown_until: cooldownUntil,
        }).eq("id", uprising.city_id);
        effects.cooldown_until = cooldownUntil;
      }

      if (selectedConcession === "open_stores") {
        // All material reserves → 0 (not gold), famine immediately ends
        await supabase.from("realm_resources").update({
          grain_reserve: 0, wood_reserve: 0, stone_reserve: 0, iron_reserve: 0,
        }).eq("session_id", sessionId).eq("player_name", playerName);

        // Sync player_resources stockpiles to 0 for food/wood/stone/iron
        for (const resType of ["food", "wood", "stone", "iron"]) {
          await supabase.from("player_resources").update({
            stockpile: 0,
          }).eq("session_id", sessionId).eq("player_name", playerName).eq("resource_type", resType);
        }

        const cooldownUntil = currentTurn + 5;
        await supabase.from("cities").update({
          famine_turn: false, famine_severity: 0, famine_consecutive_turns: 0,
          city_stability: Math.min(100, (uprising.city_stability || 30) + 30),
          uprising_cooldown_until: cooldownUntil,
        }).eq("id", uprising.city_id);
        effects.stores_emptied = true;
        effects.cooldown_until = cooldownUntil;
      }

      if (selectedConcession === "cede_city") {
        // City becomes independent (owner = "Nezávislé")
        await supabase.from("cities").update({
          owner_player: "Nezávislé",
          famine_turn: false, famine_severity: 0, famine_consecutive_turns: 0,
          city_stability: 60,
          uprising_cooldown_until: currentTurn + 99,
        }).eq("id", uprising.city_id);
        effects.city_ceded = true;

        // Reputation hit
        await supabase.from("game_events").insert({
          session_id: sessionId, event_type: "crisis", player: playerName,
          note: `${playerName} se vzdal města ${uprising.city_name} po vzpouře lidu.`,
          importance: "critical", confirmed: true, turn_number: currentTurn,
        });
      }

      if (selectedConcession === "abdicate") {
        // Game over effect - mark all cities as independent
        const { data: allCities } = await supabase
          .from("cities")
          .select("id")
          .eq("session_id", sessionId)
          .eq("owner_player", playerName);
        for (const c of (allCities || [])) {
          await supabase.from("cities").update({ owner_player: "Nezávislé" }).eq("id", c.id);
        }
        effects.abdicated = true;

        await supabase.from("game_events").insert({
          session_id: sessionId, event_type: "abdication", player: playerName,
          note: `${playerName} odstoupil z trůnu pod tlakem hladovějícího lidu.`,
          importance: "critical", confirmed: true, turn_number: currentTurn,
        });
      }

      // Resolve uprising
      await supabase.from("city_uprisings").update({
        status: "resolved",
        chosen_concession: selectedConcession,
        player_response_text: playerResponse || null,
        resolved_turn: currentTurn,
        effects_applied: effects,
      }).eq("id", uprising.id);

      // Chronicle
      try {
        const concessionLabel = uprising.demands.find(d => d.type === selectedConcession)?.label || selectedConcession;
        await supabase.from("chronicle_entries").insert({
          session_id: sessionId,
          text: `**Vzpoura v ${uprising.city_name} ukončena (rok ${currentTurn}):** Vládce ${playerName} zvolil: "${concessionLabel}". ${playerResponse ? `Prohlásil: "${playerResponse}"` : ""}`,
          epoch_style: "kroniky",
          turn_from: currentTurn,
          turn_to: currentTurn,
          source_type: "system",
        });
      } catch (_) { /* non-critical */ }

      toast.success(`Vzpoura v ${uprising.city_name} vyřešena.`);
      setOpen(false);
      setUprising(null);
      setSelectedConcession(null);
      setPlayerResponse("");
      onResolved?.();
    } catch (e) {
      toast.error("Chyba při řešení vzpoury");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!uprising) return null;

  const escalationColors = ["", "text-yellow-500", "text-orange-500", "text-red-500"];

  return (
    <Dialog open={open} onOpenChange={() => { /* blocking - cannot close */ }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden p-0" onPointerDownOutside={e => e.preventDefault()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <Flame className={`h-5 w-5 ${escalationColors[uprising.escalation_level] || "text-destructive"}`} />
              Vzpoura v {uprising.city_name}
              <Badge variant="destructive" className="ml-auto text-xs">
                Eskalace {uprising.escalation_level}/3
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {/* City stats */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Stabilita: <strong className="text-destructive">{uprising.city_stability}%</strong>
            </span>
            <span>Populace: <strong>{uprising.population_total?.toLocaleString()}</strong></span>
            <span>Hladomor: <strong className="text-destructive">{uprising.famine_consecutive_turns} kol</strong></span>
          </div>
        </div>

        <Separator />

        <ScrollArea className="max-h-[60vh] px-6 py-4">
          <div className="space-y-5">
            {/* Crowd voice */}
            <div>
              <p className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-destructive" /> Hlas lidu
              </p>
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 italic text-sm leading-relaxed">
                {generatingAI ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Naslouchám hlasu davu…
                  </span>
                ) : (
                  uprising.crowd_text || "Lid je rozhořčen…"
                )}
              </div>
            </div>

            {/* Advisor analysis */}
            <div>
              <p className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-info" /> Rada poradců
              </p>
              <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm leading-relaxed">
                {generatingAI ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Poradci se radí…
                  </span>
                ) : (
                  uprising.advisor_analysis || "Poradci analyzují situaci…"
                )}
              </div>
            </div>

            {/* Concessions */}
            <div>
              <p className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-primary" /> Vaše rozhodnutí
              </p>
              <div className="space-y-2">
                {uprising.demands.map((demand) => {
                  const Icon = CONCESSION_ICONS[demand.type] || AlertCircle;
                  const isSelected = selectedConcession === demand.type;
                  const isDangerous = demand.type === "abdicate" || demand.type === "cede_city" || demand.type === "forced_secession";
                  return (
                    <button
                      key={demand.type}
                      onClick={() => setSelectedConcession(demand.type)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                        isSelected
                          ? isDangerous
                            ? "border-destructive/60 bg-destructive/10 ring-1 ring-destructive/30"
                            : "border-primary/60 bg-primary/10 ring-1 ring-primary/30"
                          : "border-border hover:border-primary/40 hover:bg-muted/30"
                      }`}
                    >
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isDangerous ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-display font-semibold text-sm">
                          {demand.label}
                          {demand.cost_percent && <span className="text-muted-foreground font-normal ml-1">({demand.cost_percent}% zlata)</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{CONCESSION_DESCRIPTIONS[demand.type]}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Player response text */}
            <div>
              <p className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Scroll className="h-3.5 w-3.5 text-primary" /> Vaše odpověď lidu (volitelné)
              </p>
              <Textarea
                value={playerResponse}
                onChange={(e) => setPlayerResponse(e.target.value)}
                placeholder="Co řeknete svému lidu? Toto bude zaznamenáno v kronice…"
                className="min-h-[60px] text-sm"
              />
            </div>
          </div>
        </ScrollArea>

        <Separator />

        {/* Action button */}
        <div className="px-6 py-4">
          <Button
            onClick={handleConcession}
            disabled={!selectedConcession || loading}
            className="w-full font-display"
            variant={selectedConcession === "abdicate" || selectedConcession === "cede_city" ? "destructive" : "default"}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Provádím…</>
            ) : selectedConcession ? (
              `Potvrdit: ${uprising.demands.find(d => d.type === selectedConcession)?.label}`
            ) : (
              "Vyberte rozhodnutí"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UprisingDialog;
