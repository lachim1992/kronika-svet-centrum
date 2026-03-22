import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FlaskConical, Loader2, ChevronDown, AlertTriangle, CheckCircle, Info, Sprout, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { SETTLEMENT_TEMPLATES } from "@/lib/turnEngine";

interface Issue {
  severity: "error" | "warning" | "info";
  group: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  field?: string;
  message: string;
  fix?: string;
}

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

const EconomyQASection = ({ sessionId, onRefetch }: Props) => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [done, setDone] = useState(false);

  const runTests = async () => {
    setRunning(true);
    setDone(false);
    const found: Issue[] = [];

    try {
      // 1) Schema check - new tables exist
      const tables = ["realm_resources", "realm_infrastructure", "military_stacks", "military_stack_composition", "generals", "legacy_military_map"];
      for (const t of tables) {
        const { error } = await supabase.from(t as any).select("id").limit(1);
        if (error) {
          found.push({ severity: "error", group: "Schema", entityType: "table", message: `Tabulka '${t}' neexistuje nebo není dostupná`, fix: "Spusťte migraci" });
        } else {
          found.push({ severity: "info", group: "Schema", entityType: "table", message: `Tabulka '${t}' existuje ✓` });
        }
      }

      // 2) Check city columns
      const { data: cities } = await supabase.from("cities").select("id, name, settlement_level, population_total, population_peasants, population_burghers, population_clerics, city_stability").eq("session_id", sessionId).limit(5);
      if (cities && cities.length > 0) {
        for (const city of cities) {
          // Conservation check: layers must sum to total
          const layerSum = (city.population_peasants || 0) + (city.population_burghers || 0) + (city.population_clerics || 0);
          if (layerSum !== (city.population_total || 0)) {
            found.push({
              severity: "error", group: "Conservation", entityType: "city",
              entityId: city.id, entityName: city.name,
              message: `Populační vrstvy (${layerSum}) ≠ total (${city.population_total})`,
              fix: "Přepočítat vrstvy podle šablony",
            });
          } else {
            found.push({ severity: "info", group: "Conservation", entityType: "city", entityName: city.name, message: `Populace validní: ${layerSum} = total ✓` });
          }

          // Stability range
          if (city.city_stability < 0 || city.city_stability > 100) {
            found.push({
              severity: "error", group: "Conservation", entityType: "city",
              entityName: city.name, message: `Stabilita mimo rozsah: ${city.city_stability}`,
            });
          }
        }
      }

      // 3) Realm resources checks
      const { data: realms } = await supabase.from("realm_resources").select("*").eq("session_id", sessionId);
      for (const r of (realms || [])) {
        if (r.grain_reserve > r.granary_capacity) {
          found.push({
            severity: "error", group: "Conservation", entityType: "realm",
            entityName: r.player_name, message: `Zásoby obilí (${r.grain_reserve}) > kapacita sýpek (${r.granary_capacity})`,
          });
        }
        if (r.manpower_committed > r.manpower_pool) {
          found.push({
            severity: "warning", group: "Conservation", entityType: "realm",
            entityName: r.player_name, message: `Odvedení muži (${r.manpower_committed}) > manpower pool (${r.manpower_pool})`,
          });
        }
      }

      // 4) Military stack integrity
      const { data: stacks } = await supabase.from("military_stacks").select("id, name, player_name, general_id").eq("session_id", sessionId);
      for (const s of (stacks || [])) {
        // Check compositions exist
        const { data: comps } = await supabase.from("military_stack_composition").select("id").eq("stack_id", s.id);
        if (!comps || comps.length === 0) {
          found.push({
            severity: "warning", group: "Integrity", entityType: "military_stack",
            entityName: s.name, message: "Stack bez kompozice (žádné jednotky)",
          });
        }
        // Check general FK
        if (s.general_id) {
          const { data: gen } = await supabase.from("generals").select("id").eq("id", s.general_id).maybeSingle();
          if (!gen) {
            found.push({
              severity: "error", group: "Integrity", entityType: "military_stack",
              entityName: s.name, message: "Neplatný odkaz na generála",
            });
          }
        }
      }

      // 5) Turn idempotency check
      for (const r of (realms || [])) {
        const { data: session } = await supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single();
        if (session && r.last_processed_turn > session.current_turn) {
          found.push({
            severity: "error", group: "Idempotency", entityType: "realm",
            entityName: r.player_name, message: `last_processed_turn (${r.last_processed_turn}) > current_turn (${session.current_turn})`,
          });
        }
      }

    } catch (e: any) {
      found.push({ severity: "error", group: "System", entityType: "qa", message: `QA chyba: ${e.message}` });
    }

    setIssues(found);
    setRunning(false);
    setDone(true);
  };

  const handleSeedRealm = async () => {
    setSeeding(true);
    try {
      // Check if realm_resources already exist for any player
      const { data: existing } = await supabase.from("realm_resources").select("id").eq("session_id", sessionId).limit(1);
      if (existing && existing.length > 0) {
        toast.info("Realm resources již existují, seed přeskočen");
        setSeeding(false);
        return;
      }

      // Get players
      const { data: players } = await supabase.from("game_players").select("player_name").eq("session_id", sessionId);
      for (const p of (players || [])) {
        await supabase.from("realm_resources").insert({ session_id: sessionId, player_name: p.player_name });
        await supabase.from("realm_infrastructure").insert({ session_id: sessionId, player_name: p.player_name });
      }

      toast.success("Realm data zaseta");
      onRefetch?.();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSeeding(false);
    }
  };

  const [recomputing, setRecomputing] = useState(false);

  const handleRecomputeIncomes = async () => {
    setRecomputing(true);
    try {
      const { data: players } = await supabase
        .from("game_players")
        .select("player_name")
        .eq("session_id", sessionId);

      for (const p of (players || [])) {
        const { data: cities } = await supabase
          .from("cities")
          .select("id, status")
          .eq("session_id", sessionId)
          .ilike("owner_player", p.player_name);

        const okCities = (cities || []).filter(c => c.status === "ok" || !c.status);
        const cityIds = okCities.map(c => c.id);

        let productionIncome = 0;

        if (cityIds.length > 0) {
          const { data: profiles } = await supabase
            .from("settlement_resource_profiles")
            .select("base_grain, base_wood, base_special, special_resource_type")
            .in("city_id", cityIds);

          for (const pr of (profiles || [])) {
            productionIncome += (pr.base_wood || 0) + (pr.base_special || 0);
          }
        }

        const incomes: Record<string, number> = {
          food: productionIncome, // Legacy compat: food key maps to grain via profiles
          production: productionIncome,
          wealth: okCities.length,
        };

        for (const [resType, income] of Object.entries(incomes)) {
          const { data: updated } = await supabase
            .from("player_resources")
            .update({ income, updated_at: new Date().toISOString() })
            .eq("session_id", sessionId)
            .ilike("player_name", p.player_name)
            .eq("resource_type", resType)
            .select("id");

          if (!updated || updated.length === 0) {
            await supabase.from("player_resources").insert({
              session_id: sessionId,
              player_name: p.player_name.toLowerCase(),
              resource_type: resType,
              income, stockpile: 0, upkeep: 0, last_applied_turn: 0,
            });
          }
        }

        toast.success(`${p.player_name}: prod+${productionIncome} wealth+${okCities.length}`);
      }
      onRefetch?.();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRecomputing(false);
    }
  };

  const errors = issues.filter(i => i.severity === "error").length;
  const warnings = issues.filter(i => i.severity === "warning").length;
  const infos = issues.filter(i => i.severity === "info").length;
  const groups = [...new Set(issues.map(i => i.group))];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button onClick={runTests} disabled={running} size="sm" className="font-display">
          {running ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FlaskConical className="h-3 w-3 mr-1" />}
          Spustit Economy QA
        </Button>
        <Button onClick={handleSeedRealm} disabled={seeding} size="sm" variant="outline" className="font-display">
          {seeding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sprout className="h-3 w-3 mr-1" />}
          Seed Realm Data
        </Button>
        <Button onClick={handleRecomputeIncomes} disabled={recomputing} size="sm" variant="outline" className="font-display">
          {recomputing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <BarChart3 className="h-3 w-3 mr-1" />}
          Recompute Incomes
        </Button>
      </div>

      {done && (
        <>
          <div className="flex gap-2">
            <Badge variant="destructive" className="text-xs">{errors} chyb</Badge>
            <Badge variant="outline" className="text-xs border-amber-500 text-amber-700">{warnings} varování</Badge>
            <Badge variant="secondary" className="text-xs">{infos} info</Badge>
          </div>

          {groups.map(group => (
            <Collapsible key={group}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded bg-card border hover:bg-muted/50">
                <ChevronDown className="h-3 w-3" />
                <span className="text-sm font-display font-semibold">{group}</span>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {issues.filter(i => i.group === group).length}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-1 pl-4">
                {issues.filter(i => i.group === group).map((issue, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs p-1.5 rounded bg-muted/30">
                    {issue.severity === "error" && <AlertTriangle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                    {issue.severity === "warning" && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />}
                    {issue.severity === "info" && <CheckCircle className="h-3 w-3 text-green-600 shrink-0 mt-0.5" />}
                    <div>
                      <span className="font-semibold">{issue.entityName || issue.entityType}</span>
                      <span className="text-muted-foreground ml-1">— {issue.message}</span>
                      {issue.fix && <div className="text-[10px] text-muted-foreground mt-0.5">💡 {issue.fix}</div>}
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </>
      )}
    </div>
  );
};

export default EconomyQASection;
