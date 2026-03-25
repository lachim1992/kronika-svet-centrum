import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface Props {
  realm: any;
  cities: any[];
  nodeStats: any[];
}

const CAPACITY_USES = [
  {
    label: "Aktivní stavební projekty",
    icon: "🏗️",
    compute: (cities: any[]) => cities.reduce((s, c) => s, 0), // placeholder
    limitFactor: 5,
    tip: "Každý rozpracovaný projekt spotřebovává 1 bod kapacity. Limit = total_capacity / 5.",
  },
  {
    label: "Obchodní trasy",
    icon: "🔄",
    limitFactor: 3,
    tip: "Každá aktivní obchodní dohoda spotřebovává 1 bod kapacity. Limit = total_capacity / 3.",
  },
  {
    label: "Správa provincií",
    icon: "🗺️",
    limitFactor: 10,
    tip: "Každá kontrolovaná provincie vyžaduje administrativní kapacitu. Limit = total_capacity / 10.",
  },
];

const CapacityPanel = ({ realm, cities, nodeStats }: Props) => {
  const totalCapacity = realm?.total_capacity ?? 0;
  const totalClerics = cities.reduce((s, c) => s + (c.population_clerics || 0), 0);
  const infraNodes = nodeStats.filter(n => n.node_type === "logistic_hub" || n.node_type === "trade_hub").length;

  // Sources breakdown
  const urbanizationContrib = cities.reduce((s, c) => {
    const level = c.settlement_level || "HAMLET";
    const base = level === "POLIS" ? 8 : level === "CITY" ? 5 : level === "TOWN" ? 3 : level === "TOWNSHIP" ? 2 : 1;
    return s + base;
  }, 0);
  const clericContrib = Math.round(totalClerics * 0.05 * 10) / 10;
  const infraContrib = infraNodes * 2;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          🏛️ Kapacita
          <span className="ml-auto font-mono font-bold text-lg">{totalCapacity.toFixed(1)}</span>
          <InfoTip>
            Kapacita = urbanizační úroveň sídel + infrastrukturní uzly + klerici. Představuje administrativní a logistickou schopnost vaší říše. Určuje kolik projektů, tras a provincií můžete efektivně spravovat.
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-4">
        {/* Sources */}
        <div className="space-y-2">
          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Zdroje kapacity</h5>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">🏘️ Urbanizace sídel</span>
              <span className="font-bold">+{urbanizationContrib}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">🛤️ Infrastrukturní uzly ({infraNodes})</span>
              <span className="font-bold">+{infraContrib}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">📿 Klerici ({totalClerics})</span>
              <span className="font-bold">+{clericContrib}</span>
            </div>
          </div>
        </div>

        {/* What capacity limits */}
        <div className="border-t border-border pt-3 space-y-2">
          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Co kapacita limituje</h5>
          {CAPACITY_USES.map(use => {
            const maxSlots = Math.max(1, Math.floor(totalCapacity / use.limitFactor));
            return (
              <div key={use.label} className="rounded-lg border border-border/50 p-2.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    {use.icon} {use.label}
                    <InfoTip side="right">{use.tip}</InfoTip>
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    max {maxSlots}
                  </Badge>
                </div>
                <Progress value={0} className="h-1.5" />
                <span className="text-[10px] text-muted-foreground">
                  Výpočet: {totalCapacity.toFixed(0)} / {use.limitFactor} = {maxSlots} slotů
                </span>
              </div>
            );
          })}
        </div>

        {/* Formula */}
        <div className="bg-muted/40 rounded-lg p-3 text-[10px] text-muted-foreground space-y-0.5">
          <div className="font-semibold text-foreground text-[11px]">Vzorec kapacity:</div>
          <div>Kapacita = Σ(urbanizace sídel) + Σ(infra uzly × 2) + Σ(klerici × 0.05)</div>
          <div>• HAMLET=1, TOWNSHIP=2, TOWN=3, CITY=5, POLIS=8</div>
          <div>• logistic_hub, trade_hub = +2 za uzel</div>
          <div>• Vyšší kapacita → více simultánních projektů a tras</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CapacityPanel;
