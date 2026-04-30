import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Brain, Swords, Building2, Coins, Handshake, RefreshCw, Loader2,
  AlertTriangle, ChevronDown, Zap, Activity,
} from "lucide-react";
import { toast } from "sonner";

interface Props { sessionId: string; }

interface SummaryRow {
  id: string;
  faction_name: string;
  turn_number: number;
  doctrine: string | null;
  war_state: string | null;
  actions_planned: number | null;
  actions_executed: number | null;
  actions_failed: number | null;
  recruits_attempted: number | null;
  builds_attempted: number | null;
  attacks_attempted: number | null;
  power_delta: number | null;
  wealth_delta: number | null;
  internal_thought: string | null;
  failure_reasons: string[] | null;
  created_at: string;
}

const DOCTRINE_ICON: Record<string, typeof Brain> = {
  military: Swords,
  expansion: Activity,
  economy: Coins,
  diplomacy: Handshake,
};

const DOCTRINE_COLOR: Record<string, string> = {
  military: "text-destructive",
  expansion: "text-warning",
  economy: "text-yellow-500",
  diplomacy: "text-blue-400",
};

const WAR_LABEL: Record<string, string> = {
  peace: "🟢 Mír", tension: "🟡 Napětí", war: "🔴 Válka",
};

const AIFactionEnginePanel = ({ sessionId }: Props) => {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [forcing, setForcing] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("ai_faction_turn_summary")
        .select("*")
        .eq("session_id", sessionId)
        .order("turn_number", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data || []) as SummaryRow[]);
    } catch (e: any) {
      toast.error("Načítání selhalo: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, [sessionId]);

  // Group by faction → last 5 turns
  const grouped = useMemo(() => {
    const byFaction = new Map<string, SummaryRow[]>();
    for (const r of rows) {
      if (!byFaction.has(r.faction_name)) byFaction.set(r.faction_name, []);
      byFaction.get(r.faction_name)!.push(r);
    }
    for (const arr of byFaction.values()) {
      arr.sort((a, b) => b.turn_number - a.turn_number);
    }
    return Array.from(byFaction.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  // Stagnation detection: 3+ consecutive turns with no recruit AND no build
  const stagnant = useMemo(() => {
    const out: string[] = [];
    for (const [name, arr] of grouped) {
      const last3 = arr.slice(0, 3);
      if (last3.length >= 3 && last3.every(r => (r.recruits_attempted || 0) === 0 && (r.builds_attempted || 0) === 0)) {
        out.push(name);
      }
    }
    return out;
  }, [grouped]);

  const forceFaction = async (factionName: string) => {
    setForcing(factionName);
    try {
      const { error } = await supabase.functions.invoke("ai-faction-turn", {
        body: { sessionId, factionName },
      });
      if (error) throw error;
      toast.success(`${factionName}: tah vynucen`);
      await fetchRows();
    } catch (e: any) {
      toast.error("Vynucení selhalo: " + e.message);
    } finally {
      setForcing(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-lg">AI Engine</h3>
        <Badge variant="outline" className="text-[10px]">{grouped.length} frakcí</Badge>
        <Button size="sm" variant="ghost" onClick={fetchRows} disabled={loading} className="ml-auto gap-1">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {stagnant.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold mb-1">Stagnace zjištěna ({stagnant.length})</p>
              <p className="text-muted-foreground">
                Frakce bez recruit/build 3+ kola: {stagnant.map(n => <Badge key={n} variant="outline" className="mr-1 text-[10px]">{n}</Badge>)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!grouped.length && !loading && (
        <p className="text-sm text-muted-foreground text-center py-6">
          Žádné AI tahy zatím nezalogovány. Posuň tah, aby AI začala jednat.
        </p>
      )}

      <ScrollArea className="h-[480px]">
        <div className="space-y-3 pr-2">
          {grouped.map(([name, arr]) => {
            const last5 = arr.slice(0, 5);
            const latest = last5[0];
            const Icon = latest?.doctrine ? (DOCTRINE_ICON[latest.doctrine] || Brain) : Brain;
            const colorClass = latest?.doctrine ? (DOCTRINE_COLOR[latest.doctrine] || "text-muted-foreground") : "text-muted-foreground";

            return (
              <Card key={name}>
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${colorClass}`} />
                    <CardTitle className="text-sm font-display">{name}</CardTitle>
                    {latest?.war_state && (
                      <Badge variant="outline" className="text-[10px]">{WAR_LABEL[latest.war_state] || latest.war_state}</Badge>
                    )}
                    {latest?.doctrine && (
                      <Badge variant="secondary" className="text-[10px]">{latest.doctrine}</Badge>
                    )}
                    <Button
                      size="sm" variant="ghost" className="ml-auto h-7 text-[11px] gap-1"
                      onClick={() => forceFaction(name)} disabled={forcing === name}
                    >
                      {forcing === name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      Vynutit tah
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-2 pt-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border">
                          <th className="text-left p-1">Rok</th>
                          <th className="text-center p-1">Plán/Hot/Fail</th>
                          <th className="text-center p-1" title="Recruit"><Swords className="h-3 w-3 inline" /></th>
                          <th className="text-center p-1" title="Build"><Building2 className="h-3 w-3 inline" /></th>
                          <th className="text-center p-1" title="Attack">⚡</th>
                          <th className="text-right p-1">Power</th>
                          <th className="text-right p-1">Wealth</th>
                          <th className="text-center p-1">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {last5.map(r => {
                          const isOpen = openRow === r.id;
                          const hasFailures = (r.actions_failed || 0) > 0 || (r.failure_reasons || []).length > 0;
                          return (
                            <>
                              <tr key={r.id} className="border-b border-border/30 hover:bg-muted/20">
                                <td className="p-1 font-semibold">R{r.turn_number}</td>
                                <td className="p-1 text-center">
                                  <span className="text-foreground">{r.actions_planned ?? 0}</span>
                                  /<span className="text-green-500">{r.actions_executed ?? 0}</span>
                                  /<span className={hasFailures ? "text-destructive" : "text-muted-foreground"}>{r.actions_failed ?? 0}</span>
                                </td>
                                <td className="p-1 text-center">{(r.recruits_attempted || 0) > 0 ? <span className="text-foreground">{r.recruits_attempted}</span> : <span className="text-muted-foreground">·</span>}</td>
                                <td className="p-1 text-center">{(r.builds_attempted || 0) > 0 ? <span className="text-foreground">{r.builds_attempted}</span> : <span className="text-muted-foreground">·</span>}</td>
                                <td className="p-1 text-center">{(r.attacks_attempted || 0) > 0 ? <span className="text-destructive">{r.attacks_attempted}</span> : <span className="text-muted-foreground">·</span>}</td>
                                <td className="p-1 text-right text-muted-foreground">{r.power_delta ?? 0}</td>
                                <td className="p-1 text-right text-muted-foreground">{r.wealth_delta ?? 0}</td>
                                <td className="p-1 text-center">
                                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setOpenRow(isOpen ? null : r.id)}>
                                    <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                  </Button>
                                </td>
                              </tr>
                              {isOpen && (
                                <tr key={r.id + "-detail"}>
                                  <td colSpan={8} className="p-2 bg-muted/10">
                                    {r.internal_thought && (
                                      <div className="mb-2">
                                        <p className="text-[10px] text-muted-foreground mb-0.5">Interní úvaha</p>
                                        <p className="text-xs whitespace-pre-wrap">{r.internal_thought}</p>
                                      </div>
                                    )}
                                    {r.failure_reasons && r.failure_reasons.length > 0 && (
                                      <div>
                                        <p className="text-[10px] text-destructive mb-0.5">Selhané akce</p>
                                        <ul className="text-xs space-y-0.5">
                                          {r.failure_reasons.map((f, i) => (
                                            <li key={i} className="text-destructive/80">• {f}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default AIFactionEnginePanel;
