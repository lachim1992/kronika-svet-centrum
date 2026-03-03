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
  Building2, Shield, MapPin, Hammer, Crown, Users,
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

  const profiles: any[] = data.factionProfiles || [];

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
        <TabsContent value="behavior" className="space-y-4 mt-3">
          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádné AI frakce v této hře.</p>
          ) : (
            profiles.map((fp: any) => (
              <FactionBehaviorCard key={fp.id} fp={fp} />
            ))
          )}
        </TabsContent>

        {/* ── ECONOMY TAB ── */}
        <TabsContent value="economy" className="space-y-3 mt-3">
          {profiles.map((fp: any) => (
            <Card key={fp.factionName} className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {fp.factionName}
                  <Badge variant="outline" className="text-[10px]">{fp.personality}</Badge>
                  {!fp.isActive && <Badge variant="destructive" className="text-[10px]">Neaktivní</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <StatBox label="Města" value={fp.cities.length} />
                  <StatBox label="Populace" value={fp.totalPop} />
                  <StatBox label="Garnizóna" value={fp.totalGarrison} />
                  <StatBox label="Armády" value={fp.stacks.length} />
                  <StatBox label="Síla" value={fp.totalStrength} />
                </div>
                {fp.resources && (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <StatBox label="Obilí" value={fp.resources.grain_reserve} warn={fp.resources.grain_reserve < 10} />
                    <StatBox label="Dřevo" value={fp.resources.wood_reserve} />
                    <StatBox label="Kámen" value={fp.resources.stone_reserve} />
                    <StatBox label="Železo" value={fp.resources.iron_reserve} />
                    <StatBox label="Zlato" value={fp.resources.gold_reserve} />
                    <StatBox label="Koně" value={fp.resources.horses_reserve} />
                    <StatBox label="Manpower" value={fp.resources.manpower_pool} />
                    <StatBox label="Mobilizace" value={`${Math.round((fp.resources.mobilization_rate || 0) * 100)}%`} />
                  </div>
                )}
                {!fp.resources && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <XCircle className="h-3.5 w-3.5" /> Chybí realm_resources!
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {profiles.length === 0 && (
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
          <Card className="bg-card/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Wiki záznamy</CardTitle></CardHeader>
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
          <Card className="bg-card/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Obrázky ({data.imageStats?.total || 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {Object.entries(data.imageStats?.byType || {}).map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-[10px]">{type}: {count as number}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Kroniky ({data.chronicleStats?.total || 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {Object.entries(data.chronicleStats?.bySource || {}).map(([src, count]) => (
                  <Badge key={src} variant="outline" className="text-[10px]">{src}: {count as number}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pipeline souhrn</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <StatBox label="AI shrnutí" value={data.summariesCount || 0} />
                <StatBox label="Zvěsti" value={data.rumorsCount || 0} />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Zdroje kontextu pro AI</CardTitle></CardHeader>
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

/* ── Faction Behavior Card ── */

const FactionBehaviorCard = ({ fp }: { fp: any }) => {
  const statusColor = fp.personality === "aggressive" ? "text-destructive"
    : fp.personality === "diplomatic" ? "text-blue-400"
    : fp.personality === "mercantile" ? "text-yellow-400"
    : "text-muted-foreground";

  return (
    <Card className="bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <Crown className="h-4 w-4 text-primary" />
          {fp.factionName}
          <Badge variant={fp.isActive ? "default" : "secondary"} className="text-[10px]">
            {fp.isActive ? "aktivní" : "neaktivní"}
          </Badge>
          <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{fp.personality}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ── Overview Stats ── */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <StatBox label="Města" value={fp.cities.length} />
          <StatBox label="Populace" value={fp.totalPop} />
          <StatBox label="Armády" value={fp.stacks.length} />
          <StatBox label="Síla" value={fp.totalStrength} />
        </div>

        {/* ── Goals & Disposition ── */}
        <Collapsible>
          <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
            <ChevronDown className="h-3 w-3" /> Cíle & postoje
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1">
            {fp.goals && Array.isArray(fp.goals) && fp.goals.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {fp.goals.map((g: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-[10px]">🎯 {g}</Badge>
                ))}
              </div>
            )}
            {fp.disposition && typeof fp.disposition === "object" && Object.keys(fp.disposition).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(fp.disposition).map(([player, val]) => (
                  <Badge key={player} variant="secondary" className={`text-[10px] ${(val as number) < 0 ? "text-destructive" : (val as number) > 20 ? "text-green-400" : ""}`}>
                    {player}: {val as number}
                  </Badge>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* ── Cities & Buildings ── */}
        <div>
          <h4 className="text-xs font-semibold flex items-center gap-1 mb-1.5">
            <Building2 className="h-3.5 w-3.5" /> Města ({fp.cities.length})
          </h4>
          {fp.cities.length === 0 ? (
            <p className="text-[11px] text-muted-foreground ml-4">Žádná města.</p>
          ) : (
            <div className="space-y-2 ml-1">
              {fp.cities.map((c: any) => (
                <div key={c.id} className="bg-muted/20 rounded p-2">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <MapPin className="h-3 w-3 text-primary shrink-0" />
                    <span className="font-semibold">{c.name}</span>
                    {c.is_capital && <Badge className="text-[9px] bg-primary/20 text-primary">Hlavní</Badge>}
                    <Badge variant="outline" className="text-[9px]">{c.settlement_level}</Badge>
                    <span className="text-muted-foreground">Pop: {c.population_total}</span>
                    <span className="text-muted-foreground">Stab: {c.city_stability}</span>
                    <span className="text-muted-foreground">Dev: {c.development_level}</span>
                    {c.military_garrison > 0 && (
                      <span className="text-muted-foreground">🛡️ {c.military_garrison}</span>
                    )}
                  </div>
                  {c.buildings && c.buildings.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.buildings.map((b: any) => (
                        <Badge
                          key={b.id}
                          variant={b.status === "completed" ? "default" : "secondary"}
                          className={`text-[9px] gap-0.5 ${b.is_wonder ? "border-primary/50 bg-primary/10 text-primary" : ""}`}
                        >
                          {b.is_wonder ? "⭐" : <Hammer className="h-2.5 w-2.5" />}
                          {b.name}
                          {b.current_level > 1 && ` Lv${b.current_level}`}
                          {b.status !== "completed" && ` (${b.status})`}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {(!c.buildings || c.buildings.length === 0) && (
                    <p className="text-[10px] text-muted-foreground mt-1 ml-4">Žádné budovy.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Military Stacks ── */}
        <div>
          <h4 className="text-xs font-semibold flex items-center gap-1 mb-1.5">
            <Shield className="h-3.5 w-3.5" /> Armády ({fp.stacks.length})
          </h4>
          {fp.stacks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground ml-4">Žádné armády.</p>
          ) : (
            <div className="space-y-1 ml-1">
              {fp.stacks.map((s: any) => (
                <div key={s.id} className="flex items-center gap-2 text-xs bg-muted/20 rounded p-1.5 flex-wrap">
                  <Swords className="h-3 w-3 text-primary shrink-0" />
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-muted-foreground">Síla: {s.power}</span>
                  <span className="text-muted-foreground">Morálka: {s.morale}</span>
                  {s.hex_q != null && (
                    <Badge variant="outline" className="text-[9px]">
                      📍 [{s.hex_q}, {s.hex_r}]
                    </Badge>
                  )}
                  {s.is_deployed && <Badge className="text-[9px] bg-destructive/20 text-destructive">Nasazena</Badge>}
                  {!s.is_active && <Badge variant="secondary" className="text-[9px]">Neaktivní</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Action Summary ── */}
        <div>
          <h4 className="text-xs font-semibold flex items-center gap-1 mb-1.5">
            <Activity className="h-3.5 w-3.5" /> Souhrn akcí
          </h4>
          {Object.keys(fp.actionsByType || {}).length === 0 ? (
            <p className="text-[11px] text-muted-foreground ml-4">Žádné zaznamenané akce.</p>
          ) : (
            <div className="flex flex-wrap gap-1 ml-1">
              {Object.entries(fp.actionsByType)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-[10px]">
                    {type}: {count as number}×
                  </Badge>
                ))}
            </div>
          )}
        </div>

        {/* ── Recent Actions Detail ── */}
        <Collapsible>
          <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
            <ChevronDown className="h-3 w-3" /> Poslední akce ({fp.recentActions?.length || 0})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="max-h-48 mt-1">
              <div className="space-y-1">
                {(fp.recentActions || []).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2 text-[11px] border-b border-border/20 pb-1">
                    <Badge variant="outline" className="text-[9px] shrink-0">{a.event_type}</Badge>
                    <span className="text-muted-foreground shrink-0">T{a.turn_number}</span>
                    {a.event_data?.note && (
                      <span className="truncate text-muted-foreground">{a.event_data.note}</span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

/* ── Helper components ── */

const StatBox = ({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) => (
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
    {Object.entries(data).map(([key, val]) =>
      val ? (
        <Badge key={key} variant="outline" className="text-[10px] gap-1">
          <CheckCircle2 className="h-2.5 w-2.5" /> {key}
        </Badge>
      ) : null
    )}
  </div>
);

export default AIDiagnosticsPanel;
