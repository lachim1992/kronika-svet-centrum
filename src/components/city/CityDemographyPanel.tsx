import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "sonner";
import {
  Users, ArrowUpCircle, ArrowDownCircle, Home, HeartPulse,
  TrendingUp, ArrowRightLeft, Loader2, Shield, Baby, Skull, Landmark,
} from "lucide-react";

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface Props {
  sessionId: string;
  city: any;
  currentPlayerName: string;
  currentTurn: number;
  isOwner: boolean;
  onRefetch?: () => void;
}

const DEMOGRAPHIC_POLICIES: Record<string, {
  label: string; description: string; key: string;
  effects: { mobility_modifier: number; migration_modifier: number; birth_rate_modifier: number; housing_modifier: number; stability_effect: number };
}> = {
  open_gates: {
    label: "Otevřené brány", description: "Přijímá osadníky. +migrace, -stabilita.", key: "open_gates",
    effects: { mobility_modifier: 0, migration_modifier: 0.02, birth_rate_modifier: 0, housing_modifier: 0, stability_effect: -3 },
  },
  closed_gates: {
    label: "Uzavřené brány", description: "Odmítá osadníky. Zastavuje migraci.", key: "closed_gates",
    effects: { mobility_modifier: 0, migration_modifier: -0.05, birth_rate_modifier: 0, housing_modifier: 0, stability_effect: 3 },
  },
  guild_charter: {
    label: "Cechovní listina", description: "Urychluje přechod sedláků na měšťany.", key: "guild_charter",
    effects: { mobility_modifier: 1.5, migration_modifier: 0, birth_rate_modifier: 0, housing_modifier: 0, stability_effect: 0 },
  },
  natalist: {
    label: "Pronatální edikt", description: "Pobídky k porodnosti. +růst, -stabilita.", key: "natalist",
    effects: { mobility_modifier: 0, migration_modifier: 0, birth_rate_modifier: 0.005, housing_modifier: 0, stability_effect: -1 },
  },
  quarantine: {
    label: "Karanténa", description: "Snižuje riziko epidemie. Omezuje obchod.", key: "quarantine",
    effects: { mobility_modifier: -0.5, migration_modifier: -0.03, birth_rate_modifier: 0, housing_modifier: 0, stability_effect: 2 },
  },
  housing_decree: {
    label: "Stavební dekret", description: "Investice do bydlení. +kapacita, +stabilita.", key: "housing_decree",
    effects: { mobility_modifier: 0, migration_modifier: 0.01, birth_rate_modifier: 0, housing_modifier: 100, stability_effect: 1 },
  },
};

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

