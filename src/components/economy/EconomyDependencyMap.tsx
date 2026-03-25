import { InfoTip } from "@/components/ui/info-tip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, ArrowDown } from "lucide-react";

/**
 * Visual dependency map showing what affects what in the economy system.
 */
const EconomyDependencyMap = () => {
  const nodes = [
    {
      id: "pop",
      label: "👥 Populace",
      description: "Základ všeho. Roste birth_rate − death_rate. Dělí se na 4 třídy.",
      color: "bg-emerald-500/10 border-emerald-500/30",
      outputs: ["workforce", "supplies_demand", "prestige"],
    },
    {
      id: "workforce",
      label: "🔧 Pracovní síla",
      description: "= aktivní populace − vojáci. Přímo ovlivňuje produkci uzlů.",
      color: "bg-blue-500/10 border-blue-500/30",
      outputs: ["production"],
    },
    {
      id: "mobilization",
      label: "⚙️ Mobilizace",
      description: "% populace pod zbraněmi. Vyšší = méně pracovníků = penalizace produkce.",
      color: "bg-red-500/10 border-red-500/30",
      outputs: ["workforce", "military"],
    },
    {
      id: "production",
      label: "⚒️ Produkce",
      description: "Fyzický výstup uzlů. Závisí na typu uzlu, roli, izolaci a workforce.",
      color: "bg-amber-500/10 border-amber-500/30",
      outputs: ["wealth", "reserves"],
    },
    {
      id: "wealth",
      label: "💰 Bohatství",
      description: "Vzniká průchodem produkce přes trasy. Efektivita závisí na roli uzlu.",
      color: "bg-yellow-500/10 border-yellow-500/30",
      outputs: ["reserves", "prestige"],
    },
    {
      id: "supplies_demand",
      label: "🌾 Zásoby",
      description: "Spotřeba = pop × 0.006. Produkce závisí na rolnících a irrigation.",
      color: "bg-lime-500/10 border-lime-500/30",
      outputs: ["stability"],
    },
    {
      id: "stability",
      label: "🛡️ Stabilita",
      description: "Průměr city_stability. Klesá hladomorem, mobilizací. Pod 30% hrozí rebelie.",
      color: "bg-violet-500/10 border-violet-500/30",
      outputs: ["pop", "production"],
    },
    {
      id: "faith",
      label: "⛪ Víra",
      description: "Generována kleriky a chrámy. Bonus k morálce vojska a stabilitě měst.",
      color: "bg-purple-500/10 border-purple-500/30",
      outputs: ["stability", "prestige"],
    },
    {
      id: "strategic",
      label: "⚡ Strategické suroviny",
      description: "Access-based: 1 uzel = +1 tier (max 3). Odemykají jednotky a bonusy.",
      color: "bg-orange-500/10 border-orange-500/30",
      outputs: ["military", "production", "prestige"],
    },
    {
      id: "military",
      label: "⚔️ Vojsko",
      description: "Manpower z mobilizace. Spotřebovává wealth a zásoby na údržbu.",
      color: "bg-red-500/10 border-red-500/30",
      outputs: ["prestige"],
    },
    {
      id: "capacity",
      label: "🏛️ Kapacita",
      description: "Urbanizace + infrastruktura. Limit pro počet tras a stavebních projektů.",
      color: "bg-cyan-500/10 border-cyan-500/30",
      outputs: ["production", "wealth"],
    },
    {
      id: "prestige",
      label: "⭐ Prestiž",
      description: "Kompozitní ukazatel. 6 sub-typů. Milníky na 20/50/100/200 bodech.",
      color: "bg-yellow-500/10 border-yellow-500/30",
      outputs: [],
    },
  ];

  const connections: { from: string; to: string; label: string }[] = [
    { from: "pop", to: "workforce", label: "aktivní populace" },
    { from: "pop", to: "supplies_demand", label: "spotřeba jídla" },
    { from: "mobilization", to: "workforce", label: "snižuje (−)" },
    { from: "mobilization", to: "military", label: "zvyšuje manpower" },
    { from: "workforce", to: "production", label: "multiplikátor uzlů" },
    { from: "production", to: "wealth", label: "trade efficiency" },
    { from: "production", to: "reserves", label: "akumulace" },
    { from: "supplies_demand", to: "stability", label: "deficit → hladomor → −stabilita" },
    { from: "stability", to: "pop", label: "nízká → emigrace, rebelie" },
    { from: "stability", to: "production", label: "nízká → penalizace" },
    { from: "faith", to: "stability", label: "+bonus stabilita" },
    { from: "faith", to: "prestige", label: "+náboženská prestiž" },
    { from: "strategic", to: "military", label: "odemyká jednotky" },
    { from: "strategic", to: "production", label: "bonusy dle typu" },
    { from: "capacity", to: "production", label: "limit projektů" },
    { from: "capacity", to: "wealth", label: "limit tras" },
    { from: "military", to: "prestige", label: "+vojenská prestiž" },
    { from: "wealth", to: "prestige", label: "+ekonomická prestiž" },
  ];

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          🔗 Mapa závislostí ekonomiky
          <InfoTip>Ukazuje, jak jednotlivé ukazatele ovlivňují ostatní. Šipky značí směr vlivu. Zelené = pozitivní, červené = negativní/spotřeba.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {nodes.map(node => (
            <div
              key={node.id}
              className={`rounded-lg border p-3 text-xs space-y-1 ${node.color}`}
            >
              <div className="font-display font-bold text-sm">{node.label}</div>
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

        {/* Key relationships legend */}
        <div className="mt-4 border-t border-border pt-3 space-y-1.5">
          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Klíčové vztahy</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
            {connections.slice(0, 12).map((c, i) => {
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
