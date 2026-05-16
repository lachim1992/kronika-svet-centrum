// ============================================================================
// TreasuryPanel — Player-facing "HDP × Daně × Treasury" transparency panel.
//
// Separates two strictly-distinct concepts (per spec):
//   1) Market Volume (HDP) — realized economy, the taxable base. NOT income.
//   2) Crown Income — what the state actually captures after effective rate,
//      governance modifiers and leakage.
//
// Reads SSOT from realm_resources:
//   - last_turn_gdp_{domestic,market,transit,extraction}
//   - tax_rate_{domestic,market,transit,extraction,poll}
//   - last_turn_laffer_loss, legitimacy, gold_reserve
//
// Never writes — pure view over engine output.
// ============================================================================

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import { Coins, TrendingDown, AlertTriangle, ShieldAlert, Scale } from "lucide-react";

interface Props {
  realm: any;
}

const PILLAR_META = [
  { key: "domestic",   label: "Domácí",   icon: "🏛️", max: 0.50, softThreshold: 0.30 },
  { key: "market",     label: "Tržní",     icon: "🏪", max: 0.40, softThreshold: 0.24 },
  { key: "transit",    label: "Tranzit",   icon: "🛤️", max: 0.30, softThreshold: 0.18 },
  { key: "extraction", label: "Těžba",     icon: "⛏️", max: 0.50, softThreshold: 0.30 },
] as const;

const laffer = (rate: number, max: number) => Math.max(0, 1 - Math.pow(rate / max, 2));

