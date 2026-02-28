import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Swords, Shield, Navigation, Loader2, Scroll, Castle, Flag,
  Target, Mountain, Users, HandshakeIcon, CheckCircle2, Clock,
  Crosshair, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

// ═══ TYPES ═══

interface BattleLobby {
  id: string;
  session_id: string;
  turn_number: number;
  attacker_stack_id: string;
  attacker_player: string;
  defender_stack_id: string | null;
  defender_city_id: string | null;
  defender_player: string;
  attacker_formation: string;
  defender_formation: string;
  attacker_speech: string | null;
  defender_speech: string | null;
  attacker_speech_modifier: number;
  defender_speech_modifier: number;
  attacker_speech_feedback: string | null;
  defender_speech_feedback: string | null;
  attacker_ready: boolean;
  defender_ready: boolean;
  surrender_offered_by: string | null;
  surrender_terms: any;
  surrender_accepted: boolean | null;
  status: string;
  battle_id: string | null;
}

interface StackInfo {
  id: string;
  name: string;
  formation_type: string;
  morale: number;
  power: number;
  player_name: string;
  totalManpower: number;
  compositions: { unit_type: string; manpower: number; quality: number }[];
}

interface Props {
  lobby: BattleLobby;
  currentPlayerName: string;
  sessionId: string;
  currentTurn: number;
  onClose: () => void;
  onRefresh: () => void;
}

// ═══ CONSTANTS ═══

const FORMATIONS = [
  { key: "ASSAULT", label: "Útok", icon: Swords, desc: "+15% síla, -10% obrana. Silný proti OBLÉHÁNÍ.", color: "text-destructive" },
  { key: "DEFENSIVE", label: "Obrana", icon: Shield, desc: "+20% obrana, terén ×1.5. Silný proti ÚTOKU.", color: "text-primary" },
  { key: "FLANK", label: "Obchvat", icon: Navigation, desc: "+10% síla, ignoruje 50% opevnění. Silný proti OBRANĚ.", color: "text-illuminated" },
  { key: "SIEGE", label: "Obléhání", icon: Castle, desc: "+30% vs města, -20% v poli. Slabý proti ÚTOKU.", color: "text-muted-foreground" },
] as const;

const FORMATION_LABELS: Record<string, string> = {
  ASSAULT: "Útok", DEFENSIVE: "Obrana", FLANK: "Obchvat", SIEGE: "Obléhání",
};

const RESULT_DISPLAY: Record<string, { label: string; className: string }> = {
  decisive_victory: { label: "Drtivé vítězství ⚔️🔥", className: "text-accent" },
  victory: { label: "Vítězství ⚔️", className: "text-accent" },
  pyrrhic_victory: { label: "Pyrrhovo vítězství ⚔️", className: "text-illuminated" },
  defeat: { label: "Porážka 💀", className: "text-destructive" },
  rout: { label: "Rozprášení 💀💀", className: "text-destructive" },
};

