import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress } from "@/components/ui/progress";
import { TRADE_IDEOLOGIES, type TradeIdeologyDef } from "@/lib/goodsCatalog";

interface Props {
  realm: any;
}

const FiscalSubTab = ({ realm }: Props) => {
  const taxMarket = realm?.tax_market ?? 0;
  const taxTransit = realm?.tax_transit ?? 0;
  const taxExtraction = realm?.tax_extraction ?? 0;
  const popTax = realm?.total_wealth ?? 0; // legacy pop tax from wealth flow
  const capture = realm?.commercial_capture ?? 0;
  const retention = realm?.commercial_retention ?? 0;
  const ideology = realm?.trade_ideology || "balanced";
  const goldReserve = realm?.gold_reserve ?? 0;

  const totalFiscal = taxMarket + taxTransit + taxExtraction + popTax;
  const maxComponent = Math.max(taxMarket, taxTransit, taxExtraction, popTax, 1);

  const idData = TRADE_IDEOLOGIES.find((t: TradeIdeologyDef) => t.key === ideology) || TRADE_IDEOLOGIES[0];
  const flow_multiplier = idData.merchantFlowMult;
  const tariff_base = idData.tariffBase;
  const domestic_retention_bonus = ideology === "crown_mercantile" ? 0.15 : ideology === "guild_chartered" ? 0.10 : 0;

  const components = [
    { label: "👥 Population Tax", value: popTax, desc: "Odvod z populace a urbanizace (legacy wealth flow)", color: "bg-emerald-500" },
    { label: "🏪 Market Tax", value: taxMarket, desc: "Daň z objemu domácího obchodu na městských trzích", color: "bg-blue-500" },
    { label: "🚢 Transit Tax", value: taxTransit, desc: "Clo z průchozích obchodních toků přes huby a přístavy", color: "bg-amber-500" },
    { label: "⛏️ Extraction Tax", value: taxExtraction, desc: "Příjem z korunních dolů a monopolních source nodes", color: "bg-orange-500" },
  ];

  return (
    <div className="space-y-4">
      {/* Total fiscal */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            🏛️ Fiskální přehled
            <InfoTip>Celkový fiskální příjem = pop_tax + market_tax + transit_tax + extraction_tax + capture_bonus. Odvozeno z goods economy.</InfoTip>
            <span className="ml-auto font-mono font-bold text-xl text-primary">{totalFiscal.toFixed(1)} /kolo</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 space-y-3">
          {components.map(c => (
            <div key={c.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold flex items-center gap-1">
                  {c.label}
                  <InfoTip side="right">{c.desc}</InfoTip>
                </span>
                <span className="font-mono font-bold">{c.value.toFixed(1)}</span>
              </div>
              <Progress value={Math.min(100, (c.value / maxComponent) * 100)} className="h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Retention & Capture */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              🏠 Commercial Retention
              <InfoTip>Podíl domácí poptávky naplněné vlastní produkcí. Vyšší = silnější domácí ekonomika, menší importní závislost.</InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            <div className="text-3xl font-bold font-mono text-primary">{(retention * 100).toFixed(0)}%</div>
            <Progress value={retention * 100} className="h-2" />
            <p className="text-[10px] text-muted-foreground">
              {retention > 0.7 ? "✅ Silná domácí soběstačnost" : retention > 0.4 ? "⚠️ Střední závislost na importu" : "🔴 Vysoká importní závislost"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              🎯 Commercial Capture
              <InfoTip>Podíl cizí poptávky naplněné vaším exportem. Zdroj exportního příjmu a prestiže.</InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            <div className="text-3xl font-bold font-mono text-primary">{(capture * 100).toFixed(0)}%</div>
            <Progress value={capture * 100} className="h-2" />
            <p className="text-[10px] text-muted-foreground">
              {capture > 0.3 ? "✅ Silný exportér" : capture > 0.1 ? "⚠️ Mírný export" : "Minimální exportní síla"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trade ideology */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            📜 Obchodní ideologie: <span className="text-primary">{idData.label}</span>
            <InfoTip>Ideologie ovlivňuje multiplikátory obchodních toků, celní sazby a domácí retenci. Nastavuje se v realm_resources.trade_ideology.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Flow Mult</div>
              <div className="text-lg font-bold font-mono">{idData.flow_multiplier}×</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tariff Base</div>
              <div className="text-lg font-bold font-mono">{(idData.tariff_base * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Retention</div>
              <div className="text-lg font-bold font-mono">{idData.domestic_retention_bonus > 0 ? "+" : ""}{(idData.domestic_retention_bonus * 100).toFixed(0)}%</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reserves */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">🏦 Pokladna</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="text-3xl font-bold font-mono text-primary">{Math.round(goldReserve)} 💰</div>
          <p className="text-xs text-muted-foreground mt-1">
            Příjem: +{totalFiscal.toFixed(1)}/kolo | Odvozeno z goods economy + legacy wealth flow
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default FiscalSubTab;
