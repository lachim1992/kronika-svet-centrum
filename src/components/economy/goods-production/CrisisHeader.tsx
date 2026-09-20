import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { getBasketMeta } from "@/lib/goodsCatalog";
import { ALERT_BADGE, ALERT_ORDER, CLASS_LABEL } from "@/lib/demandClasses";
import type { BasketAgg } from "./types";

interface Props {
  baskets: BasketAgg[];
  onPick: (basketKey: string) => void;
}

const CrisisHeader = ({ baskets, onPick }: Props) => {
  const alerts = baskets
    .filter(b => b.demand > 0 && b.alert !== "none" && b.alert !== "info")
    .sort((a, b) => ALERT_ORDER.indexOf(a.alert) - ALERT_ORDER.indexOf(b.alert))
    .slice(0, 4);

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground text-center">
          ✅ Žádné akutní problémy. Potřeby jsou pokryté a provoz nemá úzké hrdlo.
        </CardContent>
      </Card>
    );
  }

  const worst = alerts[0].alert;
  const critical = worst === "P0" || worst === "P1";

  return (
    <Card className={critical ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}>
      <CardContent className="p-4 space-y-2">
        <div className={`flex items-center gap-2 text-xs font-display font-semibold uppercase tracking-wide ${critical ? "text-destructive" : "text-amber-600"}`}>
          <AlertTriangle className="h-3.5 w-3.5" />
          {critical ? "Nedostatek potřeb" : "Úzká hrdla provozu"}
        </div>
        <div className="space-y-1.5">
          {alerts.map(b => {
            const m = getBasketMeta(b.key);
            const covPct = Math.round(b.coverage * 100);
            return (
              <div
                key={b.key}
                className="flex items-center justify-between gap-2 rounded-lg bg-card/60 px-3 py-2 border border-border/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className={`text-[9px] ${ALERT_BADGE[b.alert]}`}>
                    {b.alert.toUpperCase()}
                  </Badge>
                  <span className="text-sm">{m.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {CLASS_LABEL[b.demandClass]} · {b.effect || `krytí ${covPct} %`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className={`text-sm font-mono font-bold ${covPct < 50 ? "text-destructive" : covPct < 80 ? "text-amber-500" : "text-primary"}`}>
                      {covPct} %
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      −{b.unmet.toFixed(1)} · {b.cityCount} měst
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onPick(b.key)}>
                    Řešit
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default CrisisHeader;
