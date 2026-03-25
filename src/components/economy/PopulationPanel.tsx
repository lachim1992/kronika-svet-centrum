import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus, Users } from "lucide-react";

interface Props {
  cities: any[];
  realm: any;
}

const CLASS_META = [
  { key: "peasants", label: "Rolníci", icon: "🌾", color: "bg-emerald-600", role: "Produkce potravin a surovin. Základ ekonomiky.", effects: "Zvyšují produkci uzlů (weight 1.0 v active_pop). Spotřebovávají zásoby." },
  { key: "burghers", label: "Měšťané", icon: "🔨", color: "bg-amber-500", role: "Obchod a řemesla. Generují bohatství.", effects: "Zvyšují wealth tok (weight 0.7 v active_pop). +1 wealth/200 měšťanů. Rostou s market_level." },
  { key: "clerics", label: "Klerici", icon: "📿", color: "bg-violet-500", role: "Duchovní a akademická vrstva.", effects: "Generují víru (+0.01/klerka/kolo) a kapacitu (weight 0.2). Rostou s temple_level." },
  { key: "warriors", label: "Válečníci", icon: "⚔️", color: "bg-red-600", role: "Vojenská třída — garnizóny a posily.", effects: "Bonus morálky garnizónu. Nezapočítávají se do active_pop. Rostou s garrison." },
];

const SETTLEMENT_THRESHOLDS = [
  { level: "HAMLET", label: "Osada", pop: 0, nextPop: 100 },
  { level: "VILLAGE", label: "Vesnice", pop: 100, nextPop: 500 },
  { level: "TOWNSHIP", label: "Městečko", pop: 500, nextPop: 2000 },
  { level: "TOWN", label: "Velké město", pop: 2000, nextPop: 8000 },
  { level: "CITY", label: "Město", pop: 8000, nextPop: 20000 },
  { level: "POLIS", label: "Polis", pop: 20000, nextPop: null },
];

const PopulationPanel = ({ cities, realm }: Props) => {
  const myCities = cities;
  const totalPop = myCities.reduce((s, c) => s + (c.population_total || 0), 0);

  const classTotals = CLASS_META.map(cls => ({
    ...cls,
    total: myCities.reduce((s, c) => s + (c[`population_${cls.key}`] || 0), 0),
  }));

  const avgBirth = myCities.length > 0 ? myCities.reduce((s, c) => s + (c.birth_rate || 0), 0) / myCities.length : 0;
  const avgDeath = myCities.length > 0 ? myCities.reduce((s, c) => s + (c.death_rate || 0), 0) / myCities.length : 0;
  const growthRate = avgBirth - avgDeath;
  const growthPerTurn = Math.round(totalPop * growthRate);

  // Settlement level counts and progress
  const settlementCounts = SETTLEMENT_THRESHOLDS.map(s => ({
    ...s,
    count: myCities.filter(c => c.settlement_level === s.level).length,
    cities: myCities.filter(c => c.settlement_level === s.level),
  }));

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" />
          Populace & demografie
          <span className="ml-auto font-mono font-bold text-lg">{totalPop.toLocaleString()}</span>
          <InfoTip>Populace je základ všeho. Růst = base_rate (1.2%) × food_surplus_mult × stability_mult × housing_mult. Třídní rozložení závisí na infrastruktuře města. Počítáno v process-turn.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-4">
        {/* Growth */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Růst/kolo:</span>
          {growthPerTurn > 0 ? (
            <span className="text-accent flex items-center gap-0.5 font-bold"><TrendingUp className="h-3 w-3" />+{growthPerTurn}</span>
          ) : growthPerTurn < 0 ? (
            <span className="text-destructive flex items-center gap-0.5 font-bold"><TrendingDown className="h-3 w-3" />{growthPerTurn}</span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />stagnace</span>
          )}
          <span className="text-muted-foreground ml-2">({(growthRate * 100).toFixed(2)}%)</span>
        </div>

        {/* Growth formula */}
        <div className="bg-muted/40 rounded-lg p-3 text-[10px] text-muted-foreground space-y-0.5">
          <div className="font-semibold text-foreground text-[11px]">Vzorec růstu populace:</div>
          <div>Růst = base_rate (1.2%) × food_surplus × stability × housing</div>
          <div>• food_surplus: 1.0 pokud zásoby {">"} 0, klesá při deficitu</div>
          <div>• stability: city_stability / 100 (pod 30% = silný pokles)</div>
          <div>• housing: min(1.0, housing_capacity / population)</div>
        </div>

        {/* Class breakdown */}
        <div className="space-y-2">
          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Třídní rozložení</h5>
          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            {classTotals.map(cls => {
              const pct = totalPop > 0 ? (cls.total / totalPop) * 100 : 0;
              return <div key={cls.key} className={`${cls.color} transition-all`} style={{ width: `${pct}%` }} title={`${cls.label} ${Math.round(pct)}%`} />;
            })}
          </div>
          {classTotals.map(cls => {
            const pct = totalPop > 0 ? Math.round((cls.total / totalPop) * 100) : 0;
            return (
              <div key={cls.key} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1">
                    {cls.icon} {cls.label}
                    <InfoTip side="right">{cls.role} {cls.effects}</InfoTip>
                  </span>
                  <span className="font-mono">{cls.total.toLocaleString()} <span className="text-muted-foreground">({pct}%)</span></span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Settlement levels WITH PROGRESS */}
        <div className="border-t border-border pt-3 space-y-2">
          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Úrovně sídel — postup</h5>
          {settlementCounts.filter(s => s.count > 0).map(s => (
            <div key={s.level} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">{s.label}</span>
                <Badge variant="secondary" className="text-[10px]">×{s.count}</Badge>
              </div>
              {/* Show each city's progress to next level */}
              {s.nextPop && s.cities.map(city => {
                const pop = city.population_total || 0;
                const progress = Math.min(100, (pop / s.nextPop!) * 100);
                return (
                  <div key={city.id} className="pl-2 space-y-0.5">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{city.name}</span>
                      <span className="font-mono">{pop.toLocaleString()} / {s.nextPop!.toLocaleString()}</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          ))}
          {/* Legend for all levels */}
          <div className="bg-muted/40 rounded-lg p-2.5 text-[10px] text-muted-foreground">
            <span className="font-semibold text-foreground">Prahy povýšení:</span>{" "}
            {SETTLEMENT_THRESHOLDS.map((s, i) => (
              <span key={s.level}>
                {s.label} ({s.pop}+){i < SETTLEMENT_THRESHOLDS.length - 1 ? " → " : ""}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PopulationPanel;
