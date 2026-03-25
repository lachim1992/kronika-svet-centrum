import { InfoTip } from "@/components/ui/info-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { computeWorkforceBreakdown, computeArmyGoldUpkeep, computeArmyFoodUpkeep } from "@/lib/economyConstants";

interface Props {
  realm?: any;
  cities?: any[];
  armies?: any[];
}

const EconomyDependencyMap = ({ realm, cities = [], armies = [] }: Props) => {
  // Compute live values
  const totalPop = cities.reduce((s, c) => s + (c.population_total || 0), 0);
  const mobRate = realm?.mobilization_rate || 0.1;
  const wf = computeWorkforceBreakdown(cities, mobRate);
  const totalProduction = realm?.total_production ?? 0;
  const totalWealth = realm?.total_wealth ?? 0;
  const totalCapacity = realm?.total_capacity ?? 0;
  const faith = realm?.faith ?? 0;
  const grainReserve = realm?.grain_reserve ?? 0;
  const goldReserve = realm?.gold_reserve ?? 0;
  const armyGold = computeArmyGoldUpkeep(armies);
  const armyFood = computeArmyFoodUpkeep(armies);
  const avgStability = cities.length > 0
    ? Math.round(cities.reduce((s, c) => s + (c.city_stability || 50), 0) / cities.length)
    : 50;

  const nodes = [
    {
      id: "pop",
      label: "👥 Populace",
      value: totalPop.toLocaleString(),
      description: "Základ všeho. Roste birth_rate − death_rate. Dělí se na 4 třídy.",
      color: "bg-emerald-500/10 border-emerald-500/30",
      outputs: ["workforce", "supplies_demand", "prestige"],
    },
    {
      id: "workforce",
      label: "🔧 Pracovní síla",
      value: `${wf.workforce}`,
      description: "= aktivní populace − vojáci. Přímo ovlivňuje produkci uzlů.",
      color: "bg-blue-500/10 border-blue-500/30",
      outputs: ["production"],
    },
    {
      id: "mobilization",
      label: "⚙️ Mobilizace",
      value: `${Math.round(mobRate * 100)}%`,
      description: "% populace pod zbraněmi. Vyšší = méně pracovníků = penalizace produkce.",
      color: wf.isOverMob ? "bg-destructive/10 border-destructive/30" : "bg-red-500/10 border-red-500/30",
      outputs: ["workforce", "military"],
    },
    {
      id: "production",
      label: "⚒️ Produkce",
      value: totalProduction.toFixed(1),
      description: "Fyzický výstup uzlů. Závisí na typu uzlu, roli, izolaci a workforce.",
      color: "bg-amber-500/10 border-amber-500/30",
      outputs: ["wealth", "reserves"],
    },
    {
      id: "wealth",
      label: "💰 Bohatství",
      value: `${totalWealth.toFixed(1)}/kolo`,
      description: "Vzniká průchodem produkce přes trasy. Efektivita závisí na roli uzlu.",
      color: "bg-yellow-500/10 border-yellow-500/30",
      outputs: ["reserves", "prestige"],
    },
    {
      id: "supplies_demand",
      label: "🌾 Zásoby",
      value: `${Math.round(grainReserve)}`,
      description: `Spotřeba = pop × 0.006 = ~${Math.round(totalPop * 0.006)}/kolo. Rezerva: ${Math.round(grainReserve)}.`,
      color: grainReserve < totalPop * 0.006 ? "bg-destructive/10 border-destructive/30" : "bg-lime-500/10 border-lime-500/30",
      outputs: ["stability"],
    },
    {
      id: "stability",
      label: "🛡️ Stabilita",
      value: `${avgStability}%`,
      description: "Průměr city_stability. Klesá hladomorem, mobilizací. Pod 30% hrozí rebelie.",
      color: avgStability < 30 ? "bg-destructive/10 border-destructive/30" : avgStability < 50 ? "bg-amber-500/10 border-amber-500/30" : "bg-violet-500/10 border-violet-500/30",
      outputs: ["pop", "production"],
    },
    {
      id: "faith",
      label: "⛪ Víra",
      value: `${Math.round(faith)}`,
      description: "Generována kleriky a chrámy. Bonus k morálce vojska a stabilitě měst.",
      color: "bg-purple-500/10 border-purple-500/30",
      outputs: ["stability", "prestige"],
    },
    {
      id: "strategic",
      label: "⚡ Strategické suroviny",
      value: "",
      description: "Access-based: 1 uzel = +1 tier (max 3). Odemykají jednotky a bonusy.",
      color: "bg-orange-500/10 border-orange-500/30",
      outputs: ["military", "production", "prestige"],
    },
    {
      id: "military",
      label: "⚔️ Vojsko",
      value: `${wf.mobilized}`,
      description: `Manpower z mobilizace. Údržba: −${armyGold} 💰, −${armyFood} 🌾 za kolo.`,
      color: "bg-red-500/10 border-red-500/30",
      outputs: ["prestige"],
    },
    {
      id: "capacity",
      label: "🏛️ Kapacita",
      value: totalCapacity.toFixed(1),
      description: "Urbanizace + infrastruktura. Limit pro počet tras a stavebních projektů.",
      color: "bg-cyan-500/10 border-cyan-500/30",
      outputs: ["production", "wealth"],
    },
    {
      id: "reserves",
      label: "🏦 Rezervy",
      value: `${Math.round(goldReserve)} 💰`,
      description: `Pokladna: ${Math.round(goldReserve)} gold, Produkce: ${Math.round(realm?.production_reserve || 0)}. Příjem − údržba.`,
      color: "bg-emerald-500/10 border-emerald-500/30",
      outputs: [],
    },
    {
      id: "prestige",
      label: "⭐ Prestiž",
      value: "",
      description: "Kompozitní ukazatel. 6 sub-typů. Milníky na 20/50/100/200 bodech.",
      color: "bg-yellow-500/10 border-yellow-500/30",
      outputs: [],
    },
  ];

  const connections: { from: string; to: string; label: string }[] = [
    { from: "pop", to: "workforce", label: "aktivní populace" },
    { from: "pop", to: "supplies_demand", label: `spotřeba ~${Math.round(totalPop * 0.006)}/kolo` },
    { from: "mobilization", to: "workforce", label: `−${wf.mobilized} vojáků` },
    { from: "mobilization", to: "military", label: "zvyšuje manpower" },
    { from: "workforce", to: "production", label: `efekt. ratio ${(wf.effectiveWorkforceRatio * 100).toFixed(0)}%` },
    { from: "production", to: "wealth", label: "trade efficiency" },
    { from: "production", to: "reserves", label: "akumulace" },
    { from: "supplies_demand", to: "stability", label: "deficit → hladomor → −stabilita" },
    { from: "stability", to: "pop", label: "nízká → emigrace, rebelie" },
    { from: "stability", to: "production", label: "nízká → penalizace" },
    { from: "faith", to: "stability", label: `+${(faith * 0.2).toFixed(1)}% stabilita` },
    { from: "faith", to: "prestige", label: "+náboženská prestiž" },
    { from: "strategic", to: "military", label: "odemyká jednotky" },
    { from: "strategic", to: "production", label: "bonusy dle typu" },
    { from: "capacity", to: "production", label: "limit projektů" },
    { from: "capacity", to: "wealth", label: "limit tras" },
    { from: "military", to: "prestige", label: "+vojenská prestiž" },
    { from: "wealth", to: "prestige", label: "+ekonomická prestiž" },
    { from: "wealth", to: "reserves", label: `+${totalWealth.toFixed(1)}/kolo` },
    { from: "military", to: "reserves", label: `−${armyGold} 💰/kolo` },
  ];

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          🔗 Mapa závislostí — živé hodnoty
          <InfoTip>Ukazuje, jak jednotlivé ukazatele ovlivňují ostatní s vašimi aktuálními hodnotami. Šipky značí směr vlivu.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {nodes.map(node => (
            <div
              key={node.id}
              className={`rounded-lg border p-3 text-xs space-y-1 ${node.color}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-sm">{node.label}</span>
                {node.value && (
                  <span className="font-mono font-bold text-primary text-sm">{node.value}</span>
                )}
              </div>
              <p className="text-muted-foreground leading-relaxed">{node.description}</p>
              {node.outputs.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  {node.outputs.map(o => {
                    const target = nodes.find(n => n.id === o);
                    return (
                      <span key={o} className="text-[10px] bg-muted/60 rounded px-1.5 py-0.5 font-medium">
                        {target?.label.split(" ").slice(1).join(" ") || o}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Key relationships with live data */}
        <div className="mt-4 border-t border-border pt-3 space-y-1.5">
          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Klíčové vztahy (živá data)</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
            {connections.map((c, i) => {
              const fromNode = nodes.find(n => n.id === c.from);
              const toNode = nodes.find(n => n.id === c.to);
              return (
                <div key={i} className="flex items-center gap-1 text-muted-foreground">
                  <span className="font-medium text-foreground">{fromNode?.label.split(" ")[0]}</span>
                  <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                  <span className="font-medium text-foreground">{toNode?.label.split(" ")[0] || c.to}</span>
                  <span className="text-[10px]">({c.label})</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EconomyDependencyMap;
