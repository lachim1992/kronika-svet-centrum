import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureRealmResources, UNIT_TYPE_LABELS, UNIT_GOLD_FACTOR, FORMATION_PRESETS } from "@/lib/turnEngine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Swords, Shield, Target, Crosshair, Users, Coins, ChevronUp, Plus, Minus, Crown, User, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

const UNIT_ICONS: Record<string, React.ElementType> = {
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

const RECRUIT_PRESETS = [
  { key: "inf_draft", label: "Pěší odvod", deltas: { INFANTRY: 200 } },
  { key: "balanced", label: "Smíšená kohorta", deltas: { INFANTRY: 150, ARCHERS: 50 } },
  { key: "cav_det", label: "Jezdecký oddíl", deltas: { CAVALRY: 100 } },
  { key: "siege_train", label: "Obléhací vůz", deltas: { SIEGE: 60 } },
];

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
  onRefetch: () => void;
}

const ArmyTab = ({ sessionId, currentPlayerName, currentTurn, myRole, onRefetch }: Props) => {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [generals, setGenerals] = useState<General[]>([]);
  const [realm, setRealm] = useState<RealmRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStack, setSelectedStack] = useState<Stack | null>(null);
  const [showRecruit, setShowRecruit] = useState(false);
  const [showCreateGeneral, setShowCreateGeneral] = useState(false);
  const [sortBy, setSortBy] = useState<"power" | "morale" | "formation">("power");

  const fetchMilitary = useCallback(async () => {
    setLoading(true);
    const [stacksRes, generalsRes] = await Promise.all([
      supabase.from("military_stacks").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).order("created_at"),
      supabase.from("generals").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName),
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

    const realmData = await ensureRealmResources(sessionId, currentPlayerName);
    if (realmData) setRealm(realmData as RealmRes);

    setLoading(false);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchMilitary(); }, [fetchMilitary]);

  const availableManpower = realm ? realm.manpower_pool - realm.manpower_committed : 0;
  const totalPower = stacks.filter(s => s.is_active).reduce((s, st) => s + st.power, 0);
  const totalCommitted = stacks.filter(s => s.is_active).reduce((s, st) => s + st.compositions.reduce((a, c) => a + c.manpower, 0), 0);

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

  const sortedStacks = [...stacks].sort((a, b) => {
    if (sortBy === "power") return b.power - a.power;
    if (sortBy === "morale") return b.morale - a.morale;
    const order = { ARMY: 0, LEGION: 1, UNIT: 2 };
    return (order[a.formation_type as keyof typeof order] ?? 2) - (order[b.formation_type as keyof typeof order] ?? 2);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Swords className="h-8 w-8 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-2 py-1">
        <Swords className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Vojenské velení</h2>
      </div>

      {/* Military Summary Bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <SummaryChip label="Dostupní muži" value={availableManpower} icon={Users} />
        <SummaryChip label="Nasazení" value={totalCommitted} icon={Shield} />
        <SummaryChip label="Mobilizace" value={`${Math.round((realm?.mobilization_rate || 0) * 100)}%`} icon={ChevronUp} />
        <SummaryChip label="Zlato" value={realm?.gold_reserve || 0} icon={Coins} />
        <SummaryChip label="Celková síla" value={totalPower} icon={Swords} highlight />
        <div className="manuscript-card p-2 flex flex-col items-center justify-center gap-0.5">
          <ReadinessIcon className={`h-4 w-4 ${readinessConfig[readiness].className}`} />
          <span className={`text-xs font-display font-semibold ${readinessConfig[readiness].className}`}>
            {readinessConfig[readiness].label}
          </span>
        </div>
      </div>

      <Tabs defaultValue="forces" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1">
          <TabsTrigger value="forces" className="font-display text-xs gap-1">
            <Swords className="h-3 w-3" />Síly
          </TabsTrigger>
          <TabsTrigger value="generals" className="font-display text-xs gap-1">
            <Crown className="h-3 w-3" />Generálové
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
              return (
                <Card key={g.id}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Crown className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-sm truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Schopnost: {g.skill}/100
                        {assigned && <> · Velí: {assigned.name}</>}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">{g.skill}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
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
    </div>
  );
};

// ---- Summary Chip ----
function SummaryChip({ label, value, icon: Icon, highlight }: { label: string; value: string | number; icon: React.ElementType; highlight?: boolean }) {
  return (
    <div className="manuscript-card p-2 flex flex-col items-center justify-center gap-0.5">
      <Icon className={`h-4 w-4 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
      <span className={`text-sm font-display font-bold ${highlight ? "text-primary" : ""}`}>{value}</span>
      <span className="text-[9px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

// ---- Stack Card ----
function StackCard({ stack, general, onManage }: { stack: Stack; general?: General; onManage: () => void }) {
  const totalManpower = stack.compositions.reduce((s, c) => s + c.manpower, 0);

  return (
    <Card className={`cursor-pointer hover:border-primary/40 transition-colors ${!stack.is_active ? "opacity-50" : ""}`} onClick={onManage}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Swords className="h-4 w-4 text-primary shrink-0" />
            <span className="font-display font-bold text-sm truncate">{stack.name}</span>
          </div>
          <Badge className={`text-xs shrink-0 ${FORMATION_COLORS[stack.formation_type] || ""}`}>
            {FORMATION_LABELS[stack.formation_type] || stack.formation_type}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-2xl font-display font-bold text-primary">{stack.power}</p>
            <p className="text-[9px] text-muted-foreground">Síla</p>
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

    await supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `${currentPlayerName} posílil **${stack.name}** o ${addedManpower} mužů (náklady: ${Math.round(addedGold)} zlata).`,
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

    await supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `${currentPlayerName} povýšil **${stack.name}** na ${FORMATION_LABELS[target]}. Náklady: ${cost} zlata.`,
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
    await supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `${currentPlayerName} jmenoval **${gen?.name || "generála"}** velitelem **${stack.name}**.`,
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

    await supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `${currentPlayerName} rozpustil **${stack.name}**. ${returnedManpower} mužů se vrátilo do manpower pool.`,
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
              {(["INFANTRY", "ARCHERS", "CAVALRY", "SIEGE"] as const).map(ut => {
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
    const totalGold = preset.composition.reduce((s, c) => s + c.manpower * (UNIT_GOLD_FACTOR[c.unit_type] || 1), 0);

    if (totalManpower > availableManpower) { toast.error(`Nedostatek mužů (${totalManpower} potřeba)`); return; }
    if (totalGold > (realm?.gold_reserve || 0)) { toast.error(`Nedostatek zlata (${totalGold} potřeba)`); return; }

    setSaving(true);
    try {
      const { recruitStack } = await import("@/lib/turnEngine");
      await recruitStack(sessionId, currentPlayerName, name.trim(), selectedPreset);
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
              const totalGold = preset.composition.reduce((s, c) => s + c.manpower * (UNIT_GOLD_FACTOR[c.unit_type] || 1), 0);
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

    await supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `${currentPlayerName} jmenoval generála **${name.trim()}** (schopnost ${skill}). Náklady: ${cost} zlata.`,
    });

    toast.success(`Generál ${name.trim()} jmenován (sch. ${skill})`);
    setName("");
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
          <p className="text-xs text-muted-foreground">Náklady: {cost} zlata · Zlato: {goldReserve}</p>
          <Button onClick={handleCreate} disabled={saving || !name.trim()} className="w-full font-display">
            <Crown className="h-4 w-4 mr-1" />Jmenovat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ArmyTab;
