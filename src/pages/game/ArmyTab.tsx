import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { ensureRealmResources, recomputeManpowerPool, UNIT_TYPE_LABELS, UNIT_GOLD_FACTOR, FORMATION_PRESETS } from "@/lib/turnEngine";
import { computeWorkforceBreakdown, DEFAULT_MAX_MOBILIZATION } from "@/lib/economyConstants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Swords, Shield, Target, Crosshair, Users, Coins, ChevronUp, Plus, Minus, Crown, User, AlertTriangle, CheckCircle2, XCircle, Gauge, Sparkles, Loader2, ImageIcon, Flag, Palette, Check, Navigation } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "sonner";
import DeployBattlePanel from "@/components/military/DeployBattlePanel";
import DemobilizeDialog from "@/components/DemobilizeDialog";

const UNIT_ICONS: Record<string, React.ElementType> = {
  MILITIA: Shield,
  PROFESSIONAL: Swords,
  // Legacy compat
  INFANTRY: Shield,
  ARCHERS: Target,
  CAVALRY: Crosshair,
  SIEGE: Swords,
};

const FORMATION_LABELS: Record<string, string> = {
  UNIT: "Jednotka",
  LEGION: "Legie",
  ARMY: "Armáda",
};

const FORMATION_COLORS: Record<string, string> = {
  UNIT: "bg-secondary text-secondary-foreground",
  LEGION: "bg-primary/20 text-primary",
  ARMY: "bg-accent/20 text-accent",
};

const LEGION_MIN_MANPOWER = 900;
const ARMY_MIN_MANPOWER = 2000;
const LEGION_GOLD_COST = 200;
const ARMY_GOLD_COST = 500;

interface Stack {
  id: string;
  name: string;
  formation_type: string;
  morale: number;
  power: number;
  is_active: boolean;
  general_id: string | null;
  province_id: string | null;
  player_name: string;
  compositions: Composition[];
  demobilized_turn?: number | null;
  remobilize_ready_turn?: number | null;
}

interface Composition {
  id: string;
  stack_id: string;
  unit_type: string;
  manpower: number;
  quality: number;
  equipment_level: number;
}

interface General {
  id: string;
  name: string;
  skill: number;
  traits: any;
  player_name: string;
  bio?: string;
  image_url?: string;
  image_prompt?: string;
  flavor_trait?: string;
}

interface UnitTypeVisual {
  id: string;
  unit_type: string;
  image_url: string | null;
  image_prompt: string | null;
}

interface RealmRes {
  id: string;
  manpower_pool: number;
  manpower_committed: number;
  gold_reserve: number;
  mobilization_rate: number;
  grain_reserve: number;
  granary_capacity: number;
  last_turn_grain_prod: number;
  last_turn_grain_cons: number;
  famine_city_count: number;
}

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  cities: any[];
  onRefetch: () => void;
}

interface CivIdentityNames {
  militia_unit_name?: string;
  militia_unit_desc?: string;
  professional_unit_name?: string;
  professional_unit_desc?: string;
}

