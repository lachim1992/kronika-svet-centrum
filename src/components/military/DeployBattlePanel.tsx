import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  MapPin, Swords, Shield, Navigation, Loader2, AlertTriangle, Crosshair,
  ChevronRight, Scroll, ArrowRight, Castle, Flag,
} from "lucide-react";
import { toast } from "sonner";

interface Stack {
  id: string;
  name: string;
  formation_type: string;
  morale: number;
  power: number;
  is_active: boolean;
  hex_q?: number | null;
  hex_r?: number | null;
  is_deployed?: boolean;
  moved_this_turn?: boolean;
  player_name: string;
  compositions: { id: string; unit_type: string; manpower: number; quality: number }[];
}

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  stacks: Stack[];
  cities: any[];
  onRefresh: () => void;
}

const AXIAL_NEIGHBORS = [
  { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
  { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
  { dq: 1, dr: -1 }, { dq: -1, dr: 1 },
];

const FORMATION_LABELS: Record<string, string> = {
  UNIT: "Jednotka", LEGION: "Legie", ARMY: "Armáda",
};

const RESULT_LABELS: Record<string, { label: string; className: string }> = {
  decisive_victory: { label: "Drtivé vítězství", className: "text-accent" },
  victory: { label: "Vítězství", className: "text-accent" },
  pyrrhic_victory: { label: "Pyrrhovo vítězství", className: "text-illuminated" },
  defeat: { label: "Porážka", className: "text-destructive" },
  rout: { label: "Rozprášení", className: "text-destructive" },
};

export default function DeployBattlePanel({ sessionId, currentPlayerName, currentTurn, stacks, cities, onRefresh }: Props) {
  const [deployDialog, setDeployDialog] = useState<Stack | null>(null);
  const [moveDialog, setMoveDialog] = useState<Stack | null>(null);
  const [battleDialog, setBattleDialog] = useState<Stack | null>(null);
  const [pendingDecisions, setPendingDecisions] = useState<any[]>([]);
  const [recentBattles, setRecentBattles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);
  const deployedStacks = stacks.filter(s => s.is_active && s.is_deployed);
  const garrisonStacks = stacks.filter(s => s.is_active && !s.is_deployed);

  // Load pending decisions and recent battles
  useEffect(() => {
    const load = async () => {
      const [decRes, batRes] = await Promise.all([
        supabase.from("action_queue").select("*")
          .eq("session_id", sessionId).eq("player_name", currentPlayerName)
          .eq("action_type", "post_battle_decision").eq("status", "pending"),
        supabase.from("battles").select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false }).limit(5),
      ]);
      setPendingDecisions(decRes.data || []);
      setRecentBattles(batRes.data || []);
    };
    load();
  }, [sessionId, currentPlayerName, stacks]);

  return (
    <div className="space-y-4">
      {/* Pending post-battle decisions */}
      {pendingDecisions.length > 0 && (
        <Card className="border-illuminated/30">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2 text-illuminated">
              <AlertTriangle className="h-4 w-4" /> Čekající rozhodnutí po bitvě
            </h3>
            {pendingDecisions.map(dec => (
              <PostBattleDecision key={dec.id} decision={dec} sessionId={sessionId}
                playerName={currentPlayerName} currentTurn={currentTurn}
                stacks={stacks} cities={cities} onRefresh={onRefresh}
                onDone={() => setPendingDecisions(p => p.filter(d => d.id !== dec.id))} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Garrison (not deployed) */}
      {garrisonStacks.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Castle className="h-4 w-4 text-muted-foreground" /> V garnizóně (nerozmístěné)
            </h3>
            <div className="space-y-2">
              {garrisonStacks.map(s => {
                const mp = s.compositions.reduce((a, c) => a + c.manpower, 0);
                return (
                  <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
                    <Swords className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-display font-semibold text-sm truncate">{s.name}</span>
                    <Badge variant="outline" className="text-[10px]">{mp} mužů</Badge>
                    <span className="ml-auto" />
                    <Button size="sm" variant="outline" className="text-xs font-display h-7"
                      onClick={() => setDeployDialog(s)}>
                      <MapPin className="h-3 w-3 mr-1" />Rozmístit
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployed stacks */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Navigation className="h-4 w-4 text-primary" /> Rozmístěné armády
          </h3>
          {deployedStacks.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Žádné rozmístěné armády. Rozmístěte jednotku na hex.</p>
          )}
          <div className="space-y-2">
            {deployedStacks.map(s => {
              const mp = s.compositions.reduce((a, c) => a + c.manpower, 0);
              const city = myCities.find(c => c.province_q === s.hex_q && c.province_r === s.hex_r);
              return (
                <div key={s.id} className="p-3 rounded-lg border border-border bg-card space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Swords className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-display font-semibold text-sm">{s.name}</span>
                    <Badge variant="outline" className="text-[10px]">{FORMATION_LABELS[s.formation_type]}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{mp} mužů</Badge>
                    <Badge variant="outline" className="text-[10px]">
                      <MapPin className="h-2.5 w-2.5 mr-0.5" />({s.hex_q},{s.hex_r})
                    </Badge>
                    {city && <Badge variant="outline" className="text-[10px]">📍 {city.name}</Badge>}
                    {s.moved_this_turn && <Badge variant="secondary" className="text-[9px]">Přesunuto</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground w-14">Morálka</span>
                    <Progress value={s.morale} className="h-1.5 flex-1" />
                    <span className="w-8 text-right font-semibold">{s.morale}</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button size="sm" variant="outline" className="text-xs font-display h-7"
                      disabled={!!s.moved_this_turn}
                      onClick={() => setMoveDialog(s)}>
                      <Navigation className="h-3 w-3 mr-1" />Přesunout
                    </Button>
                    <Button size="sm" variant="default" className="text-xs font-display h-7"
                      onClick={() => setBattleDialog(s)}>
                      <Swords className="h-3 w-3 mr-1" />Útok
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs font-display h-7"
                      onClick={async () => {
                        await supabase.from("military_stacks").update({
                          is_deployed: false, hex_q: null, hex_r: null,
                        } as any).eq("id", s.id);
                        toast.success("Armáda stažena do garnizóny");
                        onRefresh();
                      }}>
                      <Castle className="h-3 w-3 mr-1" />Stáhnout
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent battles */}
      {recentBattles.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Scroll className="h-4 w-4 text-illuminated" /> Nedávné bitvy
            </h3>
            {recentBattles.map(b => {
              const cfg = RESULT_LABELS[b.result] || { label: b.result, className: "" };
              return (
                <div key={b.id} className="p-2 rounded border border-border text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <Swords className="h-3 w-3 text-muted-foreground" />
                    <span className={`font-display font-semibold ${cfg.className}`}>{cfg.label}</span>
                    <span className="text-muted-foreground ml-auto">Kolo {b.turn_number}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>Síla: {b.attacker_strength_snapshot} vs {b.defender_strength_snapshot}</span>
                    <span>·</span>
                    <span>Ztráty: {b.casualties_attacker}/{b.casualties_defender}</span>
                    <span>·</span>
                    <span>Luck: {(b.luck_roll * 100).toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Deploy dialog */}
      {deployDialog && (
        <DeployStackDialog stack={deployDialog} cities={myCities} sessionId={sessionId}
          onClose={() => setDeployDialog(null)} onRefresh={onRefresh} />
      )}

      {/* Move dialog */}
      {moveDialog && (
        <MoveStackDialog stack={moveDialog} sessionId={sessionId}
          onClose={() => setMoveDialog(null)} onRefresh={onRefresh} />
      )}

      {/* Battle dialog */}
      {battleDialog && (
        <BattleInitDialog stack={battleDialog} sessionId={sessionId}
          currentPlayerName={currentPlayerName} currentTurn={currentTurn}
          cities={cities} stacks={stacks}
          onClose={() => setBattleDialog(null)} onRefresh={onRefresh} />
      )}
    </div>
  );
}

// ═══ Deploy Stack Dialog ═══
function DeployStackDialog({ stack, cities, sessionId, onClose, onRefresh }: {
  stack: Stack; cities: any[]; sessionId: string; onClose: () => void; onRefresh: () => void;
}) {
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const handleDeploy = async () => {
    const city = cities.find(c => c.id === selectedCity);
    if (!city) { toast.error("Vyberte město"); return; }
    setSaving(true);
    await supabase.from("military_stacks").update({
      hex_q: city.province_q,
      hex_r: city.province_r,
      is_deployed: true,
      moved_this_turn: false,
    } as any).eq("id", stack.id);
    await dispatchCommand({
      sessionId, actor: { name: stack.player_name || "system" }, commandType: "DEPLOY_STACK",
      commandPayload: { stackId: stack.id, stackName: stack.name, cityId: city.id, cityName: city.name, hexQ: city.province_q, hexR: city.province_r,
        chronicleText: `Armáda **${stack.name}** byla rozmístěna u města **${city.name}** (${city.province_q},${city.province_r}).` },
    });
    toast.success(`${stack.name} rozmístěna u ${city.name}`);
    setSaving(false);
    onRefresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Rozmístit {stack.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Vyberte město, u kterého bude armáda rozmístěna.</p>
          <Select value={selectedCity} onValueChange={setSelectedCity}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Vyberte město..." /></SelectTrigger>
            <SelectContent>
              {cities.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.province_q},{c.province_r})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleDeploy} disabled={saving || !selectedCity} className="w-full font-display">
            <MapPin className="h-4 w-4 mr-1" />Rozmístit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══ Move Stack Dialog ═══
function MoveStackDialog({ stack, sessionId, onClose, onRefresh }: {
  stack: Stack; sessionId: string; onClose: () => void; onRefresh: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const q = stack.hex_q ?? 0;
  const r = stack.hex_r ?? 0;
  const neighbors = AXIAL_NEIGHBORS.map(n => ({ q: q + n.dq, r: r + n.dr }));

  const handleMove = async (tq: number, tr: number) => {
    setSaving(true);
    await supabase.from("military_stacks").update({
      hex_q: tq, hex_r: tr, moved_this_turn: true,
    } as any).eq("id", stack.id);
    toast.success(`${stack.name} přesunuta na (${tq},${tr})`);
    setSaving(false);
    onRefresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" /> Přesunout {stack.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Aktuální pozice: ({q},{r}). Vyberte sousední hex.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {neighbors.map(n => (
              <Button key={`${n.q},${n.r}`} variant="outline" size="sm"
                className="font-display text-xs" disabled={saving}
                onClick={() => handleMove(n.q, n.r)}>
                <ArrowRight className="h-3 w-3 mr-1" />({n.q},{n.r})
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══ Battle Init Dialog (with speech) ═══
function BattleInitDialog({ stack, sessionId, currentPlayerName, currentTurn, cities, stacks, onClose, onRefresh }: {
  stack: Stack; sessionId: string; currentPlayerName: string; currentTurn: number;
  cities: any[]; stacks: Stack[]; onClose: () => void; onRefresh: () => void;
}) {
  const [targetType, setTargetType] = useState<"city" | "stack">("city");
  const [targetId, setTargetId] = useState("");
  const [speechText, setSpeechText] = useState("");
  const [speechResult, setSpeechResult] = useState<{ morale_modifier: number; ai_feedback: string } | null>(null);
  const [evaluatingSpeech, setEvaluatingSpeech] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Find valid targets (enemy cities at same or adjacent hex, enemy stacks nearby)
  const q = stack.hex_q ?? 0;
  const r = stack.hex_r ?? 0;
  const reachableHexes = new Set([
    `${q},${r}`,
    ...AXIAL_NEIGHBORS.map(n => `${q + n.dq},${r + n.dr}`),
  ]);

  const enemyCities = cities.filter(c =>
    c.owner_player !== currentPlayerName &&
    reachableHexes.has(`${c.province_q},${c.province_r}`)
  );

  const enemyStacks = stacks.filter(s =>
    s.player_name !== currentPlayerName &&
    s.is_active && s.is_deployed &&
    reachableHexes.has(`${s.hex_q},${s.hex_r}`)
  );

  const handleEvaluateSpeech = async () => {
    if (!speechText.trim()) { toast.error("Napište proslov"); return; }
    setEvaluatingSpeech(true);
    try {
      const targetName = targetType === "city"
        ? enemyCities.find(c => c.id === targetId)?.name || "město"
        : enemyStacks.find(s => s.id === targetId)?.name || "nepřítel";

      const { data, error } = await supabase.functions.invoke("battle-speech", {
        body: {
          speech_text: speechText,
          attacker_name: stack.name,
          defender_name: targetName,
          biome: "plains",
          attacker_morale: stack.morale,
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
      } else if (data) {
        setSpeechResult(data);
        toast.success(`Proslov vyhodnocen: ${data.morale_modifier >= 0 ? "+" : ""}${data.morale_modifier} morálka`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Chyba při hodnocení proslovu");
    }
    setEvaluatingSpeech(false);
  };

  const handleInitiateBattle = async () => {
    if (!targetId) { toast.error("Vyberte cíl"); return; }
    setSubmitting(true);
    try {
      const seed = Date.now() + Math.floor(Math.random() * 100000);
      await supabase.from("action_queue").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        action_type: "battle",
        status: "pending",
        action_data: {
          attacker_stack_id: stack.id,
          defender_city_id: targetType === "city" ? targetId : null,
          defender_stack_id: targetType === "stack" ? targetId : null,
          speech_text: speechText || null,
          speech_morale_modifier: speechResult?.morale_modifier || 0,
          seed,
          biome: "plains",
        },
        completes_at: new Date().toISOString(),
        created_turn: currentTurn,
        execute_on_turn: currentTurn,
      });
      toast.success(`⚔️ Bitva naplánována! Bude vyhodnocena při zpracování kola.`);
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Chyba");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Swords className="h-5 w-5 text-destructive" /> Zahájit bitvu — {stack.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Target selection */}
          <div className="space-y-2">
            <p className="text-xs font-display font-semibold text-muted-foreground">Cíl útoku</p>
            <div className="flex gap-2">
              <Button size="sm" variant={targetType === "city" ? "default" : "outline"}
                className="text-xs font-display" onClick={() => { setTargetType("city"); setTargetId(""); }}>
                <Castle className="h-3 w-3 mr-1" />Město
              </Button>
              <Button size="sm" variant={targetType === "stack" ? "default" : "outline"}
                className="text-xs font-display" onClick={() => { setTargetType("stack"); setTargetId(""); }}>
                <Shield className="h-3 w-3 mr-1" />Armáda
              </Button>
            </div>

            {targetType === "city" && (
              enemyCities.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Žádná nepřátelská města v dosahu.</p>
              ) : (
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Vyberte cíl..." /></SelectTrigger>
                  <SelectContent>
                    {enemyCities.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.owner_player}) — ({c.province_q},{c.province_r})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            )}

            {targetType === "stack" && (
              enemyStacks.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Žádné nepřátelské armády v dosahu.</p>
              ) : (
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Vyberte cíl..." /></SelectTrigger>
                  <SelectContent>
                    {enemyStacks.map(s => {
                      const mp = s.compositions.reduce((a, c) => a + c.manpower, 0);
                      return (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.player_name}) — {mp} mužů
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )
            )}
          </div>

          {/* Battle speech */}
          <div className="space-y-2">
            <p className="text-xs font-display font-semibold text-muted-foreground">
              Bitevní proslov <span className="text-[10px] font-normal">(ovlivní morálku ±10)</span>
            </p>
            <Textarea
              placeholder="Vojáci! Dnes je den, kdy se rozhodne osud naší říše..."
              value={speechText}
              onChange={e => { setSpeechText(e.target.value); setSpeechResult(null); }}
              className="text-sm min-h-[80px]"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="text-xs font-display"
                disabled={evaluatingSpeech || !speechText.trim()}
                onClick={handleEvaluateSpeech}>
                {evaluatingSpeech
                  ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Hodnotím...</>
                  : <><Scroll className="h-3 w-3 mr-1" />Vyhodnotit proslov</>
                }
              </Button>
              {speechResult && (
                <Badge className={`text-xs ${speechResult.morale_modifier >= 0 ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
                  {speechResult.morale_modifier >= 0 ? "+" : ""}{speechResult.morale_modifier} morálka
                </Badge>
              )}
            </div>
            {speechResult?.ai_feedback && (
              <p className="text-xs text-muted-foreground italic bg-muted/30 rounded p-2">
                „{speechResult.ai_feedback}"
              </p>
            )}
          </div>

          {/* Summary */}
          <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <Swords className="h-3 w-3 text-primary" />
              <span className="font-display font-semibold">{stack.name}</span>
              <span className="text-muted-foreground">Síla: {stack.power} · Morálka: {stack.morale}{speechResult ? ` → ${Math.max(0, Math.min(100, stack.morale + speechResult.morale_modifier))}` : ""}</span>
            </div>
            <p className="text-muted-foreground">
              Bitva bude vyhodnocena deterministicky při zpracování kola (process-turn).
            </p>
          </div>

          <Button onClick={handleInitiateBattle} disabled={submitting || !targetId}
            className="w-full font-display" variant="destructive">
            <Swords className="h-4 w-4 mr-1" />Zahájit útok
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══ Post-Battle Decision ═══
function PostBattleDecision({ decision, sessionId, playerName, currentTurn, stacks, cities, onRefresh, onDone }: {
  decision: any; sessionId: string; playerName: string; currentTurn: number;
  stacks: Stack[]; cities: any[]; onRefresh: () => void; onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const data = decision.action_data as any;
  const city = cities.find(c => c.id === data.defender_city_id);
  const result = RESULT_LABELS[data.result] || { label: data.result, className: "" };

  const handleDecision = async (action: "conquer" | "pillage" | "vassalize") => {
    setSaving(true);
    const labels: Record<string, string> = {
      conquer: "dobytí", pillage: "drancování", vassalize: "vazalství",
    };

    if (action === "conquer" && city) {
      await supabase.from("cities").update({ owner_player: playerName }).eq("id", city.id);
    } else if (action === "pillage" && city) {
      await supabase.from("cities").update({
        status: "devastated", devastated_round: currentTurn,
        city_stability: Math.max(0, (city.city_stability || 50) - 30),
      }).eq("id", city.id);
    }
    // vassalize = no ownership change, just diplomatic entry

    await supabase.from("action_queue").update({ status: "executed" }).eq("id", decision.id);
    await dispatchCommand({
      sessionId, actor: { name: playerName }, commandType: "POST_BATTLE_DECISION",
      commandPayload: { action, cityId: city?.id, cityName: city?.name, decisionId: decision.id,
        chronicleText: `Po vítězné bitvě se **${playerName}** rozhodl pro **${labels[action]}** města **${city?.name || "?"}**.` },
    });
    toast.success(`Rozhodnutí: ${labels[action]}`);
    setSaving(false);
    onRefresh();
    onDone();
  };

  return (
    <div className="p-3 rounded-lg border border-illuminated/20 bg-illuminated/5 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Flag className="h-4 w-4 text-illuminated" />
        <span className="font-display font-semibold">{city?.name || "Neznámé město"}</span>
        <span className={`text-xs ${result.className}`}>{result.label}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Ztráty: {data.casualties_attacker} (vy) / {data.casualties_defender} (obránce)
      </p>
      <div className="flex gap-2">
        <Button size="sm" className="text-xs font-display" disabled={saving}
          onClick={() => handleDecision("conquer")}>
          <Castle className="h-3 w-3 mr-1" />Dobýt
        </Button>
        <Button size="sm" variant="outline" className="text-xs font-display" disabled={saving}
          onClick={() => handleDecision("pillage")}>
          <Crosshair className="h-3 w-3 mr-1" />Drancovat
        </Button>
        <Button size="sm" variant="secondary" className="text-xs font-display" disabled={saving}
          onClick={() => handleDecision("vassalize")}>
          <Shield className="h-3 w-3 mr-1" />Vazalství
        </Button>
      </div>
    </div>
  );
}
