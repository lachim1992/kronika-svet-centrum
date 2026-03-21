import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  RefreshCw, Loader2, Handshake, Brain, Eye, EyeOff, Shield, Swords,
  AlertTriangle, Heart, Target, Clock, TrendingUp, TrendingDown,
  Users, ScrollText, Flame, Snowflake, Scale, Activity,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
}

/* ════════════════════════════════════════ */
/* TYPES                                    */
/* ════════════════════════════════════════ */

interface Faction { faction_name: string; personality: string; disposition: Record<string, number>; goals: any[]; is_active: boolean; }
interface Relation {
  id: string; faction_a: string; faction_b: string;
  trust: number; fear: number; grievance: number; dependency: number;
  ideological_alignment: number; cooperation_score: number; betrayal_score: number;
  overall_disposition: number; turn_number: number;
}
interface Memory {
  id: string; faction_a: string; faction_b: string; memory_type: string;
  detail: string; intensity: number; decay_rate: number; turn_number: number;
  is_active: boolean; source_event_id: string | null;
}
interface Intent {
  id: string; faction_name: string; intent_type: string; target_faction: string | null;
  priority: number; reasoning: string; created_turn: number; status: string;
}
interface Pact {
  id: string; player_a: string; player_b: string; pact_type: string;
  status: string; created_at: string; expires_turn: number | null;
}
interface ActionLog {
  id: string; player_name: string; turn_number: number; action_type: string; description: string; created_at: string;
}

/* ════════════════════════════════════════ */
/* HELPERS                                  */
/* ════════════════════════════════════════ */

const dim = (v: number, max = 100) => {
  const pct = Math.abs(v) / max;
  if (pct > 0.7) return "text-destructive font-bold";
  if (pct > 0.4) return "text-warning font-semibold";
  return "text-muted-foreground";
};

const barColor = (v: number) => {
  if (v > 30) return "bg-green-500";
  if (v > 0) return "bg-green-400/60";
  if (v > -30) return "bg-orange-400/60";
  return "bg-destructive";
};

const MiniBar = ({ value, label, max = 100 }: { value: number; label: string; max?: number }) => {
  const pct = Math.min(Math.abs(value) / max * 100, 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="space-y-0.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">{label}</span>
            <span className={dim(value, max)}>{value}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor(value)}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent><p>{label}: {value}</p></TooltipContent>
    </Tooltip>
  );
};

const INTENT_LABELS: Record<string, string> = {
  seek_ally: "🤝 Hledá spojence",
  isolate_rival: "🎯 Izoluje rivala",
  buy_time: "⏳ Kupuje čas",
  threaten_neighbor: "⚔️ Hrozí sousedovi",
  seek_trade: "💰 Hledá obchod",
  revenge_betrayal: "🔥 Pomsta za zradu",
  exploit_instability: "💀 Zneužívá nestabilitu",
  anti_hegemon_coalition: "🛡️ Anti-hegemon koalice",
  consolidate: "🏰 Konsolidace",
  defend_territory: "🛡️ Obrana území",
  expand: "🗺️ Expanze",
  dominate: "👑 Dominance",
};

const MEMORY_ICONS: Record<string, string> = {
  betrayal: "🗡️", aid_given: "🤲", aid_refused: "❌", promise_broken: "💔",
  shared_enemy: "🤝", cooperation: "🤝", war: "⚔️", peace: "🕊️",
  trade: "💰", threat: "☠️", ultimatum: "📜", tribute: "💸",
};

const PERSONALITY_ICONS: Record<string, typeof Brain> = {
  aggressive: Swords, diplomatic: Handshake, mercantile: TrendingUp,
  isolationist: Shield, expansionist: Target,
};

/* ════════════════════════════════════════ */
/* MAIN COMPONENT                           */
/* ════════════════════════════════════════ */

