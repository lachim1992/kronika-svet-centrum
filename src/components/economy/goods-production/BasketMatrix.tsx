import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBasketMeta } from "@/lib/goodsCatalog";
import {
  ALERT_BADGE, BASKET_GROUP_ORDER, CHANNEL_LABEL, CLASS_COLOR, CLASS_LABEL,
  coverageColor,
} from "@/lib/demandClasses";
import type { BasketAgg } from "./types";

interface Props {
  rows: BasketAgg[];
  importAvailable: boolean;
  onPick: (basketKey: string) => void;
}

const GROUP_ICON: Record<string, string> = {
  "ZÁKLADNÍ POTŘEBY": "🏠",
  "PROVOZNÍ EKONOMIKA": "⚙️",
  "ROZVOJ": "🏗️",
  "VOJENSTVÍ": "⚔️",
  "VOLITELNÁ SPOTŘEBA / LUXUS": "🧺",
  "PRŮMYSLOVÉ POLOTOVARY": "⚒️",
};

function provenance(channels: Record<string, number>): string {
  const entries = Object.entries(channels).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "žádný aktivní zdroj poptávky";
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${CHANNEL_LABEL[k] || k} ${v.toFixed(1)}`)
    .join(" · ");
}

const BasketMatrix = ({ rows, importAvailable, onPick }: Props) => {
  const groups = [...BASKET_GROUP_ORDER].filter(g => rows.some(r => r.group === g));

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold">📊 Matice košů</h3>
        <span className="text-[10px] text-muted-foreground">
          Poptávka vzniká jen ze skutečné aktivity
        </span>
      </div>

      <div className="divide-y divide-border/30">
        {groups.map(group => (
          <div key={group}>
            <div className="px-4 py-1.5 bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {GROUP_ICON[group] || "📦"} {group}
            </div>
            {rows.filter(r => r.group === group).map(b => {
              const m = getBasketMeta(b.key);
              const covPct = Math.round(b.coverage * 100);
              const showCoverage = b.demand > 0;
              return (
                <div key={b.key} className="px-4 py-2 hover:bg-muted/20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{m.icon}</span>
                        <span className="text-xs font-semibold">{m.label}</span>
                        <Badge variant="outline" className={`text-[8px] ${CLASS_COLOR[b.demandClass]}`}>
                          {CLASS_LABEL[b.demandClass].toUpperCase()}
                        </Badge>
                        {b.alert !== "none" && (
                          <Badge variant="outline" className={`text-[8px] ${ALERT_BADGE[b.alert]}`}>
                            {b.alert.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Zdroj poptávky: {provenance(b.channels)}
                      </div>
                      {b.effect && (
                        <div className="text-[10px] text-foreground/80">→ {b.effect}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-[9px] text-muted-foreground">Poptávka</div>
                        <div className="font-mono text-xs">{b.demand.toFixed(1)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-muted-foreground">Místní</div>
                        <div className="font-mono text-xs">{b.supply.toFixed(1)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-muted-foreground">Import</div>
                        <div className="font-mono text-xs text-blue-500">
                          {importAvailable ? b.importVol.toFixed(1) : "—"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-muted-foreground">Nekryto</div>
                        <div className="font-mono text-xs text-destructive">
                          {b.unmet > 0 ? `−${b.unmet.toFixed(1)}` : "0"}
                        </div>
                      </div>
                      <div className="text-right w-14">
                        <div className="text-[9px] text-muted-foreground">Krytí</div>
                        <div className={`font-mono text-xs font-bold ${coverageColor(b.coverage, b.demandClass)}`}>
                          {showCoverage ? `${covPct} %` : "—"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px]"
                        onClick={() => onPick(b.key)}
                      >
                        Řešit
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BasketMatrix;
