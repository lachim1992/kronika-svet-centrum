// ProductionOverviewCard — primary "what realm produces" KPI block.
// Two-layer model: realized (Goods v4.3) primary, infra raw output secondary (greyed).
// No fake utilization. Dev-mode-only semantic warning lives in NodeFlowBreakdown.

import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";

interface Props {
  realm: any;
}

const ProductionOverviewCard = ({ realm }: Props) => {
  if (!realm) return null;

  const goodsProd = Number(realm.goods_production_value ?? 0);
  const goodsWealth = Number(realm.goods_wealth_fiscal ?? 0);
  // realm.total_production aggregates province_nodes.production_output server-side.
  const infraRaw = Number(realm.total_production ?? 0);
  const infraWealth = Number(realm.total_wealth ?? 0);
  const fiscalCapture = goodsProd > 0 ? goodsWealth / goodsProd : 0;

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Produkce říše</h3>
        <InfoTip side="right">
          <b>Realizovaný tržní objem (HDP)</b> = co ekonomika skutečně produkuje a co
          trh absorbuje (Goods v4.3). Jediná kanonická hodnota.
          <br />
          <b>Infrastrukturní vstup</b> = surový výkon uzlů (province_nodes). Jiná
          vrstva i jednotka — nepoužívat jako „strop".
        </InfoTip>
        <Badge variant="outline" className="ml-auto text-[10px]">
          SSOT: realm_resources
        </Badge>
      </div>

      {/* Primary: realized */}
      <div className="rounded-lg border-2 border-accent/40 bg-accent/5 p-4">
        <div className="text-[10px] uppercase tracking-wider text-accent font-bold mb-1">
          📦 Realizovaný tržní objem (HDP)
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold font-display text-accent">
              {goodsProd.toFixed(1)}
            </div>
            <div className="text-[10px] text-muted-foreground">tržní objem / kolo</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-display">{goodsWealth.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground">fiskální výnos z goods</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-display text-primary">
              {Math.round(fiscalCapture * 100)}
              <span className="text-xs">%</span>
            </div>
            <div className="text-[10px] text-muted-foreground">fiskální záchyt</div>
          </div>
        </div>
      </div>

      {/* Secondary: infra raw output, greyed */}
      <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
          🏗️ Infrastrukturní vstup (node raw output)
          <span className="ml-2 normal-case font-normal text-muted-foreground/70">
            — kontextová hodnota, ne strop
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-muted-foreground">
          <div>
            <div className="text-sm font-semibold">{infraRaw.toFixed(1)}</div>
            <div className="text-[10px]">Σ node production</div>
          </div>
          <div>
            <div className="text-sm font-semibold">{infraWealth.toFixed(1)}</div>
            <div className="text-[10px]">Σ node wealth</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductionOverviewCard;
