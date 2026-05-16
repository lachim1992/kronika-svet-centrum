// WorkforcePanel — extracted from EconomyTab Overview.
// Pure presentation; reads myCities + mobilization rate.

import { Users, AlertTriangle } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { computeWorkforceBreakdown } from "@/lib/economyConstants";

interface Props {
  cities: any[];
  mobilizationRate?: number;
}

const WorkforcePanel = ({ cities, mobilizationRate = 0.1 }: Props) => {
  const wf = computeWorkforceBreakdown(cities, mobilizationRate);
  const currentMob = Math.round(mobilizationRate * 100);

  return (
    <TooltipProvider>
      <div className="rounded-xl border border-border/40 bg-card/50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">Lidská síla</h3>
          <InfoTip side="right">
            Pracovní síla = celková populace − vojáci. Mobilizace nad 15 % způsobuje
            penalizaci produkce.
          </InfoTip>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: "Pracovní síla", value: wf.workforce, alert: false },
            { label: "Vojáci", value: wf.mobilized, alert: false },
            { label: "Mobilizace", value: `${currentMob}%`, alert: wf.isOverMob },
          ].map(w => (
            <div
              key={w.label}
              className={`rounded-lg p-3 ${w.alert ? "bg-destructive/10 border border-destructive/20" : "bg-muted/30"}`}
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                {w.label}
              </div>
              <div className={`text-xl font-bold font-display ${w.alert ? "text-destructive" : ""}`}>
                {w.value}
              </div>
            </div>
          ))}
        </div>
        {wf.isOverMob && (
          <div className="text-xs text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Překročena mobilizační hranice — produkce penalizována o{" "}
            {Math.round(wf.overMobPenalty * 100)} %
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default WorkforcePanel;
