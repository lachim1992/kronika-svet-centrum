import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress } from "@/components/ui/progress";
import { getEconomicActivity, getMarketPosition } from "@/lib/economyFlow";

interface Props {
  realm: any;
}

const MarketPerformancePanel = ({ realm }: Props) => {
  const activity = getEconomicActivity(realm);
  const position = getMarketPosition(realm);

  const maxVal = Math.max(activity.domesticActivity, position.exportPosition, 1);

  const retentionStatus = activity.internalRetentionPct > 0.7
    ? { text: "✅ Silná domácí soběstačnost", color: "text-emerald-500" }
    : activity.internalRetentionPct > 0.4
    ? { text: "⚠️ Střední závislost na importu", color: "text-amber-500" }
    : { text: "🔴 Vysoká importní závislost", color: "text-destructive" };

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          📈 Tržní výkon
          <InfoTip>Tyto ukazatele neznamenají příjem pokladny. Popisují sílu a vitalitu trhu.</InfoTip>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Ekonomická aktivita a obchodní pozice — determinanty budoucího státního příjmu
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-4">
        {/* Domestic Activity */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold flex items-center gap-1">
              🏠 Domácí ekonomická aktivita
              <InfoTip side="right">Velikost interně uspokojené poptávky. Není to příjem pokladny.</InfoTip>
            </span>
            <span className="font-mono font-bold">{activity.domesticActivity.toFixed(1)}</span>
          </div>
          <Progress value={Math.min(100, (activity.domesticActivity / maxVal) * 100)} className="h-1.5" />
        </div>

        {/* Export Position */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold flex items-center gap-1">
              📈 Exportní tržní pozice
              <InfoTip side="right">Obchodní síla na globálním trhu. Determinuje budoucí exportní příjmy.</InfoTip>
            </span>
            <span className="font-mono font-bold">{position.exportPosition.toFixed(1)}</span>
          </div>
          <Progress value={Math.min(100, (position.exportPosition / maxVal) * 100)} className="h-1.5" />
        </div>

        {/* Internal Retention */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold flex items-center gap-1">
              🏠 Internal Retention
              <InfoTip side="right">Podíl domácí ekonomické aktivity, který zůstává interně pokrytý místo odtékání ven.</InfoTip>
            </span>
            <span className="font-mono font-bold">{(activity.internalRetentionPct * 100).toFixed(0)}%</span>
          </div>
          <Progress value={activity.internalRetentionPct * 100} className="h-1.5" />
          <p className={`text-[10px] ${retentionStatus.color}`}>
            {retentionStatus.text}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default MarketPerformancePanel;