export default function BattleLobbyPanel({ lobby: initialLobby, currentPlayerName, sessionId, currentTurn, onClose, onRefresh }: Props) {
  const [lobby, setLobby] = useState(initialLobby);
  const [attackerInfo, setAttackerInfo] = useState<StackInfo | null>(null);
  const [defenderStackInfo, setDefenderStackInfo] = useState<StackInfo | null>(null);
  const [defenderCityInfo, setDefenderCityInfo] = useState<any>(null);
  const [speechText, setSpeechText] = useState("");
  const [evaluatingSpeech, setEvaluatingSpeech] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [battleResult, setBattleResult] = useState<any>(null);
  const [surrenderTerms, setSurrenderTerms] = useState("");

  const isAttacker = currentPlayerName === lobby.attacker_player;
  const isDefender = currentPlayerName === lobby.defender_player;
  const myFormation = isAttacker ? lobby.attacker_formation : lobby.defender_formation;
  const mySpeech = isAttacker ? lobby.attacker_speech : lobby.defender_speech;
  const mySpeechMod = isAttacker ? lobby.attacker_speech_modifier : lobby.defender_speech_modifier;
  const mySpeechFeedback = isAttacker ? lobby.attacker_speech_feedback : lobby.defender_speech_feedback;
  const myReady = isAttacker ? lobby.attacker_ready : lobby.defender_ready;
  const opponentReady = isAttacker ? lobby.defender_ready : lobby.attacker_ready;

  // Load stack/city info
  useEffect(() => {
    const load = async () => {
      const { data: atkStack } = await supabase
        .from("military_stacks")
        .select("id, name, formation_type, morale, power, player_name, military_stack_composition(unit_type, manpower, quality)")
        .eq("id", lobby.attacker_stack_id)
        .single();
      if (atkStack) {
        const comps = (atkStack as any).military_stack_composition || [];
        setAttackerInfo({
          ...atkStack,
          totalManpower: comps.reduce((s: number, c: any) => s + (c.manpower || 0), 0),
          compositions: comps,
        });
      }

      if (lobby.defender_stack_id) {
        const { data: defStack } = await supabase
          .from("military_stacks")
          .select("id, name, formation_type, morale, power, player_name, military_stack_composition(unit_type, manpower, quality)")
          .eq("id", lobby.defender_stack_id)
          .single();
        if (defStack) {
          const comps = (defStack as any).military_stack_composition || [];
          setDefenderStackInfo({
            ...defStack,
            totalManpower: comps.reduce((s: number, c: any) => s + (c.manpower || 0), 0),
            compositions: comps,
          });
        }
      }

      if (lobby.defender_city_id) {
        const { data: city } = await supabase
          .from("cities")
          .select("id, name, owner_player, population_total, military_garrison, city_stability, settlement_level")
          .eq("id", lobby.defender_city_id)
          .single();
        if (city) setDefenderCityInfo(city);
      }
    };
    load();
  }, [lobby.attacker_stack_id, lobby.defender_stack_id, lobby.defender_city_id]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`battle-lobby-${lobby.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "battle_lobbies",
        filter: `id=eq.${lobby.id}`,
      }, (payload) => {
        setLobby(payload.new as any);
        if ((payload.new as any).status === "resolved") {
          toast.info("⚔️ Bitva byla vyhodnocena!");
        }
        if ((payload.new as any).surrender_accepted === true) {
          toast.info("🏳️ Kapitulace přijata!");
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lobby.id]);

  // Set formation
  const setFormation = useCallback(async (formation: string) => {
    const field = isAttacker ? "attacker_formation" : "defender_formation";
    await supabase.from("battle_lobbies").update({ [field]: formation } as any).eq("id", lobby.id);
    setLobby(prev => ({ ...prev, [field]: formation }));
  }, [lobby.id, isAttacker]);

  // Evaluate speech
  const handleEvaluateSpeech = async () => {
    if (!speechText.trim()) return;
    setEvaluatingSpeech(true);
    try {
      const targetName = defenderCityInfo?.name || defenderStackInfo?.name || "nepřítel";
      const { data, error } = await supabase.functions.invoke("battle-speech", {
        body: {
          speech_text: speechText,
          attacker_name: isAttacker ? attackerInfo?.name : (defenderStackInfo?.name || defenderCityInfo?.name),
          defender_name: isAttacker ? targetName : attackerInfo?.name,
          biome: "plains",
          attacker_morale: isAttacker ? attackerInfo?.morale : (defenderStackInfo?.morale || 50),
        },
      });
      if (error) throw error;

      const speechField = isAttacker ? "attacker_speech" : "defender_speech";
      const modField = isAttacker ? "attacker_speech_modifier" : "defender_speech_modifier";
      const feedbackField = isAttacker ? "attacker_speech_feedback" : "defender_speech_feedback";

      await supabase.from("battle_lobbies").update({
        [speechField]: speechText,
        [modField]: data?.morale_modifier || 0,
        [feedbackField]: data?.ai_feedback || "",
      } as any).eq("id", lobby.id);

      setLobby(prev => ({
        ...prev,
        [speechField]: speechText,
        [modField]: data?.morale_modifier || 0,
        [feedbackField]: data?.ai_feedback || "",
      }));

      toast.success(`Proslov: ${(data?.morale_modifier || 0) >= 0 ? "+" : ""}${data?.morale_modifier || 0} morálka`);
    } catch (e: any) {
      toast.error("Chyba při hodnocení proslovu");
    }
    setEvaluatingSpeech(false);
  };

  // Toggle ready
  const toggleReady = async () => {
    const field = isAttacker ? "attacker_ready" : "defender_ready";
    const newVal = !myReady;
    await supabase.from("battle_lobbies").update({ [field]: newVal } as any).eq("id", lobby.id);
    setLobby(prev => ({ ...prev, [field]: newVal }));

    // If both ready, resolve
    if (newVal && opponentReady) {
      await resolveBattle();
    }
  };

  // Offer surrender
  const offerSurrender = async () => {
    if (!surrenderTerms.trim()) { toast.error("Napište podmínky kapitulace"); return; }
    await supabase.from("battle_lobbies").update({
      surrender_offered_by: currentPlayerName,
      surrender_terms: { text: surrenderTerms, offered_at: new Date().toISOString() },
    } as any).eq("id", lobby.id);
    setLobby(prev => ({
      ...prev,
      surrender_offered_by: currentPlayerName,
      surrender_terms: { text: surrenderTerms },
    }));
    toast.success("Nabídka kapitulace odeslána");
  };

  // Accept/reject surrender
  const respondSurrender = async (accept: boolean) => {
    if (accept) {
      await supabase.from("battle_lobbies").update({
        surrender_accepted: true, status: "surrendered", resolved_at: new Date().toISOString(),
      } as any).eq("id", lobby.id);
      toast.success("Kapitulace přijata — bitva zrušena");
      onRefresh();
      onClose();
    } else {
      await supabase.from("battle_lobbies").update({
        surrender_offered_by: null, surrender_terms: null, surrender_accepted: false,
      } as any).eq("id", lobby.id);
      setLobby(prev => ({ ...prev, surrender_offered_by: null, surrender_terms: null, surrender_accepted: false }));
      toast.info("Kapitulace odmítnuta — boj pokračuje");
    }
  };

  // Resolve battle
  const resolveBattle = async () => {
    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-battle", {
        body: {
          session_id: sessionId,
          player_name: lobby.attacker_player,
          current_turn: currentTurn,
          attacker_stack_id: lobby.attacker_stack_id,
          defender_city_id: lobby.defender_city_id || null,
          defender_stack_id: lobby.defender_stack_id || null,
          speech_text: lobby.attacker_speech || null,
          speech_morale_modifier: lobby.attacker_speech_modifier || 0,
          defender_speech_text: lobby.defender_speech || null,
          defender_speech_morale_modifier: lobby.defender_speech_modifier || 0,
          attacker_formation: lobby.attacker_formation,
          defender_formation: lobby.defender_formation,
          seed: Date.now() + Math.floor(Math.random() * 100000),
          lobby_id: lobby.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBattleResult(data);
      toast.success(data.result_label || "Bitva vyhodnocena");
    } catch (e: any) {
      toast.error(e.message || "Chyba při vyhodnocení bitvy");
    }
    setResolving(false);
  };

  const isResolved = lobby.status === "resolved" || lobby.status === "surrendered" || !!battleResult;

  return (
    <Dialog open onOpenChange={() => { onRefresh(); onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="font-display flex items-center gap-2 text-lg">
            <Swords className="h-5 w-5 text-destructive" />
            Bitevní příprava — Rok {lobby.turn_number}
            {lobby.status === "resolved" && <Badge variant="secondary">Vyhodnoceno</Badge>}
            {lobby.status === "surrendered" && <Badge variant="outline">Kapitulace</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* ═══ TWO-COLUMN: Attacker vs Defender ═══ */}
          <div className="grid grid-cols-2 gap-3">
            {/* Attacker */}
            <SidePanel
              label="Útočník"
              playerName={lobby.attacker_player}
              stackInfo={attackerInfo}
              formation={lobby.attacker_formation}
              speech={lobby.attacker_speech}
              speechMod={lobby.attacker_speech_modifier}
              speechFeedback={lobby.attacker_speech_feedback}
              ready={lobby.attacker_ready}
              isCurrentPlayer={isAttacker}
              isCityDefender={false}
              cityInfo={null}
            />
            {/* Defender */}
            <SidePanel
              label="Obránce"
              playerName={lobby.defender_player}
              stackInfo={defenderStackInfo}
              formation={lobby.defender_formation}
              speech={lobby.defender_speech}
              speechMod={lobby.defender_speech_modifier}
              speechFeedback={lobby.defender_speech_feedback}
              ready={lobby.defender_ready}
              isCurrentPlayer={isDefender}
              isCityDefender={!!lobby.defender_city_id}
              cityInfo={defenderCityInfo}
            />
          </div>

          {/* ═══ FORMATION SELECTOR (only if not resolved and is participant) ═══ */}
          {!isResolved && (isAttacker || isDefender) && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-display font-semibold">Zvolit formaci</p>
                <div className="grid grid-cols-2 gap-2">
                  {FORMATIONS.map(f => {
                    const Icon = f.icon;
                    const selected = myFormation === f.key;
                    return (
                      <button
                        key={f.key}
                        onClick={() => setFormation(f.key)}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          selected
                            ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className={`h-3.5 w-3.5 ${f.color}`} />
                          <span className="font-display font-semibold text-xs">{f.label}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{f.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══ SPEECH ═══ */}
          {!isResolved && (isAttacker || isDefender) && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-display font-semibold">Bitevní proslov <span className="font-normal text-muted-foreground">(±10 morálka)</span></p>
                {mySpeech ? (
                  <div className="space-y-1">
                    <p className="text-xs italic bg-muted/30 rounded p-2">„{mySpeech}"</p>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs ${mySpeechMod >= 0 ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
                        {mySpeechMod >= 0 ? "+" : ""}{mySpeechMod} morálka
                      </Badge>
                      {mySpeechFeedback && <span className="text-[10px] text-muted-foreground italic">{mySpeechFeedback}</span>}
                    </div>
                  </div>
                ) : (
                  <>
                    <Textarea
                      placeholder="Vojáci! Dnes je den, kdy se rozhodne osud naší říše..."
                      value={speechText} onChange={e => setSpeechText(e.target.value)}
                      className="text-sm min-h-[60px]"
                    />
                    <Button size="sm" variant="outline" className="text-xs font-display"
                      disabled={evaluatingSpeech || !speechText.trim()} onClick={handleEvaluateSpeech}>
                      {evaluatingSpeech
                        ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Hodnotím...</>
                        : <><Scroll className="h-3 w-3 mr-1" />Vyhodnotit proslov</>}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ═══ SURRENDER ═══ */}
          {!isResolved && (isAttacker || isDefender) && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-display font-semibold flex items-center gap-1.5">
                  <HandshakeIcon className="h-3.5 w-3.5" /> Kapitulace
                </p>
                {lobby.surrender_offered_by ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">{lobby.surrender_offered_by}</span> nabídl kapitulaci:
                    </p>
                    <p className="text-xs italic bg-muted/30 rounded p-2">
                      „{lobby.surrender_terms?.text || "Bez podmínek"}"
                    </p>
                    {lobby.surrender_offered_by !== currentPlayerName && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="default" className="text-xs font-display"
                          onClick={() => respondSurrender(true)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" />Přijmout
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs font-display"
                          onClick={() => respondSurrender(false)}>
                          Odmítnout
                        </Button>
                      </div>
                    )}
                    {lobby.surrender_offered_by === currentPlayerName && (
                      <p className="text-[10px] text-muted-foreground">Čekáme na odpověď protivníka...</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Podmínky kapitulace (tribut, postoupení území...)"
                      value={surrenderTerms} onChange={e => setSurrenderTerms(e.target.value)}
                      className="text-xs min-h-[40px]"
                    />
                    <Button size="sm" variant="outline" className="text-xs font-display"
                      disabled={!surrenderTerms.trim()} onClick={offerSurrender}>
                      <Flag className="h-3 w-3 mr-1" />Nabídnout kapitulaci
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ═══ READY + RESOLVE ═══ */}
          {!isResolved && (isAttacker || isDefender) && (
            <div className="flex items-center gap-3">
              <Button
                onClick={toggleReady}
                variant={myReady ? "secondary" : "default"}
                className="flex-1 font-display"
              >
                {myReady
                  ? <><CheckCircle2 className="h-4 w-4 mr-1" />Připraven ✓</>
                  : <><Swords className="h-4 w-4 mr-1" />Potvrdit připravenost</>}
              </Button>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {opponentReady
                  ? <><CheckCircle2 className="h-3 w-3 text-accent" /> Protivník připraven</>
                  : <><Clock className="h-3 w-3" /> Čekáme na protivníka</>}
              </div>
            </div>
          )}

          {/* ═══ RESOLVING SPINNER ═══ */}
          {resolving && (
            <div className="flex items-center justify-center gap-2 p-4">
              <Loader2 className="h-6 w-6 animate-spin text-destructive" />
              <span className="font-display text-sm">Vyhodnocuji bitvu...</span>
            </div>
          )}

          {/* ═══ BATTLE RESULT ═══ */}
          {battleResult && (
            <Card className="border-primary/30">
              <CardContent className="p-4 space-y-3">
                <div className="text-center space-y-1">
                  <p className={`font-display font-bold text-lg ${RESULT_DISPLAY[battleResult.result]?.className || ""}`}>
                    {RESULT_DISPLAY[battleResult.result]?.label || battleResult.result_label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {battleResult.attacker_name} vs {battleResult.defender_name}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <p className="font-display font-semibold">Útočník</p>
                    <p>Formace: {FORMATION_LABELS[battleResult.attacker_formation]}</p>
                    <p>Síla: {battleResult.attacker_strength}</p>
                    <p className="text-destructive">Ztráty: {battleResult.casualties_attacker}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-display font-semibold">Obránce</p>
                    <p>Formace: {FORMATION_LABELS[battleResult.defender_formation]}</p>
                    <p>Síla: {battleResult.defender_strength}</p>
                    <p className="text-destructive">Ztráty: {battleResult.casualties_defender}</p>
                  </div>
                </div>
                <div className="text-center text-[10px] text-muted-foreground">
                  Matchup bonus: {battleResult.formation_matchup_bonus >= 0 ? "+" : ""}{(battleResult.formation_matchup_bonus * 100).toFixed(0)}% · Luck: {(battleResult.luck_roll * 100).toFixed(0)}%
                </div>
                {battleResult.needs_decision && (
                  <p className="text-xs text-illuminated text-center font-display">
                    ⚖️ Rozhodnutí po bitvě čeká v panelu armády!
                  </p>
                )}
                <Button onClick={() => { onRefresh(); onClose(); }} className="w-full font-display">
                  Zavřít
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══ SIDE PANEL ═══
function SidePanel({ label, playerName, stackInfo, formation, speech, speechMod, speechFeedback, ready, isCurrentPlayer, isCityDefender, cityInfo }: {
  label: string; playerName: string; stackInfo: StackInfo | null; formation: string;
  speech: string | null; speechMod: number; speechFeedback: string | null;
  ready: boolean; isCurrentPlayer: boolean; isCityDefender: boolean; cityInfo: any;
}) {
  const FormIcon = FORMATIONS.find(f => f.key === formation)?.icon || Shield;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isCurrentPlayer ? "border-primary/40 bg-primary/5" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <p className="font-display font-semibold text-xs">{label}</p>
        {ready ? (
          <Badge variant="secondary" className="text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Připraven</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />Čeká</Badge>
        )}
      </div>

      <p className="font-display font-bold text-sm">{playerName}</p>

      {stackInfo && (
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-1.5">
            <Swords className="h-3 w-3 text-primary" />
            <span className="font-semibold">{stackInfo.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]"><Users className="h-2.5 w-2.5 mr-0.5" />{stackInfo.totalManpower} mužů</Badge>
            <Badge variant="secondary" className="text-[10px]">Síla: {stackInfo.power}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-12">Morálka</span>
            <Progress value={stackInfo.morale} className="h-1.5 flex-1" />
            <span className="w-6 text-right font-semibold">{stackInfo.morale}{speechMod ? ` (${speechMod >= 0 ? "+" : ""}${speechMod})` : ""}</span>
          </div>
          {/* Unit breakdown */}
          <div className="space-y-0.5">
            {stackInfo.compositions.map((c, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-16">{c.unit_type}</span>
                <span>{c.manpower} mužů</span>
                <span>· Q{c.quality}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isCityDefender && cityInfo && (
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-1.5">
            <Castle className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold">{cityInfo.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">Pop: {cityInfo.population_total}</Badge>
            <Badge variant="outline" className="text-[10px]">Garnizóna: {cityInfo.military_garrison || 0}</Badge>
            <Badge variant="outline" className="text-[10px]">{cityInfo.settlement_level}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-12">Stabilita</span>
            <Progress value={cityInfo.city_stability || 50} className="h-1.5 flex-1" />
            <span className="w-6 text-right font-semibold">{cityInfo.city_stability || 50}</span>
          </div>
        </div>
      )}

      {/* Formation */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-border">
        <FormIcon className="h-3 w-3" />
        <span className="text-xs font-display font-semibold">{FORMATION_LABELS[formation] || formation}</span>
      </div>

      {/* Speech preview */}
      {speech && (
        <div className="text-[10px] italic text-muted-foreground bg-muted/20 rounded p-1.5">
          „{speech.length > 100 ? speech.slice(0, 100) + "…" : speech}"
          <span className={`ml-1 font-semibold ${speechMod >= 0 ? "text-accent" : "text-destructive"}`}>
            ({speechMod >= 0 ? "+" : ""}{speechMod})
          </span>
        </div>
      )}
    </div>
  );
}
