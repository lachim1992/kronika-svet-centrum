import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Crown, Coins, Shield, Swords, Users, Eye, Church, Scroll, ScrollText,
  ChevronRight, Loader2, Sparkles, AlertTriangle, CheckCircle, Gavel,
  TrendingUp, TrendingDown, Minus, ThumbsUp, ThumbsDown, MinusCircle,
  Landmark, ArrowRight, Zap, Target, Bell,
} from "lucide-react";
import { toast } from "sonner";
import { FACTION_TYPES } from "@/lib/cityGovernance";
import { computeFactionReactions, computeVotingResult, computeDecreeImpacts, type FactionVote } from "@/lib/factionCouncil";
import { TurnReportPanel } from "@/components/TurnReportPanel";

interface Props {
  sessionId: string;
  session: any;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  events: any[];
  cities: any[];
  resources: any[];
  armies: any[];
  trades: any[];
  declarations: any[];
  worldCrises: any[];
  cityStates: any[];
  players: any[];
  onRefetch: () => void;
}

type AdvisorId = "briefing" | "economy" | "stability" | "military" | "diplomacy" | "intelligence" | "culture" | "city_council";

const ADVISORS: { id: AdvisorId; label: string; icon: React.ElementType; title: string }[] = [
  { id: "briefing", label: "Hlášení", icon: Bell, title: "Hlášení rádců" },
  { id: "economy", label: "Ekonomie", icon: Coins, title: "Ministr obchodu" },
  { id: "stability", label: "Stabilita", icon: Shield, title: "Ministr vnitra" },
  { id: "military", label: "Vojenství", icon: Swords, title: "Vojevůdce" },
  { id: "diplomacy", label: "Diplomacie", icon: Users, title: "Diplomat" },
  { id: "intelligence", label: "Zvědi", icon: Eye, title: "Mistr špiónů" },
  { id: "culture", label: "Kultura", icon: Church, title: "Velekněz" },
  { id: "city_council", label: "Rada města", icon: Crown, title: "Městská rada" },
];

const DECREE_TYPES = [
  { value: "law", label: "Zákon" },
  { value: "tax", label: "Změna daní" },
  { value: "military_reform", label: "Vojenská reforma" },
  { value: "diplomatic_shift", label: "Diplomatický obrat" },
  { value: "religious_decree", label: "Náboženský dekret" },
];