const TreasuryPanel = ({ realm }: Props) => {
  if (!realm) return null;

  const legitimacy = Number(realm.legitimacy ?? 50);
  // Governance modifier: low legitimacy = the state can't collect efficiently.
  // 0 legit → 0.5×, 50 legit → 0.75×, 100 legit → 1.0×
  const govMod = 0.5 + 0.5 * (Math.max(0, Math.min(100, legitimacy)) / 100);

  const pillars = PILLAR_META.map(p => {
    const nominalRate = Number(realm[`tax_rate_${p.key}`] ?? 0);
    const volume = Number(realm[`last_turn_gdp_${p.key}`] ?? 0);
    const lafferKeep = laffer(nominalRate, p.max);
    const effectiveRate = nominalRate * lafferKeep * govMod;
    const grossPotential = volume * nominalRate;
    const realizedRevenue = volume * effectiveRate;
    const leakage = Math.max(0, grossPotential - realizedRevenue);
    const overThreshold = nominalRate > p.softThreshold;
    return { ...p, nominalRate, effectiveRate, volume, realizedRevenue, leakage, lafferKeep, overThreshold, grossPotential };
  });

  const totalGDP = pillars.reduce((s, p) => s + p.volume, 0);
  const totalRealized = pillars.reduce((s, p) => s + p.realizedRevenue, 0);
  const totalLeakage = pillars.reduce((s, p) => s + p.leakage, 0);
  const overTaxed = pillars.filter(p => p.overThreshold);
  const lafferLoss = Number(realm.last_turn_laffer_loss ?? 0);
  const goldReserve = Number(realm.gold_reserve ?? 0);
  const goodsProduction = Number(realm.goods_production_value ?? 0);

  // Soft penalty preview
  const overTaxSeverity = overTaxed.length === 0 ? "ok" : overTaxed.length <= 1 ? "warn" : "danger";
  const projectedLegitDelta = overTaxed.reduce((s, p) => s - Math.round(((p.nominalRate - p.softThreshold) / p.max) * 8), 0);
  const projectedUnrestDelta = overTaxed.reduce((s, p) => s + Math.round(((p.nominalRate - p.softThreshold) / p.max) * 5), 0);

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" />
          Pokladnice — HDP × Daně × Příjem
          <InfoTip side="right">
            <b>Tržní volume (HDP)</b> = realizovaný objem ekonomiky (zdaňovaná báze). <b>NENÍ</b> příjem koruny.
            <br /><b>Příjem koruny</b> = HDP × efektivní sazba × legitimita. Vysoké sazby snižují efektivní výnos a poškozují budoucí ekonomiku.
          </InfoTip>
          <Badge variant="outline" className="ml-auto text-[10px]">SSOT: realm_resources</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-4">
        {/* ═══ Top KPIs ═══ */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Tržní volume (HDP)</div>
            <div className="text-2xl font-bold font-display">{totalGDP.toFixed(0)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              z toho goods: <span className="font-mono">{goodsProduction.toFixed(0)}</span>
            </div>
          </div>
          <div className="rounded-lg border-2 border-accent/40 bg-accent/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-accent font-bold mb-1">Příjem koruny / kolo</div>
            <div className="text-2xl font-bold font-display text-accent">+{totalRealized.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              efektivně: <span className="font-mono">{totalGDP > 0 ? ((totalRealized / totalGDP) * 100).toFixed(1) : "0"}%</span> HDP
            </div>
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-1 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Únik / šedá ek.
            </div>
            <div className="text-2xl font-bold font-display text-destructive">−{totalLeakage.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Laffer ztráta: <span className="font-mono">{(lafferLoss * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* ═══ Governance modifier ═══ */}
        <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold flex items-center gap-1">
              <Scale className="h-3 w-3" /> Schopnost výběru (governance)
              <InfoTip>Nízká legitimita = nižší schopnost výběru. Korupce, neposlušnost, regionální únik. Modifikátor: 0.5 + 0.5 × (legitimacy/100).</InfoTip>
            </div>
            <div className="text-xs font-mono">
              legitimita <span className="font-bold">{legitimacy.toFixed(0)}</span> → ×<span className="font-bold text-primary">{govMod.toFixed(2)}</span>
            </div>
          </div>
          <Progress value={legitimacy} className="h-1.5" />
        </div>

        {/* ═══ Per-pillar breakdown ═══ */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Rozpad dle pilíře</div>
          <div className="grid grid-cols-[80px_70px_70px_1fr_80px] gap-2 text-[10px] text-muted-foreground px-1 pb-1 border-b border-border/30">
            <div>Pilíř</div>
            <div className="text-right">Nominál</div>
            <div className="text-right">Efektiv.</div>
            <div className="text-right">HDP</div>
            <div className="text-right">Příjem</div>
          </div>
          {pillars.map(p => (
            <div key={p.key} className={`grid grid-cols-[80px_70px_70px_1fr_80px] gap-2 text-xs items-center px-1 py-1 rounded ${p.overThreshold ? "bg-destructive/5" : ""}`}>
              <div className="flex items-center gap-1">
                <span>{p.icon}</span>
                <span className="font-semibold">{p.label}</span>
              </div>
              <div className="text-right font-mono text-muted-foreground">{(p.nominalRate * 100).toFixed(1)}%</div>
              <div className="text-right font-mono">
                <span className={p.lafferKeep < 0.5 ? "text-destructive" : ""}>{(p.effectiveRate * 100).toFixed(1)}%</span>
              </div>
              <div className="text-right font-mono text-muted-foreground">{p.volume.toFixed(0)}</div>
              <div className="text-right font-mono font-semibold text-accent">+{p.realizedRevenue.toFixed(1)}</div>
            </div>
          ))}
        </div>

        {/* ═══ Risks ═══ */}
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
              <div>Předpokládané důsledky příští kolo:</div>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                {projectedLegitDelta < 0 && <li>Legitimita {projectedLegitDelta} ({legitimacy.toFixed(0)} → {Math.max(0, legitimacy + projectedLegitDelta).toFixed(0)})</li>}
                {projectedUnrestDelta > 0 && <li>Nepokoje +{projectedUnrestDelta}</li>}
                <li>Migrace pryč z přetížených uzlů</li>
                <li>Růst šedé ekonomiky → nižší realizovaná produkce</li>
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
