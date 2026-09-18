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

  // v6 fiscal model — MUST mirror process-turn/index.ts (sole fiscal writer).
  // fiscal_revenue = popTax + domesticMarket + goodsFiscal
  // Each tax has its own base: Revenue = Base × rate × Laffer(rate) × Governance
  const pillars = [
    { icon: "👥", label: "Populační daň", value: fi.popTax,         desc: "Základ: populace + městská vrstva. Poll-tax a daň z bohatství měst." },
    { icon: "🏛️", label: "Domácí trh",    value: fi.domesticMarket, desc: "Základ: domácí HDP (domestic_tax_base) × sazba × Lafferova křivka × správa." },
    { icon: "📦", label: "Daně ze zboží", value: fi.goodsFiscal,    desc: "Souhrn tržní, tranzitní a extrakční daně z obchodního základu." },
  ];

  const goodsBreakdown = [
    { icon: "🏪", label: "Tržní daň",     value: fi.marketTariff },
    { icon: "🚚", label: "Tranzitní daň", value: fi.transitToll },
    { icon: "⛏️", label: "Extrakční daň", value: fi.extractionTax },
  ].filter(g => g.value > 0);

  // Tax bases — five separate bases, canonical from process-turn
  const taxBases = [
    { icon: "🏛️", label: "Domácí základ",    value: fi.taxBases.domestic },
    { icon: "🏪", label: "Tržní základ",     value: fi.taxBases.market },
    { icon: "🚚", label: "Tranzitní základ", value: fi.taxBases.transit },
    { icon: "⛏️", label: "Extrakční základ", value: fi.taxBases.extraction },
    { icon: "👥", label: "Populační základ", value: fi.taxBases.poll },
  ];

  // Pillar 1 transparency — poll-tax vs city-wealth tax
  const totalPopulation = Number(realm?.total_population ?? 0);
  const POLL_TAX_PER_CAPITA = 0.002;
  const pollTaxRaw = totalPopulation * POLL_TAX_PER_CAPITA;
  const cityWealthTaxRaw = Math.max(0, fi.popTax - pollTaxRaw * (1 + (Number(realm?.tax_rate_modifier ?? 0) / 100)));


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

          {/* Pillar 1 transparency */}
          <div className="pt-2 mt-2 border-t border-border/30 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Rozklad pilíře „Populační daň"
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground pl-3">
              <span>👥 Poll-tax (populace × 0,2 %)</span>
              <span className="font-mono">{pollTaxRaw.toFixed(1)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground pl-3">
              <span>🏛️ Daň z city wealth (layers.wealth)</span>
              <span className="font-mono">{cityWealthTaxRaw.toFixed(1)}</span>
            </div>
          </div>

          {/* Pillar 2 transparency */}
          <div className="pt-2 mt-2 border-t border-border/30 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              Rozklad pilíře „Domácí trh"
              <InfoTip side="right">Vstupy z trade-flow solveru. Domácí složka × 0,4 + tržní podíl × 0,6.</InfoTip>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground pl-3">
              <span>🏠 Domácí složka × 0,4</span>
              <span className="font-mono">{wealthDomesticComponent.toFixed(1)} → {(wealthDomesticComponent * PILLAR2_DOMESTIC_WEIGHT).toFixed(1)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground pl-3">
              <span>🌍 Tržní podíl × 0,6</span>
              <span className="font-mono">{wealthMarketShare.toFixed(1)} → {(wealthMarketShare * PILLAR2_MARKET_WEIGHT).toFixed(1)}</span>
            </div>
          </div>

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