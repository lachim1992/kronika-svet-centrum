import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "sonner";
import {
  Wheat, Shield, Crown, Users, Building2, Loader2, Plus,
  Landmark, ScrollText, TrendingUp, ArrowUpCircle,
} from "lucide-react";
import {
  FACTION_TYPES, RATION_POLICIES,
  LABOR_KEYS, LABOR_LABELS, MAX_DISTRICTS, INFRA_UPGRADES, computeFactionPower,
} from "@/lib/cityGovernance";
import { availableDistrictBlueprints, districtsTowardHousingLimit, isLegacyProductionDistrict, storedDistrictBlueprint, type DistrictBlueprint } from "@/lib/cityDistricts";
import CityDistrictMap from "@/components/city/CityDistrictMap";

interface Props {
  sessionId: string;
  city: any;
  realm: any;
  currentPlayerName: string;
  currentTurn: number;
  isOwner: boolean;
  onRefetch?: () => void;
}

const CityGovernancePanel = ({ sessionId, city, realm, currentPlayerName, currentTurn, isOwner, onRefetch }: Props) => {
  const [districts, setDistricts] = useState<any[]>([]);
  const [parcelEconomyVersion, setParcelEconomyVersion] = useState(0);
  const [factions, setFactions] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Labor allocation local state
  const [labor, setLabor] = useState<Record<string, number>>(
    city.labor_allocation || { farming: 60, crafting: 25, scribes: 5, canal: 10 }
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [dRes, fRes, pRes, sRes] = await Promise.all([
      supabase.from("city_districts").select("*").eq("city_id", city.id).order("created_at"),
      supabase.from("city_factions").select("*").eq("city_id", city.id),
      supabase.from("city_policies").select("*").eq("city_id", city.id).eq("is_active", true),
      supabase.from("game_sessions").select("parcel_economy_version").eq("id", sessionId).single(),
    ]);
    setParcelEconomyVersion(Number(sRes.data?.parcel_economy_version || 0));
    setDistricts(dRes.data || []);
    setFactions(fRes.data || []);
    setPolicies(pRes.data || []);
    setLoading(false);
  }, [city.id, sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-init factions if empty
  useEffect(() => {
    if (!loading && factions.length === 0 && isOwner) {
      initFactions();
    }
  }, [loading, factions.length, isOwner]);

  const initFactions = async () => {
    const basePower = computeFactionPower(city);
    const inserts = Object.entries(FACTION_TYPES).map(([key, meta]) => ({
      session_id: sessionId,
      city_id: city.id,
      faction_type: key,
      power: basePower[key] || 20,
      loyalty: 50,
      satisfaction: 50,
      description: meta.description,
    }));
    await supabase.from("city_factions").upsert(inserts, { onConflict: "city_id,faction_type" });
    fetchData();
  };

  const maxDistricts = MAX_DISTRICTS[city.settlement_level] || 2;
  const countedDistricts = districtsTowardHousingLimit(districts, parcelEconomyVersion);
  const currentRation = city.ration_policy || "equal";

  // ── Save ration policy ──
  const handleRation = async (key: string) => {
    const preset = RATION_POLICIES[key];
    if (!preset) { toast.error("Neplatný přídělový režim"); return; }
    setSaving(true);
    const { dispatchCommand } = await import("@/lib/commands");
    const result = await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: currentPlayerName, type: "player" },
      commandType: "SET_RATION_POLICY",
      commandPayload: { cityId: city.id, policyKey: key },
    });
    if (!result.ok) toast.error(result.error || "Přídělový režim se nepodařilo změnit");
    else {
      toast.success(`Přídělový systém změněn na: ${preset.label}`);
      onRefetch?.();
      fetchData();
    }
    setSaving(false);
  };

  // ── Save labor allocation ──
  const handleLaborChange = (key: string, val: number) => {
    const remaining = 100 - val;
    const others = LABOR_KEYS.filter(k => k !== key);
    const otherTotal = others.reduce((s, k) => s + (labor[k] || 0), 0);
    const newLabor: Record<string, number> = { ...labor, [key]: val };
    if (otherTotal > 0) {
      for (const k of others) {
        newLabor[k] = Math.round((labor[k] / otherTotal) * remaining);
      }
    }
    setLabor(newLabor);
  };

  const saveLaborAllocation = async () => {
    setSaving(true);
    await supabase.from("cities").update({ labor_allocation: labor } as any).eq("id", city.id);
    toast.success("Rozdělení práce uloženo");
    setSaving(false);
    onRefetch?.();
  };

  // ── Build district: the server resolves every effect and price from districtKey ──
  const buildDistrict = async (blueprint: DistrictBlueprint) => {
    if (countedDistricts.length >= maxDistricts) {
      toast.error(`Maximum ${maxDistricts} čtvrtí pro ${city.settlement_level}`);
      return;
    }
    if (!realm) { toast.error("Nedostupné zdroje"); return; }
    const districtProdCost = (blueprint.build_cost_wood || 0) + (blueprint.build_cost_stone || 0);
    if ((realm.gold_reserve || 0) < blueprint.build_cost_wealth ||
        (realm.production_reserve || 0) < districtProdCost) {
      toast.error("Nedostatek surovin!");
      return;
    }
    setSaving(true);
    const { dispatchCommand } = await import("@/lib/commands");
    const res = await dispatchCommand({
      sessionId,
      turnNumber: currentTurn,
      actor: { name: currentPlayerName, type: "player" },
      commandType: "BUILD_DISTRICT",
      commandPayload: {
        cityId: city.id,
        districtKey: blueprint.key,
        basketKey: blueprint.district_type === "production" ? blueprint.baskets?.[0] : undefined,
        chronicleText: `V městě **${city.name}** byla zahájena výstavba nové čtvrti: **${blueprint.name}**. ${blueprint.description}`,
      },
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || "Nepodařilo se založit čtvrť");
      return;
    }
    toast.success(`🏗️ Výstavba "${blueprint.name}" zahájena!`);
    onRefetch?.();
    fetchData();
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* ─── FOOD MANAGEMENT ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Wheat className="h-4 w-4 text-primary" />Správa potravin
            <InfoTip>Přídělový systém ovlivňuje spotřebu obilí, stabilitu a spokojenost frakcí.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(RATION_POLICIES).map(([key, p]) => (
              <button
                key={key}
                disabled={!isOwner || saving}
                onClick={() => handleRation(key)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  currentRation === key
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <p className="text-xs font-display font-semibold">{p.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{p.description}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {p.grain_effect !== 0 && (
                    <Badge variant="outline" className="text-[9px]">
                      🌾 {p.grain_effect > 0 ? "+" : ""}{p.grain_effect}
                    </Badge>
                  )}
                  {p.stability_effect !== 0 && (
                    <Badge variant="outline" className="text-[9px]">
                      🛡️ {p.stability_effect > 0 ? "+" : ""}{p.stability_effect}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Granary info */}
          <div className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
            <span className="text-muted-foreground">Sýpka</span>
            <span className="font-semibold">{city.local_grain_reserve || 0} / {city.local_granary_capacity || 0}</span>
          </div>
        </CardContent>
      </Card>

      {/* ─── LABOR ALLOCATION ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />Organizace práce
            <InfoTip>Rozdělení populace mezi pole, dílny, písaře a kanály. Celkem musí být 100 %.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {LABOR_KEYS.map(key => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1">
                  <span>{LABOR_LABELS[key].icon}</span>
                  <span className="font-display font-semibold">{LABOR_LABELS[key].label}</span>
                  <InfoTip>{LABOR_LABELS[key].tip}</InfoTip>
                </span>
                <span className="font-semibold">{labor[key] || 0}%</span>
              </div>
              <Slider
                value={[labor[key] || 0]}
                onValueChange={([v]) => handleLaborChange(key, v)}
                min={0} max={80} step={5}
                disabled={!isOwner}
                className="h-2"
              />
            </div>
          ))
          }
          {isOwner && (
            <Button size="sm" onClick={saveLaborAllocation} disabled={saving} className="w-full text-xs">
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ScrollText className="h-3 w-3 mr-1" />}
              Uložit rozdělení
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ─── DISTRICT MAP ─── */}
      {districts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />Mapa čtvrtí
              <Badge variant="secondary" className="text-[10px] ml-auto">{countedDistricts.length}/{maxDistricts}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CityDistrictMap districts={districts} settlementLevel={city.settlement_level} parcelEconomyVersion={parcelEconomyVersion} />
          </CardContent>
        </Card>
      )}

      {/* ─── DISTRICTS LIST + BUILD ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />Čtvrtě města
            <Badge variant="secondary" className="text-[10px] ml-auto">{districts.length}/{maxDistricts}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Existing districts */}
          {districts.length > 0 && (
            <div className="space-y-2">
              {districts.map(d => {
                const tmpl = storedDistrictBlueprint(d);
                const isBuilding = d.status === "building";
                const legacyProduction = isLegacyProductionDistrict(d, parcelEconomyVersion);
                const turnsLeft = isBuilding ? (d.build_started_turn + d.build_turns - currentTurn) : 0;
                return (
                  <div key={d.id} className={`p-3 rounded-lg border ${isBuilding ? "border-muted bg-muted/20" : "border-border"}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{tmpl?.district_type === "production" ? (tmpl.key === "farm_belt" ? "🌾" : "⚒️") : "🏘️"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-semibold">{d.name}</p>
                        <p className="text-[10px] text-muted-foreground">{d.description}</p>
                      </div>
                      {isBuilding ? (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          🏗️ {turnsLeft > 0 ? `${turnsLeft} kol` : "Dokončuje se"}
                        </Badge>
                      ) : legacyProduction ? (
                        <Badge variant="outline" className="text-[10px] shrink-0">Legacy — neaktivní</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Aktivní</Badge>
                      )}
                    </div>
                    {!isBuilding && !legacyProduction && (
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {d.grain_modifier !== 0 && <Badge variant="outline" className="text-[9px]">🌾{d.grain_modifier > 0 ? "+" : ""}{d.grain_modifier}</Badge>}
                        {d.wealth_modifier !== 0 && <Badge variant="outline" className="text-[9px]">💰{d.wealth_modifier > 0 ? "+" : ""}{d.wealth_modifier}</Badge>}
                        {d.stability_modifier !== 0 && <Badge variant="outline" className="text-[9px]">🛡️{d.stability_modifier > 0 ? "+" : ""}{d.stability_modifier}</Badge>}
                        {d.population_capacity > 0 && <Badge variant="outline" className="text-[9px]">👥+{d.population_capacity}</Badge>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Build new district */}
          {isOwner && countedDistricts.length < maxDistricts && (
            <div className="space-y-2">
              <p className="text-xs font-display font-semibold flex items-center gap-1">
                <Plus className="h-3 w-3" />Založit novou čtvrť
              </p>
              <div className="grid grid-cols-2 gap-2">
                {availableDistrictBlueprints(parcelEconomyVersion).map(blueprint => (
                  <button
                    key={blueprint.key}
                    onClick={() => buildDistrict(blueprint)}
                    disabled={saving}
                    className="p-2 rounded-lg border border-border hover:border-primary/50 text-left transition-colors"
                  >
                    <p className="text-xs font-semibold">{blueprint.district_type === "production" ? "⚒️" : "🏘️"} {blueprint.name}</p>
                    <p className="text-[9px] text-muted-foreground line-clamp-2">{blueprint.description}</p>
                    <div className="flex gap-1 mt-1 text-[9px] text-muted-foreground">
                      <span>💰{blueprint.build_cost_wealth}</span>
                      <span>⚒️{(blueprint.build_cost_wood || 0) + (blueprint.build_cost_stone || 0)}</span>
                      <span>⏱️{blueprint.build_turns}k</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {districts.length === 0 && !isOwner && (
            <p className="text-xs text-muted-foreground italic text-center py-4">Město zatím nemá žádné čtvrtě.</p>
          )}
        </CardContent>
      </Card>

      {/* ─── FACTIONS ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Crown className="h-4 w-4 text-primary" />Rada města – Frakce
            <InfoTip>Síla frakcí vychází z demografie. Hráč může jmenovat vůdce a manipulovat s mocí.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {factions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Frakce zatím nejsou inicializovány.</p>
          ) : (
            <div className="space-y-3">
              {factions.map(f => {
                const meta = FACTION_TYPES[f.faction_type];
                const powerPct = Math.min(100, f.power);
                const satColor = f.satisfaction >= 50 ? "bg-primary/70" : f.satisfaction >= 25 ? "bg-yellow-500" : "bg-destructive";
                return (
                  <div key={f.id} className="p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">{meta?.icon || "👥"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-semibold">{meta?.label || f.faction_type}</p>
                        {f.leader_name && (
                          <p className="text-[10px] text-muted-foreground">Vůdce: {f.leader_name}{f.leader_trait ? ` (${f.leader_trait})` : ""}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground">Moc</p>
                        <p className="text-xs font-bold">{f.power}</p>
                      </div>
                    </div>
                    {/* Power bar */}
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted mb-1">
                      <div className="bg-primary/70" style={{ width: `${powerPct}%` }} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>Loajalita: <strong>{f.loyalty}</strong></span>
                      <span className="flex items-center gap-1">
                        Spokojenost:
                        <span className={`inline-block w-2 h-2 rounded-full ${satColor}`} />
                        <strong>{f.satisfaction}</strong>
                      </span>
                    </div>
                    {f.current_demand && (
                      <div className="mt-1 p-1.5 bg-muted/30 rounded">
                        <p className="text-[10px] italic">
                          📢 {f.current_demand}
                          {f.demand_urgency > 5 && <Badge variant="destructive" className="text-[8px] ml-1">Naléhavé</Badge>}
                        </p>
                        <p className="text-[9px] text-primary mt-0.5">
                          💡 Řešte požadavek dekretem v Královské radě
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── INFRASTRUCTURE UPGRADES ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />Infrastruktura
            <InfoTip>Investujte do zavlažování, chrámů a tržišť. Každá úroveň vyžaduje suroviny.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(INFRA_UPGRADES).map(([key, infra]) => {
            const currentLevel = (city as any)[infra.field] || 0;
            const atMax = currentLevel >= infra.maxLevel;
            const cost = {
              wealth: infra.costPerLevel.wealth * (currentLevel + 1),
              wood: infra.costPerLevel.wood * (currentLevel + 1),
              stone: infra.costPerLevel.stone * (currentLevel + 1),
            };
            const canAfford = realm &&
              (realm.gold_reserve || 0) >= cost.wealth &&
              (realm.production_reserve || 0) >= (cost.wood + cost.stone);

            return (
              <div key={key} className="p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{infra.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-display font-semibold">{infra.label}</p>
                    <p className="text-[10px] text-muted-foreground">{infra.effects}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold">{currentLevel}/{infra.maxLevel}</p>
                  </div>
                </div>
                {/* Level bar */}
                <div className="flex h-1.5 rounded-full overflow-hidden bg-muted mb-2">
                  <div className="bg-primary/70 transition-all" style={{ width: `${(currentLevel / infra.maxLevel) * 100}%` }} />
                </div>
                {isOwner && !atMax && (
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1 text-[9px] text-muted-foreground">
                      <span>💰{cost.wealth}</span>
                      <span>⚒️{cost.wood + cost.stone}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1"
                      disabled={saving || !canAfford}
                      onClick={async () => {
                        setSaving(true);
                        const { dispatchCommand } = await import("@/lib/commands");
                        const res = await dispatchCommand({
                          sessionId,
                          turnNumber: currentTurn,
                          actor: { name: currentPlayerName, type: "player" },
                          commandType: "UPGRADE_INFRASTRUCTURE",
                            commandPayload: {
                            cityId: city.id,
                            field: infra.field,
                            nextLevel: currentLevel + 1,
                            chronicleText: `V městě **${city.name}** byla vylepšena infrastruktura: **${infra.label}** na úroveň ${currentLevel + 1}.`,
                          },
                        });
                        setSaving(false);
                        if (!res.ok) {
                          toast.error(res.error || "Nepodařilo se vylepšit infrastrukturu");
                          return;
                        }
                        toast.success(`${infra.icon} ${infra.label} vylepšena na úroveň ${currentLevel + 1}!`);
                        onRefetch?.();
                      }}
                    >
                      <ArrowUpCircle className="h-3 w-3" />Vylepšit
                    </Button>
                  </div>
                )}
                {atMax && (
                  <p className="text-[10px] text-primary font-semibold">✓ Maximální úroveň</p>
                )}
              </div>
            );
          })}
          <div className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
            <span className="text-muted-foreground flex items-center gap-1">
              <Shield className="h-3 w-3" /> Legitimita
            </span>
            <span className="font-semibold">{city.legitimacy || 50}/100</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CityGovernancePanel;
