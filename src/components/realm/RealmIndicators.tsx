import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import {
  TrendingUp, TrendingDown, Minus, Users, Shield, Swords,
  AlertTriangle, Timer, Network
} from "lucide-react";
import { MACRO_LAYER_ICONS, MACRO_LAYER_LABELS, STRATEGIC_RESOURCE_ICONS, STRATEGIC_RESOURCE_LABELS, STRATEGIC_TIER_LABELS, type StrategicResource } from "@/lib/economyFlow";

interface Props {
  realm: any;
  cities: any[];
  currentTurn: number;
}

const Trend = ({ val, suffix = "" }: { val: number; suffix?: string }) => {
  if (val > 0) return <span className="text-accent flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />+{val}{suffix}</span>;
  if (val < 0) return <span className="text-destructive flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{val}{suffix}</span>;
  return <span className="text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />0{suffix}</span>;
};

const RealmIndicators = ({ realm, cities, currentTurn }: Props) => {
  const stats = useMemo(() => {
    const totalPop = cities.reduce((s, c) => s + (c.population_total || 0), 0);
    const totalPeasants = cities.reduce((s, c) => s + (c.population_peasants || 0), 0);
    const totalBurghers = cities.reduce((s, c) => s + (c.population_burghers || 0), 0);
    const totalClerics = cities.reduce((s, c) => s + (c.population_clerics || 0), 0);
    const totalWarriors = cities.reduce((s, c) => s + (c.population_warriors || 0), 0);

    const avgStability = cities.length > 0
      ? Math.round(cities.reduce((s, c) => s + (c.city_stability || 50), 0) / cities.length)
      : 0;
    const avgLegitimacy = cities.length > 0
      ? Math.round(cities.reduce((s, c) => s + (c.legitimacy || 50), 0) / cities.length)
      : 0;

    const avgBirth = cities.length > 0 ? cities.reduce((s, c) => s + (c.birth_rate || 0), 0) / cities.length : 0;
    const avgDeath = cities.length > 0 ? cities.reduce((s, c) => s + (c.death_rate || 0), 0) / cities.length : 0;
    const growthRate = avgBirth - avgDeath;
    const growthPerTurn = Math.round(totalPop * growthRate);

    const famineCities = cities.filter(c => c.famine_turn);
    const epidemicCities = cities.filter(c => c.epidemic_active);
    const lowStabilityCities = cities.filter(c => (c.city_stability || 50) < 30);

    const availableManpower = (realm?.manpower_pool || 0) - (realm?.manpower_committed || 0);
    const mobRate = Math.round((realm?.mobilization_rate || 0.1) * 100);

    // Macro economy
    const totalProduction = realm?.total_production ?? 0;
    const totalWealth = realm?.total_wealth ?? 0;
    const totalCapacity = realm?.total_capacity ?? 0;
    const totalImportance = realm?.total_importance ?? 0;
    const faith = realm?.faith ?? 0;
    const faithGrowth = realm?.faith_growth ?? 0;
    const warriorRatio = realm?.warrior_ratio ?? 0;
    const supplyStrain = realm?.supply_strain ?? 0;

    // Strategic tiers
    const strategicTiers = [
      { key: "iron" as StrategicResource, tier: realm?.strategic_iron_tier ?? 0 },
      { key: "horses" as StrategicResource, tier: realm?.strategic_horses_tier ?? 0 },
      { key: "salt" as StrategicResource, tier: realm?.strategic_salt_tier ?? 0 },
      { key: "copper" as StrategicResource, tier: realm?.strategic_copper_tier ?? 0 },
      { key: "gold_deposit" as StrategicResource, tier: realm?.strategic_gold_tier ?? 0 },
    ].filter(s => s.tier > 0);

    return {
      totalPop, totalPeasants, totalBurghers, totalClerics, totalWarriors,
      avgStability, avgLegitimacy, growthRate, growthPerTurn,
      famineCities, epidemicCities, lowStabilityCities,
      availableManpower, mobRate,
      totalProduction, totalWealth, totalCapacity, totalImportance,
      faith, faithGrowth, warriorRatio, supplyStrain,
      strategicTiers,
    };
  }, [realm, cities, currentTurn]);

  const peasantPct = stats.totalPop > 0 ? Math.round((stats.totalPeasants / stats.totalPop) * 100) : 0;
  const burgherPct = stats.totalPop > 0 ? Math.round((stats.totalBurghers / stats.totalPop) * 100) : 0;
  const clericPct = stats.totalPop > 0 ? Math.round((stats.totalClerics / stats.totalPop) * 100) : 0;
  const warriorPct = stats.totalPop > 0 ? Math.round((stats.totalWarriors / stats.totalPop) * 100) : 0;
  const maxMacro = Math.max(stats.totalProduction, stats.totalWealth, stats.totalCapacity, 1);

  return (
    <div className="space-y-3">
      {/* Alerts */}
      {(stats.famineCities.length > 0 || stats.epidemicCities.length > 0 || stats.lowStabilityCities.length > 0) && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-display font-semibold text-destructive">Varování</span>
            </div>
            {stats.famineCities.map(c => (
              <div key={c.id} className="text-xs text-destructive">🌾 {c.name} — hladomor (deficit {c.famine_severity})</div>
            ))}
            {stats.epidemicCities.map(c => (
              <div key={c.id} className="text-xs text-destructive">🦠 {c.name} — epidemie</div>
            ))}
            {stats.lowStabilityCities.map(c => (
              <div key={c.id} className="text-xs text-amber-500">⚠ {c.name} — nízká stabilita ({c.city_stability}%)</div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Macro Economy — 3 Layers + Faith */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1"><Network className="h-3 w-3" />Ekonomika toku</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2">
          {(["production", "wealth", "capacity"] as const).map(layer => {
            const val = layer === "production" ? stats.totalProduction : layer === "wealth" ? stats.totalWealth : stats.totalCapacity;
            return (
              <div key={layer} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{MACRO_LAYER_ICONS[layer]} {MACRO_LAYER_LABELS[layer]}</span>
                  <span className="font-bold">{val.toFixed(1)}</span>
                </div>
                <Progress value={Math.min(100, (val / maxMacro) * 100)} className="h-1" />
              </div>
            );
          })}
          <div className="flex justify-between text-xs border-t border-border/50 pt-1">
            <span className="text-muted-foreground">⭐ Celková důležitost</span>
            <span className="font-bold">{stats.totalImportance.toFixed(1)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">⛪ Víra</span>
            <span className="font-bold flex items-center gap-1">
              {stats.faith.toFixed(0)}
              <Trend val={Math.round(stats.faithGrowth * 10) / 10} />
            </span>
          </div>
          {stats.supplyStrain > 0.6 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">📦 Zásobovací zátěž</span>
              <span className={`font-bold ${stats.supplyStrain > 1.0 ? "text-destructive" : "text-amber-500"}`}>
                {Math.round(stats.supplyStrain * 100)}%
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategic Resources */}
      {stats.strategicTiers.length > 0 && (
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs flex items-center gap-1">⚡ Strategické suroviny</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1 space-y-1">
            {stats.strategicTiers.map(s => (
              <div key={s.key} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{STRATEGIC_RESOURCE_ICONS[s.key]} {STRATEGIC_RESOURCE_LABELS[s.key]}</span>
                <Badge variant="secondary" className="text-[9px]">{STRATEGIC_TIER_LABELS[s.tier]}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Population & Demographics */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1"><Users className="h-3 w-3" />Populace & demografie</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Celkem</span>
              <span className="font-bold">{stats.totalPop.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Růst/kolo</span>
              <Trend val={stats.growthPerTurn} />
            </div>
          </div>
          <div>
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              <div className="bg-emerald-600 transition-all" style={{ width: `${peasantPct}%` }} title={`Rolníci ${peasantPct}%`} />
              <div className="bg-amber-500 transition-all" style={{ width: `${burgherPct}%` }} title={`Měšťané ${burgherPct}%`} />
              <div className="bg-violet-500 transition-all" style={{ width: `${clericPct}%` }} title={`Klerici ${clericPct}%`} />
              <div className="bg-red-600 transition-all" style={{ width: `${warriorPct}%` }} title={`Válečníci ${warriorPct}%`} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 flex-wrap gap-x-2">
              <span>🌾 Rolníci {peasantPct}%</span>
              <span>🔨 Měšťané {burgherPct}%</span>
              <span>📿 Klerici {clericPct}%</span>
              <span>⚔ Válečníci {warriorPct}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stability & Military */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs flex items-center gap-1"><Shield className="h-3 w-3" />Stabilita</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ø Stabilita</span>
              <span className={`font-bold ${stats.avgStability < 30 ? "text-destructive" : stats.avgStability < 50 ? "text-amber-500" : "text-accent"}`}>
                {stats.avgStability}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ø Legitimita</span>
              <span className="font-bold">{stats.avgLegitimacy}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs flex items-center gap-1"><Swords className="h-3 w-3" />Vojsko</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">K dispozici</span>
              <span className="font-bold">{stats.availableManpower}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mobilizace</span>
              <span className="font-bold">{stats.mobRate}%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RealmIndicators;
