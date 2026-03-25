import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import {
  PRESTIGE_COMPONENTS, PRESTIGE_META, PRESTIGE_TIER_LABELS,
  computeTotalPrestige, getPrestigeTier,
  type PrestigeComponent,
} from "@/lib/economyFlow";

interface Props {
  realm: any;
}

const MILESTONE_THRESHOLDS = [
  { threshold: 5, label: "Lokální", bonus: "Jméno známé v regionu" },
  { threshold: 20, label: "Regionální", bonus: "+0.5% wealth, +1 diplomatický vliv" },
  { threshold: 50, label: "Kontinentální", bonus: "+1% wealth, +2 diplomatický vliv, event" },
  { threshold: 100, label: "Světová velmoc", bonus: "+2% wealth, +5 diplomatický vliv, titul" },
  { threshold: 200, label: "Legendární", bonus: "+5% wealth, +10 diplomatický vliv, unikátní bonus" },
];

const PrestigeBreakdown = ({ realm }: Props) => {
  const totalPrestige = computeTotalPrestige(realm);
  const tier = getPrestigeTier(totalPrestige);
  const nextMilestone = MILESTONE_THRESHOLDS.find(m => m.threshold > totalPrestige);
  const progressToNext = nextMilestone
    ? Math.min(100, (totalPrestige / nextMilestone.threshold) * 100)
    : 100;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          ⭐ Prestiž
          <Badge variant="secondary" className="text-[10px]">{PRESTIGE_TIER_LABELS[tier]}</Badge>
          <span className="ml-auto font-mono font-bold text-lg text-primary">{Math.round(totalPrestige)}</span>
          <InfoTip>Kompozitní ukazatel progresu říše. Součet 6 sub-typů. Plynulý bonus +0.1% wealth za každý bod. Milníky na 5/20/50/100/200 bodech odemykají tituly a speciální bonusy.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-4">
        {/* Progress to next milestone */}
        {nextMilestone && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Další milník: {nextMilestone.label} ({nextMilestone.threshold})</span>
              <span>{Math.round(totalPrestige)}/{nextMilestone.threshold}</span>
            </div>
            <Progress value={progressToNext} className="h-2" />
            <p className="text-[10px] text-muted-foreground">Bonus: {nextMilestone.bonus}</p>
          </div>
        )}

        {/* Sub-type breakdown */}
        <div className="space-y-2">
          {PRESTIGE_COMPONENTS.map(key => {
            const meta = PRESTIGE_META[key];
            const val = realm?.[meta.dbColumn] ?? 0;
            const maxForBar = Math.max(totalPrestige, 1);
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    {meta.icon} {meta.label}
                    <InfoTip side="right">{meta.description}</InfoTip>
                  </span>
                  <span className="font-mono font-bold">{Math.round(val)}</span>
                </div>
                <Progress value={totalPrestige > 0 ? (val / maxForBar) * 100 : 0} className="h-1.5" />
                <div className="flex flex-wrap gap-1">
                  {meta.sources.map((src, i) => (
                    <span key={i} className="text-[9px] bg-muted/60 rounded px-1.5 py-0.5 text-muted-foreground">
                      {src}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Milestones list */}
        <div className="border-t border-border pt-3 space-y-1.5">
          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Milníky prestiže</h5>
          {MILESTONE_THRESHOLDS.map(m => {
            const reached = totalPrestige >= m.threshold;
            return (
              <div key={m.threshold} className={`flex items-center gap-2 text-xs ${reached ? "text-foreground" : "text-muted-foreground"}`}>
                <span className={`w-4 text-center ${reached ? "text-primary" : ""}`}>
                  {reached ? "✓" : "○"}
                </span>
                <span className="font-semibold w-8">{m.threshold}</span>
                <span className={`font-medium ${reached ? "text-primary" : ""}`}>{m.label}</span>
                <span className="text-[10px] ml-auto">{m.bonus}</span>
              </div>
            );
          })}
        </div>

        {/* Continuous bonus */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs">
          <span className="font-semibold text-primary">Plynulý bonus:</span>{" "}
          <span className="text-muted-foreground">+{(totalPrestige * 0.1).toFixed(1)}% wealth (= {Math.round(totalPrestige)} × 0.1%)</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default PrestigeBreakdown;