const CouncilTab = ({
  sessionId, session, currentPlayerName, currentTurn, myRole,
  events, cities, resources, armies, trades, declarations, worldCrises, cityStates, players,
  onRefetch,
}: Props) => {
  const [activeAdvisor, setActiveAdvisor] = useState<AdvisorId>("briefing");
  const [showDecree, setShowDecree] = useState(false);
  const [decreeType, setDecreeType] = useState("law");
  const [decreeText, setDecreeText] = useState("");
  const [decreePreview, setDecreePreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [enacting, setEnacting] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [allFactions, setAllFactions] = useState<any[]>([]);
  const [factionVotes, setFactionVotes] = useState<FactionVote[]>([]);

  // Council session state
  const [councilSession, setCouncilSession] = useState<any>(null);
  const [councilLoading, setCouncilLoading] = useState(false);
  const [showCouncilSession, setShowCouncilSession] = useState(false);
  const [councilUsedThisTurn, setCouncilUsedThisTurn] = useState(false);
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const [enactingAgenda, setEnactingAgenda] = useState<number | null>(null);

  // Law draft generation state
  const [lawDraft, setLawDraft] = useState<{ lawName: string; fullText: string; effects: { type: string; value: number; label: string }[] } | null>(null);
  const [generatingLaw, setGeneratingLaw] = useState(false);
  const [savingLaw, setSavingLaw] = useState(false);

  const myResources = useMemo(() => resources.filter(r => r.player_name === currentPlayerName), [resources, currentPlayerName]);
  const myArmies = useMemo(() => armies.filter(a => a.player_name === currentPlayerName), [armies, currentPlayerName]);
  const myCities = useMemo(() => cities.filter(c => c.owner_player === currentPlayerName), [cities, currentPlayerName]);
  const recentEvents = useMemo(() => events.filter(e => e.turn_number >= currentTurn - 3).slice(0, 10), [events, currentTurn]);
  const activeCrises = useMemo(() => worldCrises.filter(c => !c.resolved), [worldCrises]);
  const recentTrades = useMemo(() => trades.filter(t => t.turn_number >= currentTurn - 3), [trades, currentTurn]);

  // ── Apply immediate (one-time) decree effects to realm/cities ──
  const IMMEDIATE_EFFECT_TYPES = new Set(["gold", "grain", "wood", "stone", "iron", "manpower", "stability"]);
  const RESOURCE_FIELD_MAP: Record<string, string> = {
    gold: "gold_reserve", grain: "grain_reserve", wood: "wood_reserve",
    stone: "stone_reserve", iron: "iron_reserve", manpower: "manpower_pool",
  };

  const applyImmediateEffects = async (effects: { type: string; value: number }[]) => {
    const immediate = effects.filter(e => IMMEDIATE_EFFECT_TYPES.has(e.type));
    if (immediate.length === 0) return;

    // Load current realm resources
    const { data: realm } = await supabase.from("realm_resources").select("*")
      .eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle();
    if (!realm) return;

    const realmUpdates: Record<string, number> = {};
    let stabilityDelta = 0;

    for (const eff of immediate) {
      if (eff.type === "stability") {
        stabilityDelta += eff.value;
      } else {
        const field = RESOURCE_FIELD_MAP[eff.type];
        if (field) {
          const current = (realm as any)[field] || 0;
          realmUpdates[field] = Math.max(0, current + eff.value);
        }
      }
    }

    // Update realm resources
    if (Object.keys(realmUpdates).length > 0) {
      await supabase.from("realm_resources").update(realmUpdates)
        .eq("session_id", sessionId).eq("player_name", currentPlayerName);
    }

    // Apply stability to all player cities
    if (stabilityDelta !== 0) {
      for (const city of myCities) {
        const newStab = Math.max(0, Math.min(100, (city.city_stability || 50) + stabilityDelta));
        await supabase.from("cities").update({ city_stability: newStab }).eq("id", city.id);
      }
    }
  };

  // Fetch all city factions for player's cities
  useEffect(() => {
    const cityIds = myCities.map(c => c.id);
    if (cityIds.length === 0) return;
    supabase
      .from("city_factions")
      .select("*")
      .in("city_id", cityIds)
      .then(({ data }) => setAllFactions(data || []));
  }, [myCities]);

  // Check if council already used this turn
  useEffect(() => {
    supabase
      .from("council_evaluations")
      .select("id")
      .eq("session_id", sessionId)
      .eq("player_name", currentPlayerName)
      .eq("round_number", currentTurn)
      .maybeSingle()
      .then(({ data }) => setCouncilUsedThisTurn(!!data));
  }, [sessionId, currentPlayerName, currentTurn]);

  // Faction demands across all cities
  const factionDemands = useMemo(() =>
    allFactions.filter(f => f.current_demand && f.demand_urgency > 3)
      .map(f => {
        const city = myCities.find(c => c.id === f.city_id);
        return { ...f, cityName: city?.name || "?" };
      })
      .sort((a, b) => b.demand_urgency - a.demand_urgency),
    [allFactions, myCities]
  );

  // ── Generate advisor reports from real data ──
  const advisorReport = useMemo(() => {
    switch (activeAdvisor) {
      case "economy": {
        const totalIncome = myResources.reduce((s, r) => s + (r.income || 0), 0);
        const totalUpkeep = myResources.reduce((s, r) => s + (r.upkeep || 0), 0);
        const totalStock = myResources.reduce((s, r) => s + (r.stockpile || 0), 0);
        const netIncome = totalIncome - totalUpkeep;
        return {
          summary: netIncome >= 0 ? "Ekonomika je stabilní." : "⚠ Výdaje převyšují příjmy!",
          metrics: [
            { label: "Příjem", value: `+${totalIncome}`, trend: "up" as const },
            { label: "Výdaje", value: `-${totalUpkeep}`, trend: "down" as const },
            { label: "Čistý", value: `${netIncome >= 0 ? "+" : ""}${netIncome}`, trend: netIncome >= 0 ? "up" as const : "down" as const },
            { label: "Zásoby", value: String(totalStock), trend: "neutral" as const },
            { label: "Obchody", value: String(recentTrades.length), trend: "neutral" as const },
            { label: "Města", value: String(myCities.length), trend: "neutral" as const },
          ],
          risk: netIncome < 0 ? "Vysoké" : netIncome < 5 ? "Střední" : "Nízké",
          recommendation: netIncome < 0
            ? "Doporučuji snížit výdaje na armádu nebo zvýšit daně."
            : "Hospodářství se vyvíjí příznivě. Zvažte investice do nových staveb.",
        };
      }
      case "military": {
        const activeArmies = myArmies.filter(a => a.status === "Aktivní");
        const warEvents = events.filter(e => ["battle", "war", "siege"].includes(e.event_type || e.event_category || "") && e.turn_number >= currentTurn - 5);
        return {
          summary: warEvents.length > 0 ? `⚔ ${warEvents.length} konfliktů v posledních 5 kolech.` : "Mír v říši.",
          metrics: [
            { label: "Armády", value: String(activeArmies.length), trend: "neutral" as const },
            { label: "Síla železo", value: String(myArmies.reduce((s, a) => s + (a.iron_cost || 0), 0)), trend: "neutral" as const },
            { label: "Konflikty", value: String(warEvents.length), trend: warEvents.length > 0 ? "down" as const : "up" as const },
            { label: "Krize", value: String(activeCrises.length), trend: activeCrises.length > 0 ? "down" as const : "up" as const },
          ],
          risk: warEvents.length > 2 ? "Vysoké" : warEvents.length > 0 ? "Střední" : "Nízké",
          recommendation: warEvents.length > 2
            ? "Situace je kritická. Zvažte mírová jednání nebo posily."
            : "Hranice jsou klidné. Dobrý čas na výcvik nových jednotek.",
        };
      }
      case "diplomacy": {
        const diplomaticEvents = events.filter(e => ["treaty", "diplomacy", "alliance"].includes(e.event_type || e.event_category || ""));
        return {
          summary: `${cityStates.length} městských států, ${diplomaticEvents.length} diplomatických akcí.`,
          metrics: [
            { label: "Městské státy", value: String(cityStates.length), trend: "neutral" as const },
            { label: "Dohody", value: String(diplomaticEvents.length), trend: "neutral" as const },
            { label: "Hráči", value: String(players.length), trend: "neutral" as const },
          ],
          risk: "Střední",
          recommendation: "Sledujte vztahy s městskými státy a udržujte aliance.",
        };
      }
      case "stability": {
        const devastated = cities.filter(c => c.status === "devastated");
        return {
          summary: devastated.length > 0 ? `⚠ ${devastated.length} zdevastovaných měst!` : "Řád v říši je zachován.",
          metrics: [
            { label: "Města OK", value: String(myCities.filter(c => c.status === "ok").length), trend: "up" as const },
            { label: "Zdevastovaná", value: String(devastated.length), trend: devastated.length > 0 ? "down" as const : "up" as const },
            { label: "Aktivní krize", value: String(activeCrises.length), trend: activeCrises.length > 0 ? "down" as const : "up" as const },
            { label: "Deklarace", value: String(declarations.length), trend: "neutral" as const },
          ],
          risk: devastated.length > 0 || activeCrises.length > 0 ? "Vysoké" : "Nízké",
          recommendation: devastated.length > 0
            ? "Obnovte zdevastovaná města a vyřešte aktivní krize."
            : "Stabilita je dobrá. Zvažte vyhlášení nových zákonů.",
        };
      }
      case "intelligence": {
        return {
          summary: "Špionážní síť monitoruje okolní říše.",
          metrics: [
            { label: "Události", value: String(recentEvents.length), trend: "neutral" as const },
            { label: "Krize", value: String(activeCrises.length), trend: activeCrises.length > 0 ? "down" as const : "up" as const },
          ],
          risk: activeCrises.length > 1 ? "Vysoké" : "Nízké",
          recommendation: "Udržujte špionážní síť aktivní. Sledujte pohyby sousedů.",
        };
      }
      case "culture": {
        const wonderCount = cities.length > 0 ? Math.floor(cities.length / 3) : 0;
        return {
          summary: "Kultura a víra slouží říši.",
          metrics: [
            { label: "Města s divy", value: String(wonderCount), trend: "neutral" as const },
            { label: "Deklarace", value: String(declarations.length), trend: "neutral" as const },
          ],
          risk: "Nízké",
          recommendation: "Stavba divů a náboženské dekrety posilují loajalitu.",
        };
      }
      case "city_council": {
        const avgSatisfaction = allFactions.length > 0
          ? Math.round(allFactions.reduce((s, f) => s + f.satisfaction, 0) / allFactions.length)
          : 50;
        const avgLoyalty = allFactions.length > 0
          ? Math.round(allFactions.reduce((s, f) => s + f.loyalty, 0) / allFactions.length)
          : 50;
        const unhappy = allFactions.filter(f => f.satisfaction < 30);
        return {
          summary: unhappy.length > 0
            ? `⚠ ${unhappy.length} nespokojených frakcí ve vašich městech!`
            : "Rada města je spokojena s vaší vládou.",
          metrics: [
            { label: "Frakce celkem", value: String(allFactions.length), trend: "neutral" as const },
            { label: "Ø Spokojenost", value: String(avgSatisfaction), trend: avgSatisfaction >= 40 ? "up" as const : "down" as const },
            { label: "Ø Loajalita", value: String(avgLoyalty), trend: avgLoyalty >= 40 ? "up" as const : "down" as const },
            { label: "Požadavky", value: String(factionDemands.length), trend: factionDemands.length > 0 ? "down" as const : "up" as const },
            { label: "Nespokojení", value: String(unhappy.length), trend: unhappy.length > 0 ? "down" as const : "up" as const },
          ],
          risk: unhappy.length > 2 ? "Vysoké" : unhappy.length > 0 ? "Střední" : "Nízké",
          recommendation: unhappy.length > 0
            ? "Řešte požadavky nespokojených frakcí dekrety, jinak hrozí povstání."
            : "Pokračujte v moudrém vládnutí. Zvažte dekret posilující slabší frakce.",
        };
      }
    }
  }, [activeAdvisor, myResources, myArmies, myCities, recentEvents, activeCrises, recentTrades, cityStates, players, declarations, events, cities, currentTurn, trades, allFactions, factionDemands]);

  const TrendIcon = ({ trend }: { trend: "up" | "down" | "neutral" }) => {
    if (trend === "up") return <TrendingUp className="h-3 w-3 text-forest-green" />;
    if (trend === "down") return <TrendingDown className="h-3 w-3 text-seal-red" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  // ── Convene Council Session ──
  const handleConveneCouncil = async () => {
    if (councilLoading || councilUsedThisTurn) return;
    setCouncilLoading(true);
    setCouncilSession(null);
    setSelectedDirection(null);
    try {
      const { data, error } = await supabase.functions.invoke("council-session", {
        body: { sessionId, playerName: currentPlayerName, currentTurn },
      });
      if (error) {
        let body: any = null;
        try {
          if (error.context && typeof error.context === "object" && "json" in error.context) {
            body = await (error.context as Response).json();
          }
        } catch { /* ignore */ }
        const msg = body?.error || error.message;
        if (msg?.includes("již v tomto kole")) {
          setCouncilUsedThisTurn(true);
          toast.info("Rada již v tomto kole zasedala.");
        } else {
          toast.error(`Svolání rady selhalo: ${msg}`);
        }
        setCouncilLoading(false);
        return;
      }
      setCouncilSession(data);
      setShowCouncilSession(true);
      setCouncilUsedThisTurn(true);
      toast.success("👑 Královská rada zasedla!");
    } catch (e) {
      console.error(e);
      toast.error("Neočekávaná chyba při svolání rady");
    }
    setCouncilLoading(false);
  };

  // ── Enact suggested decree from agenda ──
  const handleEnactAgendaDecree = async (agendaItem: any, idx: number) => {
    if (enactingAgenda !== null) return;
    setEnactingAgenda(idx);
    try {
      const decree = agendaItem.suggestedDecree;
      // Write declaration
      await supabase.from("declarations").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        original_text: decree.decreeText,
        declaration_type: decree.decreeType,
        turn_number: currentTurn,
        status: "published",
        title: `Dekret rady: ${agendaItem.title}`,
        effects: decree.effects || [],
      });

      const allEffects = (decree.effects || []).filter((e: any) => e.type && e.value !== undefined);
      // Only save ongoing (per-turn) effects as laws — one-time effects are applied immediately
      const ongoingEffects = allEffects.filter((e: any) => !IMMEDIATE_EFFECT_TYPES.has(e.type));
      const decreeEffects = allEffects;
      if (decreeEffects.length > 0) {
        await supabase.from("laws").insert({
          session_id: sessionId,
          player_name: currentPlayerName,
          law_name: `Dekret: ${agendaItem.title}`,
          full_text: decree.decreeText || agendaItem.title,
          structured_effects: decreeEffects.map((e: any) => ({ type: e.type, value: e.value })),
          enacted_turn: currentTurn,
        });
        // Non-blocking AI rewrite
        supabase.functions.invoke("law-process", {
          body: { lawName: `Dekret: ${agendaItem.title}`, fullText: decree.decreeText, effects: decreeEffects, playerName: currentPlayerName, sessionId },
        }).then(({ data: aiData }) => {
          if (aiData?.epicText) {
            supabase.from("laws").update({ ai_epic_text: aiData.epicText })
              .eq("session_id", sessionId).eq("law_name", `Dekret: ${agendaItem.title}`).eq("enacted_turn", currentTurn);
          }
        }).catch(() => {});
      }

      // Apply immediate one-time effects (gold, grain, stability, etc.)
      await applyImmediateEffects(decree.effects || []);

      // Apply faction impacts
      const votes = computeFactionReactions(allFactions, decree.decreeType, decree.effects);
      if (votes.length > 0) {
        const impacts = computeDecreeImpacts(votes);
        for (const faction of allFactions) {
          const impact = impacts[faction.faction_type];
          if (!impact) continue;
          await supabase.from("city_factions").update({
            satisfaction: Math.max(0, Math.min(100, faction.satisfaction + impact.satisfaction)),
            loyalty: Math.max(0, Math.min(100, faction.loyalty + impact.loyalty)),
          }).eq("id", faction.id);
        }
      }

      // Log
      await supabase.from("world_action_log").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        turn_number: currentTurn,
        action_type: "decree",
        description: `${currentPlayerName} přijal doporučení rady: ${agendaItem.title}`,
        metadata: { source: "council_session", decree_type: decree.decreeType, effects: decree.effects },
      });

      toast.success(`📜 Dekret "${agendaItem.title}" vyhlášen a zapsán jako zákon!`);
      onRefetch();
    } catch (e) {
      console.error(e);
      toast.error("Vyhlášení dekretu selhalo");
    }
    setEnactingAgenda(null);
  };

  // ── Apply strategic direction ──
  const handleApplyDirection = async (direction: any) => {
    setSelectedDirection(direction.id);
    try {
      // Log strategic direction
      await supabase.from("world_action_log").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        turn_number: currentTurn,
        action_type: "strategic_direction",
        description: `${currentPlayerName} zvolil strategický směr: ${direction.label}`,
        metadata: { direction_id: direction.id, effects: direction.effects },
      });

      // Apply effects as temporary bonuses via entity_traits
      for (const eff of (direction.effects || [])) {
        await supabase.from("entity_traits").insert({
          session_id: sessionId,
          entity_type: "empire",
          entity_name: `Směr: ${direction.label}`,
          trait_category: "strategic_direction",
          trait_text: eff.label,
          description: direction.description,
          source_type: "Council",
          source_turn: currentTurn,
          intensity: Math.abs(eff.value) > 3 ? 3 : Math.max(1, Math.abs(eff.value)),
          is_active: true,
        } as any);
      }

      toast.success(`🧭 Strategický směr zvolen: ${direction.label}`);
    } catch (e) {
      console.error(e);
      toast.error("Uložení směru selhalo");
    }
  };

  const handleDecreePreview = async () => {
    if (!decreeText.trim()) return;
    setPreviewLoading(true);
    setDecreePreview(null);
    setFactionVotes([]);
    try {
      const { data, error } = await supabase.functions.invoke("royal-council", {
        body: {
          action: "preview_decree",
          sessionId,
          playerName: currentPlayerName,
          currentTurn,
          decreeType,
          decreeText,
          context: {
            cities: myCities.map(c => ({ name: c.name, level: c.level, status: c.status })),
            armies: myArmies.length,
            resources: myResources.map(r => ({ type: r.resource_type, stockpile: r.stockpile, income: r.income })),
            crises: activeCrises.map(c => c.title),
          },
        },
      });
      if (error) throw error;
      setDecreePreview(data);

      // Compute faction votes
      const votes = computeFactionReactions(allFactions, decreeType, data?.effects);
      setFactionVotes(votes);
    } catch (e) {
      console.error(e);
      toast.error("Hodnocení rady selhalo");
    }
    setPreviewLoading(false);
  };

  // ── Enact decree ──
  const handleEnactDecree = async () => {
    if (!decreePreview) return;
    setEnacting(true);
    try {
      const decreeTitle = `Dekret: ${DECREE_TYPES.find(d => d.value === decreeType)?.label || decreeType}`;
      // Write to declarations table
      await supabase.from("declarations").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        original_text: decreeText,
        declaration_type: decreeType,
        turn_number: currentTurn,
        status: "published",
        title: decreeTitle,
        epic_text: decreePreview?.narrativeText || null,
        effects: decreePreview?.effects || [],
      });

      // Auto-save as law with structured effects
      const decreeEffects = (decreePreview?.effects || []).filter((e: any) => e.type && e.value !== undefined);
      if (decreeEffects.length > 0) {
        await supabase.from("laws").insert({
          session_id: sessionId,
          player_name: currentPlayerName,
          law_name: decreeTitle,
          full_text: decreeText,
          structured_effects: decreeEffects.map((e: any) => ({ type: e.type, value: e.value })),
          enacted_turn: currentTurn,
        });
        // Non-blocking AI rewrite
        supabase.functions.invoke("law-process", {
          body: { lawName: decreeTitle, fullText: decreeText, effects: decreeEffects, playerName: currentPlayerName, sessionId },
        }).then(({ data: aiData }) => {
          if (aiData?.epicText) {
            supabase.from("laws").update({ ai_epic_text: aiData.epicText })
              .eq("session_id", sessionId).eq("law_name", decreeTitle).eq("enacted_turn", currentTurn);
          }
        }).catch(() => {});
      }

      // Apply immediate one-time effects (gold, grain, stability, etc.)
      await applyImmediateEffects(decreeEffects);

      // Apply faction impacts (mechanical effects on satisfaction & loyalty)
      if (factionVotes.length > 0) {
        const impacts = computeDecreeImpacts(factionVotes);
        const votingResult = computeVotingResult(factionVotes);

        for (const faction of allFactions) {
          const impact = impacts[faction.faction_type];
          if (!impact) continue;
          const newSatisfaction = Math.max(0, Math.min(100, faction.satisfaction + impact.satisfaction));
          const newLoyalty = Math.max(0, Math.min(100, faction.loyalty + impact.loyalty));
          await supabase.from("city_factions").update({
            satisfaction: newSatisfaction,
            loyalty: newLoyalty,
          }).eq("id", faction.id);
        }

        // If forced against council will, apply stability penalty
        if (!votingResult.approved && votingResult.stabilityPenalty > 0) {
          for (const city of myCities) {
            const newStability = Math.max(0, (city.city_stability || 70) - votingResult.stabilityPenalty);
            await supabase.from("cities").update({ city_stability: newStability } as any).eq("id", city.id);
          }
          toast.warning(`⚠ Dekret vynucen proti vůli rady! Stabilita snížena o ${votingResult.stabilityPenalty}.`);
        }
      }

      // Write to world action log
      await supabase.from("world_action_log").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        turn_number: currentTurn,
        action_type: "decree",
        description: `${currentPlayerName} vydal dekret: ${decreeText.slice(0, 100)}`,
        metadata: { decree_type: decreeType, effects: decreePreview?.effects, faction_votes: factionVotes.map(v => ({ faction: v.factionType, stance: v.stance })) },
      });

      toast.success("📜 Dekret vyhlášen a zapsán jako zákon!");
      setDecreeText("");
      setDecreePreview(null);
      setFactionVotes([]);
      setShowDecree(false);
      onRefetch();
    } catch (e) {
      console.error(e);
      toast.error("Vyhlášení dekretu selhalo");
    }
    setEnacting(false);
  };

  // ── Generate law draft from decree ──
  const handleGenerateLawDraft = async () => {
    if (!decreeText.trim()) return;
    setGeneratingLaw(true);
    setLawDraft(null);
    try {
      const { data, error } = await supabase.functions.invoke("royal-council", {
        body: {
          action: "generate_law_draft",
          sessionId,
          playerName: currentPlayerName,
          currentTurn,
          decreeType,
          decreeText,
          context: {
            cities: myCities.map(c => ({ name: c.name, level: c.level, status: c.status })),
            armies: myArmies.length,
            resources: myResources.map(r => ({ type: r.resource_type, stockpile: r.stockpile, income: r.income })),
          },
        },
      });
      if (error) throw error;
      setLawDraft(data);
    } catch (e) {
      console.error(e);
      toast.error("Generování návrhu zákona selhalo");
    }
    setGeneratingLaw(false);
  };

  // ── Save law draft to laws collection ──
  const handleSaveLawToCollection = async () => {
    if (!lawDraft) return;
    setSavingLaw(true);
    try {
      // 1. Insert the law
      const { error: insertError } = await supabase.from("laws").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        law_name: lawDraft.lawName,
        full_text: lawDraft.fullText,
        structured_effects: lawDraft.effects.map(e => ({ type: e.type, value: e.value })),
        enacted_turn: currentTurn,
      });
      if (insertError) throw insertError;

      // 2. Try AI epic rewrite (non-blocking)
      try {
        const { data: aiData } = await supabase.functions.invoke("law-process", {
          body: {
            lawName: lawDraft.lawName,
            fullText: lawDraft.fullText,
            effects: lawDraft.effects,
            playerName: currentPlayerName,
          },
        });
        if (aiData?.epicText) {
          await supabase.from("laws")
            .update({ ai_epic_text: aiData.epicText })
            .eq("session_id", sessionId)
            .eq("law_name", lawDraft.lawName)
            .eq("enacted_turn", currentTurn);
        }
      } catch { /* non-blocking */ }

      // 3. World action log
      await supabase.from("world_action_log").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        turn_number: currentTurn,
        action_type: "law_enacted",
        description: `${currentPlayerName} zavedl zákon: ${lawDraft.lawName}`,
        metadata: { effects: lawDraft.effects },
      });

      toast.success("⚖️ Zákon byl přidán do sbírky zákonů!");
      setLawDraft(null);
      onRefetch();
    } catch (e) {
      console.error(e);
      toast.error("Uložení zákona selhalo");
    }
    setSavingLaw(false);
  };

  const activeAdvisorData = ADVISORS.find(a => a.id === activeAdvisor)!;
  const ActiveIcon = activeAdvisorData.icon;

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="manuscript-card p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-royal-purple/10 flex items-center justify-center">
            <Crown className="h-6 w-6 text-royal-purple" />
          </div>
          <div>
            <h2 className="font-decorative text-lg text-foreground tracking-wide">Královská rada</h2>
            <p className="text-[11px] text-muted-foreground font-body">Poradní sbor vládce • Kolo {currentTurn}</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleConveneCouncil}
              disabled={councilLoading || councilUsedThisTurn}
              className="text-xs"
            >
              {councilLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Landmark className="h-3.5 w-3.5 mr-1" />}
              {councilUsedThisTurn ? "Rada zasedla" : "Svolat radu"}
            </Button>
            <Button
              size="sm"
              variant={showDecree ? "default" : "outline"}
              onClick={() => { setShowDecree(!showDecree); setShowCouncilSession(false); }}
              className="text-xs"
            >
              <Gavel className="h-3.5 w-3.5 mr-1" />
              {showDecree ? "Zpět k radě" : "Navrhnout dekret"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-4 min-h-[calc(100vh-320px)]">
        {/* LEFT: Advisor Categories */}
        <div className="w-[220px] shrink-0 manuscript-card overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border">
            <p className="font-display text-xs text-muted-foreground tracking-wider uppercase">Rádci</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {ADVISORS.map(advisor => {
                const Icon = advisor.icon;
                const isActive = activeAdvisor === advisor.id;
                return (
                  <button
                    key={advisor.id}
                    onClick={() => { setActiveAdvisor(advisor.id); setShowDecree(false); }}
                    className={`w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg transition-all text-left
                      ${isActive
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "hover:bg-muted/50 text-foreground border border-transparent"
                      }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-illuminated" : "text-muted-foreground"}`} />
                    <div className="min-w-0">
                      <p className="font-display text-xs font-semibold truncate">{advisor.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{advisor.title}</p>
                    </div>
                    {isActive && <ChevronRight className="h-3 w-3 ml-auto text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* RIGHT: Report / Decree Panel */}
        <div className="flex-1 min-w-0">
          <ScrollArea className="h-[calc(100vh-320px)]">
            {showCouncilSession && councilSession ? (
              /* ── COUNCIL SESSION RESULTS ── */
              <div className="manuscript-card p-5 space-y-5">
                {/* Overall assessment */}
                <div className="flex items-center gap-3 mb-2">
                  <Landmark className="h-5 w-5 text-royal-purple" />
                  <h3 className="font-decorative text-base text-foreground">Zasedání rady — Kolo {currentTurn}</h3>
                  <Badge variant="outline" className={`ml-auto text-[10px] font-display
                    ${councilSession.riskLevel === "Kritické" || councilSession.riskLevel === "Vysoké" ? "border-destructive/40 text-seal-red" :
                      councilSession.riskLevel === "Střední" ? "border-primary/40 text-illuminated" :
                      "border-accent/40 text-forest-green"}`}
                  >
                    Riziko: {councilSession.riskLevel}
                  </Badge>
                </div>

                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm font-body leading-relaxed">{councilSession.overallAssessment}</p>
                </div>

                {/* Advisor reports */}
                {councilSession.advisorReports?.length > 0 && (
                  <>
                    <div className="scroll-divider"><span className="text-[10px]">👥 Hlášení rádců 👥</span></div>
                    <div className="space-y-2">
                      {councilSession.advisorReports.map((report: any, i: number) => {
                        const advisorIcons: Record<string, React.ElementType> = {
                          economy: Coins, stability: Shield, military: Swords, diplomacy: Users, culture: Church,
                        };
                        const Icon = advisorIcons[report.advisorRole] || Crown;
                        return (
                          <div key={i} className="p-3 rounded-lg border border-border bg-card">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Icon className="h-4 w-4 text-illuminated" />
                              <span className="text-xs font-display font-semibold">{report.advisorTitle}</span>
                            </div>
                            <p className="text-[11px] font-body text-foreground mb-1">{report.summary}</p>
                            {report.keyIssues?.length > 0 && (
                              <div className="flex gap-1 flex-wrap mb-1">
                                {report.keyIssues.map((issue: string, j: number) => (
                                  <Badge key={j} variant="outline" className="text-[9px]">{issue}</Badge>
                                ))}
                              </div>
                            )}
                            <p className="text-[10px] text-muted-foreground italic">💡 {report.recommendation}</p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Priority agenda */}
                {councilSession.priorityAgenda?.length > 0 && (
                  <>
                    <div className="scroll-divider"><span className="text-[10px]">🎯 Prioritní agenda 🎯</span></div>
                    <div className="space-y-3">
                      {councilSession.priorityAgenda.map((item: any, i: number) => (
                        <div key={i} className="p-4 rounded-lg border-2 border-primary/20 bg-card space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-display font-bold text-primary">#{item.priority}</span>
                            </div>
                            <h4 className="font-display font-semibold text-sm flex-1">{item.title}</h4>
                            <Target className="h-4 w-4 text-illuminated shrink-0" />
                          </div>
                          <p className="text-[11px] font-body text-muted-foreground">{item.description}</p>

                          {/* Suggested decree */}
                          <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-2">
                            <div className="flex items-center gap-2">
                              <Gavel className="h-3.5 w-3.5 text-primary" />
                              <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-muted-foreground">Navržený dekret</span>
                              <Badge variant="outline" className="text-[9px] ml-auto">
                                {DECREE_TYPES.find(d => d.value === item.suggestedDecree?.decreeType)?.label || item.suggestedDecree?.decreeType}
                              </Badge>
                            </div>
                            <p className="text-xs font-body">{item.suggestedDecree?.decreeText}</p>
                            {item.suggestedDecree?.effects?.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap">
                                {item.suggestedDecree.effects.map((eff: any, j: number) => (
                                  <Badge key={j} variant="outline" className={`text-[9px] ${eff.value > 0 ? "text-forest-green border-accent/30" : "text-seal-red border-destructive/30"}`}>
                                    {eff.value > 0 ? "+" : ""}{eff.value} {eff.label}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs w-full"
                              disabled={enactingAgenda !== null}
                              onClick={() => handleEnactAgendaDecree(item, i)}
                            >
                              {enactingAgenda === i ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                              Přijmout a vyhlásit dekret
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Strategic direction */}
                {councilSession.strategicDirection?.options?.length > 0 && (
                  <>
                    <div className="scroll-divider"><span className="text-[10px]">🧭 Strategický směr 🧭</span></div>
                    {councilSession.strategicDirection.recommendation && (
                      <div className="p-3 rounded-lg bg-muted/30 border border-border">
                        <p className="text-[11px] font-body italic text-muted-foreground">
                          💡 Doporučení rady: {councilSession.strategicDirection.recommendation}
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {councilSession.strategicDirection.options.map((dir: any) => (
                        <button
                          key={dir.id}
                          onClick={() => !selectedDirection && handleApplyDirection(dir)}
                          disabled={!!selectedDirection}
                          className={`p-3 rounded-lg border-2 text-left transition-all
                            ${selectedDirection === dir.id
                              ? "border-primary bg-primary/10"
                              : selectedDirection
                                ? "border-border opacity-50 cursor-not-allowed"
                                : "border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
                            }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <ArrowRight className={`h-3.5 w-3.5 ${selectedDirection === dir.id ? "text-primary" : "text-muted-foreground"}`} />
                            <span className="font-display font-semibold text-xs">{dir.label}</span>
                            {selectedDirection === dir.id && <CheckCircle className="h-3 w-3 text-primary ml-auto" />}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-body mb-1.5">{dir.description}</p>
                          {dir.effects?.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {dir.effects.map((eff: any, j: number) => (
                                <Badge key={j} variant="outline" className={`text-[8px] ${eff.value > 0 ? "text-forest-green" : "text-seal-red"}`}>
                                  {eff.value > 0 ? "+" : ""}{eff.value} {eff.label}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {dir.supportingAdvisors?.length > 0 && (
                            <p className="text-[9px] text-muted-foreground mt-1">Podporují: {dir.supportingAdvisors.join(", ")}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Back button */}
                <div className="flex justify-center pt-2">
                  <Button size="sm" variant="outline" onClick={() => setShowCouncilSession(false)} className="text-xs">
                    Zpět k rádcům
                  </Button>
                </div>
              </div>
            ) : showDecree ? (
              /* ── DECREE PLANNING ── */
              <div className="manuscript-card p-5 space-y-5">
                <div className="flex items-center gap-3 mb-2">
                  <Gavel className="h-5 w-5 text-royal-purple" />
                  <h3 className="font-decorative text-base text-foreground">Návrh dekretu</h3>
                </div>

                <div className="space-y-3">
                  <Select value={decreeType} onValueChange={setDecreeType}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Typ dekretu" />
                    </SelectTrigger>
                    <SelectContent>
                      {DECREE_TYPES.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Textarea
                    value={decreeText}
                    onChange={e => setDecreeText(e.target.value)}
                    placeholder="Popište svůj dekret… např. 'Zvýšit daně o 20% na obnovu zdevastovaných měst'"
                    className="min-h-[100px] text-sm font-body"
                  />

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDecreePreview}
                      disabled={previewLoading || !decreeText.trim()}
                      className="text-xs"
                    >
                      {previewLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                      Náhled důsledků
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateLawDraft}
                      disabled={generatingLaw || !decreeText.trim()}
                      className="text-xs"
                    >
                      {generatingLaw ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ScrollText className="h-3 w-3 mr-1" />}
                      Vygenerovat návrh zákona
                    </Button>
                  </div>
                </div>

                {/* Decree Preview Results */}
                {decreePreview && (
                  <div className="space-y-4 mt-4">
                    <div className="scroll-divider"><span className="text-[10px]">⚖ Hodnocení rady ⚖</span></div>

                    {/* Effects grid */}
                    {decreePreview.effects && Array.isArray(decreePreview.effects) && (
                      <div className="grid grid-cols-2 gap-2">
                        {decreePreview.effects.map((eff: any, i: number) => (
                          <div key={i} className={`p-2.5 rounded-lg border text-xs font-display
                            ${eff.value > 0 ? "bg-accent/5 border-accent/20 text-forest-green" :
                              eff.value < 0 ? "bg-destructive/5 border-destructive/20 text-seal-red" :
                              "bg-muted/30 border-border text-muted-foreground"}`}
                          >
                            <span className="font-semibold">{eff.value > 0 ? "+" : ""}{eff.value}</span>{" "}
                            <span>{eff.label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Risk */}
                    {decreePreview.riskLevel && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                        <AlertTriangle className="h-4 w-4 text-illuminated shrink-0" />
                        <div className="text-xs font-body">
                          <span className="font-display font-semibold">Riziko: </span>
                          <span>{decreePreview.riskLevel}</span>
                        </div>
                      </div>
                    )}

                    {/* Narrative */}
                    {decreePreview.narrativeText && (
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <p className="text-xs font-body italic leading-relaxed">{decreePreview.narrativeText}</p>
                      </div>
                    )}

                    {/* ── Faction Voting ── */}
                    {factionVotes.length > 0 && (() => {
                      const votingResult = computeVotingResult(factionVotes);
                      return (
                        <div className="space-y-3">
                          <div className="scroll-divider"><span className="text-[10px]">👑 Hlasování Rady města 👑</span></div>

                          {/* Voting summary */}
                          <div className={`p-3 rounded-lg border text-xs font-body ${
                            votingResult.approved
                              ? "bg-accent/5 border-accent/20"
                              : "bg-destructive/5 border-destructive/20"
                          }`}>
                            <p className="font-display font-semibold mb-1">
                              {votingResult.approved ? "✅ Rada schvaluje" : "❌ Rada odmítá"}
                            </p>
                            <p>{votingResult.summary}</p>
                          </div>

                          {/* Individual faction votes */}
                          <div className="space-y-2">
                            {factionVotes.map(v => (
                              <div key={v.factionType} className="p-2.5 rounded-lg border border-border flex items-start gap-2.5">
                                <span className="text-lg shrink-0">{v.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-display font-semibold">{v.label}</span>
                                    {v.stance === "support" && <ThumbsUp className="h-3 w-3 text-forest-green" />}
                                    {v.stance === "oppose" && <ThumbsDown className="h-3 w-3 text-seal-red" />}
                                    {v.stance === "neutral" && <MinusCircle className="h-3 w-3 text-muted-foreground" />}
                                    <Badge variant="outline" className={`text-[9px] ${
                                      v.stance === "support" ? "border-accent/30 text-forest-green" :
                                      v.stance === "oppose" ? "border-destructive/30 text-seal-red" :
                                      "border-border text-muted-foreground"
                                    }`}>
                                      {v.stance === "support" ? "Pro" : v.stance === "oppose" ? "Proti" : "Zdržel se"}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground italic">{v.reason}</p>
                                  <div className="flex gap-2 mt-1 text-[10px]">
                                    <span className={v.satisfactionImpact >= 0 ? "text-forest-green" : "text-seal-red"}>
                                      Spokojenost: {v.satisfactionImpact >= 0 ? "+" : ""}{v.satisfactionImpact}
                                    </span>
                                    <span className={v.loyaltyImpact >= 0 ? "text-forest-green" : "text-seal-red"}>
                                      Loajalita: {v.loyaltyImpact >= 0 ? "+" : ""}{v.loyaltyImpact}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {!votingResult.approved && (
                            <div className="p-2.5 rounded-lg bg-destructive/5 border border-destructive/20 text-xs">
                              <p className="font-display font-semibold text-seal-red mb-0.5">⚠ Vynucení dekretu</p>
                              <p className="text-muted-foreground">
                                Můžete dekret vyhlásit i přes nesouhlas rady, ale stabilita všech měst klesne o {votingResult.stabilityPenalty}.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Enact button */}
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => { setDecreePreview(null); setFactionVotes([]); }} className="text-xs">
                        Zrušit
                      </Button>
                      <Button size="sm" onClick={handleEnactDecree} disabled={enacting} className="text-xs">
                        {enacting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                        {factionVotes.length > 0 && !computeVotingResult(factionVotes).approved
                          ? "Vynutit dekret"
                          : "Vyhlásit dekret"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Law Draft Section */}
                {lawDraft && (
                  <div className="space-y-4 mt-4">
                    <div className="scroll-divider"><span className="text-[10px]">📜 Návrh zákona 📜</span></div>

                    <div className="p-4 rounded-lg bg-card border border-primary/20 space-y-3">
                      <div className="flex items-center gap-2">
                        <ScrollText className="h-4 w-4 text-illuminated" />
                        <h4 className="font-decorative text-sm text-foreground">{lawDraft.lawName}</h4>
                      </div>

                      <div className="p-3 rounded-lg bg-muted/30 border border-border">
                        <p className="text-xs font-body leading-relaxed whitespace-pre-wrap">{lawDraft.fullText}</p>
                      </div>

                      {lawDraft.effects && lawDraft.effects.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground font-display mb-1.5 uppercase tracking-wider">Mechanické efekty</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {lawDraft.effects.map((eff, i) => (
                              <div key={i} className={`p-2 rounded border text-xs font-display
                                ${eff.value > 0 ? "bg-accent/5 border-accent/20 text-forest-green" :
                                  eff.value < 0 ? "bg-destructive/5 border-destructive/20 text-seal-red" :
                                  "bg-muted/30 border-border text-muted-foreground"}`}
                              >
                                <span className="font-semibold">{eff.value > 0 ? "+" : ""}{eff.value}</span>{" "}
                                <span>{eff.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 justify-end pt-1">
                        <Button size="sm" variant="outline" onClick={() => setLawDraft(null)} className="text-xs">
                          Zahodit
                        </Button>
                        <Button size="sm" onClick={handleSaveLawToCollection} disabled={savingLaw} className="text-xs">
                          {savingLaw ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Gavel className="h-3 w-3 mr-1" />}
                          Přidat do sbírky zákonů
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : activeAdvisor === "briefing" ? (
              /* ── TURN BRIEFING (integrated) ── */
              <div className="manuscript-card p-5 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-illuminated" />
                  </div>
                  <div>
                    <h3 className="font-decorative text-base text-foreground">Hlášení rádců</h3>
                    <p className="text-[11px] text-muted-foreground font-body">Sumarizace minulého kola • Rok {currentTurn - 1}</p>
                  </div>
                </div>
                <TurnReportPanel
                  sessionId={sessionId}
                  playerName={currentPlayerName}
                  currentTurn={currentTurn}
                />
              </div>
            ) : (
              /* ── ADVISOR REPORT ── */
              <div className="manuscript-card p-5 space-y-5">
                {/* Advisor header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ActiveIcon className="h-5 w-5 text-illuminated" />
                  </div>
                  <div>
                    <h3 className="font-decorative text-base text-foreground">{activeAdvisorData.title}</h3>
                    <p className="text-[11px] text-muted-foreground font-body">{activeAdvisorData.label} • Hlášení</p>
                  </div>
                  <Badge variant="outline" className={`ml-auto text-[10px] font-display
                    ${advisorReport.risk === "Vysoké" ? "border-destructive/40 text-seal-red" :
                      advisorReport.risk === "Střední" ? "border-primary/40 text-illuminated" :
                      "border-accent/40 text-forest-green"}`}
                  >
                    Riziko: {advisorReport.risk}
                  </Badge>
                </div>

                {/* Summary */}
                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-sm font-body">{advisorReport.summary}</p>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {advisorReport.metrics.map((m, i) => (
                    <div key={i} className="p-3 rounded-lg bg-card border border-border">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground font-body">{m.label}</span>
                        <TrendIcon trend={m.trend} />
                      </div>
                      <p className="font-display text-lg font-bold text-foreground">{m.value}</p>
                    </div>
                  ))}
                </div>

                <div className="scroll-divider"><span className="text-[10px]">✦</span></div>

                {/* Recommendation */}
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <h4 className="font-display text-xs font-semibold mb-2 flex items-center gap-2">
                    <Scroll className="h-3.5 w-3.5 text-illuminated" /> Doporučení rádce
                  </h4>
                  <p className="text-sm font-body leading-relaxed">{advisorReport.recommendation}</p>
                </div>

                {/* ── City Council: faction details + demands ── */}
                {activeAdvisor === "city_council" && (
                  <div className="space-y-4">
                    {/* Faction demands */}
                    {factionDemands.length > 0 && (
                      <div>
                        <h4 className="font-display text-xs font-semibold mb-2 flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-illuminated" /> Požadavky frakcí
                        </h4>
                        <div className="space-y-2">
                          {factionDemands.map(fd => {
                            const meta = FACTION_TYPES[fd.faction_type];
                            return (
                              <div key={fd.id} className="p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-base">{meta?.icon || "👥"}</span>
                                  <span className="text-xs font-display font-semibold">{meta?.label || fd.faction_type}</span>
                                  <Badge variant="outline" className="text-[9px] ml-auto">{fd.cityName}</Badge>
                                  {fd.demand_urgency > 7 && <Badge variant="destructive" className="text-[8px]">Kritické</Badge>}
                                </div>
                                <p className="text-[11px] text-muted-foreground italic">📢 {fd.current_demand}</p>
                                <div className="flex gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-[10px]"
                                    onClick={() => {
                                      setDecreeText(fd.current_demand);
                                      setShowDecree(true);
                                    }}
                                  >
                                    <Gavel className="h-3 w-3 mr-1" />Navrhnout dekret
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="scroll-divider"><span className="text-[10px]">👑 Přehled frakcí 👑</span></div>

                    {/* Factions by city */}
                    {myCities.map(city => {
                      const cityFactions = allFactions.filter(f => f.city_id === city.id);
                      if (cityFactions.length === 0) return null;
                      return (
                        <div key={city.id} className="space-y-2">
                          <h4 className="font-display text-xs font-semibold text-muted-foreground">{city.name}</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {cityFactions.map(f => {
                              const meta = FACTION_TYPES[f.faction_type];
                              const satColor = f.satisfaction >= 50 ? "text-forest-green" : f.satisfaction >= 25 ? "text-illuminated" : "text-seal-red";
                              return (
                                <div key={f.id} className="p-2.5 rounded-lg border border-border bg-card">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-base">{meta?.icon || "👥"}</span>
                                    <span className="text-[11px] font-display font-semibold">{meta?.label || f.faction_type}</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                                    <div>
                                      <p className="text-muted-foreground">Moc</p>
                                      <p className="font-bold">{f.power}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Spokoj.</p>
                                      <p className={`font-bold ${satColor}`}>{f.satisfaction}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Loajalita</p>
                                      <p className="font-bold">{f.loyalty}</p>
                                    </div>
                                  </div>
                                  {f.current_demand && (
                                    <p className="text-[9px] text-muted-foreground italic mt-1 truncate">📢 {f.current_demand}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Recent events relevant to this advisor */}
                {activeAdvisor !== "city_council" && recentEvents.length > 0 && (
                  <div>
                    <h4 className="font-display text-xs font-semibold mb-2 text-muted-foreground">Poslední události</h4>
                    <div className="space-y-1">
                      {recentEvents.slice(0, 5).map(evt => (
                        <div key={evt.id} className="flex items-center gap-2 py-1 px-2 rounded text-xs text-foreground font-body">
                          <span className="text-muted-foreground">K{evt.turn_number}</span>
                          <span className="truncate">{evt.note || evt.event_type}</span>
                          {evt.importance === "high" && <Badge variant="destructive" className="text-[9px]">!</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export default CouncilTab;
