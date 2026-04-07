import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { TRADE_IDEOLOGIES, type TradeIdeologyDef } from "@/lib/goodsCatalog";
import { getWealthBreakdown } from "@/lib/economyFlow";

interface Props {
  realm: any;
  sessionId?: string;
  playerName?: string;
  onRefetch?: () => void;
}

const FiscalSubTab = ({ realm, sessionId, playerName, onRefetch }: Props) => {
  const [switching, setSwitching] = useState(false);

  const wb = getWealthBreakdown(realm);
  const goldReserve = realm?.gold_reserve ?? 0;
  const ideology = realm?.trade_ideology || "balanced";
  const retention = realm?.commercial_retention ?? 0;
  const capture = realm?.commercial_capture ?? 0;

  // Goods fiscal sub-detail
  const taxMarket = realm?.tax_market ?? 0;
  const taxTransit = realm?.tax_transit ?? 0;
  const taxExtraction = realm?.tax_extraction ?? 0;
  const captureVal = realm?.commercial_capture ?? 0;

  const idData = TRADE_IDEOLOGIES.find((t: TradeIdeologyDef) => t.key === ideology) || TRADE_IDEOLOGIES[0];
  const flow_multiplier = idData.merchantFlowMult;
  const tariff_base = idData.tariffBase;
  const domestic_retention_bonus = ideology === "crown_mercantile" ? 0.15 : ideology === "guild_chartered" ? 0.10 : ideology === "palace_commanded" ? 0.20 : 0;

  const maxPillar = Math.max(wb.popTax, wb.domesticMarket, wb.goodsFiscal, wb.routeCommerce, 1);

  const handleIdeologySwitch = async (newIdeology: string) => {
    if (!sessionId || !playerName || newIdeology === ideology) return;
    setSwitching(true);
    try {
      await supabase.from("realm_resources").update({
        trade_ideology: newIdeology,
      }).eq("session_id", sessionId).eq("player_name", playerName);
      toast.success(`Obchodní ideologie změněna na "${TRADE_IDEOLOGIES.find(t => t.key === newIdeology)?.label}"`);
      onRefetch?.();
    } catch (e: any) {
      toast.error("Chyba při změně ideologie");
    } finally {
      setSwitching(false);
    }
  };

  const pillars = [
    {
      icon: "👥", label: "Populační daň", value: wb.popTax,
      desc: "Flat odvod z populace a městské vrstvy (burghers × koeficient × strategické bonusy)",
      color: "bg-emerald-500",
    },
    {
      icon: "🏪", label: "Domácí trh", value: wb.domesticMarket,
      desc: "Wealth realizovaný z centralizovaného produkčního toku (capital market mechanism × realization rate)",
      color: "bg-blue-500",
    },
    {
      icon: "📦", label: "Goods fiskál", value: wb.goodsFiscal,
      desc: "Přímé daně z goods pipeline: tržní + tranzitní + extrakční daň + export capture",
      color: "bg-amber-500",
      subDetail: [
        { label: "Tržní daň", value: taxMarket },
        { label: "Tranzitní daň", value: taxTransit },
        { label: "Extrakční daň", value: taxExtraction },
        { label: "Export capture", value: captureVal },
      ],
    },
    {
      icon: "🛤️", label: "Koridorový obchod", value: wb.routeCommerce,
      desc: "Sekundární wealth z objemu kontrolovaných obchodních tras — služby, sklady, karavany",
      color: "bg-purple-500",
    },
  ];

  const expenses = [
    { icon: "⚔️", label: "Armádní upkeep", value: wb.armyUpkeep },
    { icon: "🏛️", label: "Mýtné / správa", value: wb.tolls },
    { icon: "🏟️", label: "Sport funding", value: wb.sportFunding },
  ].filter(e => e.value > 0);

  return (
    <div className="space-y-4">
      {/* INCOME */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            🏛️ Fiskální přehled — Příjmy
            <InfoTip>4 pilíře wealth: populační daň, domácí trh, goods fiskál, koridorový obchod. Každý pilíř má jinou ekonomickou logiku vzniku.</InfoTip>
            <span className="ml-auto font-mono font-bold text-xl text-primary">+{wb.totalIncome.toFixed(1)} /kolo</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 space-y-3">
          {pillars.map(p => (
            <div key={p.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold flex items-center gap-1">
                  {p.icon} {p.label}
                  <InfoTip side="right">{p.desc}</InfoTip>
                </span>
                <span className="font-mono font-bold">+{p.value.toFixed(1)}</span>
              </div>
              <Progress value={Math.min(100, (p.value / maxPillar) * 100)} className="h-1.5" />
              {p.subDetail && (
                <div className="pl-6 space-y-0.5">
                  {p.subDetail.map(sd => (
                    <div key={sd.label} className="flex justify-between text-[10px] text-muted-foreground">
                      <span>• {sd.label}</span>
                      <span className="font-mono">{sd.value.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* EXPENSES */}
      {expenses.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              📉 Výdaje
              <span className="ml-auto font-mono font-bold text-destructive">-{wb.totalExpenses.toFixed(1)} /kolo</span>
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
            <span className={`text-xl font-bold font-mono ${wb.netChange >= 0 ? "text-primary" : "text-destructive"}`}>
              {wb.netChange >= 0 ? "+" : ""}{wb.netChange.toFixed(1)} /kolo
            </span>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">🏦 Pokladna</span>
            <span className="text-2xl font-bold font-mono text-primary">{Math.round(goldReserve)} 💰</span>
          </div>
        </CardContent>
      </Card>

      {/* Retention & Capture */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              🏠 Commercial Retention
              <InfoTip>Podíl domácí poptávky naplněné vlastní produkcí. Vyšší = silnější domácí ekonomika.</InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            <div className="text-3xl font-bold font-mono text-primary">{(retention * 100).toFixed(0)}%</div>
            <Progress value={retention * 100} className="h-2" />
            <p className="text-[10px] text-muted-foreground">
              {retention > 0.7 ? "✅ Silná domácí soběstačnost" : retention > 0.4 ? "⚠️ Střední závislost na importu" : "🔴 Vysoká importní závislost"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              🎯 Commercial Capture
              <InfoTip>Podíl cizí poptávky naplněné vaším exportem. Zdroj exportního příjmu a prestiže.</InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            <div className="text-3xl font-bold font-mono text-primary">{(capture * 100).toFixed(0)}%</div>
            <Progress value={capture * 100} className="h-2" />
            <p className="text-[10px] text-muted-foreground">
              {capture > 0.3 ? "✅ Silný exportér" : capture > 0.1 ? "⚠️ Mírný export" : "Minimální exportní síla"}
            </p>
          </CardContent>
        </Card>
      </div>

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
