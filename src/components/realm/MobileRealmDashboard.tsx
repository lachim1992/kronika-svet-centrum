import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Crown, Castle, Users, Skull, Swords,
  AlertTriangle, TrendingUp, TrendingDown,
  RefreshCw, ChevronRight, Network, Church,
  MapPin, Eye,
} from "lucide-react";
import {
  MACRO_LAYER_ICONS,
  computeTotalPrestige, getPrestigeTier, PRESTIGE_TIER_LABELS,
} from "@/lib/economyFlow";
import { computeWorkforceBreakdown } from "@/lib/economyConstants";

const SETTLEMENT_LABELS: Record<string, string> = {
  HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis",
};

interface Props {
  realm: any;
  myCities: any[];
  capital: any;
  provinces: any[];
  nodeStats: any[];
  stacks: any[];
  activeWars: any[];
  famineCities: any[];
  isolatedNodes: any[];
  deficitNodes: any[];
  surplusNodes: any[];
  currentTurn: number;
  currentPlayerName: string;
  recomputing: boolean;
  onRecompute: () => void;
  onCityClick?: (type: string, id: string) => void;
  onTabChange?: (tab: string) => void;
  onFoundCity?: () => void;
}

const MobileRealmDashboard = ({
  realm, myCities, capital, provinces, nodeStats, stacks, activeWars,
  famineCities, isolatedNodes, deficitNodes, surplusNodes,
  currentTurn, currentPlayerName, recomputing,
  onRecompute, onCityClick, onTabChange, onFoundCity,
}: Props) => {
  const totalPop = myCities.reduce((s, c) => s + (c.population_total || 0), 0);
  const totalPower = stacks.reduce((s, st) => s + (st.power || 0), 0);
  const mobRate = realm?.mobilization_rate || 0.1;
  const wf = computeWorkforceBreakdown(myCities, mobRate);

  const totalProd = realm?.total_production ?? 0;
  const totalWealth = realm?.total_wealth ?? 0;
  const totalCap = realm?.total_capacity ?? 0;
  const grainReserve = realm?.grain_reserve ?? 0;
  const granCap = realm?.granary_capacity ?? 1;
  const grainNet = realm?.last_turn_grain_net ?? 0;
  const goldReserve = realm?.gold_reserve ?? 0;
  const faith = realm?.faith ?? 0;
  const totalPrestige = computeTotalPrestige(realm);
  const prestigeTier = getPrestigeTier(totalPrestige);

  const hasAlerts = famineCities.length > 0 || isolatedNodes.length > 0 || deficitNodes.length > 0 || activeWars.length > 0;

  return (
    <div className="space-y-3 pb-20 px-1">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-display font-bold">Moje říše</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/15 text-primary border-primary/25 font-display text-[10px] px-2 py-0.5">
            Rok {currentTurn}
          </Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRecompute} disabled={recomputing}>
            <RefreshCw className={`h-3.5 w-3.5 ${recomputing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ALERTS */}
      {hasAlerts && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 space-y-1.5">
          {activeWars.map((w: any) => (
            <div key={w.id} className="flex items-center gap-2 text-xs text-destructive">
              <Swords className="h-3.5 w-3.5 shrink-0" />
              <span className="font-semibold">Válka: {w.declaring_player === currentPlayerName ? w.target_player : w.declaring_player}</span>
            </div>
          ))}
          {famineCities.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <Skull className="h-3.5 w-3.5 shrink-0" />
              <span>{famineCities.length} sídel trpí hladomorem!</span>
            </div>
          )}
          {isolatedNodes.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{isolatedNodes.length} izolovaných uzlů</span>
            </div>
          )}
          {deficitNodes.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-foreground">
              <TrendingDown className="h-3.5 w-3.5 shrink-0" />
              <span>{deficitNodes.length} uzlů v deficitu</span>
            </div>
          )}
        </div>
      )}

      {/* CAPITAL CARD */}
      {capital ? (
        <div
          className="game-card p-3 active:bg-muted/30"
          onClick={() => onCityClick?.("city", capital.id)}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Castle className="h-4 w-4 text-primary shrink-0" />
                <span className="font-display font-bold text-sm truncate">{capital.name}</span>
                <span className="text-primary text-[10px]">★</span>
              </div>
              {capital.province && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3" />{capital.province}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-bold font-display">{(capital.population_total || 0).toLocaleString()}</div>
              <div className="text-[9px] text-muted-foreground">obyvatel</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="game-card p-4 text-center">
          <Castle className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-xs text-muted-foreground mb-2">Žádná sídla</p>
          <Button size="sm" className="text-xs" onClick={onFoundCity}>Založit osadu</Button>
        </div>
      )}

      {/* KEY METRICS GRID — 2×3 */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard icon={MACRO_LAYER_ICONS.production} label="Produkce" value={totalProd.toFixed(1)} />
        <MetricCard icon={MACRO_LAYER_ICONS.wealth} label="Bohatství" value={`${Math.round(goldReserve)}`} sub={`+${totalWealth.toFixed(0)}/k`} />
        <MetricCard icon="🌾" label="Zásoby" value={`${Math.round(grainReserve)}`} sub={`/${Math.round(granCap)}`} warning={grainReserve < 20} />
        <MetricCard icon={<Users className="h-3.5 w-3.5" />} label="Populace" value={totalPop.toLocaleString()} />
        <MetricCard icon={<Church className="h-3.5 w-3.5" />} label="Víra" value={Math.round(faith).toString()} />
        <MetricCard icon="⭐" label="Prestiž" value={Math.round(totalPrestige).toString()} sub={PRESTIGE_TIER_LABELS[prestigeTier]} />
      </div>

      {/* GRAIN BAR */}
      {realm && (
        <div className="game-card p-3 space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">🌾 Obilí</span>
            <span className={`font-semibold font-mono ${grainNet >= 0 ? "text-accent" : "text-destructive"}`}>
              {grainNet >= 0 ? "+" : ""}{grainNet}/kolo
            </span>
          </div>
          <Progress value={Math.min(100, (grainReserve / Math.max(1, granCap)) * 100)} className="h-2" />
        </div>
      )}

      {/* NODES SUMMARY */}
      <div className="game-card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Network className="h-4 w-4 text-primary" />
            <span className="text-xs font-display font-semibold">Uzly ({nodeStats.length})</span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-accent flex items-center gap-0.5">
              <TrendingUp className="h-2.5 w-2.5" />{surplusNodes.length}
            </span>
            <span className="text-destructive flex items-center gap-0.5">
              <TrendingDown className="h-2.5 w-2.5" />{deficitNodes.length}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
          <div className="bg-muted/40 rounded p-1.5">
            <div className="text-muted-foreground">Mob.</div>
            <div className="font-bold text-sm">{Math.round(mobRate * 100)}%</div>
          </div>
          <div className="bg-muted/40 rounded p-1.5">
            <div className="text-muted-foreground">Vojáci</div>
            <div className="font-bold text-sm">{wf.mobilized}</div>
          </div>
          <div className="bg-muted/40 rounded p-1.5">
            <div className="text-muted-foreground">Kapacita</div>
            <div className="font-bold text-sm">{totalCap.toFixed(0)}</div>
          </div>
        </div>
      </div>

      {/* CITIES LIST */}
      {myCities.length > 1 && (
        <div className="game-card p-0 overflow-hidden">
          <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
            <span className="text-xs font-display font-semibold">Sídla ({myCities.length})</span>
          </div>
          <div className="divide-y divide-border">
            {myCities.slice(0, 5).map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between px-3 py-2 active:bg-muted/40"
                onClick={() => onCityClick?.("city", c.id)}
              >
                <div className="min-w-0">
                  <span className="text-xs font-semibold flex items-center gap-1">
                    {c.name}
                    {c.is_capital && <span className="text-[8px] text-primary">★</span>}
                    {c.famine_turn && <Skull className="h-2.5 w-2.5 text-destructive" />}
                  </span>
                  <div className="text-[9px] text-muted-foreground">
                    {SETTLEMENT_LABELS[c.settlement_level] || c.settlement_level} · {(c.population_total || 0).toLocaleString()} ob.
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>
            ))}
            {myCities.length > 5 && (
              <div className="px-3 py-1.5 text-center text-[10px] text-muted-foreground">
                +{myCities.length - 5} dalších
              </div>
            )}
          </div>
        </div>
      )}

      {/* QUICK NAV */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="text-xs h-9 gap-1.5" onClick={() => onTabChange?.("worldmap")}>
          <Eye className="h-3.5 w-3.5" />Mapa
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-9 gap-1.5" onClick={() => onTabChange?.("army")}>
          <Swords className="h-3.5 w-3.5" />Armáda
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-9 gap-1.5" onClick={() => onTabChange?.("realm")}>
          <Castle className="h-3.5 w-3.5" />Správa
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-9 gap-1.5" onClick={() => onTabChange?.("council")}>
          <Crown className="h-3.5 w-3.5" />Rada
        </Button>
      </div>
    </div>
  );
};

/* ─── Small metric card ─── */
function MetricCard({
  icon, label, value, sub, warning,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; warning?: boolean;
}) {
  return (
    <div className={`game-card p-2.5 text-center ${warning ? "border-destructive/30 bg-destructive/5" : ""}`}>
      <div className="flex items-center justify-center gap-1 mb-0.5">
        {typeof icon === "string" ? <span className="text-sm">{icon}</span> : <span className="text-primary">{icon}</span>}
      </div>
      <div className={`text-base font-bold font-display leading-none ${warning ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="text-[8px] text-muted-foreground mt-0.5">{sub}</div>}
      <div className="text-[8px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

export default MobileRealmDashboard;
