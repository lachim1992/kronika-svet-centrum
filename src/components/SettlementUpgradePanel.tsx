import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { dispatchCommand } from "@/lib/commands";
import { SETTLEMENT_UPGRADES, type SettlementUpgradeDefinition } from "../../supabase/functions/_shared/settlementUpgrades";

interface Props2 { sessionId?: string; currentPlayerName?: string; currentTurn?: number; }

interface UpgradeRequirement {
  label: string;
  met: boolean;
  current: string;
  required: string;
}

interface Props {
  city: any;
  realm: any;
  sessionId?: string;
  currentPlayerName?: string;
  currentTurn?: number;
  onRefetch?: () => void;
}

/** Display uses the same progression and prices as the authoritative command. */
const SETTLEMENT_LABELS: Record<string, string> = { HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis" };

function settlementRequirements(upgrade: SettlementUpgradeDefinition, city: any, realm: any): UpgradeRequirement[] {
  const requirements: UpgradeRequirement[] = [
    { label: "Populace", met: (city.population_total || 0) >= upgrade.population, current: `${city.population_total || 0}`, required: upgrade.population.toLocaleString("cs-CZ") },
    { label: "Stabilita", met: (city.city_stability || 70) >= upgrade.stability, current: `${city.city_stability || 70}`, required: `${upgrade.stability}` },
    { label: "⚒️ Produkce", met: (realm?.production_reserve || 0) >= upgrade.costProduction, current: `${realm?.production_reserve || 0}`, required: `${upgrade.costProduction}` },
    { label: "💰 Bohatství", met: (realm?.gold_reserve || 0) >= upgrade.costGold, current: `${realm?.gold_reserve || 0}`, required: `${upgrade.costGold}` },
  ];
  if (upgrade.grain > 0) requirements.splice(2, 0, { label: "Sýpka", met: (city.local_grain_reserve || 0) >= upgrade.grain, current: `${city.local_grain_reserve || 0}`, required: `${upgrade.grain}` });
  if (upgrade.capacity > 0) requirements.push({ label: "🏛️ Kapacita", met: (realm?.total_capacity || 0) >= upgrade.capacity, current: `${(realm?.total_capacity || 0).toFixed(0)}`, required: `${upgrade.capacity}` });
  if (upgrade.prestige > 0) requirements.push({ label: "Prestiž", met: (realm?.prestige || 0) >= upgrade.prestige, current: `${realm?.prestige || 0}`, required: `${upgrade.prestige}` });
  return requirements;
}

const SettlementUpgradePanel = ({ city, realm, sessionId, currentPlayerName, currentTurn, onRefetch }: Props) => {
  const upgrade = SETTLEMENT_UPGRADES[city.settlement_level];
  if (!upgrade) return null;

  const requirements = settlementRequirements(upgrade, city, realm);
  const allMet = requirements.every(r => r.met);

  const handleUpgrade = async () => {
    if (!allMet) return;
    if (!sessionId || !currentPlayerName) {
      toast.error("Chybí kontext sezení.");
      return;
    }

    const result = await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: currentPlayerName, type: "player" },
      commandType: "UPGRADE_SETTLEMENT",
      commandPayload: {
        cityId: city.id,
        chronicleText: `Sídlo **${city.name}** bylo povýšeno na **${upgrade.nextLabel}**.`,
      },
    });

    if (!result.ok) {
      toast.error("Upgrade selhal: " + result.error);
      return;
    }

    toast.success(`${city.name} povýšeno na ${upgrade.nextLabel}!`);
    onRefetch?.();
  };

  return (
    <div className="game-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <ArrowUp className="h-4 w-4 text-primary" />
          Povýšení na {upgrade.nextLabel}
        </h3>
        <Badge variant="outline" className="text-xs">
          {SETTLEMENT_LABELS[city.settlement_level]} → {upgrade.nextLabel}
        </Badge>
      </div>

      <div className="space-y-1.5">
        {requirements.map((req, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {req.met ? <Check className="h-3.5 w-3.5 text-success" /> : <X className="h-3.5 w-3.5 text-destructive" />}
              <span className={req.met ? "text-muted-foreground" : "text-foreground"}>{req.label}</span>
            </div>
            <span className={`text-xs font-mono ${req.met ? "text-success" : "text-destructive"}`}>
              {req.current} / {req.required}
            </span>
          </div>
        ))}
      </div>

      <Button
        size="sm" className="w-full"
        disabled={!allMet}
        onClick={handleUpgrade}
      >
        <ArrowUp className="h-3.5 w-3.5 mr-1" />
        Povýšit na {upgrade.nextLabel}
      </Button>
    </div>
  );
};

export default SettlementUpgradePanel;