const DiplomacyDebugPanel = ({ sessionId }: Props) => {
  const [loading, setLoading] = useState(false);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [pacts, setPacts] = useState<Pact[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [selectedFaction, setSelectedFaction] = useState<string>("");
  const [selectedPairA, setSelectedPairA] = useState<string>("");
  const [selectedPairB, setSelectedPairB] = useState<string>("");

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [
        { data: f }, { data: r }, { data: m }, { data: i }, { data: p }, { data: a },
      ] = await Promise.all([
        supabase.from("ai_factions").select("faction_name, personality, disposition, goals, is_active").eq("session_id", sessionId),
        supabase.from("diplomatic_relations").select("*").eq("session_id", sessionId),
        supabase.from("diplomatic_memory").select("*").eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(200),
        supabase.from("faction_intents").select("*").eq("session_id", sessionId).order("created_turn", { ascending: false }).limit(100),
        supabase.from("diplomatic_pacts").select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(50),
        supabase.from("world_action_log").select("*").eq("session_id", sessionId)
          .in("action_type", ["ai_faction_turn", "diplomacy", "war_declared", "peace_offered", "treaty", "pact_created", "pact_broken"])
          .order("turn_number", { ascending: false }).limit(100),
      ]);
      setFactions((f || []) as Faction[]);
      setRelations((r || []) as Relation[]);
      setMemories((m || []) as Memory[]);
      setIntents((i || []) as Intent[]);
      setPacts((p || []) as Pact[]);
      setActionLogs((a || []) as ActionLog[]);
      if (!selectedFaction && f?.length) setSelectedFaction(f[0].faction_name);
      if (!selectedPairA && f?.length) { setSelectedPairA(f[0]?.faction_name || ""); setSelectedPairB(f[1]?.faction_name || ""); }
    } catch (e: any) {
      toast.error("Fetch error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [sessionId]);

  const allNames = useMemo(() => {
    const s = new Set<string>();
    factions.forEach(f => s.add(f.faction_name));
    relations.forEach(r => { s.add(r.faction_a); s.add(r.faction_b); });
    return Array.from(s).sort();
  }, [factions, relations]);

  // ─── 1. Faction Overview ───
  const FactionOverview = () => {
    const f = factions.find(x => x.faction_name === selectedFaction);
    if (!f) return <p className="text-muted-foreground text-sm">Vyber frakci.</p>;
    const Icon = PERSONALITY_ICONS[f.personality] || Brain;
    const fRelations = relations.filter(r => r.faction_a === selectedFaction || r.faction_b === selectedFaction);
    const fIntents = intents.filter(i => i.faction_name === selectedFaction && i.status === "active");
    const fPacts = pacts.filter(p => (p.player_a === selectedFaction || p.player_b === selectedFaction) && p.status === "active");
    const fMemories = memories.filter(m =>
      (m.faction_a === selectedFaction || m.faction_b === selectedFaction) && m.is_active && m.memory_type === "betrayal"
    );

    const allies = fRelations.filter(r => r.overall_disposition > 20).map(r => r.faction_a === selectedFaction ? r.faction_b : r.faction_a);
    const rivals = fRelations.filter(r => r.overall_disposition < -20).map(r => r.faction_a === selectedFaction ? r.faction_b : r.faction_a);

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <span className="font-display font-bold text-lg">{selectedFaction}</span>
          <Badge variant="outline" className="text-[10px]">{f.personality}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Card className="p-2">
            <p className="text-[10px] text-muted-foreground mb-1">Spojenci</p>
            {allies.length ? allies.map(a => <Badge key={a} variant="secondary" className="mr-1 mb-1">{a}</Badge>) : <span className="text-muted-foreground">—</span>}
          </Card>
          <Card className="p-2">
            <p className="text-[10px] text-muted-foreground mb-1">Rivalové</p>
            {rivals.length ? rivals.map(r => <Badge key={r} variant="destructive" className="mr-1 mb-1">{r}</Badge>) : <span className="text-muted-foreground">—</span>}
          </Card>
        </div>

        <Card className="p-2">
          <p className="text-[10px] text-muted-foreground mb-1">Aktivní smlouvy ({fPacts.length})</p>
          {fPacts.map(p => (
            <div key={p.id} className="flex gap-2 text-xs items-center">
              <Badge variant="outline">{p.pact_type}</Badge>
              <span>{p.player_a === selectedFaction ? p.player_b : p.player_a}</span>
              {p.expires_turn && <span className="text-muted-foreground text-[10px]">exp. {p.expires_turn}</span>}
            </div>
          ))}
          {!fPacts.length && <span className="text-muted-foreground text-xs">Žádné</span>}
        </Card>

        <Card className="p-2">
          <p className="text-[10px] text-muted-foreground mb-1">Křivdy ({fMemories.length})</p>
          {fMemories.slice(0, 5).map(m => (
            <div key={m.id} className="text-xs text-destructive">
              {MEMORY_ICONS[m.memory_type] || "•"} {m.detail?.substring(0, 80)} <span className="text-muted-foreground">(rok {m.turn_number})</span>
            </div>
          ))}
          {!fMemories.length && <span className="text-muted-foreground text-xs">Žádné</span>}
        </Card>

        <Card className="p-2">
          <p className="text-[10px] text-muted-foreground mb-1">Strategické záměry ({fIntents.length})</p>
          {fIntents.map(i => (
            <div key={i.id} className="flex items-center gap-1.5 text-xs">
              <span>{INTENT_LABELS[i.intent_type] || i.intent_type}</span>
              {i.target_faction && <Badge variant="secondary" className="text-[10px]">→ {i.target_faction}</Badge>}
              <Badge variant="outline" className="text-[10px]">P{i.priority}</Badge>
              <span className="text-muted-foreground ml-auto text-[10px]">{i.reasoning?.substring(0, 60)}</span>
            </div>
          ))}
          {!fIntents.length && <span className="text-muted-foreground text-xs">Žádné záměry</span>}
        </Card>

        <Card className="p-2">
          <p className="text-[10px] text-muted-foreground mb-1">Cíle</p>
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap">{JSON.stringify(f.goals, null, 1)}</pre>
        </Card>
      </div>
    );
  };

  // ─── 2. Relation Matrix ───
  const RelationMatrix = () => {
    const pair = relations.find(r =>
      (r.faction_a === selectedPairA && r.faction_b === selectedPairB) ||
      (r.faction_a === selectedPairB && r.faction_b === selectedPairA)
    );

    return (
      <div className="space-y-3">
        {/* Heatmap grid */}
        <Card className="p-2">
          <p className="text-[10px] text-muted-foreground mb-2">Heatmap — celková dispozice</p>
          <div className="overflow-x-auto">
            <table className="text-[10px] w-full">
              <thead>
                <tr>
                  <th className="text-left p-1" />
                  {allNames.map(n => <th key={n} className="p-1 text-center truncate max-w-[60px]">{n.substring(0, 8)}</th>)}
                </tr>
              </thead>
              <tbody>
                {allNames.map(a => (
                  <tr key={a}>
                    <td className="p-1 font-semibold truncate max-w-[80px]">{a.substring(0, 10)}</td>
                    {allNames.map(b => {
                      if (a === b) return <td key={b} className="p-1 text-center bg-muted">—</td>;
                      const rel = relations.find(r =>
                        (r.faction_a === a && r.faction_b === b) || (r.faction_a === b && r.faction_b === a)
                      );
                      const v = rel?.overall_disposition ?? 0;
                      const bg = v > 30 ? "bg-green-500/30" : v > 0 ? "bg-green-400/10" : v > -30 ? "bg-orange-400/20" : "bg-destructive/30";
                      return (
                        <td
                          key={b}
                          className={`p-1 text-center cursor-pointer hover:ring-1 ring-primary ${bg}`}
                          onClick={() => { setSelectedPairA(a); setSelectedPairB(b); }}
                        >
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Pair detail */}
        <div className="flex gap-2 items-center">
          <Select value={selectedPairA} onValueChange={setSelectedPairA}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{allNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-muted-foreground">⟷</span>
          <Select value={selectedPairB} onValueChange={setSelectedPairB}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{allNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {pair ? (
          <Card className="p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <MiniBar value={pair.trust} label="Důvěra" />
              <MiniBar value={pair.fear} label="Strach" />
              <MiniBar value={pair.grievance} label="Křivda" />
              <MiniBar value={pair.dependency} label="Závislost" />
              <MiniBar value={pair.ideological_alignment} label="Ideol. shoda" />
              <MiniBar value={pair.cooperation_score} label="Spolupráce" />
              <MiniBar value={pair.betrayal_score} label="Zrada" />
              <MiniBar value={pair.overall_disposition} label="Celkově" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Aktualizováno v kole {pair.turn_number}</p>
          </Card>
        ) : (
          <p className="text-xs text-muted-foreground">Žádný záznam pro tento pár.</p>
        )}
      </div>
    );
  };

  // ─── 3. Memory Inspector ───
  const MemoryInspector = () => {
    const pairMem = memories.filter(m =>
      (m.faction_a === selectedPairA && m.faction_b === selectedPairB) ||
      (m.faction_a === selectedPairB && m.faction_b === selectedPairA)
    );
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{selectedPairA} ⟷ {selectedPairB} — {pairMem.length} záznamů</p>
        <ScrollArea className="h-[350px]">
          {pairMem.map(m => (
            <Card key={m.id} className={`p-2 mb-2 ${m.is_active ? "" : "opacity-50"}`}>
              <div className="flex items-center gap-2 text-xs">
                <span>{MEMORY_ICONS[m.memory_type] || "•"}</span>
                <Badge variant={m.is_active ? "default" : "outline"} className="text-[10px]">{m.memory_type}</Badge>
                <span className="text-muted-foreground">rok {m.turn_number}</span>
                <Badge variant="outline" className="text-[10px] ml-auto">intenzita {m.intensity}</Badge>
                <Badge variant="outline" className="text-[10px]">decay {m.decay_rate}</Badge>
              </div>
              <p className="text-xs mt-1">{m.detail}</p>
              {m.source_event_id && <p className="text-[10px] text-muted-foreground mt-1">event: {m.source_event_id.substring(0, 8)}…</p>}
            </Card>
          ))}
          {!pairMem.length && <p className="text-muted-foreground text-sm py-4 text-center">Žádné diplomatické paměti pro tento pár.</p>}
        </ScrollArea>
      </div>
    );
  };

  // ─── 4. Intent Inspector ───
  const IntentInspector = () => {
    const grouped = allNames.map(name => ({
      name,
      active: intents.filter(i => i.faction_name === name && i.status === "active"),
      superseded: intents.filter(i => i.faction_name === name && i.status === "superseded").slice(0, 5),
    })).filter(g => g.active.length || g.superseded.length);

    return (
      <ScrollArea className="h-[400px]">
        {grouped.map(g => (
          <Card key={g.name} className="p-2 mb-2">
            <p className="font-display font-bold text-sm mb-1">{g.name}</p>
            {g.active.map(i => (
              <div key={i.id} className="flex items-center gap-1.5 text-xs mb-1">
                <Activity className="h-3 w-3 text-green-500" />
                <span>{INTENT_LABELS[i.intent_type] || i.intent_type}</span>
                {i.target_faction && <Badge variant="secondary" className="text-[10px]">→ {i.target_faction}</Badge>}
                <Badge variant="outline" className="text-[10px]">P{i.priority}</Badge>
                <span className="text-muted-foreground text-[10px] ml-auto">rok {i.created_turn}</span>
              </div>
            ))}
            {g.superseded.length > 0 && (
              <div className="mt-1 border-t border-border pt-1">
                <p className="text-[10px] text-muted-foreground mb-0.5">Předchozí:</p>
                {g.superseded.map(i => (
                  <div key={i.id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="opacity-60">{INTENT_LABELS[i.intent_type] || i.intent_type}</span>
                    {i.target_faction && <span>→ {i.target_faction}</span>}
                    <span className="ml-auto">rok {i.created_turn}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {!grouped.length && <p className="text-muted-foreground text-sm py-4 text-center">Žádné záměry.</p>}
      </ScrollArea>
    );
  };

  // ─── 5. Decision Trace ───
  const DecisionTrace = () => {
    const dipLogs = actionLogs.filter(a => a.action_type === "ai_faction_turn" && a.player_name === selectedFaction);
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">AI Turn logy pro {selectedFaction} — diplomatické rozhodování</p>
        <ScrollArea className="h-[350px]">
          {dipLogs.map(log => {
            // Parse the internal thought from description
            const thought = log.description?.match(/\[.*?\]\.\s*(.*)/)?.[1] || log.description;
            return (
              <Card key={log.id} className="p-2 mb-2">
                <div className="flex items-center gap-2 text-xs">
                  <Brain className="h-3 w-3 text-primary" />
                  <span className="font-display font-semibold">Rok {log.turn_number}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{new Date(log.created_at).toLocaleString("cs")}</span>
                </div>
                <p className="text-xs mt-1 whitespace-pre-wrap">{thought}</p>
              </Card>
            );
          })}
          {!dipLogs.length && <p className="text-muted-foreground text-sm py-4 text-center">Žádné záznamy.</p>}
        </ScrollArea>
        <p className="text-[10px] text-muted-foreground italic">
          💡 Podrobnější diplomacy_trace (vstupní signály, zvážené paměti, kandidátní akce) — připraveno k rozšíření v ai-faction-turn.
        </p>
      </div>
    );
  };

  // ─── 6. Public vs Private ───
  const PublicPrivateView = () => {
    const f = factions.find(x => x.faction_name === selectedFaction);
    const fIntentsActive = intents.filter(i => i.faction_name === selectedFaction && i.status === "active");
    const fRelationsAll = relations.filter(r => r.faction_a === selectedFaction || r.faction_b === selectedFaction);

    return (
      <div className="space-y-3">
        <Card className="p-3 border-primary/30">
          <div className="flex items-center gap-2 mb-2">
            <EyeOff className="h-4 w-4 text-destructive" />
            <span className="text-sm font-display font-bold">Interní postoj (skryté)</span>
          </div>
          <div className="text-xs space-y-1">
            <p><strong>Osobnost:</strong> {f?.personality}</p>
            <p><strong>Záměry:</strong></p>
            {fIntentsActive.map(i => (
              <div key={i.id} className="ml-2">{INTENT_LABELS[i.intent_type] || i.intent_type}{i.target_faction ? ` → ${i.target_faction}` : ""} — {i.reasoning}</div>
            ))}
            <p><strong>Skutečné dispozice:</strong></p>
            {fRelationsAll.map(r => {
              const other = r.faction_a === selectedFaction ? r.faction_b : r.faction_a;
              return <div key={r.id} className="ml-2">{other}: {r.overall_disposition} (důvěra {r.trust}, zrada {r.betrayal_score})</div>;
            })}
          </div>
        </Card>

        <Card className="p-3 border-green-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-green-500" />
            <span className="text-sm font-display font-bold">Veřejný postoj (viditelné)</span>
          </div>
          <div className="text-xs space-y-1">
            <p><strong>Paktové:</strong></p>
            {pacts.filter(p => (p.player_a === selectedFaction || p.player_b === selectedFaction) && p.status === "active").map(p => (
              <div key={p.id} className="ml-2">
                <Badge variant="outline" className="text-[10px] mr-1">{p.pact_type}</Badge>
                {p.player_a === selectedFaction ? p.player_b : p.player_a}
              </div>
            ))}
            <p className="text-muted-foreground italic mt-2">
              Generované diplomatické zprávy a deklarace jsou k dispozici v DiplomacyPanel a Chronicle.
              Budoucí: detekce deception / signaling.
            </p>
          </div>
        </Card>
      </div>
    );
  };

  // ─── 7. Diplomatic Timeline ───
  const DiplomaticTimeline = () => {
    // Combine pacts, memories, intents, action logs into a timeline
    type TimelineItem = { turn: number; type: string; text: string; faction?: string; created_at?: string };
    const items: TimelineItem[] = [];

    pacts.forEach(p => items.push({
      turn: 0, type: "pact", text: `${p.pact_type}: ${p.player_a} ⟷ ${p.player_b} [${p.status}]`,
      created_at: p.created_at,
    }));
    memories.filter(m => m.is_active).forEach(m => items.push({
      turn: m.turn_number, type: m.memory_type,
      text: `${MEMORY_ICONS[m.memory_type] || "•"} ${m.faction_a} → ${m.faction_b}: ${m.detail?.substring(0, 80)}`,
    }));
    actionLogs.forEach(a => items.push({
      turn: a.turn_number, type: a.action_type,
      text: `[${a.player_name}] ${a.description?.substring(0, 120)}`,
      created_at: a.created_at,
    }));

    items.sort((a, b) => (b.turn || 0) - (a.turn || 0) || (b.created_at || "").localeCompare(a.created_at || ""));

    return (
      <ScrollArea className="h-[400px]">
        {items.slice(0, 100).map((item, idx) => (
          <div key={idx} className="flex gap-2 py-1 border-b border-border/50 text-xs">
            <span className="text-muted-foreground w-10 text-right shrink-0">R{item.turn || "?"}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">{item.type}</Badge>
            <span className="truncate">{item.text}</span>
          </div>
        ))}
        {!items.length && <p className="text-muted-foreground text-sm py-4 text-center">Žádné diplomatické události.</p>}
      </ScrollArea>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Handshake className="h-5 w-5 text-primary" />
        <h2 className="font-display font-bold text-lg">Diplomacy Debug</h2>
        <Button size="sm" variant="ghost" onClick={fetchAll} disabled={loading} className="ml-auto gap-1">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {/* Faction selector */}
      <Select value={selectedFaction} onValueChange={setSelectedFaction}>
        <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="Vyber frakci" /></SelectTrigger>
        <SelectContent>
          {allNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
        </SelectContent>
      </Select>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="overview" className="text-[11px] gap-1"><Users className="h-3 w-3" /> Přehled</TabsTrigger>
          <TabsTrigger value="relations" className="text-[11px] gap-1"><Scale className="h-3 w-3" /> Vztahy</TabsTrigger>
          <TabsTrigger value="memory" className="text-[11px] gap-1"><ScrollText className="h-3 w-3" /> Paměť</TabsTrigger>
          <TabsTrigger value="intents" className="text-[11px] gap-1"><Target className="h-3 w-3" /> Záměry</TabsTrigger>
          <TabsTrigger value="trace" className="text-[11px] gap-1"><Brain className="h-3 w-3" /> Trace</TabsTrigger>
          <TabsTrigger value="public-private" className="text-[11px] gap-1"><Eye className="h-3 w-3" /> Pub/Priv</TabsTrigger>
          <TabsTrigger value="timeline" className="text-[11px] gap-1"><Clock className="h-3 w-3" /> Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3"><FactionOverview /></TabsContent>
        <TabsContent value="relations" className="mt-3"><RelationMatrix /></TabsContent>
        <TabsContent value="memory" className="mt-3"><MemoryInspector /></TabsContent>
        <TabsContent value="intents" className="mt-3"><IntentInspector /></TabsContent>
        <TabsContent value="trace" className="mt-3"><DecisionTrace /></TabsContent>
        <TabsContent value="public-private" className="mt-3"><PublicPrivateView /></TabsContent>
        <TabsContent value="timeline" className="mt-3"><DiplomaticTimeline /></TabsContent>
      </Tabs>
    </div>
  );
};

export default DiplomacyDebugPanel;
