import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain, Swords, HandshakeIcon, Sparkles, RefreshCw, Loader2,
  ChevronDown, AlertTriangle, CheckCircle2, XCircle, Activity,
} from "lucide-react";

interface Props {
  sessionId: string;
}

const AIDiagnosticsPanel = ({ sessionId }: Props) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("ai-diagnostics", {
        body: { sessionId },
      });
      if (error) throw error;
      setData(result);
    } catch (e: any) {
      toast.error("Chyba diagnostiky: " + (e.message || ""));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDiagnostics(); }, [sessionId]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Načítání diagnostiky…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" /> AI Lab
        </h2>
        <Button size="sm" variant="outline" onClick={fetchDiagnostics} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="behavior" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="behavior" className="text-xs gap-1"><Brain className="h-3.5 w-3.5" />Chování</TabsTrigger>
          <TabsTrigger value="economy" className="text-xs gap-1"><Activity className="h-3.5 w-3.5" />Ekonomika</TabsTrigger>
          <TabsTrigger value="diplomacy" className="text-xs gap-1"><HandshakeIcon className="h-3.5 w-3.5" />Diplomacie</TabsTrigger>
          <TabsTrigger value="pipeline" className="text-xs gap-1"><Sparkles className="h-3.5 w-3.5" />Pipeline</TabsTrigger>
        </TabsList>

        {/* ── BEHAVIOR TAB ── */}
        <TabsContent value="behavior" className="space-y-3 mt-3">
          {(data.aiFactions || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádné AI frakce v této hře.</p>
          ) : (
            <>
              {(data.aiFactions || []).map((f: any) => (
                <Card key={f.id} className="bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {f.faction_name}
                      <Badge variant={f.is_active ? "default" : "secondary"} className="text-[10px]">
                        {f.is_active ? "aktivní" : "neaktivní"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{f.personality}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <ContextTags data={{ goals: f.goals, disposition: f.disposition }} />
                    <Collapsible>
                      <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
                        <ChevronDown className="h-3 w-3" /> Detail JSON
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="text-[10px] bg-muted/50 p-2 rounded mt-1 overflow-x-auto max-h-40">
                          {JSON.stringify({ goals: f.goals, disposition: f.disposition, resources_snapshot: f.resources_snapshot }, null, 2)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              ))}

              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Poslední akce AI ({data.aiActions?.length || 0})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-60">
                    <div className="space-y-1.5">
                      {(data.aiActions || []).slice(0, 30).map((a: any) => (
                        <div key={a.id} className="flex items-start gap-2 text-xs border-b border-border/30 pb-1.5">
                          <Badge variant="outline" className="text-[10px] shrink-0">{a.event_type}</Badge>
                          <span className="text-muted-foreground shrink-0">T{a.turn_number}</span>
                          <span className="truncate">{a.player_name}</span>
                          <Collapsible className="ml-auto">
                            <CollapsibleTrigger className="text-muted-foreground hover:text-foreground">
                              <ChevronDown className="h-3 w-3" />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <pre className="text-[10px] bg-muted/50 p-1 rounded mt-1 max-w-xs overflow-x-auto">
                                {JSON.stringify(a.event_data, null, 2)}
                              </pre>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      ))}
                      {(data.aiActions || []).length === 0 && (
                        <p className="text-muted-foreground text-xs">Žádné akce AI zaznamenány.</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── ECONOMY TAB ── */}
        <TabsContent value="economy" className="space-y-3 mt-3">
          {(data.aiEconomyStats || []).map((es: any) => (
            <Card key={es.factionName} className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {es.factionName}
                  <Badge variant="outline" className="text-[10px]">{es.personality}</Badge>
                  {!es.isActive && <Badge variant="destructive" className="text-[10px]">Neaktivní</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <StatBox label="Města" value={es.cities.length} />
                  <StatBox label="Populace" value={es.totalPop} />
                  <StatBox label="Garnizóna" value={es.totalGarrison} />
                  <StatBox label="Armády" value={es.stacks.length} />
                  <StatBox label="Síla" value={es.totalStrength} />
                </div>
                {es.resources && (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <StatBox label="Obilí" value={es.resources.grain_stockpile} warn={es.resources.grain_stockpile < 10} />
                    <StatBox label="Dřevo" value={es.resources.wood_stockpile} />
                    <StatBox label="Kámen" value={es.resources.stone_stockpile} />
                    <StatBox label="Železo" value={es.resources.iron_stockpile} />
                    <StatBox label="Zlato" value={es.resources.gold_reserve} />
                    <StatBox label="Koně" value={es.resources.horses} />
                  </div>
                )}
                {!es.resources && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <XCircle className="h-3.5 w-3.5" /> Chybí realm_resources!
                  </div>
                )}
                <Collapsible>
                  <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
                    <ChevronDown className="h-3 w-3" /> Města & armády detail
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="text-[10px] bg-muted/50 p-2 rounded mt-1 overflow-x-auto max-h-48">
                      {JSON.stringify({ cities: es.cities, stacks: es.stacks }, null, 2)}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          ))}
          {(data.aiEconomyStats || []).length === 0 && (
            <p className="text-sm text-muted-foreground">Žádné AI frakce.</p>
          )}
        </TabsContent>

        {/* ── DIPLOMACY TAB ── */}
        <TabsContent value="diplomacy" className="space-y-3 mt-3">
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pakty s AI ({data.aiDiplomacy?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-60">
                <div className="space-y-1.5">
                  {(data.aiDiplomacy || []).map((p: any) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs border-b border-border/30 pb-1.5">
                      <Badge variant="outline" className="text-[10px]">{p.pact_type}</Badge>
                      <span>{p.party_a} ↔ {p.party_b}</span>
                      <Badge variant={p.status === "active" ? "default" : "secondary"} className="text-[10px] ml-auto">{p.status}</Badge>
                    </div>
                  ))}
                  {(data.aiDiplomacy || []).length === 0 && (
                    <p className="text-muted-foreground text-xs">Žádné pakty.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Tenze ({data.aiTensions?.length || 0})
                {(data.aiTensions || []).some((t: any) => t.total_tension > 65) && (
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-60">
                <div className="space-y-1.5">
                  {(data.aiTensions || []).map((t: any) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs border-b border-border/30 pb-1.5">
                      <span className="shrink-0">T{t.turn_number}</span>
                      <span>{t.player_a} ↔ {t.player_b}</span>
                      <span className={`ml-auto font-mono ${t.total_tension > 65 ? "text-destructive font-bold" : ""}`}>
                        {t.total_tension}
                      </span>
                      {t.crisis_triggered && <AlertTriangle className="h-3 w-3 text-destructive" />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PIPELINE TAB ── */}
        <TabsContent value="pipeline" className="space-y-3 mt-3">
          {/* Wiki Stats */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Wiki záznamy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-4 gap-2 text-xs">
                <StatBox label="Celkem" value={data.wikiStats?.total || 0} />
                <StatBox label="S popisem" value={data.wikiStats?.withDescription || 0} />
                <StatBox label="S obrázkem" value={data.wikiStats?.withImage || 0} />
                <StatBox label="S kontextem" value={data.wikiStats?.withSourceContext || 0} />
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(data.wikiStats?.byType || {}).map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-[10px]">{type}: {count as number}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Image Stats */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Obrázky ({data.imageStats?.total || 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {Object.entries(data.imageStats?.byType || {}).map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-[10px]">{type}: {count as number}</Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(data.imageStats?.byKind || {}).map(([kind, count]) => (
                  <Badge key={kind} variant="secondary" className="text-[10px]">{kind}: {count as number}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Chronicle Stats */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Kroniky ({data.chronicleStats?.total || 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {Object.entries(data.chronicleStats?.bySource || {}).map(([src, count]) => (
                  <Badge key={src} variant="outline" className="text-[10px]">{src}: {count as number}</Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(data.chronicleStats?.byEpoch || {}).map(([ep, count]) => (
                  <Badge key={ep} variant="secondary" className="text-[10px]">{ep}: {count as number}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Misc pipeline stats */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pipeline souhrn</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <StatBox label="AI shrnutí" value={data.summariesCount || 0} />
                <StatBox label="Zvěsti" value={data.rumorsCount || 0} />
              </div>
            </CardContent>
          </Card>

          {/* Context Sources */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Zdroje kontextu pro AI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <ContextTag label="lore_bible" present={!!data.styleCfg?.lore_bible} />
                <ContextTag label="prompt_rules" present={!!data.styleCfg?.prompt_rules} />
                <ContextTag label="world_vibe" present={!!data.styleCfg?.world_vibe} />
                <ContextTag label="writing_style" present={!!data.styleCfg?.writing_style} />
                <ContextTag label="constraints" present={!!data.styleCfg?.constraints} />
                <ContextTag label="premisa" present={!!data.premise} />
                <ContextTag label="cosmology" present={!!data.premise?.cosmology} />
                <ContextTag label="narrative_rules" present={!!data.premise?.narrative_rules} />
              </div>
              <Collapsible>
                <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
                  <ChevronDown className="h-3 w-3" /> Plný kontext
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="text-[10px] bg-muted/50 p-2 rounded mt-1 overflow-x-auto max-h-60">
                    {JSON.stringify({ styleCfg: data.styleCfg, premise: data.premise }, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

/* ── Helper components ── */

const StatBox = ({ label, value, warn }: { label: string; value: number; warn?: boolean }) => (
  <div className={`bg-muted/30 rounded p-1.5 text-center ${warn ? "border border-destructive/50" : ""}`}>
    <div className={`font-mono font-bold text-sm ${warn ? "text-destructive" : ""}`}>{value}</div>
    <div className="text-[10px] text-muted-foreground">{label}</div>
  </div>
);

const ContextTag = ({ label, present }: { label: string; present: boolean }) => (
  <Badge variant={present ? "default" : "secondary"} className="text-[10px] gap-1">
    {present ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
    {label}
  </Badge>
);

const ContextTags = ({ data }: { data: any }) => (
  <div className="flex flex-wrap gap-1">
    {Object.entries(data).map(([key, val]) => (
      <ContextTag key={key} label={key} present={!!val && (typeof val === "object" ? Object.keys(val as object).length > 0 : true)} />
    ))}
  </div>
);

export default AIDiagnosticsPanel;
