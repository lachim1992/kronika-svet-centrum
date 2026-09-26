import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowUpDown, Hammer, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InfoTip } from "@/components/ui/info-tip";
import {
  BASKET_CONFIG,
  getBasketMeta,
  getBuildingTemplatesForBasket,
  resolveBasketKey,
  scaledBasketOutputs,
  VALID_BASKETS,
} from "@/lib/goodsCatalog";
import { chainLabel, firstMissingStep, productionChainForBasket } from "@/lib/productionPaths";
import type { CityBasketRow } from "./goods-production/types";
import CityAccountsPanel from "./CityAccountsPanel";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
  onEntityClick?: (type: string, id: string) => void;
  onTabChange?: (tab: string) => void;
}

interface BuildingRow {
  id: string;
  city_id: string;
  name: string;
  category?: string | null;
  status?: string | null;
  current_level?: number | null;
  effects?: any;
  template_id?: string | null;
  building_templates?: { id: string; effects?: any } | null;
}

interface DistrictRow {
  id: string;
  city_id: string;
  name: string;
  status?: string | null;
  district_type?: string | null;
  basket_key?: string | null;
  basket_output?: number | null;
  basket_quality?: number | null;
  is_staffed?: boolean | null;
}

interface SourceRow {
  id: string;
  cityId: string;
  name: string;
  kind: "building" | "district";
  status: string;
  basketKey: string;
  amount: number;
  note: string;
}

const num = (value: unknown) => Number(value ?? 0) || 0;
const fmt = (value: number, digits = 0) => value.toFixed(digits);

