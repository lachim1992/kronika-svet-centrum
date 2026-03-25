import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Save, Loader2, RotateCcw, ChevronDown, ChevronUp, Sliders, Eye,
  Factory, Coins, Wheat, Shield, Church, Swords, Users, Network,
} from "lucide-react";
import {
  BASE_PRODUCTION, ROLE_TRADE_EFFICIENCY,
} from "@/lib/economyFlow";
import {
  ACTIVE_POP_WEIGHTS, DEFAULT_ACTIVE_POP_RATIO, DEFAULT_MAX_MOBILIZATION,
  SETTLEMENT_WEALTH,
} from "@/lib/economyConstants";

interface Props {
  sessionId: string;
}

// ── All tuneable formula groups ──
interface FormulaParam {
  key: string;
  label: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
}

interface FormulaGroup {
  groupKey: string;
  title: string;
  icon: React.ElementType;
  description: string;
  params: FormulaParam[];
}

const FORMULA_GROUPS: FormulaGroup[] = [
  {
    groupKey: "base_production",
    title: "⚒️ Základní produkce uzlů",
    icon: Factory,
    description: "Výchozí produkční výnos podle typu uzlu (node_type)",
    params: Object.entries(BASE_PRODUCTION).map(([k, v]) => ({
      key: k, label: k, defaultValue: v, min: 0, max: 50, step: 1,
      hint: `Výchozí: ${v}`,
    })),
  },
  {
    groupKey: "role_multiplier",
    title: "💰 Trade efektivita dle role",
    icon: Coins,
    description: "Multiplikátor obchodní efektivity pro flow_role uzlu",
    params: Object.entries(ROLE_TRADE_EFFICIENCY).map(([k, v]) => ({
      key: k, label: k, defaultValue: v, min: 0, max: 2, step: 0.05,
      hint: `Výchozí: ${v}`,
    })),
  },
  {
    groupKey: "workforce",
    title: "👥 Workforce & Mobilizace",
    icon: Users,
    description: "Váhy populačních vrstev pro aktivní pracovní sílu a limity mobilizace",
    params: [
      { key: "weight_peasants", label: "Váha rolníků", defaultValue: ACTIVE_POP_WEIGHTS.peasants, min: 0, max: 2, step: 0.05, hint: `Výchozí: ${ACTIVE_POP_WEIGHTS.peasants}` },
      { key: "weight_burghers", label: "Váha měšťanů", defaultValue: ACTIVE_POP_WEIGHTS.burghers, min: 0, max: 2, step: 0.05, hint: `Výchozí: ${ACTIVE_POP_WEIGHTS.burghers}` },
      { key: "weight_clerics", label: "Váha kleriků", defaultValue: ACTIVE_POP_WEIGHTS.clerics, min: 0, max: 2, step: 0.05, hint: `Výchozí: ${ACTIVE_POP_WEIGHTS.clerics}` },
      { key: "active_pop_ratio", label: "Aktivní pop ratio", defaultValue: DEFAULT_ACTIVE_POP_RATIO, min: 0.1, max: 0.9, step: 0.05, hint: `Výchozí: ${DEFAULT_ACTIVE_POP_RATIO}` },
      { key: "max_mobilization", label: "Max mobilizace", defaultValue: DEFAULT_MAX_MOBILIZATION, min: 0.05, max: 0.5, step: 0.05, hint: `Výchozí: ${DEFAULT_MAX_MOBILIZATION}` },
      { key: "overmob_penalty_mult", label: "Over-mob penalizace ×", defaultValue: 2, min: 0.5, max: 5, step: 0.5, hint: "Výchozí: 2 (penalty = (mob−max) × tato hodnota)" },
    ],
  },
  {
    groupKey: "settlement_wealth",
    title: "🏘️ Wealth dle úrovně sídla",
    icon: Coins,
    description: "Základní příjem bohatství podle settlement_level",
    params: Object.entries(SETTLEMENT_WEALTH).map(([k, v]) => ({
      key: k, label: k, defaultValue: v, min: 0, max: 20, step: 1,
      hint: `Výchozí: ${v}`,
    })),
  },
  {
    groupKey: "wealth_formula",
    title: "💰 Wealth vzorec",
    icon: Coins,
    description: "Parametry výpočtu městského bohatství",
    params: [
      { key: "pop_per_wealth", label: "Populace na 1 wealth", defaultValue: 500, min: 100, max: 2000, step: 50, hint: "Výchozí: 500 (pop/500 → bonus)" },
      { key: "burghers_per_wealth", label: "Měšťané na 1 wealth", defaultValue: 200, min: 50, max: 1000, step: 50, hint: "Výchozí: 200 (burghers/200 → bonus)" },
      { key: "prestige_wealth_pct", label: "Prestiž wealth bonus %", defaultValue: 0.1, min: 0, max: 1, step: 0.05, unit: "%/bod", hint: "Výchozí: 0.1% za bod prestiže" },
    ],
  },
  {
    groupKey: "grain",
    title: "🌾 Zásoby (Grain)",
    icon: Wheat,
    description: "Spotřeba a produkce zásob",
    params: [
      { key: "consumption_per_pop", label: "Spotřeba / obyvatel / kolo", defaultValue: 0.006, min: 0.001, max: 0.05, step: 0.001, hint: "Výchozí: 0.006" },
      { key: "base_granary_capacity", label: "Základní kapacita sýpky", defaultValue: 100, min: 50, max: 500, step: 10, hint: "Výchozí: 100" },
    ],
  },
  {
    groupKey: "population",
    title: "👶 Růst populace",
    icon: Users,
    description: "Vzorec: base_rate × food_surplus × stability × housing",
    params: [
      { key: "base_growth_rate", label: "Základní růst %", defaultValue: 1.2, min: 0.1, max: 5, step: 0.1, unit: "%", hint: "Výchozí: 1.2%" },
      { key: "peasant_share", label: "Podíl rolníků", defaultValue: 0.55, min: 0.1, max: 0.9, step: 0.05, hint: "Výchozí: 55%" },
      { key: "burgher_share", label: "Podíl měšťanů", defaultValue: 0.20, min: 0.05, max: 0.5, step: 0.05, hint: "Výchozí: 20%" },
      { key: "cleric_share", label: "Podíl kleriků", defaultValue: 0.10, min: 0.01, max: 0.3, step: 0.01, hint: "Výchozí: 10%" },
      { key: "stability_threshold_low", label: "Kritická stabilita %", defaultValue: 30, min: 5, max: 50, step: 5, hint: "Výchozí: 30% (pod touto hranicí = velmi nízký růst)" },
    ],
  },
  {
    groupKey: "stability",
    title: "🛡️ Stabilita",
    icon: Shield,
    description: "Modifikátory stability města",
    params: [
      { key: "base_stability", label: "Základní stabilita %", defaultValue: 50, min: 10, max: 100, step: 5, hint: "Výchozí: 50%" },
      { key: "famine_penalty", label: "Hladomor penalizace / kolo", defaultValue: 5, min: 1, max: 20, step: 1, unit: "%", hint: "Výchozí: −5% za kolo" },
      { key: "faith_stability_bonus", label: "Víra → stabilita", defaultValue: 0.2, min: 0, max: 1, step: 0.05, unit: "%/bod", hint: "Výchozí: +0.2% za bod víry" },
      { key: "rebellion_threshold", label: "Práh rebelie %", defaultValue: 30, min: 5, max: 50, step: 5, hint: "Výchozí: 30% (pod = riziko povstání)" },
      { key: "rebellion_critical", label: "Kritický práh %", defaultValue: 15, min: 5, max: 30, step: 5, hint: "Výchozí: 15% (téměř jistá rebelie)" },
    ],
  },
  {
    groupKey: "faith",
    title: "⛪ Víra",
    icon: Church,
    description: "Generace víry a její efekty",
    params: [
      { key: "cleric_faith_rate", label: "Víra / klerik / kolo", defaultValue: 0.01, min: 0.001, max: 0.1, step: 0.005, hint: "Výchozí: 0.01" },
      { key: "temple_faith_rate", label: "Víra / temple_level / kolo", defaultValue: 0.5, min: 0.1, max: 2, step: 0.1, hint: "Výchozí: 0.5" },
      { key: "faith_morale_bonus", label: "Víra → morálka vojska", defaultValue: 0.5, min: 0, max: 2, step: 0.1, unit: "%/bod", hint: "Výchozí: +0.5% morálky za bod víry" },
    ],
  },
  {
    groupKey: "military_upkeep",
    title: "⚔️ Vojenská údržba",
    icon: Swords,
    description: "Náklady na údržbu armád",
    params: [
      { key: "gold_per_troops", label: "Gold / X vojáků", defaultValue: 100, min: 50, max: 500, step: 25, hint: "Výchozí: 1 gold za 100 vojáků" },
      { key: "food_per_troops", label: "Zásoby / X vojáků", defaultValue: 500, min: 100, max: 2000, step: 50, hint: "Výchozí: 1 zásoba za 500 vojáků" },
    ],
  },
  {
    groupKey: "network_flow",
    title: "🔗 Síťový tok",
    icon: Network,
    description: "Parametry flow grafu provincií",
    params: [
      { key: "minor_to_major_pct", label: "Minor → Major přenos %", defaultValue: 50, min: 10, max: 100, step: 5, unit: "%", hint: "Výchozí: 50% produkce minor uzlů jde do nadřazeného major" },
      { key: "isolation_mild", label: "Mírná izolace práh", defaultValue: 0.15, min: 0.05, max: 0.3, step: 0.05, hint: "Výchozí: 0.15" },
      { key: "isolation_moderate", label: "Částečná izolace práh", defaultValue: 0.35, min: 0.15, max: 0.5, step: 0.05, hint: "Výchozí: 0.35" },
      { key: "isolation_severe", label: "Těžká izolace práh", defaultValue: 0.55, min: 0.35, max: 0.8, step: 0.05, hint: "Výchozí: 0.55" },
    ],
  },
];

