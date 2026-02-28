import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Swords, Wheat, Building2, AlertTriangle, MessageSquare, TrendingUp, Scroll, Loader2, Eye, EyeOff, Sparkles } from "lucide-react";
import RichText from "@/components/RichText";

interface TurnReportItem {
  icon: React.ElementType;
  category: string;
  text: string;
  tone: "info" | "success" | "warning" | "danger";
}

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn: number;
}

const toneColors = {
  info: "text-muted-foreground",
  success: "text-emerald-400",
  warning: "text-amber-400",
  danger: "text-red-400",
};

const toneBg = {
  info: "bg-muted/30",
  success: "bg-emerald-500/10",
  warning: "bg-amber-500/10",
  danger: "bg-red-500/10",
};

const TurnReportPanel = ({ sessionId, playerName, currentTurn }: Props) => {
  const [items, setItems] = useState<TurnReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [watched, setWatched] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("briefing");
  const lastTurn = currentTurn - 1;

  // Load structured events
  useEffect(() => {
    if (lastTurn < 1) { setLoading(false); return; }

    const load = async () => {
      const [
        { data: events },
        { data: battles },
        { data: rumors },
        { data: buildings },
        { data: uprisings },
      ] = await Promise.all([
        supabase.from("game_events").select("event_type, note, importance, player")
          .eq("session_id", sessionId).eq("turn_number", lastTurn).eq("confirmed", true).limit(50),
        supabase.from("battles").select("result, casualties_attacker, casualties_defender, defender_city_id")
          .eq("session_id", sessionId).eq("turn_number", lastTurn).limit(20),
        supabase.from("city_rumors").select("text, tone_tag, city_name")
          .eq("session_id", sessionId).eq("turn_number", lastTurn).eq("is_draft", false).limit(20),
        supabase.from("city_buildings").select("name, city_id")
          .eq("session_id", sessionId).eq("completed_turn", lastTurn).limit(20),
        supabase.from("city_uprisings").select("city_id, escalation_level, status")
          .eq("session_id", sessionId).eq("turn_triggered", lastTurn).limit(10),
      ]);

      const result: TurnReportItem[] = [];

      for (const b of (battles || [])) {
        const isVictory = b.result?.includes("victory");
        result.push({
          icon: Swords,
          category: "Bitva",
          text: `${b.result} — ztráty: ${b.casualties_attacker}/${b.casualties_defender}`,
          tone: isVictory ? "success" : "danger",
        });
      }

      for (const u of (uprisings || [])) {
        result.push({
          icon: AlertTriangle,
          category: "Vzpoura",
          text: `Úroveň ${u.escalation_level} — ${u.status}`,
          tone: "danger",
        });
      }

      for (const b of (buildings || [])) {
        result.push({
          icon: Building2,
          category: "Stavba",
          text: `„${b.name}" dokončena`,
          tone: "success",
        });
      }

      for (const e of (events || [])) {
        if (e.event_type === "battle") continue;
        const isCritical = e.importance === "critical";
        result.push({
          icon: e.event_type === "trade_raid" ? TrendingUp
            : e.event_type === "famine" ? Wheat
            : e.event_type === "rebellion" ? AlertTriangle
            : Scroll,
          category: e.event_type === "trade_raid" ? "Přepadení" : e.event_type,
          text: e.note || e.event_type,
          tone: isCritical ? "danger" : e.event_type === "trade_raid" ? "warning" : "info",
        });
      }

      for (const r of (rumors || []).slice(0, 5)) {
        result.push({
          icon: MessageSquare,
          category: `Zvěst · ${r.city_name}`,
          text: r.text,
          tone: r.tone_tag === "alarming" ? "warning" : "info",
        });
      }

      setItems(result);
      setLoading(false);
    };

    load();
  }, [sessionId, lastTurn]);

  // Load AI briefing
  const loadBriefing = useCallback(async () => {
    if (lastTurn < 1) return;
    setBriefingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("turn-briefing", {
        body: { sessionId, playerName, turnNumber: currentTurn },
      });
      if (error) throw error;
      if (data?.briefing) setBriefing(data.briefing);
      if (data?.summary) setSummary(data.summary);
      if (data?.watched) setWatched(data.watched);
    } catch {
      setBriefing(null);
    } finally {
      setBriefingLoading(false);
    }
  }, [sessionId, playerName, currentTurn, lastTurn]);

  // Auto-load briefing on first render
  useEffect(() => { loadBriefing(); }, [loadBriefing]);

  if (loading && !briefing) return null;
  if (lastTurn < 1) {
    return (
      <div className="text-center text-sm text-muted-foreground py-6">
        První rok vaší vlády právě začíná.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-display uppercase tracking-wider flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Hlášení rádců — rok {lastTurn}
      </p>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full h-8">
          <TabsTrigger value="briefing" className="text-xs flex-1">
            <Sparkles className="h-3 w-3 mr-1" />Rádci
          </TabsTrigger>
          <TabsTrigger value="events" className="text-xs flex-1">
            <Scroll className="h-3 w-3 mr-1" />Události ({items.length})
          </TabsTrigger>
          {watched.length > 0 && (
            <TabsTrigger value="watched" className="text-xs flex-1">
              <Eye className="h-3 w-3 mr-1" />Sledované ({watched.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="briefing" className="mt-2">
          {briefingLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Rádci připravují hlášení…</span>
            </div>
          ) : briefing ? (
            <ScrollArea className="max-h-[350px]">
              <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground/90 px-1">
                <RichText text={briefing} />
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground mb-2">Hlášení rádců nebylo vygenerováno.</p>
              <Button variant="outline" size="sm" onClick={loadBriefing} className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />Vygenerovat
              </Button>
            </div>
          )}

          {/* Summary stats strip */}
          {summary && (
            <div className="flex flex-wrap gap-2 mt-3 px-1">
              {summary.battles > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Swords className="h-3 w-3" />{summary.battles} bitev
                </Badge>
              )}
              {summary.buildings_completed > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Building2 className="h-3 w-3" />{summary.buildings_completed} staveb
                </Badge>
              )}
              {summary.uprisings > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" />{summary.uprisings} vzpour
                </Badge>
              )}
              {summary.active_crises > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" />{summary.active_crises} krizí
                </Badge>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-2">
          <ScrollArea className="max-h-[350px]">
            {items.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">
                V roce {lastTurn} se neodehrálo nic zásadního.
              </div>
            ) : (
              <div className="space-y-1.5 p-0.5">
                {items.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2 ${toneBg[item.tone]}`}>
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${toneColors[item.tone]}`} />
                      <div className="min-w-0">
                        <Badge variant="outline" className="text-[10px] font-normal mb-0.5">{item.category}</Badge>
                        <p className="text-sm text-foreground/90 leading-snug">{item.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {watched.length > 0 && (
          <TabsContent value="watched" className="mt-2">
            <ScrollArea className="max-h-[350px]">
              <div className="space-y-3 p-0.5">
                {watched.map((w: any, i: number) => (
                  <div key={i} className="rounded-lg bg-muted/30 px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5 text-primary" />
                      <span className="text-sm font-semibold">{w.name}</span>
                      <Badge variant="outline" className="text-[10px]">{w.owner}</Badge>
                    </div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground">
                      <span>Pop: {w.population}</span>
                      <span>Stabilita: {w.stability}%</span>
                      {w.famine && <span className="text-amber-400">⚠ Hladomor</span>}
                      {w.epidemic && <span className="text-red-400">⚠ Epidemie</span>}
                    </div>
                    {w.events?.length > 0 && (
                      <div className="text-xs text-foreground/70 space-y-0.5">
                        {w.events.map((e: string, j: number) => (
                          <div key={j} className="flex items-start gap-1.5">
                            <Scroll className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                            <span>{e}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {w.rumors?.length > 0 && (
                      <div className="text-xs text-foreground/60 italic space-y-0.5">
                        {w.rumors.map((r: string, j: number) => (
                          <div key={j} className="flex items-start gap-1.5">
                            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>„{r}"</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export { TurnReportPanel };
export type { TurnReportItem };
