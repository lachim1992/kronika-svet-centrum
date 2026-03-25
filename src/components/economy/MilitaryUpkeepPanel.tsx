import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
import { computeArmyGoldUpkeep, computeArmyFoodUpkeep } from "@/lib/economyConstants";

interface Props {
  armies: any[];
  realm: any;
}

const MilitaryUpkeepPanel = ({ armies, realm }: Props) => {
  const goldUpkeep = computeArmyGoldUpkeep(armies);
  const foodUpkeep = computeArmyFoodUpkeep(armies);
  const totalManpower = armies.reduce((s, stack) => {
    const mp = (stack.military_stack_composition || [])
      .reduce((sum: number, c: any) => sum + (c.manpower ?? 0), 0);
    return s + mp;
  }, 0);
  const mobRate = Math.round((realm?.mobilization_rate || 0) * 100);

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          ⚔️ Vojenská údržba
          <InfoTip>
            Armáda spotřebovává bohatství a zásoby každé kolo. Zlatá údržba = 1 gold / 100 vojáků. Potravinová údržba = 1 food / 500 vojáků. Vysoká mobilizace ({">"}15%) penalizuje produkci uzlů.
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-muted/40 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Vojáci</div>
            <div className="text-xl font-bold font-display">{totalManpower.toLocaleString()}</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">💰 Údržba</div>
            <div className="text-xl font-bold font-display text-destructive">-{goldUpkeep}</div>
            <div className="text-[10px] text-muted-foreground">gold/kolo</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">🌾 Spotřeba</div>
            <div className="text-xl font-bold font-display text-destructive">-{foodUpkeep}</div>
            <div className="text-[10px] text-muted-foreground">zásoby/kolo</div>
          </div>
        </div>

        {/* Mobilization effect */}
        <div className="bg-muted/40 rounded-lg p-3 text-[10px] text-muted-foreground space-y-0.5">
          <div className="font-semibold text-foreground text-[11px]">Vzorce údržby:</div>
          <div>• Zlatá údržba = ⌈manpower / 100⌉ gold za kolo</div>
          <div>• Potravinová údržba = ⌈manpower / 500⌉ zásob za kolo</div>
          <div>• Mobilizace {mobRate}% — nad 15% penalizuje produkci uzlů progresivně</div>
          <div>• Penalizace = (mob_rate − max_mob) × 2 (max 80%)</div>
        </div>

        {armies.length > 0 && (
          <div className="border-t border-border pt-3 space-y-1.5">
            <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Armádní svazy ({armies.length})</h5>
            {armies.slice(0, 5).map((stack, i) => {
              const mp = (stack.military_stack_composition || [])
                .reduce((sum: number, c: any) => sum + (c.manpower ?? 0), 0);
              return (
                <div key={stack.id || i} className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{stack.name || `Svaz #${i + 1}`}</span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>👥 {mp}</span>
                    <span className="text-destructive">-{Math.ceil(mp / 100)} 💰</span>
                    <span className="text-destructive">-{Math.ceil(mp / 500)} 🌾</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MilitaryUpkeepPanel;
