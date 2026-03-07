import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, Minus, Users, Shield, Swords, Coins,
  Wheat, AlertTriangle, Timer, Crown
} from "lucide-react";

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

    const avgStability = cities.length > 0
      ? Math.round(cities.reduce((s, c) => s + (c.city_stability || 50), 0) / cities.length)
      : 0;
    const avgLegitimacy = cities.length > 0
      ? Math.round(cities.reduce((s, c) => s + (c.legitimacy || 50), 0) / cities.length)
      : 0;

    // Population growth estimate based on birth/death rates
    const avgBirth = cities.length > 0
      ? cities.reduce((s, c) => s + (c.birth_rate || 0), 0) / cities.length
      : 0;
    const avgDeath = cities.length > 0
      ? cities.reduce((s, c) => s + (c.death_rate || 0), 0) / cities.length
      : 0;
    const growthRate = avgBirth - avgDeath;
    const growthPerTurn = Math.round(totalPop * growthRate);

    const netGrain = realm?.last_turn_grain_net ?? 0;
    const grainReserve = realm?.grain_reserve || 0;
    const grainCap = realm?.granary_capacity || 500;

    // Projection: turns until grain runs out (if negative net)
    const turnsUntilFamine = netGrain < 0 ? Math.max(0, Math.floor(grainReserve / Math.abs(netGrain))) : null;
    // Projection: turns until granary full (if positive net)
    const turnsUntilFull = netGrain > 0 ? Math.max(0, Math.ceil((grainCap - grainReserve) / netGrain)) : null;

    const famineCities = cities.filter(c => c.famine_turn);
    const epidemicCities = cities.filter(c => c.epidemic_active);
    const lowStabilityCities = cities.filter(c => (c.city_stability || 50) < 30);

    const availableManpower = (realm?.manpower_pool || 0) - (realm?.manpower_committed || 0);
    const mobRate = Math.round((realm?.mobilization_rate || 0.1) * 100);

    return {
      totalPop, totalPeasants, totalBurghers, totalClerics,
      avgStability, avgLegitimacy, growthRate, growthPerTurn,
      netGrain, grainReserve, grainCap, turnsUntilFamine, turnsUntilFull,
      famineCities, epidemicCities, lowStabilityCities,
      availableManpower, mobRate,
      gold: realm?.gold_reserve || 0,
      wood: realm?.wood_reserve || 0,
      stone: realm?.stone_reserve || 0,
      iron: realm?.iron_reserve || 0,
    };
  }, [realm, cities, currentTurn]);

  const peasantPct = stats.totalPop > 0 ? Math.round((stats.totalPeasants / stats.totalPop) * 100) : 0;
  const burgherPct = stats.totalPop > 0 ? Math.round((stats.totalBurghers / stats.totalPop) * 100) : 0;
  const clericPct = stats.totalPop > 0 ? Math.round((stats.totalClerics / stats.totalPop) * 100) : 0;

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
          {/* Class ratios bar */}
          <div>
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              <div className="bg-emerald-600 transition-all" style={{ width: `${peasantPct}%` }} title={`Rolníci ${peasantPct}%`} />
              <div className="bg-amber-500 transition-all" style={{ width: `${burgherPct}%` }} title={`Měšťané ${burgherPct}%`} />
              <div className="bg-violet-500 transition-all" style={{ width: `${clericPct}%` }} title={`Klerici ${clericPct}%`} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>🌾 Rolníci {peasantPct}%</span>
              <span>🔨 Měšťané {burgherPct}%</span>
              <span>📿 Klerici {clericPct}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Economy Summary */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1"><Coins className="h-3 w-3" />Ekonomika</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Zlato</span><span className="font-bold">{stats.gold}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Dřevo</span><span className="font-bold">{stats.wood}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Kámen</span><span className="font-bold">{stats.stone}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Železo</span><span className="font-bold">{stats.iron}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Obilí</span>
              <span className="font-bold">{stats.grainReserve}/{stats.grainCap}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bilance</span>
              <Trend val={stats.netGrain} />
            </div>
          </div>
          {/* Grain bar */}
          <div className="w-full bg-muted rounded-full h-1.5 mt-2">
            <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${Math.min(100, (stats.grainReserve / Math.max(1, stats.grainCap)) * 100)}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Projections */}
      {(stats.turnsUntilFamine !== null || stats.turnsUntilFull !== null) && (
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs flex items-center gap-1"><Timer className="h-3 w-3" />Projekce</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1 text-xs space-y-1">
            {stats.turnsUntilFamine !== null && (
              <div className="flex justify-between">
                <span className={stats.turnsUntilFamine <= 3 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                  ⏰ Hladomor za
                </span>
                <span className={stats.turnsUntilFamine <= 3 ? "text-destructive font-bold" : "font-bold"}>
                  {stats.turnsUntilFamine} kol
                </span>
              </div>
            )}
            {stats.turnsUntilFull !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">🏛️ Sýpky plné za</span>
                <span className="font-bold">{stats.turnsUntilFull} kol</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
