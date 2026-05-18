import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { getBasketMeta } from "@/lib/goodsCatalog";
import type { BasketAgg } from "./types";

interface Props {
  baskets: BasketAgg[]; // already sorted worst-sat first
  onPick: (basketKey: string) => void;
}

function tierIcon(sat: number) {
  if (sat < 0.5) return "🔴";
  if (sat < 0.8) return "⚠️";
  return "✅";
}

const CrisisHeader = ({ baskets, onPick }: Props) => {
  const top = baskets.filter(b => b.demand > 0).slice(0, 3);
  if (top.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground text-center">
          ✅ Žádné kritické deficity. Hlavní baskety jsou nasycené.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs font-display font-semibold uppercase tracking-wide text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          Kritické deficity
        </div>
        <div className="space-y-1.5">
          {top.map(b => {
            const m = getBasketMeta(b.key);
            const satPct = Math.round(b.sat * 100);
            return (
              <div
                key={b.key}
                className="flex items-center justify-between gap-2 rounded-lg bg-card/60 px-3 py-2 border border-border/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{tierIcon(b.sat)}</span>
                  <span className="text-sm">{m.icon}</span>
                  <span className="text-sm font-semibold truncate">{m.label}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className={`text-sm font-mono font-bold ${
                      satPct < 50 ? "text-destructive" : satPct < 80 ? "text-amber-500" : "text-primary"
                    }`}>
                      {satPct}%
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      −{b.unmet.toFixed(0)} · {b.cityCount} měst
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]"
                    onClick={() => onPick(b.key)}>
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
