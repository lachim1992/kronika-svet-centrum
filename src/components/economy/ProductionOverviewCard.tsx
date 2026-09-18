// ProductionOverviewCard — Layer A → B → C chain, NOT two parallel economies.
//   🏗 Produkční potenciál (Layer A: total_production_capacity)
//   📦 Realizovaná produkce (Layer B: goods_production_value = auto + recipe + structures)
//   💰 Tržní hodnota / fiskální záchyt
//   🏛 Fiskální příjem z goods (Layer C)
// Never reads total_wealth (= alias fiskálního příjmu) nor node wealth_output (legacy).

import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
import { Package, ArrowRight } from "lucide-react";

interface Props {
  realm: any;
}

const ProductionOverviewCard = ({ realm }: Props) => {
  if (!realm) return null;

  // Layer A — potential (capacity), never a production number.
  const capacity = Number(realm.total_production_capacity ?? realm.total_production ?? 0);
  // Layer B — realized production (single canonical value, also total_gdp proxy).
  const goodsProd = Number(realm.goods_production_value ?? 0);
  const detail = (realm.goods_value_detail || {}) as Record<string, number>;
  const autoVal = Number(detail.auto ?? 0);
  const recipeVal = Number(detail.recipe ?? 0);
  const structVal = Number(detail.structures ?? 0);
  // Layer C — fiscal.
  const goodsWealth = Number(realm.goods_wealth_fiscal ?? 0);
  const fiscalCapture = goodsProd > 0 ? goodsWealth / goodsProd : 0;
  const utilization = capacity > 0 ? goodsProd / capacity : 0;
  // Trade (separate metric — NOT part of HDP).
  const exportGross = Number(realm.export_gross_value ?? 0);
  const domesticConsumption = Number(realm.goods_domestic_consumption_value ?? 0);
  const logistics = Number(realm.total_capacity ?? 0);

  const Step = ({
    icon, label, value, unit, accent, children,
  }: { icon: string; label: string; value: string; unit: string; accent?: boolean; children?: React.ReactNode }) => (
    <div className={`rounded-lg border p-3 ${accent ? "border-accent/40 bg-accent/5" : "border-border/40 bg-muted/20"}`}>
      <div className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${accent ? "text-accent" : "text-muted-foreground"}`}>
        {icon} {label}
      </div>
      <div className={`font-display font-bold ${accent ? "text-2xl text-accent" : "text-xl"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{unit}</div>
      {children}
    </div>
  );

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Produkce říše</h3>
        <InfoTip side="right">
          <b>Řetězec, ne dvě ekonomiky:</b> produkční potenciál (infrastruktura a
          geografie) omezuje specializovanou výrobu → skutečně vyrobené zboží je
          jediná kanonická produkce → z jeho tržní hodnoty vzniká fiskální příjem.
          <br />
          <b>Export</b> je obchodní metrika, ne další produkce — do HDP se nepřičítá.
        </InfoTip>
        <Badge variant="outline" className="ml-auto text-[10px]">SSOT: realm_resources</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-2 items-center">
        <Step icon="🏗️" label="Produkční potenciál" value={capacity.toFixed(1)} unit="kapacita uzlů (Layer A)">
          <div className="text-[10px] text-muted-foreground mt-1">
            využití {Math.round(utilization * 100)}%
          </div>
        </Step>
        <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground mx-auto" />
        <Step icon="📦" label="Realizovaná produkce" value={goodsProd.toFixed(1)} unit="hodnota vyrobeného zboží / kolo" accent>
          <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
            <div>domácnosti {autoVal.toFixed(1)}</div>
            <div>recepty {recipeVal.toFixed(1)}</div>
            <div>budovy a čtvrti {structVal.toFixed(1)}</div>
          </div>
        </Step>
        <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground mx-auto" />
        <Step icon="🏛️" label="Fiskální příjem z goods" value={goodsWealth.toFixed(1)} unit="zlato / kolo (Layer C)">
          <div className="text-[10px] text-muted-foreground mt-1">
            fiskální záchyt {Math.round(fiscalCapture * 100)}%
          </div>
        </Step>
      </div>

      <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          🚚 Trh &amp; obchod
          <span className="ml-2 normal-case font-normal text-muted-foreground/70">
            — samostatné metriky, nesčítají se s produkcí
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-muted-foreground">
          <div>
            <div className="text-sm font-semibold">{domesticConsumption.toFixed(1)}</div>
            <div className="text-[10px]">domácí spotřeba (uspokojená)</div>
          </div>
          <div>
            <div className="text-sm font-semibold">{exportGross.toFixed(1)}</div>
            <div className="text-[10px]">export (hrubá hodnota)</div>
          </div>
          <div>
            <div className="text-sm font-semibold">{logistics.toFixed(1)}</div>
            <div className="text-[10px]">dopravní kapacita</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductionOverviewCard;
