import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  getBasketMeta,
  diagnoseBasketDeficit,
  getBuildingTemplatesForBasket,
} from "@/lib/goodsCatalog";
import CityActionPanel from "./CityActionPanel";
import type { CityBasketRow } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  basketKey: string | null;
  sessionId: string;
  cityRows: CityBasketRow[];
  cities: any[];
  templates: any[];
  accessLevels: Array<{ trade_system_id: string; access_level: string }>;
  reachableSurplusByBasket: Set<string>;
  onNavigateToCities: (cityId: string, templateId: string, basketKey: string) => void;
}

const BasketDetailDrawer = ({
  open,
  onOpenChange,
  basketKey,
  sessionId,
  cityRows,
  cities,
  templates,
  accessLevels,
  reachableSurplusByBasket,
  onNavigateToCities,
}: Props) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const meta = basketKey ? getBasketMeta(basketKey) : { label: "", icon: "" };
  const affected = useMemo(() => {
    if (!basketKey) return [];
    return cityRows
      .filter(r => r.basket_key === basketKey)
      .map(r => ({
        row: r,
        city: cities.find(c => c.id === r.city_id),
        unmet: r.unmet_demand ?? Math.max(0, r.local_demand - r.local_supply),
      }))
      .filter(x => x.city)
      .sort((a, b) => b.unmet - a.unmet);
  }, [basketKey, cityRows, cities]);

  const totals = useMemo(() => {
    const sumD = affected.reduce((s, x) => s + (x.row.local_demand || 0), 0);
    const sumS = affected.reduce((s, x) => s + (x.row.local_supply || 0), 0);
    const sumU = affected.reduce((s, x) => s + x.unmet, 0);
    const sat = sumD > 0 ? Math.min(1, sumS / sumD) : 1;
    return { sumD, sumS, sumU, sat };
  }, [affected]);

  const causes = useMemo(() => {
    if (!basketKey) return [];
    const hasBuilding = getBuildingTemplatesForBasket(templates, basketKey).length > 0;
    const hasAccess = accessLevels.some(a => a.access_level && a.access_level !== "none");
    const hasSurplus = reachableSurplusByBasket.has(basketKey);
    return diagnoseBasketDeficit({
      basketKey,
      cityRows: affected.map(x => x.row),
      hasBuildingForBasket: hasBuilding,
      hasTradeAccess: hasAccess,
      hasReachableSurplus: hasSurplus,
    });
  }, [basketKey, affected, templates, accessLevels, reachableSurplusByBasket]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Aggregate */}
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-muted/30 p-2 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Demand</div>
              <div className="text-sm font-mono font-bold">{totals.sumD.toFixed(0)}</div>
            </div>
            <div className="rounded-lg bg-muted/30 p-2 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Supply</div>
              <div className="text-sm font-mono font-bold">{totals.sumS.toFixed(0)}</div>
            </div>
            <div className="rounded-lg bg-destructive/10 p-2 text-center">
              <div className="text-[9px] text-destructive uppercase">Deficit</div>
              <div className="text-sm font-mono font-bold text-destructive">−{totals.sumU.toFixed(0)}</div>
            </div>
            <div className="rounded-lg bg-primary/10 p-2 text-center">
              <div className="text-[9px] text-primary uppercase">Sat</div>
              <div className="text-sm font-mono font-bold text-primary">{Math.round(totals.sat * 100)}%</div>
            </div>
          </div>

          {/* Causes */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Pravděpodobné příčiny
            </div>
            <div className="space-y-1">
              {causes.map(c => (
                <div key={c.code} className="flex items-start gap-2 text-xs p-2 rounded bg-card/60 border border-border/30">
                  <Badge variant={c.code === "ok" ? "secondary" : "destructive"} className="text-[9px] shrink-0">
                    {c.code === "ok" ? "OK" : "⚠"}
                  </Badge>
                  <div>
                    <div className="font-semibold">{c.label}</div>
                    <div className="text-[10px] text-muted-foreground">{c.hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Affected cities */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Postižená města ({affected.length})
            </div>
            {affected.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic px-2">Žádné město nemá zaznamenanou poptávku.</p>
            ) : (
              <div className="space-y-1">
                {affected.map(({ row, city, unmet }) => {
                  const isOpen = expanded === city.id;
                  const satPct = Math.round((Number(row.domestic_satisfaction) || 0) * 100);
                  return (
                    <div key={city.id} className="rounded-lg border border-border/30 bg-card/40 overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 text-left"
                        onClick={() => setExpanded(isOpen ? null : city.id)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold">🏛️ {city.name}</span>
                          <span className="text-[9px] text-muted-foreground">
                            D {row.local_demand.toFixed(0)} · S {row.local_supply.toFixed(0)} · auto {Number(row.auto_supply).toFixed(1)} · rec {Number(row.recipe_bonus || 0).toFixed(1)} · bld {Number(row.building_bonus || 0).toFixed(1)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {unmet > 0 ? (
                            <span className="text-xs font-mono text-destructive">−{unmet.toFixed(0)}</span>
                          ) : (
                            <span className="text-xs font-mono text-primary">OK</span>
                          )}
                          <span className={`text-[10px] font-mono ${satPct < 50 ? "text-destructive" : satPct < 80 ? "text-amber-500" : "text-primary"}`}>
                            {satPct}%
                          </span>
                          {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </div>
                      </button>
                      {isOpen && basketKey && (
                        <div className="p-2 border-t border-border/30">
                          <CityActionPanel
                            sessionId={sessionId}
                            cityId={city.id}
                            cityName={city.name}
                            basketKey={basketKey}
                            templates={templates}
                            onNavigateToCities={onNavigateToCities}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default BasketDetailDrawer;