type OverrideMap = Record<string, Record<string, number>>;

const FormulaTunerPanel = ({ sessionId }: Props) => {
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [savedOverrides, setSavedOverrides] = useState<OverrideMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load existing overrides from DB
  const loadOverrides = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("economy_overrides")
      .select("override_key, override_value")
      .eq("session_id", sessionId);

    const map: OverrideMap = {};
    for (const row of data || []) {
      map[row.override_key] = row.override_value as Record<string, number>;
    }
    setOverrides(map);
    setSavedOverrides(JSON.parse(JSON.stringify(map)));
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  const getValue = (groupKey: string, paramKey: string, defaultValue: number): number => {
    return overrides[groupKey]?.[paramKey] ?? defaultValue;
  };

  const setValue = (groupKey: string, paramKey: string, value: number) => {
    setOverrides(prev => ({
      ...prev,
      [groupKey]: { ...(prev[groupKey] || {}), [paramKey]: value },
    }));
  };

  const isModified = (groupKey: string, paramKey: string, defaultValue: number): boolean => {
    const current = overrides[groupKey]?.[paramKey];
    return current !== undefined && current !== defaultValue;
  };

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(overrides) !== JSON.stringify(savedOverrides);
  }, [overrides, savedOverrides]);

  const resetGroup = (groupKey: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[groupKey];
      return next;
    });
  };

  const resetAll = () => setOverrides({});

  const saveAll = async () => {
    setSaving(true);
    try {
      // Upsert each group that has values
      const allGroupKeys = FORMULA_GROUPS.map(g => g.groupKey);
      for (const gk of allGroupKeys) {
        const vals = overrides[gk];
        if (vals && Object.keys(vals).length > 0) {
          const { error } = await supabase
            .from("economy_overrides")
            .upsert({
              session_id: sessionId,
              override_key: gk,
              override_value: vals,
              updated_at: new Date().toISOString(),
            }, { onConflict: "session_id,override_key" });
          if (error) throw error;
        } else {
          // Delete override if reset to defaults
          await supabase
            .from("economy_overrides")
            .delete()
            .eq("session_id", sessionId)
            .eq("override_key", gk);
        }
      }
      setSavedOverrides(JSON.parse(JSON.stringify(overrides)));
      toast.success("Overrides uloženy do DB");
    } catch (err: any) {
      toast.error("Chyba: " + (err.message || "Neznámá"));
    } finally {
      setSaving(false);
    }
  };

  const modifiedCount = useMemo(() => {
    let count = 0;
    for (const group of FORMULA_GROUPS) {
      for (const p of group.params) {
        if (isModified(group.groupKey, p.key, p.defaultValue)) count++;
      }
    }
    return count;
  }, [overrides]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            Formula Tuner
            {modifiedCount > 0 && (
              <Badge variant="destructive" className="text-[9px] h-4 px-1.5">
                {modifiedCount} změn
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={resetAll} className="gap-1 text-xs h-7">
              <RotateCcw className="h-3 w-3" /> Reset vše
            </Button>
            <Button
              size="sm"
              onClick={saveAll}
              disabled={saving || !hasUnsavedChanges}
              className="gap-1 text-xs h-7"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Uložit do DB
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Úprava všech výpočetních konstant simulace. Změny se ukládají per-session do DB a edge funkce je načtou při dalším kole.
        </p>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <ScrollArea className="h-[600px]">
          <div className="space-y-1.5 pr-2">
            {FORMULA_GROUPS.map(group => {
              const isExpanded = expanded[group.groupKey] ?? false;
              const Icon = group.icon;
              const groupModCount = group.params.filter(p =>
                isModified(group.groupKey, p.key, p.defaultValue)
              ).length;

              return (
                <Collapsible
                  key={group.groupKey}
                  open={isExpanded}
                  onOpenChange={v => setExpanded(prev => ({ ...prev, [group.groupKey]: v }))}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium bg-muted/30 hover:bg-muted/50 rounded-lg transition-colors">
                      <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{group.title}</span>
                      {groupModCount > 0 && (
                        <Badge variant="secondary" className="text-[8px] h-4 px-1 bg-primary/20 text-primary">
                          {groupModCount}×
                        </Badge>
                      )}
                      <span className="text-[9px] text-muted-foreground ml-auto mr-2 hidden md:inline">{group.description}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 py-2 space-y-1.5 border rounded-b-lg border-t-0 bg-background/50">
                    <div className="flex justify-end mb-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resetGroup(group.groupKey)}
                        className="text-[10px] h-5 px-2 gap-1"
                      >
                        <RotateCcw className="h-2.5 w-2.5" /> Reset skupiny
                      </Button>
                    </div>
                    {group.params.map(param => {
                      const current = getValue(group.groupKey, param.key, param.defaultValue);
                      const modified = isModified(group.groupKey, param.key, param.defaultValue);
                      return (
                        <div key={param.key} className="flex items-center gap-2 text-xs">
                          <span className={`font-mono min-w-[140px] truncate ${modified ? "text-primary font-semibold" : "text-foreground"}`}>
                            {param.label}
                          </span>
                          <Input
                            type="number"
                            value={current}
                            min={param.min}
                            max={param.max}
                            step={param.step ?? 1}
                            onChange={e => setValue(group.groupKey, param.key, parseFloat(e.target.value) || 0)}
                            className={`h-7 w-24 text-xs font-mono ${modified ? "border-primary/50 bg-primary/5" : ""}`}
                          />
                          {param.unit && (
                            <span className="text-[9px] text-muted-foreground">{param.unit}</span>
                          )}
                          {modified && (
                            <Badge variant="outline" className="text-[8px] h-4 px-1 border-primary/30 text-primary">
                              Δ
                            </Badge>
                          )}
                          <span className="text-[9px] text-muted-foreground ml-auto hidden lg:inline">
                            {param.hint}
                          </span>
                        </div>
                      );
                    })}

                    {/* Live preview */}
                    <div className="mt-2 p-2 rounded bg-muted/20 border border-border/50">
                      <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-1">
                        <Eye className="h-3 w-3" /> Live Preview
                      </div>
                      <LivePreview group={group} overrides={overrides[group.groupKey] || {}} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

// ── Live Preview per group ──
const LivePreview = ({ group, overrides }: { group: FormulaGroup; overrides: Record<string, number> }) => {
  const get = (key: string, def: number) => overrides[key] ?? def;

  switch (group.groupKey) {
    case "base_production": {
      const entries = group.params.map(p => `${p.key}: ${get(p.key, p.defaultValue)}`);
      return <p className="text-[10px] font-mono text-foreground/80">{entries.join(" | ")}</p>;
    }
    case "workforce": {
      const exPop = 1000;
      const wP = get("weight_peasants", 1.0);
      const wB = get("weight_burghers", 0.7);
      const wC = get("weight_clerics", 0.2);
      const ratio = get("active_pop_ratio", 0.5);
      const raw = 600 * wP + 250 * wB + 150 * wC;
      const active = Math.floor(raw * ratio);
      return (
        <div className="text-[10px] font-mono text-foreground/80 space-y-0.5">
          <p>Příklad: 600 rolníků + 250 měšťanů + 150 kleriků = {exPop} pop</p>
          <p>Raw AP = 600×{wP} + 250×{wB} + 150×{wC} = {Math.floor(raw)}</p>
          <p>Effective AP = {Math.floor(raw)} × {ratio} = {active}</p>
        </div>
      );
    }
    case "grain": {
      const cons = get("consumption_per_pop", 0.006);
      return (
        <p className="text-[10px] font-mono text-foreground/80">
          1000 pop × {cons} = {(1000 * cons).toFixed(1)} zásob/kolo spotřeba
        </p>
      );
    }
    case "population": {
      const rate = get("base_growth_rate", 1.2);
      const pop = 1000;
      return (
        <p className="text-[10px] font-mono text-foreground/80">
          {pop} pop × {rate}% base = +{Math.floor(pop * rate / 100)} růst/kolo (za ideálních podmínek)
        </p>
      );
    }
    case "military_upkeep": {
      const goldPer = get("gold_per_troops", 100);
      const foodPer = get("food_per_troops", 500);
      return (
        <p className="text-[10px] font-mono text-foreground/80">
          1000 vojáků → ⌈1000/{goldPer}⌉ = {Math.ceil(1000 / goldPer)} gold + ⌈1000/{foodPer}⌉ = {Math.ceil(1000 / foodPer)} zásoby/kolo
        </p>
      );
    }
    default:
      return (
        <p className="text-[10px] text-muted-foreground italic">
          {group.params.map(p => `${p.label}: ${overrides[p.key] ?? p.defaultValue}`).join(", ")}
        </p>
      );
  }
};

export default FormulaTunerPanel;
