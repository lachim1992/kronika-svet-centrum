import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Wheat, Trees, Mountain, Anvil, Coins, Users, Gauge,
  AlertTriangle, TrendingUp, TrendingDown, Minus,
  Skull, ArrowUpDown, BarChart3, ShieldAlert, Info, RefreshCw,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
  resources: any[];
  armies: any[];
  onEntityClick?: (type: string, id: string) => void;
}

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  food: <Wheat className="h-4 w-4" />,
  wood: <Trees className="h-4 w-4" />,
  stone: <Mountain className="h-4 w-4" />,
  iron: <Anvil className="h-4 w-4" />,
  wealth: <Coins className="h-4 w-4" />,
};

const RESOURCE_LABELS: Record<string, string> = {
  food: "Obilí", wood: "Dřevo", stone: "Kámen", iron: "Železo", wealth: "Bohatství",
};

const SETTLEMENT_LABELS: Record<string, string> = {
  HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis",
};

type CitySortKey = "name" | "population" | "grain_prod" | "grain_cons" | "wood_prod" | "special" | "vulnerability";

const EconomyTab = ({ sessionId, currentPlayerName, currentTurn, cities, resources, armies, onEntityClick }: Props) => {
  const [realm, setRealm] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [citySortKey, setCitySortKey] = useState<CitySortKey>("grain_prod");
  const [citySortAsc, setCitySortAsc] = useState(false);
  const [mobPreview, setMobPreview] = useState<number | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const myCities = useMemo(() => cities.filter(c => c.owner_player === currentPlayerName), [cities, currentPlayerName]);

  const fetchData = useCallback(async () => {
    const [realmRes, profilesRes] = await Promise.all([
      supabase.from("realm_resources").select("*")
        .eq("session_id", sessionId).ilike("player_name", currentPlayerName).maybeSingle(),
      supabase.from("settlement_resource_profiles").select("*")
        .in("city_id", myCities.map(c => c.id)),
    ]);
    if (realmRes.data) setRealm(realmRes.data);
    setProfiles(profilesRes.data || []);
  }, [sessionId, currentPlayerName, myCities]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const profileMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of profiles) m[p.city_id] = p;
    return m;
  }, [profiles]);

  const resMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of resources.filter(r => r.player_name?.toLowerCase() === currentPlayerName.toLowerCase())) {
      m[r.resource_type] = r;
    }
    return m;
  }, [resources, currentPlayerName]);

  const totals = useMemo(() => {
    const foodR = resMap["food"];
    const grainProd = foodR?.income || 0;
    const grainCons = foodR?.upkeep || 0;
    return { grainProd, grainCons, grainNet: grainProd - grainCons };
  }, [resMap]);

  const sortedCities = useMemo(() => {
    const arr = [...myCities];
    arr.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      switch (citySortKey) {
        case "name": va = a.name; vb = b.name; return citySortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        case "population": va = a.population_total || 0; vb = b.population_total || 0; break;
        case "grain_prod": va = a.last_turn_grain_prod || 0; vb = b.last_turn_grain_prod || 0; break;
        case "grain_cons": va = a.last_turn_grain_cons || 0; vb = b.last_turn_grain_cons || 0; break;
        case "wood_prod": va = a.last_turn_wood_prod || 0; vb = b.last_turn_wood_prod || 0; break;
        case "special": va = a.last_turn_special_prod || 0; vb = b.last_turn_special_prod || 0; break;
        case "vulnerability": va = a.vulnerability_score || 0; vb = b.vulnerability_score || 0; break;
      }
      return citySortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [myCities, citySortKey, citySortAsc]);

  const handleCitySort = (key: CitySortKey) => {
    if (citySortKey === key) setCitySortAsc(!citySortAsc);
    else { setCitySortKey(key); setCitySortAsc(false); }
  };

  // Wealth data
  const wealthR = resMap["wealth"];
  const wealthIncome = wealthR?.income || 0;
  const wealthUpkeep = wealthR?.upkeep || 0;
  const wealthNet = wealthIncome - wealthUpkeep;
  const wealthStock = wealthR?.stockpile || realm?.gold_reserve || 0;

  // Wealth top sources
  const wealthSources: { label: string; value: number; type: "income" | "expense" }[] = [];
  if (wealthIncome > 0) wealthSources.push({ label: "Obchod & daně", value: wealthIncome, type: "income" });
  if (wealthUpkeep > 0) wealthSources.push({ label: "Výdaje správy", value: wealthUpkeep, type: "expense" });

  // Alerts
  const alerts: { text: string; severity: "error" | "warning" }[] = [];
  const foodNet = totals.grainNet;
  if (foodNet < 0) alerts.push({ text: `Deficit obilí: ${foodNet}/kolo`, severity: "error" });
  const famineCities = myCities.filter(c => c.famine_turn);
  if (famineCities.length > 0) alerts.push({ text: `${famineCities.length} sídel trpí hladomorem!`, severity: "error" });
  if (realm && (realm.mobilization_rate || 0) > 0.2) alerts.push({ text: `Vysoká mobilizace (${Math.round((realm.mobilization_rate || 0) * 100)}%)`, severity: "warning" });

  // Mobilization simulator
  const currentMob = realm ? Math.round((realm.mobilization_rate || 0.1) * 100) : 10;
  const previewMob = mobPreview ?? currentMob;
  const baseGrain = myCities.reduce((s, c) => s + (profileMap[c.id]?.base_grain || 0), 0);
  const earlyBuffer = myCities.length <= 3 ? 10 : 0;
  const projectedGrainProd = Math.round(baseGrain * (1 - previewMob / 100 * 0.5)) + earlyBuffer;
  const projectedGrainNet = projectedGrainProd - totals.grainCons;

  const SortIcon = ({ field }: { field: CitySortKey }) => (
    <ArrowUpDown
      className={`h-3 w-3 inline ml-0.5 cursor-pointer ${citySortKey === field ? "text-primary" : "text-muted-foreground/50"}`}
      onClick={() => handleCitySort(field)}
    />
  );

  const handleRecompute = useCallback(async () => {
    setRecomputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("economy-recompute", {
        body: { session_id: sessionId, player_name: currentPlayerName },
      });
      if (error) throw error;
      toast({ title: "Ekonomika přepočítána", description: `Obilí netto = ${data.net_food}` });
      await fetchData();
    } catch (e: any) {
      toast({ title: "Chyba přepočtu", description: e.message, variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  }, [sessionId, currentPlayerName, fetchData]);

  // Build sources for a resource type
  const buildSources = (rt: string) => {
    const sources: { label: string; value: number; type: "income" | "expense" }[] = [];
    const r = resMap[rt];
    const income = r?.income || 0;
    const upkeep = r?.upkeep || 0;
    if (rt === "food") {
      const totalGrainProd = myCities.reduce((s, c) => s + (c.last_turn_grain_prod || 0), 0);
      const totalGrainCons = myCities.reduce((s, c) => s + (c.last_turn_grain_cons || 0), 0);
      sources.push({ label: "Produkce sídel", value: totalGrainProd, type: "income" });
      if (myCities.length <= 3) sources.push({ label: "Bonus malé říše", value: 10, type: "income" });
      sources.push({ label: "Spotřeba populace", value: totalGrainCons, type: "expense" });
      if (realm && (realm.mobilization_rate || 0) > 0) {
        sources.push({ label: `Penalizace mobilizace`, value: Math.round(totalGrainProd * (realm.mobilization_rate || 0) * 0.5), type: "expense" });
      }
    } else if (rt === "wood") {
      const totalWood = myCities.reduce((s, c) => s + (c.last_turn_wood_prod || 0), 0);
      sources.push({ label: "Produkce sídel", value: totalWood, type: "income" });
      if (upkeep > 0) sources.push({ label: "Údržba budov", value: upkeep, type: "expense" });
    } else if (rt === "stone" || rt === "iron") {
      const totalSpec = myCities.filter(c => c.special_resource_type === rt.toUpperCase()).reduce((s, c) => s + (c.last_turn_special_prod || 0), 0);
      sources.push({ label: "Produkce dolů", value: totalSpec, type: "income" });
      if (upkeep > 0) sources.push({ label: "Vojenská údržba", value: upkeep, type: "expense" });
    } else {
      if (income > 0) sources.push({ label: "Obchod & daně", value: income, type: "income" });
      if (upkeep > 0) sources.push({ label: "Výdaje", value: upkeep, type: "expense" });
    }
    return sources;
  };

  // Resource types for the compact grid (all except wealth which is top-tier)
  const compactResources = ["food", "wood", "stone", "iron"] as const;

  return (
    <div className="space-y-6 pb-24 px-1">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-display font-bold">Ekonomika</h2>
        <span className="text-sm text-muted-foreground ml-auto font-display">Rok {currentTurn}</span>
        <Button variant="outline" size="sm" className="ml-2 text-sm h-9" onClick={handleRecompute} disabled={recomputing}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "Počítám…" : "Přepočítat"}
        </Button>
      </div>

      {/* ═══ TOP TIER: Wealth (Money) + Alerts ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Wealth main card — spans 2 cols */}
        <div className="game-card p-5 md:col-span-2 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg">Bohatství</h3>
              <span className="text-xs text-muted-foreground">Finanční přehled říše</span>
            </div>
            <Badge variant="outline" className="ml-auto text-sm px-3 py-1 font-display font-bold">
              {wealthStock} zlata
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Příjem</div>
              <div className="text-2xl font-bold font-display text-success">+{wealthIncome}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">/kolo</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Výdaje</div>
              <div className="text-2xl font-bold font-display text-destructive">-{wealthUpkeep}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">/kolo</div>
            </div>
            <div className={`rounded-lg p-3 ${wealthNet < 0 ? "bg-destructive/10" : "bg-success/10"}`}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Netto</div>
              <div className={`text-2xl font-bold font-display ${wealthNet < 0 ? "text-destructive" : "text-success"}`}>
                {wealthNet >= 0 ? "+" : ""}{wealthNet}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">/kolo</div>
            </div>
          </div>

          {/* Top sources */}
          {wealthSources.length > 0 && (
            <div className="border-t border-border/50 pt-3 space-y-1">
              {wealthSources.map((src, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{src.label}</span>
                  <span className={src.type === "income" ? "text-success font-semibold" : "text-destructive font-semibold"}>
                    {src.type === "income" ? "+" : "-"}{src.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Alerts + quick stats */}
        <div className="space-y-4">
          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="game-card border-destructive/30 bg-destructive/5 p-4 space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs ${a.severity === "error" ? "text-destructive" : "text-foreground"}`}>
                  {a.severity === "error" ? <Skull className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  <span>{a.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Quick realm stats */}
          <div className="game-card p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-primary" /> Lidská síla</span>
              <span className="font-bold">{(realm?.manpower_pool || 0) - (realm?.manpower_committed || 0)} / {realm?.manpower_pool || 0}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5 text-primary" /> Stabilita</span>
              <span className={`font-bold ${(realm?.stability || 70) < 40 ? "text-destructive" : ""}`}>{realm?.stability || 70}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-primary" /> Mobilizace</span>
              <span className="font-bold">{currentMob}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RESOURCE TIER: Compact uniform cards ═══ */}
      <div>
        <h3 className="text-base font-display font-semibold flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-primary" /> Suroviny
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {compactResources.map(rt => {
            const r = resMap[rt];
            const income = r?.income || 0;
            const upkeep = r?.upkeep || 0;
            const stockpile = r?.stockpile || 0;
            const net = income - upkeep;
            const isDeficit = net < 0;
            const isFamine = rt === "food" && famineCities.length > 0;
            const sources = buildSources(rt);

            return (
              <Collapsible key={rt}>
                <div className={`game-card p-4 space-y-2.5 ${isDeficit ? "border-destructive/30" : ""}`}>
                  {/* Header row */}
                  <div className="flex items-center gap-2">
                    <span className="text-primary">{RESOURCE_ICONS[rt]}</span>
                    <span className="font-display font-semibold text-sm">{RESOURCE_LABELS[rt]}</span>
                    {isFamine && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 ml-1">
                        ⚠ Hladomor
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      Zásoba: <span className="font-bold text-foreground">{stockpile}</span>
                    </span>
                  </div>

                  {/* Net — prominent */}
                  <div className="flex items-center gap-3">
                    <div className={`text-xl font-bold font-display ${isDeficit ? "text-destructive" : "text-success"}`}>
                      {net >= 0 ? "+" : ""}{net}
                    </div>
                    <span className="text-[10px] text-muted-foreground">/kolo</span>
                    {net > 0 ? <TrendingUp className="h-3.5 w-3.5 text-success ml-auto" /> : net < 0 ? <TrendingDown className="h-3.5 w-3.5 text-destructive ml-auto" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
                  </div>

                  {/* Income / Expense inline */}
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">Příjem: <span className="text-success font-semibold">+{income}</span></span>
                    <span className="text-muted-foreground">Výdaje: <span className="text-destructive font-semibold">-{upkeep}</span></span>
                  </div>

                  {/* Expandable breakdown */}
                  {sources.length > 0 && (
                    <>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors pt-1">
                          <ChevronDown className="h-3 w-3" />
                          <span>Detail zdrojů</span>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-border/50 pt-2 mt-1 space-y-1">
                          {sources.map((src, i) => (
                            <div key={i} className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">{src.label}</span>
                              <span className={src.type === "income" ? "text-success" : "text-destructive"}>
                                {src.type === "income" ? "+" : "-"}{src.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </>
                  )}
                </div>
              </Collapsible>
            );
          })}
        </div>
      </div>

      {/* ═══ DRIVERS: Top producers / consumers ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="game-card p-5">
          <h3 className="text-sm font-display font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-success" /> Top producenti (obilí)
          </h3>
          {[...myCities].sort((a, b) => (b.last_turn_grain_prod || 0) - (a.last_turn_grain_prod || 0)).slice(0, 5).map(c => (
            <div key={c.id} className="flex justify-between text-sm py-1.5 cursor-pointer hover:text-primary border-b border-border/30 last:border-0" onClick={() => onEntityClick?.("city", c.id)}>
              <span>{c.name}</span>
              <span className="font-semibold text-success">+{c.last_turn_grain_prod || 0}</span>
            </div>
          ))}
        </div>
        <div className="game-card p-5">
          <h3 className="text-sm font-display font-semibold flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-destructive" /> Top spotřebitelé (obilí)
          </h3>
          {[...myCities].sort((a, b) => (b.last_turn_grain_cons || 0) - (a.last_turn_grain_cons || 0)).slice(0, 5).map(c => (
            <div key={c.id} className="flex justify-between text-sm py-1.5 cursor-pointer hover:text-primary border-b border-border/30 last:border-0" onClick={() => onEntityClick?.("city", c.id)}>
              <span>{c.name}</span>
              <span className="font-semibold text-destructive">-{c.last_turn_grain_cons || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ CITY TABLE ═══ */}
      <div className="game-card p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-base font-display font-semibold">Přehled sídel</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs px-3">Město <SortIcon field="name" /></TableHead>
              <TableHead className="text-xs px-3">Úroveň</TableHead>
              <TableHead className="text-xs px-3 text-right">Pop <SortIcon field="population" /></TableHead>
              <TableHead className="text-xs px-3 text-right">🌾+ <SortIcon field="grain_prod" /></TableHead>
              <TableHead className="text-xs px-3 text-right">🌾- <SortIcon field="grain_cons" /></TableHead>
              <TableHead className="text-xs px-3 text-right">🪵+ <SortIcon field="wood_prod" /></TableHead>
              <TableHead className="text-xs px-3 text-right">Spec <SortIcon field="special" /></TableHead>
              <TableHead className="text-xs px-3 text-right">Zranit. <SortIcon field="vulnerability" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCities.map(c => {
              const profile = profileMap[c.id];
              return (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onEntityClick?.("city", c.id)}>
                  <TableCell className="text-sm px-3 font-semibold">
                    {c.name}
                    {c.famine_turn && <Skull className="h-3.5 w-3.5 inline ml-1.5 text-destructive" />}
                  </TableCell>
                  <TableCell className="text-xs px-3">
                    <Badge variant="secondary" className="text-[10px]">{SETTLEMENT_LABELS[c.settlement_level] || c.settlement_level}</Badge>
                  </TableCell>
                  <TableCell className="text-sm px-3 text-right">{(c.population_total || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-sm px-3 text-right text-success">{c.last_turn_grain_prod || 0}</TableCell>
                  <TableCell className="text-sm px-3 text-right text-destructive">{c.last_turn_grain_cons || 0}</TableCell>
                  <TableCell className="text-sm px-3 text-right">{c.last_turn_wood_prod || 0}</TableCell>
                  <TableCell className="text-sm px-3 text-right">
                    {profile?.special_resource_type !== "NONE" && profile?.special_resource_type
                      ? `${profile.special_resource_type === "STONE" ? "⛏" : "⚒"} +${c.last_turn_special_prod || 0}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm px-3 text-right">{(c.vulnerability_score || 0).toFixed(0)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ═══ MOBILIZATION SIMULATOR ═══ */}
      <div className="game-card p-5">
        <h3 className="text-base font-display font-semibold flex items-center gap-2 mb-4">
          <Gauge className="h-5 w-5 text-primary" /> Simulátor: Mobilizace
        </h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-24 font-display">Mobilizace</span>
            <Slider value={[previewMob]} onValueChange={(v) => setMobPreview(v[0])} max={30} min={0} step={1} className="flex-1" />
            <span className="text-xl font-bold font-display w-16 text-right text-primary">{previewMob}%</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Projekce obilí</div>
              <div className={`text-lg font-bold font-display mt-1 ${projectedGrainNet < 0 ? "text-destructive" : "text-success"}`}>
                {projectedGrainNet >= 0 ? "+" : ""}{projectedGrainNet}/kolo
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Produkce</div>
              <div className="text-lg font-bold font-display mt-1">{projectedGrainProd}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Lidská síla</div>
              <div className="text-lg font-bold font-display mt-1">
                {Math.round((myCities.reduce((s, c) => s + (c.population_total || 0), 0)) * previewMob / 100)}
              </div>
            </div>
          </div>
          {mobPreview !== null && mobPreview !== currentMob && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>Toto je pouze náhled. Mobilizaci změníte v HUD baru nahoře.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EconomyTab;
