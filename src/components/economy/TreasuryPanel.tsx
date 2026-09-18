// ============================================================================
// TreasuryPanel — canonical treasury view (Integrity Pass closure, P1).
//
// NO parallel fiscal model here. Every income figure comes from
// `getFiscalIncome(realm)`, which mirrors process-turn (the sole writer of turn
// fiscal state). GDP is ONLY `realm.total_gdp` — never a sum of tax bases.
//
// Effective rate is derived (realized ÷ base), not recomputed from Laffer here.
// Over-threshold consequences list only what the engine actually applies:
// a legitimacy delta.
// ============================================================================

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import { Coins, TrendingDown, AlertTriangle, ShieldAlert, Scale } from "lucide-react";
import { getFiscalIncome } from "@/lib/economyFlow";

interface Props {
  realm: any;
}

const TreasuryPanel = ({ realm }: Props) => {
  if (!realm) return null;

  const fiscal = getFiscalIncome(realm);
  const legitimacy = Number(realm.legitimacy ?? 50);
  // Governance modifier as applied by process-turn: 0.5 + 0.5 × (legitimacy/100)
  const govMod = 0.5 + 0.5 * (Math.max(0, Math.min(100, legitimacy)) / 100);

  const PILLARS = [
    { key: "domestic",   label: "Domácí",  icon: "🏛️", max: 0.50, softThreshold: 0.30, base: fiscal.taxBases.domestic,   realized: fiscal.domesticMarket },
    { key: "market",     label: "Tržní",   icon: "🏪", max: 0.40, softThreshold: 0.24, base: fiscal.taxBases.market,     realized: fiscal.marketTariff },
    { key: "transit",    label: "Tranzit", icon: "🛤️", max: 0.30, softThreshold: 0.18, base: fiscal.taxBases.transit,    realized: fiscal.transitToll },
    { key: "extraction", label: "Těžba",   icon: "⛏️", max: 0.50, softThreshold: 0.30, base: fiscal.taxBases.extraction, realized: fiscal.extractionTax },
    { key: "poll",       label: "Populace",icon: "👥", max: 0.50, softThreshold: 0.30, base: fiscal.taxBases.poll,       realized: fiscal.popTax },
  ].map(p => {
    const nominalRate = Number(realm[`tax_rate_${p.key}`] ?? 0);
    const effectiveRate = p.base > 0 ? p.realized / p.base : 0;
    const grossPotential = p.base * nominalRate;
    const leakage = Math.max(0, grossPotential - p.realized);
    return { ...p, nominalRate, effectiveRate, leakage, overThreshold: nominalRate > p.softThreshold };
  });

  // GDP is the canonical realm figure — NOT a sum of tax bases.
  const totalGDP = Number(realm.total_gdp ?? 0);
  const totalRealized = fiscal.fiscalRevenue;
  const totalLeakage = PILLARS.reduce((s, p) => s + p.leakage, 0);
  const overTaxed = PILLARS.filter(p => p.overThreshold);
  const goldReserve = Number(realm.gold_reserve ?? 0);
  const goodsProduction = Number(realm.goods_production_value ?? 0);

  const overTaxSeverity = overTaxed.length === 0 ? "ok" : overTaxed.length <= 1 ? "warn" : "danger";
  const projectedLegitDelta = overTaxed.reduce(
    (s, p) => s - Math.round(((p.nominalRate - p.softThreshold) / p.max) * 8), 0,
  );

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" />
          Pokladnice — HDP × Daně × Příjem
          <InfoTip side="right">
            <b>HDP</b> = kanonická hodnota <code>total_gdp</code> (agregace po tahu). <b>NENÍ</b> příjem koruny ani součet daňových základů.
            <br /><b>Příjem koruny</b> = to, co engine skutečně přičetl do pokladny (populační daň + domácí trh + daně ze zboží).
          </InfoTip>
          <Badge variant="outline" className="ml-auto text-[10px]">SSOT: process-turn</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-4">
        {/* ═══ Top KPIs ═══ */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">HDP (total_gdp)</div>
            <div className="text-2xl font-bold font-display">{totalGDP.toFixed(0)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              z toho goods: <span className="font-mono">{goodsProduction.toFixed(0)}</span>
            </div>
          </div>
          <div className="rounded-lg border-2 border-accent/40 bg-accent/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-accent font-bold mb-1">Příjem koruny / kolo</div>
            <div className="text-2xl font-bold font-display text-accent">+{totalRealized.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              čistá změna: <span className="font-mono">{fiscal.netChange >= 0 ? "+" : ""}{fiscal.netChange.toFixed(1)}</span>
            </div>
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-1 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Nevybráno
            </div>
            <div className="text-2xl font-bold font-display text-destructive">−{totalLeakage.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              rozdíl nominálu a skutečného výběru
            </div>
          </div>
        </div>

        {/* ═══ Governance modifier ═══ */}
        <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold flex items-center gap-1">
              <Scale className="h-3 w-3" /> Schopnost výběru (governance)
              <InfoTip>Nízká legitimita = nižší schopnost výběru. Modifikátor enginu: 0.5 + 0.5 × (legitimacy/100).</InfoTip>
            </div>
            <div className="text-xs font-mono">
              legitimita <span className="font-bold">{legitimacy.toFixed(0)}</span> → ×<span className="font-bold text-primary">{govMod.toFixed(2)}</span>
            </div>
          </div>
          <Progress value={legitimacy} className="h-1.5" />
        </div>

        {/* ═══ Per-pillar breakdown ═══ */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Rozpad dle pilíře (pět daňových základů)</div>
          <div className="grid grid-cols-[80px_70px_70px_1fr_80px] gap-2 text-[10px] text-muted-foreground px-1 pb-1 border-b border-border/30">
            <div>Pilíř</div>
            <div className="text-right">Nominál</div>
            <div className="text-right">Efektiv.</div>
            <div className="text-right">Základ</div>
            <div className="text-right">Příjem</div>
          </div>
          {PILLARS.map(p => (
            <div key={p.key} className={`grid grid-cols-[80px_70px_70px_1fr_80px] gap-2 text-xs items-center px-1 py-1 rounded ${p.overThreshold ? "bg-destructive/5" : ""}`}>
              <div className="flex items-center gap-1">
                <span>{p.icon}</span>
                <span className="font-semibold">{p.label}</span>
              </div>
              <div className="text-right font-mono text-muted-foreground">{(p.nominalRate * 100).toFixed(1)}%</div>
              <div className="text-right font-mono">
                <span className={p.nominalRate > 0 && p.effectiveRate < p.nominalRate * 0.5 ? "text-destructive" : ""}>
                  {(p.effectiveRate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="text-right font-mono text-muted-foreground">{p.base.toFixed(0)}</div>
              <div className="text-right font-mono font-semibold text-accent">+{p.realized.toFixed(1)}</div>
            </div>
          ))}
        </div>

        {/* ═══ Risks — only effects the engine really applies ═══ */}
        {overTaxed.length > 0 && (
          <div className={`rounded-lg border p-3 ${overTaxSeverity === "danger" ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5"}`}>
            <div className="flex items-center gap-2 mb-2">
              {overTaxSeverity === "danger" ? <ShieldAlert className="h-4 w-4 text-destructive" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
              <div className="text-xs font-semibold">
                {overTaxSeverity === "danger" ? "Přetížená ekonomika" : "Sazba nad měkkým prahem"}
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1">
              <div>Pilíře nad prahem: {overTaxed.map(p => `${p.icon}${p.label}`).join(", ")}</div>
              <div>Skutečný dopad enginu příští kolo:</div>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                {projectedLegitDelta < 0
                  ? <li>Legitimita {projectedLegitDelta} ({legitimacy.toFixed(0)} → {Math.max(0, legitimacy + projectedLegitDelta).toFixed(0)}) → nižší schopnost výběru</li>
                  : <li>Bez přímého postihu legitimity</li>}
                <li>Nižší efektivní sazba (vyšší nevybraná část)</li>
              </ul>
            </div>
          </div>
        )}

        {/* ═══ Footer ═══ */}
        <div className="pt-2 border-t border-border/30 text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Zlatá rezerva: <span className="font-mono font-bold text-foreground">{goldReserve.toFixed(0)}</span></span>
          <span>Sazby uprav v záložce „Daňová politika".</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default TreasuryPanel;
