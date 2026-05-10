import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "sonner";

interface Props { realm: any; sessionId: string; playerName: string; onRefetch?: () => void; }

const PILLARS = [
  { key: "domestic",   label: "Domácí daň",     icon: "🏛️", max: 0.50, hint: "Daň z domácí spotřeby. Při >25 % roste šedý trh." },
  { key: "market",     label: "Tržní clo",       icon: "🏪", max: 0.40, hint: "Clo na tržní transakce. Při >20 % obchodníci unikají." },
  { key: "transit",    label: "Tranzitní mýto",  icon: "🛤️", max: 0.30, hint: "Mýto na karavany. Při >15 % se hledají objížďky." },
  { key: "extraction", label: "Extrakční daň",   icon: "⛏️", max: 0.50, hint: "Daň z primární těžby. Při >25 % vzniká pašerácký řetězec." },
  { key: "poll",       label: "Daň z hlavy",     icon: "👥", max: 0.02, hint: "Per capita. Při >1 % hrozí daňové vzpoury." },
] as const;

const laffer = (rate: number, max: number) => Math.max(0, 1 - Math.pow(rate / max, 2));

const TaxPolicySubTab = ({ realm, sessionId, playerName, onRefetch }: Props) => {
  const [rates, setRates] = useState<Record<string, number>>({
    domestic:   Number(realm?.tax_rate_domestic   ?? 0.10),
    market:     Number(realm?.tax_rate_market     ?? 0.05),
    transit:    Number(realm?.tax_rate_transit    ?? 0.03),
    extraction: Number(realm?.tax_rate_extraction ?? 0.05),
    poll:       Number(realm?.tax_rate_poll       ?? 0.002),
  });
  const [saving, setSaving] = useState(false);

  // GDP volumes from last turn
  const gdp = {
    domestic:   Number(realm?.last_turn_gdp_domestic   ?? realm?.wealth_domestic_component ?? 0),
    market:     Number(realm?.last_turn_gdp_market     ?? 0),
    transit:    Number(realm?.last_turn_gdp_transit    ?? 0),
    extraction: Number(realm?.last_turn_gdp_extraction ?? 0),
    poll:       Number(realm?.tax_population ?? 0) * 500, // rough population proxy
  };

  const previewRevenue = (key: string) => {
    const p = PILLARS.find(p => p.key === key)!;
    const r = rates[key];
    const vol = (gdp as any)[key];
    return vol * laffer(r, p.max) * r;
  };

  const totalPreview = PILLARS.reduce((s, p) => s + previewRevenue(p.key), 0);

  const save = async () => {
    setSaving(true);
    try {
      const { dispatchCommand } = await import("@/lib/commands");
      const res = await dispatchCommand({
        sessionId,
        actor: { name: playerName, type: "player" },
        commandType: "SET_TAX_RATES",
        commandPayload: rates,
      });
      if (!res.ok) throw new Error(res.error || "Unknown");
      toast.success("Daňová politika uložena. Platí od příštího kola.");
      onRefetch?.();
    } catch (e) {
      toast.error("Chyba: " + (e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            ⚖️ Daňová politika
            <InfoTip>Lafferův princip: vysoká sazba sníží zdaněný objem (úniky, šedá ekonomika). Optimální výnos je obvykle kolem 30–40 % maxima sazby.</InfoTip>
            <span className="ml-auto text-xs text-muted-foreground">
              Ztráta minulého kola: <span className="font-mono">{((Number(realm?.last_turn_laffer_loss ?? 0)) * 100).toFixed(0)} %</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-5">
          {PILLARS.map(p => {
            const rate = rates[p.key];
            const vol = (gdp as any)[p.key];
            const eff = laffer(rate, p.max);
            const rev = previewRevenue(p.key);
            const peakRate = p.max / Math.sqrt(3);
            return (
              <div key={p.key} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1">
                    {p.icon} {p.label}
                    <InfoTip side="right">{p.hint}</InfoTip>
                  </span>
                  <span className="font-mono">
                    <span className="text-muted-foreground">{(rate * 100).toFixed(1)} %</span>
                    <span className="mx-2">→</span>
                    <span className="font-bold text-primary">+{rev.toFixed(1)}/k</span>
                  </span>
                </div>
                <Slider
                  value={[rate]}
                  min={0}
                  max={p.max}
                  step={p.max / 100}
                  onValueChange={(v) => setRates(r => ({ ...r, [p.key]: v[0] }))}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>0 %</span>
                  <span className={Math.abs(rate - peakRate) < p.max * 0.05 ? "text-primary font-bold" : ""}>
                    ▲ peak {(peakRate * 100).toFixed(1)} %
                  </span>
                  <span>max {(p.max * 100).toFixed(0)} %</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  GDP {vol.toFixed(0)} × Laffer {(eff * 100).toFixed(0)} % × sazba {(rate * 100).toFixed(1)} %
                </div>
              </div>
            );
          })}

          <div className="pt-3 border-t border-border/30 flex items-center justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Odhad celkového příjmu: </span>
              <span className="font-mono font-bold text-primary text-lg">+{totalPreview.toFixed(1)} /kolo</span>
            </div>
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? "Ukládám…" : "Uložit politiku"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TaxPolicySubTab;
