import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import {
  STRATEGIC_RESOURCES, STRATEGIC_RESOURCE_META, STRATEGIC_TIER_LABELS,
  STRATEGIC_TIER_COLORS, getStrategicTiers,
  type StrategicResource,
} from "@/lib/economyFlow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface Props {
  realm: any;
}

const CATEGORY_LABELS: Record<string, string> = {
  military: "⚔️ Vojenské",
  trade: "🔄 Obchod",
  economic: "💰 Ekonomické",
  luxury: "💎 Luxus",
  cultural: "🎭 Kulturní",
  infrastructure: "🏗️ Infrastruktura",
  faith: "⛪ Víra",
};

const StrategicResourcesDetail = ({ realm }: Props) => {
  const activeTiers = getStrategicTiers(realm);
  const activeKeys = new Set(activeTiers.map(t => t.key));

  // Group by category
  const byCategory = STRATEGIC_RESOURCES.reduce<Record<string, { key: StrategicResource; tier: number }[]>>((acc, key) => {
    const meta = STRATEGIC_RESOURCE_META[key];
    const tier = activeTiers.find(t => t.key === key)?.tier ?? 0;
    const cat = meta.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push({ key, tier });
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          ⚡ Strategické suroviny ({activeTiers.length}/11)
          <InfoTip>Access-based systém: 1 kontrolovaný uzel = +1 tier (max 3). Suroviny se generují v biomech s odpovídající afinitou. Skryté pod mlhou dějin — odhalují se průzkumem hexu.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-4">
        {/* Active resources highlight */}
        {activeTiers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeTiers.map(s => {
              const meta = STRATEGIC_RESOURCE_META[s.key];
              return (
                <div key={s.key} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/20 bg-primary/5 text-xs">
                  <span className="text-base">{meta.icon}</span>
                  <span className="font-semibold">{meta.label}</span>
                  <Badge variant="secondary" className={`text-[9px] ${STRATEGIC_TIER_COLORS[s.tier]}`}>
                    T{s.tier} — {STRATEGIC_TIER_LABELS[s.tier]}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        {activeTiers.length === 0 && (
          <p className="text-xs text-muted-foreground">Žádné strategické suroviny. Prozkoumejte hexy a kontrolujte uzly s přírodními zdroji.</p>
        )}

        {/* Detailed breakdown by category */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-semibold">
              <ChevronDown className="h-3 w-3" /> Katalog všech surovin a efektů
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4">
            {Object.entries(byCategory).map(([cat, resources]) => (
              <div key={cat} className="space-y-2">
                <h5 className="text-xs font-semibold text-muted-foreground">{CATEGORY_LABELS[cat] || cat}</h5>
                {resources.map(({ key, tier }) => {
                  const meta = STRATEGIC_RESOURCE_META[key];
                  const isActive = tier > 0;
                  return (
                    <div key={key} className={`rounded-lg border p-3 text-xs space-y-2 ${isActive ? "border-primary/20 bg-card" : "border-border/50 bg-muted/20 opacity-60"}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{meta.icon}</span>
                        <span className="font-display font-bold">{meta.label}</span>
                        <Badge variant="outline" className="text-[9px] ml-1">
                          {meta.rarity === "common" ? "Běžné" : meta.rarity === "medium" ? "Středně vzácné" : "Vzácné"}
                        </Badge>
                        {isActive && (
                          <Badge className={`text-[9px] ml-auto ${STRATEGIC_TIER_COLORS[tier]}`}>
                            T{tier} — {STRATEGIC_TIER_LABELS[tier]}
                          </Badge>
                        )}
                        {!isActive && <span className="ml-auto text-[10px] text-muted-foreground">Nemáte přístup</span>}
                      </div>
                      <p className="text-muted-foreground">{meta.description}</p>
                      {/* Tier effects */}
                      <div className="space-y-1">
                        {[1, 2, 3].map(t => {
                          const effects = meta.gameplayEffects[t];
                          if (!effects) return null;
                          const isCurrent = tier >= t;
                          return (
                            <div key={t} className={`flex items-start gap-2 ${isCurrent ? "text-foreground" : "text-muted-foreground/50"}`}>
                              <span className={`w-5 text-center font-mono font-bold text-[10px] ${isCurrent ? "text-primary" : ""}`}>T{t}</span>
                              <div className="flex flex-wrap gap-1">
                                {effects.map((e, i) => (
                                  <span key={i} className={`text-[10px] rounded px-1.5 py-0.5 ${isCurrent ? "bg-primary/10 text-primary" : "bg-muted/40"}`}>
                                    {e}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        +{meta.prestigePerTier} prestiž/tier • Spawn: {Math.round(meta.spawnChance * 100)}% na minor uzel
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

export default StrategicResourcesDetail;
