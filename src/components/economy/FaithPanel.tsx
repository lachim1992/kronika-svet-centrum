import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  realm: any;
  cities: any[];
}

const FaithPanel = ({ realm, cities }: Props) => {
  const faith = realm?.faith ?? 0;
  const faithGrowth = realm?.faith_growth ?? 0;
  const totalClerics = cities.reduce((s, c) => s + (c.population_clerics || 0), 0);
  const totalTempleLevel = cities.reduce((s, c) => s + (c.temple_level || 0), 0);

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          ⛪ Víra
          <span className="ml-auto font-mono font-bold text-lg">{Math.round(faith)}</span>
          <InfoTip>Víra je generována kleriky a chrámy. Každý klerik přispívá ~0.01 víry/kolo. Každá úroveň chrámu přidává +0.5 víry/kolo. Víra zvyšuje morálku vojska (+0.5% za bod) a stabilitu měst (+0.2% za bod). Počítáno v process-turn.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Trend:</span>
          {faithGrowth > 0 ? (
            <span className="text-accent flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />+{faithGrowth.toFixed(1)}/kolo</span>
          ) : faithGrowth < 0 ? (
            <span className="text-destructive flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{faithGrowth.toFixed(1)}/kolo</span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />stabilní</span>
          )}
        </div>

        <div className="space-y-2 text-xs">
          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Zdroje víry</h5>
          <div className="flex justify-between">
            <span className="text-muted-foreground">📿 Klerici (celkem)</span>
            <span className="font-bold">{totalClerics} → +{(totalClerics * 0.01).toFixed(1)}/kolo</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">🏛️ Úrovně chrámů (celkem)</span>
            <span className="font-bold">{totalTempleLevel} → +{(totalTempleLevel * 0.5).toFixed(1)}/kolo</span>
          </div>
        </div>

        <div className="space-y-2 text-xs border-t border-border pt-3">
          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Efekty víry</h5>
          <div className="flex justify-between">
            <span className="text-muted-foreground">⚔️ Bonus morálka vojska</span>
            <span className="font-bold text-accent">+{(faith * 0.5).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">🛡️ Bonus stabilita měst</span>
            <span className="font-bold text-accent">+{(faith * 0.2).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">⭐ Příspěvek k prestiži</span>
            <span className="font-bold">přes kleriky a budovy</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FaithPanel;