const CityEconomyAnalytics = ({
  sessionId,
  currentPlayerName,
  currentTurn,
  cities,
  onEntityClick,
  onTabChange,
}: Props) => {
  const [rows, setRows] = useState<CityBasketRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [snapshotTurn, setSnapshotTurn] = useState<number | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const myCities = useMemo(
    () => cities.filter(city => city.owner_player === currentPlayerName),
    [cities, currentPlayerName],
  );
  const myCityIds = useMemo(() => new Set(myCities.map(city => city.id)), [myCities]);
  const cityName = useMemo(() => new Map(cities.map(city => [city.id, city.name])), [cities]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [basketCurrent, buildingRes, districtRes, templateRes] = await Promise.all([
        supabase
          .from("city_market_baskets")
          .select("city_id,player_name,basket_key,turn_number,local_demand,local_supply,auto_supply,bonus_supply,recipe_bonus,building_bonus,domestic_satisfaction,unmet_demand,export_surplus")
          .eq("session_id", sessionId)
          .eq("player_name", currentPlayerName)
          .eq("turn_number", currentTurn)
          .limit(1000),
        (supabase as any)
          .from("city_buildings")
          .select("id,city_id,name,category,status,current_level,effects,template_id,building_templates(id,effects)")
          .eq("session_id", sessionId)
          .in("city_id", myCities.map(city => city.id)),
        supabase
          .from("city_districts")
          .select("id,city_id,name,status,district_type,basket_key,basket_output,basket_quality,is_staffed")
          .eq("session_id", sessionId)
          .in("city_id", myCities.map(city => city.id)),
        supabase
          .from("building_templates")
          .select("id,name,category,required_settlement_level,effects,cost_wealth,cost_wood,cost_stone,cost_iron"),
      ]);

      let basketRows = (basketCurrent.data || []) as CityBasketRow[];
      let usedTurn = currentTurn;
      if (basketRows.length === 0) {
        const { data: fallbackRows } = await supabase
          .from("city_market_baskets")
          .select("city_id,player_name,basket_key,turn_number,local_demand,local_supply,auto_supply,bonus_supply,recipe_bonus,building_bonus,domestic_satisfaction,unmet_demand,export_surplus")
          .eq("session_id", sessionId)
          .eq("player_name", currentPlayerName)
          .order("turn_number", { ascending: false })
          .limit(1000);
        const maxTurn = (fallbackRows || []).reduce((max, row: any) => Math.max(max, Number(row.turn_number) || 0), 0);
        basketRows = ((fallbackRows || []) as CityBasketRow[]).filter(row => Number(row.turn_number) === maxTurn);
        usedTurn = maxTurn || currentTurn;
      }

      if (cancelled) return;
      setRows(basketRows);
      setSnapshotTurn(usedTurn);
      setBuildings((buildingRes.data || []) as BuildingRow[]);
      setDistricts((districtRes.data || []) as DistrictRow[]);
      setTemplates(templateRes.data || []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [sessionId, currentPlayerName, currentTurn, myCities]);

  const sources = useMemo<SourceRow[]>(() => {
    const out: SourceRow[] = [];
    for (const building of buildings) {
      const outputs = scaledBasketOutputs(building);
      for (const [rawKey, amount] of Object.entries(outputs)) {
        const basketKey = resolveBasketKey(rawKey);
        out.push({
          id: `${building.id}-${basketKey}`,
          cityId: building.city_id,
          name: building.name,
          kind: "building",
          status: building.status || "unknown",
          basketKey,
          amount: Number(amount) || 0,
          note: `úroveň ${Math.max(1, num(building.current_level) || 1)}`,
        });
      }
    }
    for (const district of districts) {
      if (!district.basket_key || num(district.basket_output) <= 0) continue;
      const basketKey = resolveBasketKey(district.basket_key);
      out.push({
        id: `${district.id}-${basketKey}`,
        cityId: district.city_id,
        name: district.name,
        kind: "district",
        status: district.status || "unknown",
        basketKey,
        amount: num(district.basket_output),
        note: district.is_staffed === false ? "bez obsluhy" : "čtvrť",
      });
    }
    return out.filter(source => (VALID_BASKETS as readonly string[]).includes(source.basketKey));
  }, [buildings, districts]);

  const citySummaries = useMemo(() => {
    const map = new Map<string, {
      city: any; demand: number; supply: number; auto: number; recipe: number; building: number;
      unmet: number; surplus: number; satNumerator: number; satDenominator: number; baskets: CityBasketRow[];
    }>();
    for (const city of myCities) {
      map.set(city.id, {
        city,
        demand: 0,
        supply: 0,
        auto: 0,
        recipe: 0,
        building: 0,
        unmet: 0,
        surplus: 0,
        satNumerator: 0,
        satDenominator: 0,
        baskets: [],
      });
    }
    for (const row of rows) {
      if (!myCityIds.has(row.city_id)) continue;
      const current = map.get(row.city_id);
      if (!current) continue;
      const demand = num(row.local_demand);
      const sat = num(row.domestic_satisfaction);
      current.demand += demand;
      current.supply += num(row.local_supply);
      current.auto += num(row.auto_supply);
      current.recipe += num(row.recipe_bonus);
      current.building += num(row.building_bonus);
      current.unmet += row.unmet_demand == null ? Math.max(0, demand - num(row.local_supply)) : num(row.unmet_demand);
      current.surplus += num(row.export_surplus);
      current.satNumerator += sat * demand;
      current.satDenominator += demand;
      current.baskets.push(row);
    }
    return Array.from(map.values())
      .map(summary => ({
        ...summary,
        satisfaction: summary.satDenominator > 0 ? summary.satNumerator / summary.satDenominator : 1,
        sourceCount: sources.filter(source => source.cityId === summary.city.id).length,
      }))
      .sort((a, b) => b.unmet - a.unmet || b.supply - a.supply);
  }, [myCities, myCityIds, rows, sources]);

  useEffect(() => {
    if (!selectedCityId && citySummaries.length > 0) setSelectedCityId(citySummaries[0].city.id);
    if (selectedCityId && citySummaries.length > 0 && !citySummaries.some(summary => summary.city.id === selectedCityId)) {
      setSelectedCityId(citySummaries[0].city.id);
    }
  }, [citySummaries, selectedCityId]);

  const selected = citySummaries.find(summary => summary.city.id === selectedCityId) || citySummaries[0];
  // Structures physically present in the selected city — used to name the blocking chain step.
  const cityStructureNames = useMemo(
    () => (selected ? sources.filter(source => source.cityId === selected.city.id).map(source => source.name) : []),
    [selected, sources],
  );

  const selectedBaskets = useMemo(() => {
    if (!selected) return [];
    return selected.baskets
      .map(row => {
        const basketKey = resolveBasketKey(row.basket_key);
        const demand = num(row.local_demand);
        const supply = num(row.local_supply);
        const unmet = row.unmet_demand == null ? Math.max(0, demand - supply) : num(row.unmet_demand);
        return {
          ...row,
          basketKey,
          demand,
          supply,
          unmet,
          surplus: num(row.export_surplus),
          sat: demand > 0 ? Math.min(1, supply / demand) : 1,
          sources: sources.filter(source => source.cityId === row.city_id && source.basketKey === basketKey),
        };
      })
      .sort((a, b) => b.unmet - a.unmet || b.supply - a.supply);
  }, [selected, sources]);

  const biggestProblems = selectedBaskets.filter(row => row.unmet > 0).slice(0, 4);
  const biggestSurpluses = selectedBaskets.filter(row => row.surplus > 0).slice(0, 4);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-center text-xs text-muted-foreground">
          Městská tržní data zatím nejsou k dispozici. Spusť přepočet ekonomiky.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
    <CityAccountsPanel sessionId={sessionId} currentTurn={currentTurn} cities={cities} currentPlayerName={currentPlayerName} />
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Městská ekonomická analytika
          <InfoTip>
            Řádky jsou z aktuálního modelu košů: místní poptávka, reálná nabídka,
            domácnosti, receptury, budovy/čtvrti a přebytek pro obchod.
          </InfoTip>
          {snapshotTurn !== currentTurn && snapshotTurn !== null && (
            <Badge variant="outline" className="ml-auto text-[10px]">snapshot {snapshotTurn}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-4">
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] px-2">Město</TableHead>
                <TableHead className="text-[10px] px-2 text-right">Poptávka</TableHead>
                <TableHead className="text-[10px] px-2 text-right">Nabídka</TableHead>
                <TableHead className="text-[10px] px-2 text-right">Auto</TableHead>
                <TableHead className="text-[10px] px-2 text-right">Recepty</TableHead>
                <TableHead className="text-[10px] px-2 text-right">Budovy</TableHead>
                <TableHead className="text-[10px] px-2 text-right">Deficit</TableHead>
                <TableHead className="text-[10px] px-2 text-right">Přebytek</TableHead>
                <TableHead className="text-[10px] px-2 text-right">Sat</TableHead>
                <TableHead className="text-[10px] px-2"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {citySummaries.map(summary => {
                const satPct = Math.round(summary.satisfaction * 100);
                return (
                  <TableRow key={summary.city.id} className={selected?.city.id === summary.city.id ? "bg-muted/30" : "hover:bg-muted/20"}>
                    <TableCell className="px-2 py-2 text-xs font-semibold">
                      <button className="text-left hover:text-primary" onClick={() => onEntityClick?.("city", summary.city.id)}>
                        {summary.city.name}
                      </button>
                      <div className="text-[9px] text-muted-foreground">{summary.sourceCount} výrobních zdrojů</div>
                    </TableCell>
                    <TableCell className="px-2 py-2 text-right font-mono text-xs">{fmt(summary.demand)}</TableCell>
                    <TableCell className="px-2 py-2 text-right font-mono text-xs">{fmt(summary.supply)}</TableCell>
                    <TableCell className="px-2 py-2 text-right font-mono text-[10px] text-muted-foreground">{fmt(summary.auto, 1)}</TableCell>
                    <TableCell className="px-2 py-2 text-right font-mono text-[10px] text-muted-foreground">{fmt(summary.recipe, 1)}</TableCell>
                    <TableCell className="px-2 py-2 text-right font-mono text-[10px] text-primary">{fmt(summary.building, 1)}</TableCell>
                    <TableCell className="px-2 py-2 text-right font-mono text-xs text-destructive">{summary.unmet > 0 ? `−${fmt(summary.unmet)}` : "0"}</TableCell>
                    <TableCell className="px-2 py-2 text-right font-mono text-xs text-primary">{summary.surplus > 0 ? `+${fmt(summary.surplus)}` : "0"}</TableCell>
                    <TableCell className="px-2 py-2 text-right font-mono text-xs">
                      <span className={satPct < 50 ? "text-destructive" : satPct < 80 ? "text-amber-500" : "text-primary"}>{satPct}%</span>
                    </TableCell>
                    <TableCell className="px-2 py-2 text-right">
                      <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setSelectedCityId(summary.city.id)}>
                        Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {selected && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-3">
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-display font-semibold">{selected.city.name}: koše a poptávka</h4>
                <Badge variant="outline" className="text-[10px] ml-auto">{selectedBaskets.length} košů</Badge>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {selectedBaskets.map(row => {
                  const meta = getBasketMeta(row.basketKey);
                  const cfg = BASKET_CONFIG[row.basketKey];
                  const satPct = Math.round(row.sat * 100);
                  const templatesForBasket = getBuildingTemplatesForBasket(templates, row.basketKey).slice(0, 3);
                  return (
                    <div key={row.basketKey} className="rounded-lg border border-border/40 bg-card/60 p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{meta.icon}</span>
                        <span className="text-xs font-semibold">{meta.label}</span>
                        <Badge variant="outline" className="text-[8px]">{cfg?.tierClass || "need"}</Badge>
                        <span className="ml-auto font-mono text-[11px]">
                          {fmt(row.supply)}/{fmt(row.demand)} <span className={satPct < 50 ? "text-destructive" : satPct < 80 ? "text-amber-500" : "text-primary"}>{satPct}%</span>
                        </span>
                      </div>
                      <Progress value={satPct} className="h-1.5" />
                      <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                        <span>domácnosti {fmt(num(row.auto_supply), 1)}</span>
                        <span>recepty {fmt(num(row.recipe_bonus), 1)}</span>
                        <span>budovy {fmt(num(row.building_bonus), 1)}</span>
                        <span className={row.unmet > 0 ? "text-destructive" : "text-primary"}>{row.unmet > 0 ? `chybí ${fmt(row.unmet, 1)}` : `přebytek ${fmt(row.surplus, 1)}`}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        <span className="font-semibold text-foreground/80">Proč se poptává: </span>
                        {(cfg?.demandDrivers || ["population_total"]).join(", ")}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        <span className="font-semibold text-foreground/80">Co to živí: </span>
                        {(cfg?.productionInputs?.length ? cfg.productionInputs : cfg?.resourceDependencies || []).join(", ") || "základní sektor"}
                      </div>
                      {(() => {
                        const steps = productionChainForBasket(row.basketKey);
                        if (!steps.length) return null;
                        const missing = row.unmet > 0 ? firstMissingStep(steps, cityStructureNames) : null;
                        return (
                          <div className="text-[10px] text-muted-foreground space-y-0.5">
                            <div>
                              <span className="font-semibold text-foreground/80">Výrobní cesta: </span>
                              {chainLabel(steps)}
                            </div>
                            {row.unmet > 0 && (
                              <div className={missing ? "text-destructive" : "text-amber-500"}>
                                {missing
                                  ? `Chybí stavba pro krok ${missing.good} — postav ${missing.buildings.map(b => `${b.building} (úroveň ${b.level})`).join(" nebo ") || "odpovídající dílnu"}.`
                                  : "Stavby jsou na místě — omezuje pracovní síla, kapacita, dopravní cesta nebo dodavatel vstupů."}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {row.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {row.sources.slice(0, 5).map(source => (
                            <Badge key={source.id} variant="secondary" className="text-[9px]">
                              {source.kind === "building" ? "🏗️" : "🏘️"} {source.name} +{fmt(source.amount, 1)}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {row.unmet > 0 && templatesForBasket.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] text-muted-foreground">Stavět:</span>
                          {templatesForBasket.map(template => (
                            <Button
                              key={template.id}
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] gap-1"
                              onClick={() => {
                                try {
                                  sessionStorage.setItem("goods.buildHint", JSON.stringify({ cityId: selected.city.id, templateId: template.id, basketKey: row.basketKey, ts: Date.now() }));
                                } catch {}
                                onTabChange?.("realm");
                              }}
                            >
                              <Hammer className="h-3 w-3" /> {template.name}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2 flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" /> Největší rozhodnutí
                </div>
                <div className="space-y-2">
                  {biggestProblems.length === 0 ? (
                    <div className="text-xs text-primary">Všechny zaznamenané koše jsou pokryté.</div>
                  ) : biggestProblems.map(row => {
                    const meta = getBasketMeta(row.basketKey);
                    return (
                      <div key={row.basketKey} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{meta.icon} {meta.label}</span>
                        <span className="font-mono text-destructive shrink-0">−{fmt(row.unmet, 1)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Exportní přebytky</div>
                <div className="space-y-2">
                  {biggestSurpluses.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Žádný výrazný přebytek k vývozu.</div>
                  ) : biggestSurpluses.map(row => {
                    const meta = getBasketMeta(row.basketKey);
                    return (
                      <div key={row.basketKey} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{meta.icon} {meta.label}</span>
                        <span className="font-mono text-primary shrink-0">+{fmt(row.surplus, 1)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Budovy a čtvrti ve městě</div>
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {sources.filter(source => source.cityId === selected.city.id).length === 0 ? (
                    <div className="text-xs text-muted-foreground">Žádná dokončená výrobní stavba nebo čtvrť s výstupem.</div>
                  ) : sources.filter(source => source.cityId === selected.city.id).map(source => {
                    const meta = getBasketMeta(source.basketKey);
                    return (
                      <div key={source.id} className="flex items-center justify-between gap-2 rounded bg-card/60 px-2 py-1.5 text-[11px]">
                        <span className="truncate">{source.kind === "building" ? "🏗️" : "🏘️"} {source.name}</span>
                        <span className="font-mono text-muted-foreground shrink-0">{meta.icon} +{fmt(source.amount, 1)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
};

export default CityEconomyAnalytics;