const ArmyTab = ({ sessionId, currentPlayerName, currentTurn, myRole, cities, onRefetch }: Props) => {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [generals, setGenerals] = useState<General[]>([]);
  const [realm, setRealm] = useState<RealmRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStack, setSelectedStack] = useState<Stack | null>(null);
  const [showRecruit, setShowRecruit] = useState(false);
  const [showCreateGeneral, setShowCreateGeneral] = useState(false);
  const [sortBy, setSortBy] = useState<"power" | "morale" | "formation">("power");
  const [unitVisuals, setUnitVisuals] = useState<UnitTypeVisual[]>([]);
  const [generatingVisual, setGeneratingVisual] = useState<string | null>(null);
  const [remobilizing, setRemobilizing] = useState<string | null>(null);
  const [showDemobilize, setShowDemobilize] = useState(false);
  const [pendingMobRate, setPendingMobRate] = useState<number | null>(null);
  const [civIdentity, setCivIdentity] = useState<CivIdentityNames>({});

  const fetchMilitary = useCallback(async () => {
    setLoading(true);
    const [stacksRes, generalsRes, visualsRes] = await Promise.all([
      supabase.from("military_stacks").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).order("created_at"),
      supabase.from("generals").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName),
      supabase.from("unit_type_visuals").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName),
    ]);

    const rawStacks = stacksRes.data || [];
    const stackIds = rawStacks.map(s => s.id);

    let compositions: Composition[] = [];
    if (stackIds.length > 0) {
      const { data } = await supabase.from("military_stack_composition").select("*").in("stack_id", stackIds);
      compositions = (data || []) as Composition[];
    }

    const enriched: Stack[] = rawStacks.map(s => ({
      ...s,
      compositions: compositions.filter(c => c.stack_id === s.id),
    }));

    setStacks(enriched);
    setGenerals((generalsRes.data || []) as General[]);
    setUnitVisuals((visualsRes.data || []) as UnitTypeVisual[]);

    const realmData = await ensureRealmResources(sessionId, currentPlayerName);
    if (realmData) setRealm(realmData as RealmRes);

    setLoading(false);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchMilitary(); }, [fetchMilitary]);

  // Compute population-based manpower
  // Compute workforce breakdown using new model
  const myCities = cities.filter(c => c.owner_player === currentPlayerName);
  const mobRate = realm?.mobilization_rate || 0.1;
  const wf = computeWorkforceBreakdown(myCities, mobRate);
  const computedPool = wf.effectiveActivePop;
  const totalPower = stacks.filter(s => s.is_active).reduce((s, st) => s + st.power, 0);
  const totalCommitted = stacks.filter(s => s.is_active).reduce((s, st) => s + st.compositions.reduce((a, c) => a + c.manpower, 0), 0);
  const maxMobPct = Math.round(wf.maxMobilization * 100);
  // Mobilization cap = how many can be mobilized at current rate
  const mobilizationCap = wf.mobilized;
  const availableManpower = Math.max(0, mobilizationCap - totalCommitted);
  const isOverMobCap = mobRate > wf.maxMobilization;
  const overMobPenalty = isOverMobCap ? Math.round((mobRate - wf.maxMobilization) * 100) : 0;

  const grainNet = realm ? realm.last_turn_grain_prod - realm.last_turn_grain_cons : 0;
  const readiness = realm
    ? realm.famine_city_count > 0 || realm.gold_reserve <= 0
      ? "crisis"
      : grainNet < 0 || realm.gold_reserve < 50
        ? "strained"
        : "stable"
    : "stable";

  const readinessConfig = {
    stable: { label: "Stabilní", icon: CheckCircle2, className: "text-accent" },
    strained: { label: "Napjaté", icon: AlertTriangle, className: "text-illuminated" },
    crisis: { label: "Krize", icon: XCircle, className: "text-destructive" },
  };

  const ReadinessIcon = readinessConfig[readiness].icon;

  const activeStacks = stacks.filter(s => s.is_active);
  const demobilizedStacks = stacks.filter(s => !s.is_active && s.demobilized_turn != null);

  const sortedStacks = [...activeStacks].sort((a, b) => {
    if (sortBy === "power") return b.power - a.power;
    if (sortBy === "morale") return b.morale - a.morale;
    const order = { ARMY: 0, LEGION: 1, UNIT: 2 };
    return (order[a.formation_type as keyof typeof order] ?? 2) - (order[b.formation_type as keyof typeof order] ?? 2);
  });

  const handleRemobilize = async (stack: Stack) => {
    const totalManpower = stack.compositions.reduce((s, c) => s + c.manpower, 0);
    if (availableManpower < totalManpower) {
      toast.error(`Nedostatek volných mužů (potřeba ${totalManpower}, dostupných ${availableManpower})`);
      return;
    }

    setRemobilizing(stack.id);
    try {
      await supabase.from("military_stacks").update({
        is_active: true,
        demobilized_turn: null,
        remobilize_ready_turn: null,
        morale: 30, // Start with low morale
      } as any).eq("id", stack.id);

      await supabase.from("realm_resources").update({
        manpower_committed: (realm?.manpower_committed || 0) + totalManpower,
      }).eq("id", realm?.id || "");

      await dispatchCommand({
        sessionId,
        actor: { name: currentPlayerName },
        commandType: "REMOBILIZE_STACK",
        commandPayload: {
          stackId: stack.id,
          stackName: stack.name,
          manpower: totalManpower,
          chronicleText: `${currentPlayerName} reaktivoval **${stack.name}** (${totalManpower} mužů). Jednotka nastupuje s nízkou morálkou.`,
        },
      });

      toast.success(`${stack.name} reaktivována — morálka 30 (normalizace za 2 kola)`);
      fetchMilitary();
    } catch (e: any) {
      toast.error("Chyba: " + e.message);
    } finally {
      setRemobilizing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Swords className="h-8 w-8 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header — with confirmed realm sigil as decorative emblem */}
      {(realm as any)?.army_sigil_confirmed && (realm as any)?.army_sigil_url ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24">
            {/* Ornamental frame */}
            <div className="absolute inset-0 rounded-lg border-2 border-illuminated/60 shadow-[0_0_20px_4px_hsl(var(--illuminated)/0.15)] bg-gradient-to-b from-illuminated/10 via-transparent to-illuminated/5" />
            <div className="absolute -inset-1 rounded-xl border border-illuminated/20 pointer-events-none" />
            <img
              src={(realm as any).army_sigil_url}
              alt="Říšský erb"
              className="relative w-full h-full object-cover rounded-lg"
            />
            {/* Corner ornaments */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-illuminated/50 rounded-tl-sm" />
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-illuminated/50 rounded-tr-sm" />
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-illuminated/50 rounded-bl-sm" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-illuminated/50 rounded-br-sm" />
          </div>
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-illuminated" />
            <h2 className="text-lg font-display font-bold">Vojenské velení</h2>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1">
          <Swords className="h-5 w-5 text-illuminated" />
          <h2 className="text-lg font-display font-bold">Vojenské velení</h2>
        </div>
      )}

      {/* Military Summary Bar */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        <SummaryChip label="Mob. strop" value={mobilizationCap} icon={Gauge} tip={`Maximální počet mužů odvoditelných při mobilizaci ${Math.round(mobRate * 100)}%. Závisí na aktivní populaci (${wf.effectiveActivePop}) × míře mobilizace.`} />
        <SummaryChip label="Dostupní muži" value={availableManpower} icon={Users} tip={`Mobilizační strop (${mobilizationCap}) minus nasazení muži (${totalCommitted}). Závisí na míře mobilizace.`} />
        <SummaryChip label="Mobilizovaní" value={totalCommitted} icon={Shield} tip="Počet mužů aktuálně sloužících v armádách. Odečítáno z pracovní síly — více vojáků = méně produkce." />
        <SummaryChip label="Mobilizace" value={`${Math.round(mobRate * 100)}%`} icon={ChevronUp} tip={`Procento aktivní populace odváděné do armády. Soft cap ${maxMobPct}%, hard cap 50%.`} />
        <SummaryChip label="Zlato" value={realm?.gold_reserve || 0} icon={Coins} tip="Zásoby zlata. Armáda spotřebovává 1 zlato za 100 vojáků/kolo." />
        <SummaryChip label="Celková síla" value={totalPower} icon={Swords} highlight tip="Součet bojové síly všech aktivních armád. Závisí na počtu mužů, kvalitě, morálce, generálovi a formaci." />
        <div className="manuscript-card p-2 flex flex-col items-center justify-center gap-0.5">
          <ReadinessIcon className={`h-4 w-4 ${readinessConfig[readiness].className}`} />
          <span className={`text-xs font-display font-semibold ${readinessConfig[readiness].className}`}>
            {readinessConfig[readiness].label}
          </span>
          <span className="text-[8px] text-muted-foreground">
            {readiness === "crisis" ? "Hladomor nebo bankrot" : readiness === "strained" ? "Nízké zásoby" : "Vše v pořádku"}
          </span>
        </div>
      </div>

      {/* Mobilization Control */}
      <div className="game-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-display font-semibold">Mobilizace</h3>
          <Badge variant="outline" className="ml-auto text-xs">{Math.round(mobRate * 100)}%</Badge>
        </div>
      <Slider
          value={[Math.round(mobRate * 100)]}
          max={50}
          min={0}
          step={1}
          onValueChange={(val) => {
            if (!realm) return;
            const rate = val[0] / 100;
            const newWf = computeWorkforceBreakdown(myCities, rate);
            setRealm({ ...realm, mobilization_rate: rate, manpower_pool: newWf.effectiveActivePop });
          }}
          onValueCommit={async (val) => {
            if (!realm) return;
            const rate = val[0] / 100;
            const newWf = computeWorkforceBreakdown(myCities, rate);
            const newCap = newWf.mobilized;
            // Check if lowering below committed — force demobilize
            if (newCap < totalCommitted) {
              setPendingMobRate(rate);
              setShowDemobilize(true);
              // Revert slider visually
              setRealm({ ...realm, mobilization_rate: mobRate, manpower_pool: wf.effectiveActivePop });
              return;
            }
            await supabase.from("realm_resources").update({ mobilization_rate: rate, manpower_pool: newWf.effectiveActivePop }).eq("id", realm.id);
          }}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0% — Mír</span>
          <span className={mobRate > wf.maxMobilization ? "text-illuminated font-semibold" : ""}>{maxMobPct}% — Soft cap</span>
          <span>50% — Hard cap</span>
        </div>
        {isOverMobCap && (
          <div className="flex items-center gap-1.5 text-xs text-illuminated bg-illuminated/10 rounded-md px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Mobilizace překračuje doporučený limit o {overMobPenalty}%. Produkce penalizována o {Math.round(wf.overMobPenalty * 100)}%.</span>
          </div>
        )}
        {(() => {
          const reservesPct = computedPool > 0 ? Math.round(((computedPool - totalCommitted) / computedPool) * 100) : 100;
          const reservesLow = reservesPct < 20;
          return (
            <div className="grid grid-cols-5 gap-2 text-xs">
              <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-center gap-1">Akt. populace <InfoTip>Rolníci×1.0 + měšťané×0.7 + klerici×0.2, pak × koeficient (výchozí 50%).</InfoTip></div>
                <div className="text-base font-bold font-display mt-0.5">{wf.effectiveActivePop.toLocaleString()}</div>
              </div>
              <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-center gap-1">Pracovní síla <InfoTip>Aktivní populace minus mobilizovaní muži. Přímo ovlivňuje produkci všech surovin.</InfoTip></div>
                <div className="text-base font-bold font-display mt-0.5">{wf.workforce.toLocaleString()}</div>
              </div>
              <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-center gap-1">Mobilizovaní <InfoTip>Počet mužů odvedených do armád. Snižuje pracovní sílu a tím produkci.</InfoTip></div>
                <div className="text-base font-bold font-display mt-0.5">{totalCommitted.toLocaleString()}</div>
              </div>
              <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-center gap-1">K dispozici <InfoTip>Mobilizační strop ({mobilizationCap}) minus nasazení vojáci ({totalCommitted}). Zvyšte mobilizaci pro více mužů.</InfoTip></div>
                <div className={`text-base font-bold font-display mt-0.5 ${availableManpower <= 0 ? "text-destructive" : ""}`}>{availableManpower.toLocaleString()}</div>
              </div>
              <div className={`rounded-lg p-2.5 text-center ${reservesLow ? "bg-destructive/15" : "bg-muted/40"}`}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-center gap-1">Zálohy <InfoTip>Kolik % z pool je dosud nevyužito. Pod 20% hrozí krize.</InfoTip></div>
                <div className={`text-base font-bold font-display mt-0.5 ${reservesLow ? "text-destructive" : ""}`}>{reservesPct}%</div>
              </div>
            </div>
          );
        })()}
      </div>

      <Tabs defaultValue="forces" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1">
          <TabsTrigger value="forces" className="font-display text-xs gap-1">
            <Swords className="h-3 w-3" />Síly
          </TabsTrigger>
          <TabsTrigger value="generals" className="font-display text-xs gap-1">
            <Crown className="h-3 w-3" />Generálové
          </TabsTrigger>
          <TabsTrigger value="my-army" className="font-display text-xs gap-1">
            <Flag className="h-3 w-3" />Moje armáda
          </TabsTrigger>
          <TabsTrigger value="deploy" className="font-display text-xs gap-1">
            <Navigation className="h-3 w-3" />Nasazení
          </TabsTrigger>
        </TabsList>

        <TabsContent value="forces" className="mt-3 space-y-3">
          {/* Actions row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => setShowRecruit(true)} className="font-display text-xs">
              <Plus className="h-3 w-3 mr-1" />Nová jednotka
            </Button>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Řadit..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="power">Dle síly</SelectItem>
                <SelectItem value="morale">Dle morálky</SelectItem>
                <SelectItem value="formation">Dle formace</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sortedStacks.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Žádné vojenské jednotky. Založte první!
              </CardContent>
            </Card>
          )}

          {/* Stack Cards */}
          <div className="grid gap-3 md:grid-cols-2">
            {sortedStacks.map(stack => (
              <StackCard
                key={stack.id}
                stack={stack}
                general={generals.find(g => g.id === stack.general_id)}
                onManage={() => setSelectedStack(stack)}
              />
            ))}
          </div>

          {/* Demobilized Stacks */}
          {demobilizedStacks.length > 0 && (
            <div className="space-y-2 mt-4">
              <h4 className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
                Demobilizované jednotky
              </h4>
              <div className="grid gap-2 md:grid-cols-2">
                {demobilizedStacks.map(stack => {
                  const totalMp = stack.compositions.reduce((s, c) => s + c.manpower, 0);
                  const readyTurn = stack.remobilize_ready_turn || 0;
                  const canReactivate = currentTurn >= readyTurn;
                  const turnsLeft = readyTurn - currentTurn;
                  return (
                    <Card key={stack.id} className="opacity-60 border-dashed">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <div className="font-display font-semibold text-sm">{stack.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {totalMp} mužů · {FORMATION_LABELS[stack.formation_type] || stack.formation_type}
                          </div>
                          {!canReactivate && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Připravena za {turnsLeft} {turnsLeft === 1 ? "kolo" : turnsLeft <= 4 ? "kola" : "kol"}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={canReactivate ? "default" : "ghost"}
                          disabled={!canReactivate || remobilizing === stack.id}
                          onClick={() => handleRemobilize(stack)}
                          className="text-xs font-display"
                        >
                          {remobilizing === stack.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Shield className="h-3 w-3 mr-1" />
                          )}
                          {canReactivate ? "Reaktivovat" : `${turnsLeft} kol`}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="generals" className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowCreateGeneral(true)} className="font-display text-xs">
              <Plus className="h-3 w-3 mr-1" />Jmenovat generála
            </Button>
          </div>

          {generals.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Žádní generálové. Jmenujte prvního!
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {generals.map(g => {
              const assigned = stacks.find(s => s.general_id === g.id);
              const isGen = generatingVisual === `general-${g.id}`;
              return (
                <Card key={g.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex gap-3">
                      {/* Portrait */}
                      <div className="shrink-0 w-16 h-16 rounded-md overflow-hidden border border-border bg-muted/30">
                        {g.image_url ? (
                          <img src={g.image_url} alt={g.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Crown className="h-6 w-6 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-display font-semibold text-sm truncate">{g.name}</p>
                          <Badge variant="outline" className="text-xs">{g.skill}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Schopnost: {g.skill}/100
                          {assigned && <> · Velí: {assigned.name}</>}
                        </p>
                        {g.flavor_trait && <p className="text-xs italic text-muted-foreground">„{g.flavor_trait}"</p>}
                      </div>
                    </div>
                    {g.bio && <p className="text-xs text-muted-foreground italic leading-relaxed">{g.bio}</p>}
                    <Button
                      size="sm" variant="outline" className="text-xs font-display w-full"
                      disabled={isGen}
                      onClick={async () => {
                        setGeneratingVisual(`general-${g.id}`);
                        try {
                          const { data, error } = await supabase.functions.invoke("army-visualize", {
                            body: {
                              sessionId, playerName: currentPlayerName, mode: "general_portrait",
                              generalId: g.id, generalName: g.name, generalSkill: g.skill,
                              flavorTrait: g.flavor_trait,
                            },
                          });
                          if (error) throw error;
                          if (data?.error) { toast.error(data.error); return; }
                          toast.success(`🎨 Portrét a bio ${g.name} vygenerován + zapsán do ChroWiki!`);
                          fetchMilitary();
                        } catch (e) {
                          console.error(e);
                          toast.error("Generování selhalo");
                        }
                        setGeneratingVisual(null);
                      }}
                    >
                      {isGen ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generuji...</> : <><Sparkles className="h-3 w-3 mr-1" />{g.image_url ? "Regenerovat portrét" : "Vygenerovat portrét + ChroWiki"}</>}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="my-army" className="mt-3 space-y-4">
          <MyArmyPanel
            sessionId={sessionId}
            currentPlayerName={currentPlayerName}
            stacks={stacks}
            realm={realm}
            unitVisuals={unitVisuals}
            generatingVisual={generatingVisual}
            setGeneratingVisual={setGeneratingVisual}
            onRefresh={fetchMilitary}
          />
        </TabsContent>

        <TabsContent value="deploy" className="mt-3">
          <DeployBattlePanel
            sessionId={sessionId}
            currentPlayerName={currentPlayerName}
            currentTurn={currentTurn}
            stacks={stacks}
            cities={cities}
            onRefresh={fetchMilitary}
          />
        </TabsContent>
      </Tabs>

      {/* Stack Detail Dialog */}
      {selectedStack && (
        <StackDetailDialog
          stack={selectedStack}
          generals={generals}
          realm={realm}
          availableManpower={availableManpower}
          sessionId={sessionId}
          currentPlayerName={currentPlayerName}
          onClose={() => setSelectedStack(null)}
          onRefresh={fetchMilitary}
        />
      )}

      {/* Recruit new stack dialog */}
      <RecruitDialog
        open={showRecruit}
        onClose={() => setShowRecruit(false)}
        realm={realm}
        availableManpower={availableManpower}
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        onRefresh={fetchMilitary}
      />

      {/* Create general dialog */}
      <CreateGeneralDialog
        open={showCreateGeneral}
        onClose={() => setShowCreateGeneral(false)}
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        goldReserve={realm?.gold_reserve || 0}
        onRefresh={fetchMilitary}
      />

      {/* Demobilize dialog — triggered when lowering mobilization below committed */}
      <DemobilizeDialog
        open={showDemobilize}
        onClose={() => {
          setShowDemobilize(false);
          setPendingMobRate(null);
        }}
        stacks={activeStacks.map(s => ({
          id: s.id,
          name: s.name,
          formation_type: s.formation_type,
          totalManpower: s.compositions.reduce((a, c) => a + c.manpower, 0),
          morale: s.morale,
        }))}
        sessionId={sessionId}
        playerName={currentPlayerName}
        currentTurn={currentTurn}
        realmId={realm?.id || ""}
        manpowerCommitted={totalCommitted}
        targetCap={pendingMobRate !== null ? computeWorkforceBreakdown(myCities, pendingMobRate).mobilized : totalCommitted}
        onDone={async () => {
          if (pendingMobRate !== null && realm) {
            const newWf = computeWorkforceBreakdown(myCities, pendingMobRate);
            await supabase.from("realm_resources").update({
              mobilization_rate: pendingMobRate,
              manpower_pool: newWf.effectiveActivePop,
            }).eq("id", realm.id);
          }
          setPendingMobRate(null);
          fetchMilitary();
        }}
      />
    </div>
  );
};

// ---- Summary Chip ----
function SummaryChip({ label, value, icon: Icon, highlight, tip }: { label: string; value: string | number; icon: React.ElementType; highlight?: boolean; tip?: string }) {
  return (
    <div className="manuscript-card p-2 flex flex-col items-center justify-center gap-0.5">
      <Icon className={`h-4 w-4 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
      <span className={`text-sm font-display font-bold ${highlight ? "text-primary" : ""}`}>{value}</span>
      <span className="text-[9px] text-muted-foreground text-center leading-tight flex items-center gap-0.5">
        {label}
        {tip && <InfoTip>{tip}</InfoTip>}
      </span>
    </div>
  );
}

// ---- Stack Card ----
function StackCard({ stack, general, onManage }: { stack: Stack; general?: General; onManage: () => void }) {
  const totalManpower = stack.compositions.reduce((s, c) => s + c.manpower, 0);
  const hasConfirmedVisual = (stack as any).image_confirmed && (stack as any).image_url;
  const hasConfirmedSigil = (stack as any).sigil_confirmed && (stack as any).sigil_url;

  return (
    <Card className={`cursor-pointer hover:border-primary/40 transition-colors ${!stack.is_active ? "opacity-50" : ""}`} onClick={onManage}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {hasConfirmedSigil ? (
              <img src={(stack as any).sigil_url} alt="Znak" className="h-6 w-6 rounded object-cover shrink-0" />
            ) : (
              <Swords className="h-4 w-4 text-primary shrink-0" />
            )}
            <span className="font-display font-bold text-sm truncate">{stack.name}</span>
          </div>
          <Badge className={`text-xs shrink-0 ${FORMATION_COLORS[stack.formation_type] || ""}`}>
            {FORMATION_LABELS[stack.formation_type] || stack.formation_type}
          </Badge>
        </div>

        {/* Confirmed visual banner */}
        {hasConfirmedVisual && (
          <div className="w-full h-20 rounded overflow-hidden border border-border">
            <img src={(stack as any).image_url} alt={stack.name} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-2xl font-display font-bold text-primary">{stack.power}</p>
            <p className="text-[9px] text-muted-foreground flex items-center gap-0.5 justify-center">
              Síla
              <InfoTip>Síla = Σ(muži × váha_typu × kvalita) × bonus_generála × morálka × formace. Váhy: Milice 0.8, Profesionálové 1.3. Formace: Jednotka ×1.0, Legie ×1.1, Armáda ×1.2.</InfoTip>
            </p>
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground w-14">Morálka</span>
              <Progress value={stack.morale} className="h-1.5 flex-1" />
              <span className="w-8 text-right font-semibold">{stack.morale}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground w-14">Muži</span>
              <span className="font-semibold">{totalManpower}</span>
            </div>
          </div>
        </div>

        {/* Composition mini-bar */}
        <div className="flex gap-2 flex-wrap">
          {stack.compositions.map(c => {
            const UIcon = UNIT_ICONS[c.unit_type] || Shield;
            return (
              <div key={c.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                <UIcon className="h-3 w-3" />
                <span>{c.manpower}</span>
                <span className="text-[9px]">{UNIT_TYPE_LABELS[c.unit_type] || c.unit_type}</span>
              </div>
            );
          })}
        </div>

        {general && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground border-t border-border pt-2">
            <Crown className="h-3 w-3 text-illuminated" />
            <span>{general.name}</span>
            <span className="text-[9px]">(schopnost {general.skill})</span>
          </div>
        )}
        {!general && !stack.general_id && (
          <div className="text-xs text-muted-foreground border-t border-border pt-2 italic">Bez generála</div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Stack Detail Dialog ----
function StackDetailDialog({
  stack, generals, realm, availableManpower, sessionId, currentPlayerName, onClose, onRefresh,
}: {
  stack: Stack; generals: General[]; realm: RealmRes | null; availableManpower: number;
  sessionId: string; currentPlayerName: string; onClose: () => void; onRefresh: () => void;
}) {
  const [reinforcements, setReinforcements] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const totalManpower = stack.compositions.reduce((s, c) => s + c.manpower, 0);
  const general = generals.find(g => g.id === stack.general_id);

  const addedManpower = Object.values(reinforcements).reduce((s, v) => s + Math.max(0, v), 0);
  const addedGold = Object.entries(reinforcements).reduce((s, [type, count]) => s + Math.max(0, count) * (UNIT_GOLD_FACTOR[type] || 1), 0);

  const canUpgradeLegion = stack.formation_type === "UNIT" && totalManpower >= LEGION_MIN_MANPOWER;
  const canUpgradeArmy = stack.formation_type === "LEGION" && totalManpower >= ARMY_MIN_MANPOWER && stack.general_id;

  const handleReinforce = async () => {
    if (addedManpower <= 0) return;
    if (addedManpower > availableManpower) { toast.error("Nedostatek mužů"); return; }
    if (addedGold > (realm?.gold_reserve || 0)) { toast.error("Nedostatek zlata"); return; }
    setSaving(true);

    for (const [unitType, amount] of Object.entries(reinforcements)) {
      if (amount <= 0) continue;
      const existing = stack.compositions.find(c => c.unit_type === unitType);
      if (existing) {
        await supabase.from("military_stack_composition").update({ manpower: existing.manpower + amount }).eq("id", existing.id);
      } else {
        await supabase.from("military_stack_composition").insert({ stack_id: stack.id, unit_type: unitType, manpower: amount });
      }
    }

    await supabase.from("realm_resources").update({
      manpower_committed: (realm?.manpower_committed || 0) + addedManpower,
      gold_reserve: (realm?.gold_reserve || 0) - addedGold,
    }).eq("id", realm?.id || "");

    await dispatchCommand({
      sessionId, actor: { name: currentPlayerName }, commandType: "REINFORCE_STACK",
      commandPayload: { stackId: stack.id, stackName: stack.name, addedManpower, addedGold: Math.round(addedGold),
        chronicleText: `${currentPlayerName} posílil **${stack.name}** o ${addedManpower} mužů (náklady: ${Math.round(addedGold)} zlata).` },
    });

    setReinforcements({});
    toast.success("Posily přidány");
    setSaving(false);
    onRefresh();
    onClose();
  };

  const handleUpgrade = async (target: "LEGION" | "ARMY") => {
    const cost = target === "LEGION" ? LEGION_GOLD_COST : ARMY_GOLD_COST;
    if ((realm?.gold_reserve || 0) < cost) { toast.error(`Nedostatek zlata (potřeba ${cost})`); return; }
    setSaving(true);

    await supabase.from("military_stacks").update({ formation_type: target }).eq("id", stack.id);
    await supabase.from("realm_resources").update({
      gold_reserve: (realm?.gold_reserve || 0) - cost,
    }).eq("id", realm?.id || "");

    await dispatchCommand({
      sessionId, actor: { name: currentPlayerName }, commandType: "UPGRADE_FORMATION",
      commandPayload: { stackId: stack.id, stackName: stack.name, target, cost,
        chronicleText: `${currentPlayerName} povýšil **${stack.name}** na ${FORMATION_LABELS[target]}. Náklady: ${cost} zlata.` },
    });

    toast.success(`Povýšeno na ${FORMATION_LABELS[target]}`);
    setSaving(false);
    onRefresh();
    onClose();
  };

  const handleAssignGeneral = async (generalId: string) => {
    setSaving(true);
    // Unassign from other stack
    await supabase.from("military_stacks").update({ general_id: null }).eq("general_id", generalId).eq("session_id", sessionId);
    await supabase.from("military_stacks").update({ general_id: generalId }).eq("id", stack.id);

    const gen = generals.find(g => g.id === generalId);
    await dispatchCommand({
      sessionId, actor: { name: currentPlayerName }, commandType: "ASSIGN_GENERAL",
      commandPayload: { stackId: stack.id, stackName: stack.name, generalId, generalName: gen?.name,
        chronicleText: `${currentPlayerName} jmenoval **${gen?.name || "generála"}** velitelem **${stack.name}**.` },
    });

    toast.success("Generál přiřazen");
    setSaving(false);
    onRefresh();
    onClose();
  };

  const handleDisband = async () => {
    setSaving(true);
    await supabase.from("military_stacks").update({ is_active: false }).eq("id", stack.id);
    const returnedManpower = totalManpower;
    await supabase.from("realm_resources").update({
      manpower_committed: Math.max(0, (realm?.manpower_committed || 0) - returnedManpower),
    }).eq("id", realm?.id || "");

    await dispatchCommand({
      sessionId, actor: { name: currentPlayerName }, commandType: "DISBAND_STACK",
      commandPayload: { stackId: stack.id, stackName: stack.name, returnedManpower,
        chronicleText: `${currentPlayerName} rozpustil **${stack.name}**. ${returnedManpower} mužů se vrátilo do manpower pool.` },
    });

    toast.success("Jednotka rozpuštěna");
    setSaving(false);
    onRefresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Swords className="h-5 w-5 text-primary" />
            {stack.name}
            <Badge className={`text-xs ${FORMATION_COLORS[stack.formation_type] || ""}`}>
              {FORMATION_LABELS[stack.formation_type]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Power + Stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="manuscript-card p-3">
              <p className="text-2xl font-display font-bold text-primary">{stack.power}</p>
              <p className="text-[10px] text-muted-foreground">Síla</p>
            </div>
            <div className="manuscript-card p-3">
              <p className="text-2xl font-display font-bold">{stack.morale}</p>
              <p className="text-[10px] text-muted-foreground">Morálka</p>
            </div>
            <div className="manuscript-card p-3">
              <p className="text-2xl font-display font-bold">{totalManpower}</p>
              <p className="text-[10px] text-muted-foreground">Muži</p>
            </div>
          </div>

          {/* General */}
          <Card>
            <CardContent className="p-3">
              <p className="text-xs font-display font-semibold mb-2 text-muted-foreground">Velitel</p>
              {general ? (
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-illuminated" />
                  <span className="font-semibold text-sm">{general.name}</span>
                  <span className="text-xs text-muted-foreground">Schopnost: {general.skill}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground italic">Bez velitele</p>
                  {generals.length > 0 && (
                    <Select onValueChange={handleAssignGeneral}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Přiřadit generála..." />
                      </SelectTrigger>
                      <SelectContent>
                        {generals.map(g => (
                          <SelectItem key={g.id} value={g.id}>{g.name} (sch. {g.skill})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Composition */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-display font-semibold text-muted-foreground">Složení</p>
              {stack.compositions.map(c => {
                const UIcon = UNIT_ICONS[c.unit_type] || Shield;
                return (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <UIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold w-20">{UNIT_TYPE_LABELS[c.unit_type]}</span>
                    <span className="flex-1">{c.manpower} mužů</span>
                    <span className="text-xs text-muted-foreground">Q: {c.quality}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Reinforce */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <p className="text-xs font-display font-semibold text-muted-foreground">Posílit jednotku</p>
              <p className="text-xs text-muted-foreground">Dostupní: {availableManpower} · Zlato: {realm?.gold_reserve || 0}</p>
              {(["MILITIA", "PROFESSIONAL"] as const).map(ut => {
                const UIcon = UNIT_ICONS[ut] || Shield;
                const val = reinforcements[ut] || 0;
                return (
                  <div key={ut} className="flex items-center gap-2 text-sm">
                    <UIcon className="h-3 w-3 text-muted-foreground" />
                    <span className="w-20 text-xs">{UNIT_TYPE_LABELS[ut]}</span>
                    <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => setReinforcements(r => ({ ...r, [ut]: Math.max(0, (r[ut] || 0) - 50) }))}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      value={val}
                      onChange={e => setReinforcements(r => ({ ...r, [ut]: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="h-6 w-16 text-xs text-center"
                    />
                    <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => setReinforcements(r => ({ ...r, [ut]: (r[ut] || 0) + 50 }))}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <span className="text-[10px] text-muted-foreground">{Math.round(val * (UNIT_GOLD_FACTOR[ut] || 1))}g</span>
                  </div>
                );
              })}
              {addedManpower > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-xs">+{addedManpower} mužů · {Math.round(addedGold)} zlata</span>
                  <Button size="sm" onClick={handleReinforce} disabled={saving} className="font-display text-xs">
                    <Plus className="h-3 w-3 mr-1" />Potvrdit posily
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Formation upgrade */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-display font-semibold text-muted-foreground">Povýšení formace</p>
              {stack.formation_type === "UNIT" && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs">
                    {totalManpower >= LEGION_MIN_MANPOWER ? <CheckCircle2 className="h-3 w-3 text-accent" /> : <XCircle className="h-3 w-3 text-destructive" />}
                    <span>Min. {LEGION_MIN_MANPOWER} mužů (máte {totalManpower})</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    {(realm?.gold_reserve || 0) >= LEGION_GOLD_COST ? <CheckCircle2 className="h-3 w-3 text-accent" /> : <XCircle className="h-3 w-3 text-destructive" />}
                    <span>Náklady: {LEGION_GOLD_COST} zlata</span>
                  </div>
                  <Button size="sm" disabled={!canUpgradeLegion || saving} onClick={() => handleUpgrade("LEGION")} className="font-display text-xs w-full mt-1">
                    <ChevronUp className="h-3 w-3 mr-1" />Povýšit na Legii
                  </Button>
                </div>
              )}
              {stack.formation_type === "LEGION" && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs">
                    {totalManpower >= ARMY_MIN_MANPOWER ? <CheckCircle2 className="h-3 w-3 text-accent" /> : <XCircle className="h-3 w-3 text-destructive" />}
                    <span>Min. {ARMY_MIN_MANPOWER} mužů (máte {totalManpower})</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    {stack.general_id ? <CheckCircle2 className="h-3 w-3 text-accent" /> : <XCircle className="h-3 w-3 text-destructive" />}
                    <span>Vyžaduje generála</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    {(realm?.gold_reserve || 0) >= ARMY_GOLD_COST ? <CheckCircle2 className="h-3 w-3 text-accent" /> : <XCircle className="h-3 w-3 text-destructive" />}
                    <span>Náklady: {ARMY_GOLD_COST} zlata</span>
                  </div>
                  <Button size="sm" disabled={!canUpgradeArmy || saving} onClick={() => handleUpgrade("ARMY")} className="font-display text-xs w-full mt-1">
                    <ChevronUp className="h-3 w-3 mr-1" />Povýšit na Armádu
                  </Button>
                </div>
              )}
              {stack.formation_type === "ARMY" && (
                <p className="text-xs text-muted-foreground italic">Nejvyšší formace dosažena.</p>
              )}
            </CardContent>
          </Card>

          {/* Disband */}
          <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/30 font-display text-xs" onClick={handleDisband} disabled={saving}>
            Rozpustit jednotku
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Recruit Dialog (new stack from preset) ----
function RecruitDialog({
  open, onClose, realm, availableManpower, sessionId, currentPlayerName, onRefresh,
}: {
  open: boolean; onClose: () => void; realm: RealmRes | null; availableManpower: number;
  sessionId: string; currentPlayerName: string; onRefresh: () => void;
}) {
  const [name, setName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Zadejte název"); return; }
    if (!selectedPreset) { toast.error("Vyberte typ"); return; }

    const preset = FORMATION_PRESETS[selectedPreset];
    if (!preset) { toast.error("Neznámý preset"); return; }

    const totalManpower = preset.composition.reduce((s, c) => s + c.manpower, 0);
    const totalGold = preset.gold_override ?? preset.composition.reduce((s, c) => s + c.manpower * (UNIT_GOLD_FACTOR[c.unit_type] || 1), 0);

    if (totalManpower > availableManpower) { toast.error(`Nedostatek mužů (${totalManpower} potřeba)`); return; }
    if (totalGold > (realm?.gold_reserve || 0)) { toast.error(`Nedostatek zlata (${totalGold} potřeba)`); return; }

    setSaving(true);
    try {
      const result = await dispatchCommand({
        sessionId,
        actor: { name: currentPlayerName },
        commandType: "RECRUIT_STACK",
        commandPayload: { stackName: name.trim(), presetKey: selectedPreset },
      });
      if (!result.ok) throw new Error(result.error || "Chyba při rekrutaci");
      toast.success(`${name.trim()} zřízen!`);
      setName("");
      setSelectedPreset(null);
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Chyba při rekrutaci");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Založit novou jednotku
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input placeholder="Název jednotky" value={name} onChange={e => setName(e.target.value)} className="h-9" />

          <div className="space-y-2">
            <p className="text-xs font-display font-semibold text-muted-foreground">Vyberte předlohu</p>
            {Object.entries(FORMATION_PRESETS).map(([key, preset]) => {
              const totalMp = preset.composition.reduce((s, c) => s + c.manpower, 0);
              const totalGold = preset.gold_override ?? preset.composition.reduce((s, c) => s + c.manpower * (UNIT_GOLD_FACTOR[c.unit_type] || 1), 0);
              const isSelected = selectedPreset === key;
              return (
                <div
                  key={key}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                  onClick={() => setSelectedPreset(key)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display font-semibold text-sm">{preset.label}</span>
                    <Badge variant="outline" className="text-xs">{FORMATION_LABELS[preset.formation_type]}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {preset.composition.map((c, i) => {
                      const UIcon = UNIT_ICONS[c.unit_type] || Shield;
                      return (
                        <span key={i} className="flex items-center gap-0.5">
                          <UIcon className="h-3 w-3" />{c.manpower} {UNIT_TYPE_LABELS[c.unit_type]}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{totalMp} mužů</span>
                    <span className="flex items-center gap-0.5"><Coins className="h-3 w-3" />{totalGold} zlata</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground">
            Dostupní muži: {availableManpower} · Zlato: {realm?.gold_reserve || 0}
          </div>

          <Button onClick={handleCreate} disabled={saving || !name.trim() || !selectedPreset} className="w-full font-display">
            <Swords className="h-4 w-4 mr-1" />Zřídit jednotku
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Create General Dialog ----
function CreateGeneralDialog({
  open, onClose, sessionId, currentPlayerName, goldReserve, onRefresh,
}: {
  open: boolean; onClose: () => void; sessionId: string; currentPlayerName: string;
  goldReserve: number; onRefresh: () => void;
}) {
  const [name, setName] = useState("");
  const [flavorTrait, setFlavorTrait] = useState("");
  const [saving, setSaving] = useState(false);
  const cost = 100;

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Zadejte jméno"); return; }
    if (goldReserve < cost) { toast.error(`Nedostatek zlata (potřeba ${cost})`); return; }
    setSaving(true);

    const skill = 40 + Math.floor(Math.random() * 30); // 40-69

    await supabase.from("generals").insert({
      session_id: sessionId,
      player_name: currentPlayerName,
      name: name.trim(),
      skill,
      flavor_trait: flavorTrait.trim() || null,
    });

    // Deduct gold
    const { data: realm } = await supabase
      .from("realm_resources")
      .select("id, gold_reserve")
      .eq("session_id", sessionId)
      .eq("player_name", currentPlayerName)
      .maybeSingle();

    if (realm) {
      await supabase.from("realm_resources").update({ gold_reserve: realm.gold_reserve - cost }).eq("id", realm.id);
    }

    await dispatchCommand({
      sessionId, actor: { name: currentPlayerName }, commandType: "RECRUIT_GENERAL",
      commandPayload: { generalName: name.trim(), skill, cost, flavorTrait: flavorTrait.trim() || null,
        chronicleText: `${currentPlayerName} jmenoval generála **${name.trim()}** (schopnost ${skill}). Náklady: ${cost} zlata.` },
    });

    toast.success(`Generál ${name.trim()} jmenován (sch. ${skill})`);
    setName(""); setFlavorTrait("");
    setSaving(false);
    onRefresh();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Crown className="h-5 w-5 text-illuminated" />
            Jmenovat generála
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Jméno generála" value={name} onChange={e => setName(e.target.value)} className="h-9" />
          <Input placeholder="Rys / přezdívka (volitelné)" value={flavorTrait} onChange={e => setFlavorTrait(e.target.value)} className="h-9" />
          <p className="text-xs text-muted-foreground">Náklady: {cost} zlata · Zlato: {goldReserve}</p>
          <Button onClick={handleCreate} disabled={saving || !name.trim()} className="w-full font-display">
            <Crown className="h-4 w-4 mr-1" />Jmenovat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- My Army Panel ----
function MyArmyPanel({
  sessionId, currentPlayerName, stacks, realm, unitVisuals, generatingVisual, setGeneratingVisual, onRefresh,
}: {
  sessionId: string; currentPlayerName: string; stacks: Stack[]; realm: any;
  unitVisuals: UnitTypeVisual[]; generatingVisual: string | null;
  setGeneratingVisual: (v: string | null) => void; onRefresh: () => void;
}) {
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});

  const handleGenerate = async (mode: string, extra: Record<string, any> = {}) => {
    const key = `${mode}-${extra.unitType || extra.stackId || "realm"}`;
    setGeneratingVisual(key);
    try {
      // Reset confirmed flags when regenerating
      if ((mode === "stack" || mode === "sigil_stack") && extra.stackId) {
        const resetField = mode === "stack" ? { image_confirmed: false } : { sigil_confirmed: false };
        await supabase.from("military_stacks").update(resetField as any).eq("id", extra.stackId);
      }
      if (mode === "sigil_realm" && realm) {
        await supabase.from("realm_resources").update({ army_sigil_confirmed: false } as any).eq("id", realm.id);
      }
      const { data, error } = await supabase.functions.invoke("army-visualize", {
        body: {
          sessionId, playerName: currentPlayerName, mode,
          customPrompt: customPrompts[key] || undefined,
          ...extra,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success("🎨 Vizuál vygenerován!");
      onRefresh();
    } catch (e) {
      console.error(e);
      toast.error("Generování selhalo");
    }
    setGeneratingVisual(null);
  };

  const UNIT_TYPES = ["MILITIA", "PROFESSIONAL"];
  const UNIT_LABELS_CZ: Record<string, string> = {
    MILITIA: "Milice", PROFESSIONAL: "Profesionálové",
  };
  const UNIT_ICONS_MAP: Record<string, React.ElementType> = {
    MILITIA: Shield, PROFESSIONAL: Swords,
  };

  return (
    <div className="space-y-6">
      {/* Army Sigil (Realm) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Flag className="h-4 w-4 text-illuminated" /> Znak armády (říšský erb)
          </h3>
          <div className="flex gap-4">
            <div className="shrink-0 w-24 h-24 rounded-lg border border-border bg-muted/30 overflow-hidden flex items-center justify-center">
              {(realm as any)?.army_sigil_url ? (
                <img src={(realm as any).army_sigil_url} alt="Znak armády" className="w-full h-full object-cover" />
              ) : (
                <Flag className="h-10 w-10 text-muted-foreground/20" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Input
                placeholder="Vlastní prompt (volitelné)..."
                value={customPrompts["sigil_realm-realm"] || ""}
                onChange={e => setCustomPrompts(p => ({ ...p, "sigil_realm-realm": e.target.value }))}
                className="h-8 text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline" className="text-xs font-display flex-1"
                  disabled={generatingVisual === "sigil_realm-realm"}
                  onClick={() => handleGenerate("sigil_realm")}
                >
                  {generatingVisual === "sigil_realm-realm"
                    ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generuji...</>
                    : <><Sparkles className="h-3 w-3 mr-1" />{(realm as any)?.army_sigil_url ? "Regenerovat" : "Vygenerovat znak"}</>
                  }
                </Button>
                {(realm as any)?.army_sigil_url && !(realm as any)?.army_sigil_confirmed && (
                  <Button
                    size="sm" variant="default" className="text-xs font-display"
                    onClick={async () => {
                      await supabase.from("realm_resources").update({ army_sigil_confirmed: true } as any)
                        .eq("id", realm!.id);
                      toast.success("✅ Říšský erb potvrzen!");
                      onRefresh();
                    }}
                  >
                    <Check className="h-3 w-3 mr-1" />Potvrdit
                  </Button>
                )}
                {(realm as any)?.army_sigil_confirmed && (
                  <Badge variant="outline" className="text-[9px] h-7 px-2 flex items-center gap-1 border-accent text-accent">
                    <Check className="h-3 w-3" /> Potvrzeno
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unit Type Visuals */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" /> Vizualizace typů jednotek
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {UNIT_TYPES.map(ut => {
              const visual = unitVisuals.find(v => v.unit_type === ut);
              const key = `unit_type-${ut}`;
              const isGen = generatingVisual === key;
              const UIcon = UNIT_ICONS_MAP[ut] || Shield;
              return (
                <div key={ut} className="manuscript-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <UIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-display font-semibold text-sm">{UNIT_LABELS_CZ[ut]}</span>
                  </div>
                  <div className="w-full h-28 rounded border border-border bg-muted/20 overflow-hidden flex items-center justify-center">
                    {visual?.image_url ? (
                      <img src={visual.image_url} alt={ut} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                    )}
                  </div>
                  <Input
                    placeholder="Vlastní prompt..."
                    value={customPrompts[key] || ""}
                    onChange={e => setCustomPrompts(p => ({ ...p, [key]: e.target.value }))}
                    className="h-7 text-xs"
                  />
                  <Button
                    size="sm" variant="outline" className="text-xs font-display w-full"
                    disabled={isGen}
                    onClick={() => handleGenerate("unit_type", { unitType: ut })}
                  >
                    {isGen ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generuji...</> : <><Sparkles className="h-3 w-3 mr-1" />{visual?.image_url ? "Regenerovat" : "Vygenerovat"}</>}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stack Visuals & Sigils */}
      {stacks.filter(s => s.is_active).length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Swords className="h-4 w-4 text-primary" /> Vizualizace a znaky jednotek
            </h3>
            <div className="space-y-3">
              {stacks.filter(s => s.is_active).map(stack => {
                const imgKey = `stack-${stack.id}`;
                const sigilKey = `sigil_stack-${stack.id}`;
                return (
                  <div key={stack.id} className="manuscript-card p-3 space-y-2">
                    {/* Header with sigil top-right */}
                    <div className="flex items-center gap-2">
                      <Swords className="h-3 w-3 text-primary" />
                      <span className="font-display font-semibold text-sm">{stack.name}</span>
                      <Badge variant="outline" className="text-xs">{FORMATION_LABELS[stack.formation_type]}</Badge>
                      <div className="ml-auto flex items-center gap-1.5">
                        {/* Sigil mini */}
                        <div className="shrink-0 w-8 h-8 rounded border border-border bg-muted/20 overflow-hidden flex items-center justify-center">
                          {(stack as any).sigil_url ? (
                            <img src={(stack as any).sigil_url} alt="Znak" className="w-full h-full object-cover" />
                          ) : (
                            <Flag className="h-4 w-4 text-muted-foreground/20" />
                          )}
                        </div>
                        {(stack as any).sigil_confirmed && (
                          <Badge variant="outline" className="text-[9px] h-5 px-1 flex items-center gap-0.5 border-accent text-accent">
                            <Check className="h-2.5 w-2.5" />
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Full-width visual */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Vizuál</p>
                      <div className="w-full h-40 rounded border border-border bg-muted/20 overflow-hidden flex items-center justify-center">
                        {(stack as any).image_url ? (
                          <img src={(stack as any).image_url} alt={stack.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                        )}
                      </div>
                      <Input
                        placeholder="Prompt..."
                        value={customPrompts[imgKey] || ""}
                        onChange={e => setCustomPrompts(p => ({ ...p, [imgKey]: e.target.value }))}
                        className="h-6 text-[10px]"
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm" variant="outline" className="text-[10px] font-display flex-1 h-6"
                          disabled={generatingVisual === imgKey}
                          onClick={() => handleGenerate("stack", { stackId: stack.id, stackName: stack.name })}
                        >
                          {generatingVisual === imgKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-0.5" />Vizuál</>}
                        </Button>
                        {(stack as any).image_url && !(stack as any).image_confirmed && (
                          <Button
                            size="sm" variant="default" className="text-[10px] font-display h-6 px-2"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await supabase.from("military_stacks").update({ image_confirmed: true } as any).eq("id", stack.id);
                              toast.success("✅ Vizuál potvrzen!");
                              onRefresh();
                            }}
                          >
                            <Check className="h-3 w-3 mr-0.5" />Potvrdit
                          </Button>
                        )}
                        {(stack as any).image_confirmed && (
                          <Badge variant="outline" className="text-[9px] h-6 px-1.5 flex items-center gap-0.5 border-accent text-accent">
                            <Check className="h-2.5 w-2.5" />OK
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Sigil controls */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Znak</p>
                      <div className="flex gap-2 items-center">
                        <Input
                          placeholder="Prompt znaku..."
                          value={customPrompts[sigilKey] || ""}
                          onChange={e => setCustomPrompts(p => ({ ...p, [sigilKey]: e.target.value }))}
                          className="h-6 text-[10px] flex-1"
                        />
                        <Button
                          size="sm" variant="outline" className="text-[10px] font-display h-6 shrink-0"
                          disabled={generatingVisual === sigilKey}
                          onClick={() => handleGenerate("sigil_stack", { stackId: stack.id, stackName: stack.name })}
                        >
                          {generatingVisual === sigilKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-0.5" />Znak</>}
                        </Button>
                        {(stack as any).sigil_url && !(stack as any).sigil_confirmed && (
                          <Button
                            size="sm" variant="default" className="text-[10px] font-display h-6 px-2 shrink-0"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await supabase.from("military_stacks").update({ sigil_confirmed: true } as any).eq("id", stack.id);
                              toast.success("✅ Znak potvrzen!");
                              onRefresh();
                            }}
                          >
                            <Check className="h-3 w-3 mr-0.5" />Potvrdit
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ArmyTab;
