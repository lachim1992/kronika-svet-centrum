import EconomyFieldList from "./EconomyFieldList";
import { PRODUCER_COST_FIELDS, type ProducerCostRecord } from "@/lib/economyFieldContract";

/** Both views format the same persisted margin, never recompute costs or cash settlement. */
export default function ProducerCostDetails({ margin, showSource = false }: {
  margin: ProducerCostRecord | null | undefined; showSource?: boolean;
}) {
  return <div className="space-y-2">
    <EconomyFieldList row={margin} fields={PRODUCER_COST_FIELDS} showSource={showSource} />
    <p className="text-xs text-muted-foreground">Ocenění spotřebovaných vstupů a odhad mezd; nikoli přehled hotovostních plateb. Režie, odpisy budov a daně výrobce: nedostupné.</p>
  </div>;
}