const CityDemographyPanel = ({ sessionId, city, currentPlayerName, currentTurn, isOwner, onRefetch }: Props) => {
  const [activePolicy, setActivePolicy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [migrationHistory, setMigrationHistory] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      // Get active demographic policy
      const { data: policyData } = await supabase
        .from("city_policies")
        .select("*")
        .eq("city_id", city.id)
        .eq("policy_category", "demography")
        .eq("is_active", true)
        .maybeSingle();
      if (policyData) setActivePolicy(policyData.policy_key);

      // Get recent migration events
      const { data: migEvents } = await supabase
        .from("game_events")
        .select("*")
        .eq("session_id", sessionId)
        .or(`city_id.eq.${city.id},secondary_city_id.eq.${city.id}`)
        .in("event_type", ["migration_in", "migration_out", "epidemic"])
        .order("turn_number", { ascending: false })
        .limit(5);
      setMigrationHistory(migEvents || []);
    };
    fetchData();
  }, [city.id, sessionId]);

  const handleSetPolicy = async (key: string) => {
    setSaving(true);
    const policy = DEMOGRAPHIC_POLICIES[key];
    // Deactivate previous
    await supabase.from("city_policies").update({ is_active: false } as any)
      .eq("city_id", city.id).eq("policy_category", "demography");
    // Insert new
    await supabase.from("city_policies").upsert({
      session_id: sessionId, city_id: city.id,
      policy_category: "demography", policy_key: key,
      policy_value: key, description: policy.description,
      stability_effect: policy.effects.stability_effect,
      enacted_turn: currentTurn, enacted_by: currentPlayerName,
      is_active: true,
    } as any, { onConflict: "city_id,policy_category,policy_key" });
    setActivePolicy(key);
    toast.success(`Demografická politika: ${policy.label}`);
    setSaving(false);
    onRefetch?.();
  };

  // Computed values
  const pop = city.population_total || 0;
  const housingCap = city.housing_capacity || 500;
  const overcrowding = pop > 0 && housingCap > 0 ? pop / housingCap : 0;
  const isOvercrowded = overcrowding > 1.0;
  const mobilityRate = city.mobility_rate || 0;
  const diseaseLevel = city.disease_level || 0;
  const epidemicActive = city.epidemic_active || false;
  const migrationPressure = city.migration_pressure || 0;
  const birthRate = city.birth_rate || 0.01;
  const deathRate = city.death_rate || 0.005;
  const naturalGrowth = Math.round(pop * (birthRate - deathRate));

  const peasantPct = pop > 0 ? ((city.population_peasants || 0) / pop * 100) : 0;
  const burgherPct = pop > 0 ? ((city.population_burghers || 0) / pop * 100) : 0;
  const clericPct = pop > 0 ? ((city.population_clerics || 0) / pop * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ─── POPULATION PYRAMID ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />Populační struktura
            <Badge variant="outline" className="text-[10px] ml-auto">{pop.toLocaleString()} obyvatel</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Population bar */}
          <div className="space-y-1.5">
            <PopBar label="Sedláci" value={city.population_peasants || 0} pct={peasantPct} color="bg-primary/60" icon="🌾" />
            <PopBar label="Měšťané" value={city.population_burghers || 0} pct={burgherPct} color="bg-accent" icon="⚒️" />
            <PopBar label="Klérus" value={city.population_clerics || 0} pct={clericPct} color="bg-muted-foreground/50" icon="⛪" />
          </div>

          {/* Social mobility indicator */}
          <div className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
            <span className="flex items-center gap-1 text-muted-foreground">
              <ArrowUpCircle className="h-3 w-3" />Sociální mobilita
              <InfoTip>Rychlost, jakou sedláci přecházejí na měšťany a měšťané na kleriky. Závisí na tržišti, chrámech a písmácích.</InfoTip>
            </span>
            <span className="font-semibold">{(mobilityRate * 100).toFixed(1)}%</span>
          </div>
        </CardContent>
      </Card>

      {/* ─── VITAL STATS ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" />Vitální statistiky
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <StatItem icon={<Baby className="h-3.5 w-3.5 text-primary" />} label="Porodnost" value={`${(birthRate * 100).toFixed(1)}%`} />
            <StatItem icon={<Skull className="h-3.5 w-3.5 text-destructive" />} label="Úmrtnost" value={`${(deathRate * 100).toFixed(1)}%`} />
            <StatItem icon={<TrendingUp className="h-3.5 w-3.5" />} label="Přirozený přírůstek"
              value={`${naturalGrowth > 0 ? "+" : ""}${naturalGrowth}`}
              className={naturalGrowth >= 0 ? "text-primary" : "text-destructive"} />
            <StatItem icon={<ArrowRightLeft className="h-3.5 w-3.5" />} label="Migrační tlak"
              value={`${migrationPressure > 0 ? "+" : ""}${(migrationPressure * 100).toFixed(1)}%`}
              className={migrationPressure >= 0 ? "text-primary" : "text-destructive"} />
          </div>

          {/* Migration history */}
          {migrationHistory.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-[10px] text-muted-foreground font-semibold">Nedávná migrace:</p>
              {migrationHistory.map(e => (
                <div key={e.id} className="text-[10px] flex items-center gap-1.5 text-muted-foreground">
                  <Badge variant="outline" className="text-[9px] shrink-0">Rok {e.turn_number}</Badge>
                  <span>{e.note}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── HOUSING & HEALTH ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />Bydlení & Zdraví
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Housing bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Kapacita bydlení</span>
              <span className={`font-semibold ${isOvercrowded ? "text-destructive" : ""}`}>
                {pop.toLocaleString()} / {housingCap.toLocaleString()}
              </span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              <div
                className={`transition-all ${isOvercrowded ? "bg-destructive" : overcrowding > 0.8 ? "bg-yellow-500" : "bg-primary/70"}`}
                style={{ width: `${Math.min(100, overcrowding * 100)}%` }}
              />
            </div>
            {isOvercrowded && (
              <p className="text-[10px] text-destructive flex items-center gap-1">
                ⚠️ Přelidnění ({(overcrowding * 100).toFixed(0)}%) — riziko epidemie a emigrace!
              </p>
            )}
          </div>

          {/* Disease level */}
          <div className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
            <span className="flex items-center gap-1 text-muted-foreground">
              <HeartPulse className="h-3 w-3" />Nákaza
              <InfoTip>Úroveň nemocí. Nad 50 hrozí epidemie. Přelidnění a nízká stabilita ji zvyšují.</InfoTip>
            </span>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${diseaseLevel > 50 ? "bg-destructive" : "bg-primary/50"}`}
                  style={{ width: `${diseaseLevel}%` }} />
              </div>
              <span className={`font-semibold ${diseaseLevel > 50 ? "text-destructive" : ""}`}>{diseaseLevel}</span>
            </div>
          </div>

          {/* Active epidemic warning */}
          {epidemicActive && (
            <div className="p-3 rounded-lg border border-destructive/50 bg-destructive/5">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                🦠 Epidemie zuří v {city.name}!
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Úmrtnost je zvýšená. Zvažte karanténní politiku.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── DEMOGRAPHIC POLICIES (PREVIEW) ─── */}
      {isOwner && (
        <Card className="opacity-75">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Landmark className="h-4 w-4 text-muted-foreground" />Demografická politika
              <Badge variant="outline" className="text-[9px] ml-1">Preview</Badge>
              <InfoTip>Tato sekce je vizuální náhled. Politiky zatím nemají mechanický dopad v enginu.</InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(DEMOGRAPHIC_POLICIES).map(([key, p]) => (
                <button
                  key={key}
                  disabled={saving}
                  onClick={() => handleSetPolicy(key)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    activePolicy === key
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <p className="text-xs font-display font-semibold">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{p.description}</p>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {p.effects.stability_effect !== 0 && (
                      <Badge variant="outline" className="text-[9px]">
                        🛡️{p.effects.stability_effect > 0 ? "+" : ""}{p.effects.stability_effect}
                      </Badge>
                    )}
                    {p.effects.migration_modifier !== 0 && (
                      <Badge variant="outline" className="text-[9px]">
                        🚶{p.effects.migration_modifier > 0 ? "+" : ""}{(p.effects.migration_modifier * 100).toFixed(0)}%
                      </Badge>
                    )}
                    {p.effects.mobility_modifier !== 0 && (
                      <Badge variant="outline" className="text-[9px]">
                        📈×{p.effects.mobility_modifier > 0 ? p.effects.mobility_modifier.toFixed(1) : p.effects.mobility_modifier}
                      </Badge>
                    )}
                    {p.effects.birth_rate_modifier !== 0 && (
                      <Badge variant="outline" className="text-[9px]">
                        👶+{(p.effects.birth_rate_modifier * 100).toFixed(1)}%
                      </Badge>
                    )}
                    {p.effects.housing_modifier !== 0 && (
                      <Badge variant="outline" className="text-[9px]">
                        🏠+{p.effects.housing_modifier}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════

function PopBar({ label, value, pct, color, icon }: { label: string; value: number; pct: number; color: string; icon: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1">
          <span>{icon}</span>
          <span className="font-display font-semibold">{label}</span>
        </span>
        <span className="text-muted-foreground">{value.toLocaleString()} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        <div className={color} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatItem({ icon, label, value, className = "" }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded text-xs">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-muted-foreground text-[10px]">{label}</p>
        <p className={`font-semibold ${className}`}>{value}</p>
      </div>
    </div>
  );
}

export default CityDemographyPanel;
