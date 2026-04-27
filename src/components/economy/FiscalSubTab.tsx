import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { TRADE_IDEOLOGIES, type TradeIdeologyDef } from "@/lib/goodsCatalog";
import { getFiscalIncome } from "@/lib/economyFlow";

interface Props {
  realm: any;
  sessionId?: string;
  playerName?: string;
  onRefetch?: () => void;
}

const FiscalSubTab = ({ realm, sessionId, playerName, onRefetch }: Props) => {
  const [switching, setSwitching] = useState(false);

  const fi = getFiscalIncome(realm);
  const goldReserve = realm?.gold_reserve ?? 0;
  const ideology = realm?.trade_ideology || "balanced";

  const idData = TRADE_IDEOLOGIES.find((t: TradeIdeologyDef) => t.key === ideology) || TRADE_IDEOLOGIES[0];
  const flow_multiplier = idData.merchantFlowMult;
  const tariff_base = idData.tariffBase;
  const domestic_retention_bonus = ideology === "crown_mercantile" ? 0.15 : ideology === "guild_chartered" ? 0.10 : ideology === "palace_commanded" ? 0.20 : 0;

  // 4-pillar wealth model — MUST mirror process-turn/index.ts.
  // The engine adds: gold_reserve += popTax + domesticMarket + goodsFiscal + routeCommerce
  // Each pillar is shown once; goodsFiscal sub-components are exposed as a breakdown
  // (informational only) so they don't double-count toward the total.
  const pillars = [
    { icon: "👥", label: "Populační daň", value: fi.popTax,         desc: "Pilíř 1: Flat odvod z populace a městské vrstvy." },
    { icon: "🏛️", label: "Domácí trh",    value: fi.domesticMarket, desc: "Pilíř 2: Tržní mechanismus z domácí spotřeby (domestic_component × 0,4 + market_share × 0,6)." },
    { icon: "📦", label: "Daně ze zboží", value: fi.goodsFiscal,    desc: "Pilíř 3: Souhrn daní z obchodu — tržní + tranzitní + extrakční + export capture." },
    { icon: "🛤️", label: "Koridorové mýto", value: fi.corridorTolls, desc: "Pilíř 4: Příjem z kontrolovaných obchodních tras (capacity × economic relevance × control)." },
  ];

  const goodsBreakdown = [
    { icon: "🏪", label: "Tržní daň",    value: fi.marketTax },
    { icon: "🚚", label: "Tranzitní daň", value: fi.transitTax },
    { icon: "⛏️", label: "Extrakční daň", value: fi.extractionTax },
    { icon: "🎯", label: "Export capture", value: fi.exportCapture },
  ];

  const maxRevenue = Math.max(...pillars.map(r => r.value), 1);

  const handleIdeologySwitch = async (newIdeology: string) => {
    if (!sessionId || !playerName || newIdeology === ideology) return;
    setSwitching(true);
    try {
      const { dispatchCommand } = await import("@/lib/commands");
      const result = await dispatchCommand({
        sessionId,
        actor: { name: playerName, type: "player" },
        commandType: "SET_TRADE_IDEOLOGY",
        commandPayload: { ideology: newIdeology },
      });
      if (!result.ok) throw new Error(result.error || "Unknown");
      toast.success(`Obchodní ideologie změněna na "${TRADE_IDEOLOGIES.find(t => t.key === newIdeology)?.label}"`);
      onRefetch?.();
    } catch (e: any) {
      toast.error("Chyba při změně ideologie: " + e.message);
    } finally {
      setSwitching(false);
    }
  };

  const expenses = [
    { icon: "⚔️", label: "Armádní upkeep", value: fi.armyUpkeep },
    { icon: "🏛️", label: "Mýtné / správa", value: fi.tolls },
    { icon: "🏟️", label: "Sport funding", value: fi.sportFunding },
  ].filter(e => e.value > 0);

  return (
    <div className="space-y-4">
      {/* REVENUE */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            🏛️ Příjmy státu
            <InfoTip>Skutečné příjmy pokladny — pouze daně, cla a capture z ekonomické aktivity.</InfoTip>
            <span className="ml-auto font-mono font-bold text-xl text-primary">+{fi.totalIncome.toFixed(1)} /kolo</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 space-y-3">
          {pillars.map(r => (
            <div key={r.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold flex items-center gap-1">
                  {r.icon} {r.label}
                  <InfoTip side="right">{r.desc}</InfoTip>
                </span>
                <span className="font-mono font-bold">+{r.value.toFixed(1)}</span>
              </div>
              <Progress value={Math.min(100, (r.value / maxRevenue) * 100)} className="h-1.5" />
            </div>
          ))}

          {/* Goods Fiscal breakdown — informational only, already counted in pillar 3 */}
          {fi.goodsFiscal > 0 && (
            <div className="pt-2 mt-2 border-t border-border/30 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                Rozklad pilíře „Daně ze zboží"
                <InfoTip side="right">Tyto čtyři položky jsou již zahrnuty v pilíři Daně ze zboží — nesčítají se znovu.</InfoTip>
              </div>
              {goodsBreakdown.map(g => (
                <div key={g.label} className="flex justify-between text-[11px] text-muted-foreground pl-3">
                  <span>{g.icon} {g.label}</span>
                  <span className="font-mono">{g.value.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pillar summary footer */}
          <div className="pt-2 border-t border-border/30 grid grid-cols-4 gap-2 text-[10px] text-muted-foreground">
            <div className="text-center">
              <div className="font-semibold text-foreground">{fi.popTax.toFixed(1)}</div>
              <div>Populace</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-foreground">{fi.domesticMarket.toFixed(1)}</div>
              <div>Domácí trh</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-foreground">{fi.goodsFiscal.toFixed(1)}</div>
              <div>Goods fiscal</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-foreground">{fi.corridorTolls.toFixed(1)}</div>
              <div>Trasy</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* EXPENSES */}
      {expenses.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              📉 Výdaje
              <span className="ml-auto font-mono font-bold text-destructive">-{fi.totalExpenses.toFixed(1)} /kolo</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            {expenses.map(e => (
              <div key={e.label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{e.icon} {e.label}</span>
                <span className="font-mono text-destructive">-{e.value.toFixed(1)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* NET + TREASURY */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">💰 Čistý přírůstek</span>
            <span className={`text-xl font-bold font-mono ${fi.netChange >= 0 ? "text-primary" : "text-destructive"}`}>
              {fi.netChange >= 0 ? "+" : ""}{fi.netChange.toFixed(1)} /kolo
            </span>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">🏦 Pokladna</span>
            <span className="text-2xl font-bold font-mono text-primary">{Math.round(goldReserve)} 💰</span>
          </div>
        </CardContent>
      </Card>

      {/* Trade ideology with switcher */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            📜 Obchodní ideologie
            <InfoTip>Ideologie ovlivňuje multiplikátory obchodních toků, celní sazby a domácí retenci. Změna platí od příštího kola.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Flow Mult</div>
              <div className="text-lg font-bold font-mono">{flow_multiplier}×</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tariff Base</div>
              <div className="text-lg font-bold font-mono">{(tariff_base * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Retention</div>
              <div className="text-lg font-bold font-mono">{domestic_retention_bonus > 0 ? "+" : ""}{(domestic_retention_bonus * 100).toFixed(0)}%</div>
            </div>
          </div>

          {sessionId && playerName && (
            <div className="space-y-2">
              <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Změnit ideologii</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TRADE_IDEOLOGIES.map((tid) => (
                  <Button
                    key={tid.key}
                    variant={tid.key === ideology ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-auto py-2 px-3 justify-start"
                    disabled={switching || tid.key === ideology}
                    onClick={() => handleIdeologySwitch(tid.key)}
                  >
                    <span className="mr-1.5">{tid.icon}</span>
                    <div className="text-left">
                      <div className="font-semibold">{tid.label}</div>
                      <div className="text-[9px] text-muted-foreground font-normal">{tid.description}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FiscalSubTab;