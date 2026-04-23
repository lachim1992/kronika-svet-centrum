import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { dispatchCommand } from "@/lib/commands";

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

/**
 * Settlement upgrade requirements use the new civilizational economy:
 * - ⚒️ Produkce (production_reserve) = physical materials from peasant output
 * - 💰 Bohatství (gold_reserve) = financing from burgher/trade output
 * - 🏛️ Kapacita (total_capacity) = logistic/admin capacity (checked, not consumed)
 */
const UPGRADE_PATH: Record<string, { next: string; nextSettlement: string; requirements: (city: any, realm: any) => UpgradeRequirement[] }> = {
  HAMLET: {
    next: "Městečko",
    nextSettlement: "TOWNSHIP",
    requirements: (city, realm) => [
      { label: "Populace", met: (city.population_total || 0) >= 2000, current: `${city.population_total || 0}`, required: "2 000" },
      { label: "Stabilita", met: (city.city_stability || 70) >= 50, current: `${city.city_stability || 70}`, required: "50" },
      { label: "Sýpka", met: (city.local_grain_reserve || 0) >= 20, current: `${city.local_grain_reserve || 0}`, required: "20" },
      { label: "⚒️ Produkce", met: (realm?.production_reserve || 0) >= 30, current: `${realm?.production_reserve || 0}`, required: "30" },
      { label: "💰 Bohatství", met: (realm?.gold_reserve || 0) >= 30, current: `${realm?.gold_reserve || 0}`, required: "30" },
    ],
  },
  TOWNSHIP: {
    next: "Město",
    nextSettlement: "CITY",
    requirements: (city, realm) => [
      { label: "Populace", met: (city.population_total || 0) >= 5000, current: `${city.population_total || 0}`, required: "5 000" },
      { label: "Stabilita", met: (city.city_stability || 70) >= 60, current: `${city.city_stability || 70}`, required: "60" },
      { label: "Sýpka", met: (city.local_grain_reserve || 0) >= 50, current: `${city.local_grain_reserve || 0}`, required: "50" },
      { label: "⚒️ Produkce", met: (realm?.production_reserve || 0) >= 80, current: `${realm?.production_reserve || 0}`, required: "80" },
      { label: "💰 Bohatství", met: (realm?.gold_reserve || 0) >= 100, current: `${realm?.gold_reserve || 0}`, required: "100" },
      { label: "🏛️ Kapacita", met: (realm?.total_capacity || 0) >= 10, current: `${(realm?.total_capacity || 0).toFixed(0)}`, required: "10" },
    ],
  },
  CITY: {
    next: "Polis",
    nextSettlement: "POLIS",
    requirements: (city, realm) => [
      { label: "Populace", met: (city.population_total || 0) >= 15000, current: `${city.population_total || 0}`, required: "15 000" },
      { label: "Stabilita", met: (city.city_stability || 70) >= 70, current: `${city.city_stability || 70}`, required: "70" },
      { label: "⚒️ Produkce", met: (realm?.production_reserve || 0) >= 250, current: `${realm?.production_reserve || 0}`, required: "250" },
      { label: "💰 Bohatství", met: (realm?.gold_reserve || 0) >= 300, current: `${realm?.gold_reserve || 0}`, required: "300" },
      { label: "🏛️ Kapacita", met: (realm?.total_capacity || 0) >= 25, current: `${(realm?.total_capacity || 0).toFixed(0)}`, required: "25" },
      { label: "Prestiž", met: (realm?.prestige || 0) >= 50, current: `${realm?.prestige || 0}`, required: "50" },
    ],
  },
};

/** Cost deduction map: label → { field, amount } */
const COST_MAP: Record<string, string> = {
  "⚒️ Produkce": "production_reserve",
  "💰 Bohatství": "gold_reserve",
};

const SETTLEMENT_LABELS: Record<string, string> = { HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis" };

const SettlementUpgradePanel = ({ city, realm, sessionId, currentPlayerName, currentTurn, onRefetch }: Props) => {
  const upgrade = UPGRADE_PATH[city.settlement_level];
  if (!upgrade) return null;

  const requirements = upgrade.requirements(city, realm);
  const allMet = requirements.every(r => r.met);

  const handleUpgrade = async () => {
    if (!allMet) return;
    if (!sessionId || !currentPlayerName) {
      toast.error("Chybí kontext sezení.");
      return;
    }

    const costs: Record<string, number> = {};
    for (const req of requirements) {
      const field = COST_MAP[req.label];
      if (field) {
        costs[field] = parseInt(req.required.replace(/\s/g, ""), 10) || 0;
      }
    }

    const result = await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: currentPlayerName, type: "player" },
      commandType: "UPGRADE_SETTLEMENT",
      commandPayload: {
        cityId: city.id, cityName: city.name,
        nextLevel: upgrade.next, nextSettlement: upgrade.nextSettlement,
        costs,
        chronicleText: `Sídlo **${city.name}** bylo povýšeno na **${upgrade.next}**.`,
      },
    });

    if (!result.ok) {
      toast.error("Upgrade selhal: " + result.error);
      return;
    }

    toast.success(`${city.name} povýšeno na ${upgrade.next}!`);
    onRefetch?.();
  };

  return (
    <div className="game-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <ArrowUp className="h-4 w-4 text-primary" />
          Povýšení na {upgrade.next}
        </h3>
        <Badge variant="outline" className="text-xs">
          {SETTLEMENT_LABELS[city.settlement_level]} → {upgrade.next}
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
        Povýšit na {upgrade.next}
      </Button>
    </div>
  );
};

export default SettlementUpgradePanel;
