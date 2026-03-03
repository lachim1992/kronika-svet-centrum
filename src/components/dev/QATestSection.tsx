import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  FlaskConical, Loader2, CheckCircle2, XCircle, AlertTriangle, Info,
  ChevronDown, ChevronRight, Database, Link2, Shield, Eye,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

type Severity = "error" | "warning" | "info";

interface Issue {
  severity: Severity;
  group: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  field?: string;
  message: string;
  fix?: string;
}

interface GroupResult {
  name: string;
  icon: React.ReactNode;
  issues: Issue[];
  passed: number;
  total: number;
}

const SeverityIcon = ({ s }: { s: Severity }) => {
  if (s === "error") return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  if (s === "warning") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  return <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
};

const QATestSection = ({ sessionId, onRefetch }: Props) => {
  const [running, setRunning] = useState(false);
  const [groups, setGroups] = useState<GroupResult[]>([]);
  const [progressLabel, setProgressLabel] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [fixing, setFixing] = useState(false);

  const toggle = (name: string) => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  // ================================================================
  // STRUCTURAL QA
  // ================================================================
  const runStructural = useCallback(async (): Promise<GroupResult> => {
    setProgressLabel("Structural QA...");
    const issues: Issue[] = [];
    let passed = 0;
    let total = 0;
    const g = "Structural";

    const [
      { data: countries }, { data: regions }, { data: provinces },
      { data: cities }, { data: wonders }, { data: persons },
    ] = await Promise.all([
      supabase.from("countries").select("id, name").eq("session_id", sessionId),
      supabase.from("regions").select("id, name, country_id").eq("session_id", sessionId),
      supabase.from("provinces").select("id, name, region_id").eq("session_id", sessionId),
      supabase.from("cities").select("id, name, province_id").eq("session_id", sessionId),
      supabase.from("wonders").select("id, name, city_name, session_id").eq("session_id", sessionId),
      supabase.from("great_persons").select("id, name, city_id").eq("session_id", sessionId),
    ]);

    const countryIds = new Set((countries || []).map(c => c.id));
    const regionIds = new Set((regions || []).map(r => r.id));
    const provinceIds = new Set((provinces || []).map(p => p.id));
    const cityIds = new Set((cities || []).map(c => c.id));

    // Country exists
    total++;
    if (!countries?.length) {
      issues.push({ severity: "error", group: g, entityType: "country", message: "Žádný stát neexistuje", fix: "Vytvořte stát pomocí Seed nástrojů" });
    } else passed++;

    // Regions → Country
    for (const r of regions || []) {
      total++;
      if (!r.country_id) {
        issues.push({ severity: "error", group: g, entityType: "region", entityId: r.id, entityName: r.name, field: "country_id", message: "Region bez státu", fix: "Přiřadit k existujícímu státu" });
      } else if (!countryIds.has(r.country_id)) {
        issues.push({ severity: "error", group: g, entityType: "region", entityId: r.id, entityName: r.name, field: "country_id", message: `Neplatná reference na stát (${r.country_id.slice(0,8)})`, fix: "Opravit nebo přiřadit k platnému státu" });
      } else passed++;
    }

    // Provinces → Region
    for (const p of provinces || []) {
      total++;
      if (!p.region_id) {
        issues.push({ severity: "error", group: g, entityType: "province", entityId: p.id, entityName: p.name, field: "region_id", message: "Provincie bez regionu", fix: "Přiřadit k regionu" });
      } else if (!regionIds.has(p.region_id)) {
        issues.push({ severity: "error", group: g, entityType: "province", entityId: p.id, entityName: p.name, field: "region_id", message: `Neplatná reference na region`, fix: "Opravit referenci" });
      } else passed++;
    }

    // Cities → Province
    for (const c of cities || []) {
      total++;
      if (!c.province_id) {
        issues.push({ severity: "warning", group: g, entityType: "city", entityId: c.id, entityName: c.name, field: "province_id", message: "Město bez provincie", fix: "Přiřadit k provincii" });
      } else if (!provinceIds.has(c.province_id)) {
        issues.push({ severity: "error", group: g, entityType: "city", entityId: c.id, entityName: c.name, field: "province_id", message: "Neplatná reference na provincii", fix: "Opravit referenci" });
      } else passed++;
    }

    // Wonders without city
    for (const w of wonders || []) {
      total++;
      if (!w.city_name) {
        issues.push({ severity: "warning", group: g, entityType: "wonder", entityId: w.id, entityName: w.name, field: "city_name", message: "Div bez přiřazeného města", fix: "Přiřadit město" });
      } else passed++;
    }

    // Persons without city
    for (const p of persons || []) {
      total++;
      if (p.city_id && !cityIds.has(p.city_id)) {
        issues.push({ severity: "warning", group: g, entityType: "person", entityId: p.id, entityName: p.name, field: "city_id", message: "Neplatná reference na město", fix: "Opravit referenci" });
      } else passed++;
    }

    // Duplicate names
    const regionNames = (regions || []).map(r => r.name);
    const provNames = (provinces || []).map(p => p.name);
    const cityNames = (cities || []).map(c => c.name);
    for (const [label, names] of [["region", regionNames], ["province", provNames], ["city", cityNames]] as const) {
      const seen = new Map<string, number>();
      for (const n of names) seen.set(n, (seen.get(n) || 0) + 1);
      for (const [name, count] of seen) {
        if (count > 1) {
          total++;
          issues.push({ severity: "warning", group: g, entityType: label, entityName: name, message: `Duplicitní název (${count}×)`, fix: "Přejmenovat nebo sloučit" });
        }
      }
    }

    return { name: "🏗️ Strukturální QA", icon: <Shield className="h-4 w-4" />, issues, passed, total };
  }, [sessionId]);

  // ================================================================
  // LOGICAL QA
  // ================================================================
  const runLogical = useCallback(async (): Promise<GroupResult> => {
    setProgressLabel("Logical QA...");
    const issues: Issue[] = [];
    let passed = 0;
    let total = 0;
    const g = "Logical";

    const [
      { data: events }, { data: chronicles },
      { data: cities }, { data: players },
    ] = await Promise.all([
      supabase.from("game_events").select("id, event_type, turn_number, location, player, city_id, confirmed, note, attacker_city_id, defender_city_id, result, actor_type").eq("session_id", sessionId),
      supabase.from("chronicle_entries").select("id, text, turn_from, turn_to").eq("session_id", sessionId),
      supabase.from("cities").select("id").eq("session_id", sessionId),
      supabase.from("game_players").select("player_name").eq("session_id", sessionId),
    ]);

    const cityIds = new Set((cities || []).map(c => c.id));
    const playerNames = new Set((players || []).map(p => p.player_name));
    const chronicleTurns = new Set<number>();
    for (const ch of chronicles || []) {
      if (ch.turn_from != null) for (let t = ch.turn_from; t <= (ch.turn_to ?? ch.turn_from); t++) chronicleTurns.add(t);
    }

    for (const evt of events || []) {
      // Required fields
      total++;
      if (!evt.event_type) {
        issues.push({ severity: "error", group: g, entityType: "event", entityId: evt.id, message: "Událost bez typu", fix: "Doplnit event_type" });
      } else passed++;

      total++;
      if (evt.turn_number == null || evt.turn_number < 0) {
        issues.push({ severity: "warning", group: g, entityType: "event", entityId: evt.id, message: "Událost bez platného kola", fix: "Nastavit turn_number" });
      } else passed++;

      // Battle-specific
      if (evt.event_type === "battle") {
        total++;
        if (!evt.attacker_city_id && !evt.defender_city_id && evt.actor_type !== "historical") {
          issues.push({ severity: "warning", group: g, entityType: "event", entityId: evt.id, message: "Bitva bez účastníků (attacker/defender)", fix: "Doplnit strany konfliktu" });
        } else passed++;

        total++;
        if (!evt.result) {
          issues.push({ severity: "info", group: g, entityType: "event", entityId: evt.id, message: "Bitva bez výsledku", fix: "Doplnit výsledek" });
        } else passed++;
      }

      // City reference validity
      if (evt.city_id) {
        total++;
        if (!cityIds.has(evt.city_id)) {
          issues.push({ severity: "error", group: g, entityType: "event", entityId: evt.id, field: "city_id", message: "Reference na neexistující město", fix: "Opravit city_id" });
        } else passed++;
      }
      if (evt.attacker_city_id) {
        total++;
        if (!cityIds.has(evt.attacker_city_id)) {
          issues.push({ severity: "error", group: g, entityType: "event", entityId: evt.id, field: "attacker_city_id", message: "Útočník: neexistující město", fix: "Opravit referenci" });
        } else passed++;
      }
      if (evt.defender_city_id) {
        total++;
        if (!cityIds.has(evt.defender_city_id)) {
          issues.push({ severity: "error", group: g, entityType: "event", entityId: evt.id, field: "defender_city_id", message: "Obránce: neexistující město", fix: "Opravit referenci" });
        } else passed++;
      }

      // Player reference
      total++;
      if (evt.player && !playerNames.has(evt.player)) {
        issues.push({ severity: "warning", group: g, entityType: "event", entityId: evt.id, field: "player", message: `Hráč "${evt.player}" neexistuje v game_players`, fix: "Opravit jméno hráče" });
      } else passed++;

      // Chronicle coverage
      if (evt.confirmed && evt.turn_number) {
        total++;
        if (!chronicleTurns.has(evt.turn_number)) {
          issues.push({ severity: "info", group: g, entityType: "event", entityId: evt.id, message: `Kolo ${evt.turn_number} nemá záznam v kronice`, fix: "Vygenerovat kroniku pro toto kolo" });
        } else passed++;
      }
    }

    // Players should have at least 1 event
    for (const pn of playerNames) {
      total++;
      const hasEvents = (events || []).some(e => e.player === pn);
      if (!hasEvents) {
        issues.push({ severity: "info", group: g, entityType: "player", entityName: pn, message: "Hráč nemá žádné události", fix: "Spustit simulaci" });
      } else passed++;
    }

    return { name: "🧠 Logická QA", icon: <Eye className="h-4 w-4" />, issues, passed, total };
  }, [sessionId]);

  // ================================================================
  // DATABASE INTEGRITY
  // ================================================================
  const runIntegrity = useCallback(async (): Promise<GroupResult> => {
    setProgressLabel("Database Integrity...");
    const issues: Issue[] = [];
    let passed = 0;
    let total = 0;
    const g = "Integrity";

    const [
      { data: wikiEntries }, { data: entityTraits },
      { data: contributions }, { data: narratives },
      { data: eventLinks }, { data: dipRooms },
      { data: dipMsgs }, { data: cityRumors },
      { data: expeditions }, { data: cityStates },
    ] = await Promise.all([
      supabase.from("wiki_entries").select("id, entity_id, entity_type, entity_name").eq("session_id", sessionId),
      supabase.from("entity_traits").select("id, entity_id, entity_name, entity_type, source_event_id").eq("session_id", sessionId),
      supabase.from("entity_contributions").select("id, entity_id, entity_type, title").eq("session_id", sessionId),
      supabase.from("event_narratives").select("id, event_id"),
      supabase.from("event_entity_links").select("id, event_id, entity_id, entity_type"),
      supabase.from("diplomacy_rooms").select("id, session_id, npc_city_state_id").eq("session_id", sessionId),
      // diplomacy_messages loaded below after we know room_ids
      Promise.resolve({ data: null }),
      supabase.from("city_rumors").select("id, city_id, related_event_id, city_name").eq("session_id", sessionId),
      supabase.from("expeditions").select("id, result_region_id, player_name").eq("session_id", sessionId),
      supabase.from("city_states").select("id").eq("session_id", sessionId),
    ]);

    // Load reference sets
    const [
      { data: allCities }, { data: allRegions }, { data: allEvents },
    ] = await Promise.all([
      supabase.from("cities").select("id").eq("session_id", sessionId),
      supabase.from("regions").select("id").eq("session_id", sessionId),
      supabase.from("game_events").select("id").eq("session_id", sessionId),
    ]);
    const cityIds = new Set((allCities || []).map(c => c.id));
    const regionIds = new Set((allRegions || []).map(r => r.id));
    const eventIds = new Set((allEvents || []).map(e => e.id));
    const roomIds = new Set((dipRooms || []).map(r => r.id));
    const csIds = new Set((cityStates || []).map(cs => cs.id));

    // Load diplomacy messages scoped to this session's rooms
    const roomIdArr = Array.from(roomIds);
    let sessionDipMsgs: Array<{ id: string; room_id: string }> = [];
    if (roomIdArr.length > 0) {
      const { data: msgs } = await supabase
        .from("diplomacy_messages")
        .select("id, room_id")
        .in("room_id", roomIdArr)
        .limit(1000);
      sessionDipMsgs = msgs || [];
    }

    // Wiki → entity_id validity
    for (const w of wikiEntries || []) {
      if (w.entity_id) {
        total++;
        if (w.entity_type === "city" && !cityIds.has(w.entity_id)) {
          issues.push({ severity: "warning", group: g, entityType: "wiki_entry", entityId: w.id, entityName: w.entity_name, field: "entity_id", message: "Wiki odkazuje na neexistující město", fix: "Opravit entity_id" });
        } else passed++;
      }
    }

    // Entity traits → source_event_id
    for (const t of entityTraits || []) {
      if (t.source_event_id) {
        total++;
        if (!eventIds.has(t.source_event_id)) {
          issues.push({ severity: "warning", group: g, entityType: "entity_trait", entityId: t.id, entityName: t.entity_name, field: "source_event_id", message: "Trait odkazuje na neexistující událost", fix: "Opravit referenci" });
        } else passed++;
      }
    }

    // Event narratives → event_id
    for (const n of narratives || []) {
      total++;
      if (!eventIds.has(n.event_id)) {
        issues.push({ severity: "error", group: g, entityType: "event_narrative", entityId: n.id, field: "event_id", message: "Narativ odkazuje na neexistující událost", fix: "Smazat osiřelý narativ" });
      } else passed++;
    }

    // Diplomacy messages → room_id (already scoped to this session)
    for (const m of sessionDipMsgs) {
      total++;
      if (!roomIds.has(m.room_id)) {
        issues.push({ severity: "warning", group: g, entityType: "diplomacy_message", entityId: m.id, field: "room_id", message: "Zpráva odkazuje na neexistující místnost", fix: "Opravit referenci" });
      } else passed++;
    }

    // Diplomacy rooms → npc_city_state_id
    for (const r of dipRooms || []) {
      if (r.npc_city_state_id) {
        total++;
        if (!csIds.has(r.npc_city_state_id)) {
          issues.push({ severity: "warning", group: g, entityType: "diplomacy_room", entityId: r.id, field: "npc_city_state_id", message: "Místnost odkazuje na neexistující městský stát", fix: "Opravit referenci" });
        } else passed++;
      }
    }

    // City rumors → city_id
    for (const cr of cityRumors || []) {
      total++;
      if (!cityIds.has(cr.city_id)) {
        issues.push({ severity: "warning", group: g, entityType: "city_rumor", entityId: cr.id, entityName: cr.city_name, field: "city_id", message: "Zvěst odkazuje na neexistující město", fix: "Opravit referenci" });
      } else passed++;

      if (cr.related_event_id) {
        total++;
        if (!eventIds.has(cr.related_event_id)) {
          issues.push({ severity: "info", group: g, entityType: "city_rumor", entityId: cr.id, field: "related_event_id", message: "Zvěst odkazuje na neexistující událost", fix: "Vyčistit referenci" });
        } else passed++;
      }
    }

    // Expeditions → result_region_id
    for (const exp of expeditions || []) {
      if (exp.result_region_id) {
        total++;
        if (!regionIds.has(exp.result_region_id)) {
          issues.push({ severity: "warning", group: g, entityType: "expedition", entityId: exp.id, entityName: exp.player_name, field: "result_region_id", message: "Expedice odkazuje na neexistující region", fix: "Opravit referenci" });
        } else passed++;
      }
    }

    return { name: "🗄️ Integrita databáze", icon: <Database className="h-4 w-4" />, issues, passed, total };
  }, [sessionId]);

  // ================================================================
  // RUN ALL
  // ================================================================
  const runAll = async () => {
    setRunning(true);
    setGroups([]);
    setOpenGroups(new Set());

    try {
      setProgressPct(10);
      const structural = await runStructural();
      setProgressPct(40);
      const logical = await runLogical();
      setProgressPct(70);
      const integrity = await runIntegrity();
      setProgressPct(100);

      const all = [structural, logical, integrity];
      setGroups(all);

      // Auto-open groups with errors
      const toOpen = new Set<string>();
      for (const gr of all) {
        if (gr.issues.some(i => i.severity === "error")) toOpen.add(gr.name);
      }
      setOpenGroups(toOpen);

      const totalErrors = all.reduce((s, g) => s + g.issues.filter(i => i.severity === "error").length, 0);
      const totalWarnings = all.reduce((s, g) => s + g.issues.filter(i => i.severity === "warning").length, 0);
      toast[totalErrors > 0 ? "error" : totalWarnings > 0 ? "warning" : "success"](
        `QA: ${totalErrors} chyb, ${totalWarnings} varování`
      );
    } catch (e: any) {
      toast.error("QA selhala: " + (e?.message || ""));
    }
    setRunning(false);
    setProgressLabel("");
  };

  // ================================================================
  // AUTO-FIX (safe only)
  // ================================================================
  const fixSafe = async () => {
    setFixing(true);
    let fixed = 0;

    try {
      // Ensure at least one country
      const { data: countries } = await supabase.from("countries").select("id").eq("session_id", sessionId);
      let countryId = countries?.[0]?.id;
      if (!countryId) {
        const { data: newC } = await supabase.from("countries").insert({
          session_id: sessionId, name: "Neznámý stát",
          description: "Automaticky vytvořený placeholder stát.",
        }).select().single();
        if (newC) { countryId = newC.id; fixed++; }
      }

      // Orphan regions → country
      if (countryId) {
        const { data: orphanRegs } = await supabase.from("regions").select("id").eq("session_id", sessionId).is("country_id", null);
        for (const r of orphanRegs || []) {
          await supabase.from("regions").update({ country_id: countryId }).eq("id", r.id);
          fixed++;
        }
      }

      // Ensure at least one region
      let { data: regions } = await supabase.from("regions").select("id").eq("session_id", sessionId).limit(1);
      let regionId = regions?.[0]?.id;
      if (!regionId && countryId) {
        const { data: newR } = await supabase.from("regions").insert({
          session_id: sessionId, name: "Neznámý region", country_id: countryId,
        }).select().single();
        if (newR) { regionId = newR.id; fixed++; }
      }

      // Orphan provinces → region
      if (regionId) {
        const { data: orphanProvs } = await supabase.from("provinces").select("id").eq("session_id", sessionId).is("region_id", null);
        for (const p of orphanProvs || []) {
          await supabase.from("provinces").update({ region_id: regionId }).eq("id", p.id);
          fixed++;
        }
      }

      // Ensure at least one province
      let { data: provs } = await supabase.from("provinces").select("id").eq("session_id", sessionId).limit(1);
      let provId = provs?.[0]?.id;
      if (!provId && regionId) {
        const { data: newP } = await supabase.from("provinces").insert({
          session_id: sessionId, name: "Neznámá provincie", region_id: regionId, owner_player: "",
        }).select().single();
        if (newP) { provId = newP.id; fixed++; }
      }

      // Orphan cities → province
      if (provId) {
        const { data: orphanCities } = await supabase.from("cities").select("id").eq("session_id", sessionId).is("province_id", null);
        for (const c of orphanCities || []) {
          await supabase.from("cities").update({ province_id: provId }).eq("id", c.id);
          fixed++;
        }
      }

      toast.success(`Opraveno ${fixed} problémů`);
      onRefetch?.();
      // Re-run scan
      await runAll();
    } catch (e: any) {
      toast.error("Oprava selhala: " + (e?.message || ""));
    }
    setFixing(false);
  };

  // ================================================================
  // RENDER
  // ================================================================
  const allIssues = groups.flatMap(g => g.issues);
  const errors = allIssues.filter(i => i.severity === "error").length;
  const warnings = allIssues.filter(i => i.severity === "warning").length;
  const infos = allIssues.filter(i => i.severity === "info").length;
  const totalPassed = groups.reduce((s, g) => s + g.passed, 0);
  const totalChecks = groups.reduce((s, g) => s + g.total, 0);
  const hasFixable = errors > 0 || warnings > 0;

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          QA Test & Integrita DB
        </h3>
        {groups.length > 0 && (
          <div className="flex gap-1.5">
            {errors > 0 && <Badge variant="destructive" className="text-[10px]">{errors} chyb</Badge>}
            {warnings > 0 && <Badge className="text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30">{warnings} varování</Badge>}
            {infos > 0 && <Badge variant="outline" className="text-[10px]">{infos} info</Badge>}
          </div>
        )}
      </div>

      {/* Run button */}
      <Button onClick={runAll} disabled={running || fixing} className="w-full h-11 gap-2">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
        {running ? `Testuji... ${progressLabel}` : "🧪 Spustit kompletní QA test"}
      </Button>

      {/* Progress */}
      {running && <Progress value={progressPct} />}

      {/* Summary bar */}
      {groups.length > 0 && (
        <div className="p-3 rounded border bg-muted/30 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-display font-semibold">Výsledek</span>
            <Badge variant={errors === 0 ? "default" : "destructive"}>
              {totalPassed}/{totalChecks} prošlo
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded border bg-destructive/10">
              <p className="text-lg font-bold text-destructive">{errors}</p>
              <p className="text-muted-foreground">Chyby</p>
            </div>
            <div className="p-2 rounded border bg-amber-500/10">
              <p className="text-lg font-bold text-amber-600">{warnings}</p>
              <p className="text-muted-foreground">Varování</p>
            </div>
            <div className="p-2 rounded border bg-blue-500/10">
              <p className="text-lg font-bold text-blue-500">{infos}</p>
              <p className="text-muted-foreground">Info</p>
            </div>
          </div>
        </div>
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <div className="space-y-2">
          {groups.map(gr => {
            const grErrors = gr.issues.filter(i => i.severity === "error").length;
            const grWarnings = gr.issues.filter(i => i.severity === "warning").length;
            const isOpen = openGroups.has(gr.name);

            return (
              <Collapsible key={gr.name} open={isOpen} onOpenChange={() => toggle(gr.name)}>
                <CollapsibleTrigger className="w-full flex items-center justify-between p-2.5 rounded border bg-muted/20 hover:bg-muted/40 transition-colors text-left">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span>{gr.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {gr.issues.length === 0 ? (
                      <Badge variant="default" className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> OK</Badge>
                    ) : (
                      <>
                        {grErrors > 0 && <Badge variant="destructive" className="text-[10px]">{grErrors}</Badge>}
                        {grWarnings > 0 && <Badge className="text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30">{grWarnings}</Badge>}
                      </>
                    )}
                    <span className="text-[10px] text-muted-foreground">{gr.passed}/{gr.total}</span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {gr.issues.length === 0 ? (
                    <div className="p-3 text-xs text-primary flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Všechny testy prošly
                    </div>
                  ) : (
                    <ScrollArea className="max-h-60">
                      <div className="p-1 space-y-0.5">
                        {gr.issues.map((issue, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs p-2 rounded border bg-card hover:bg-muted/20">
                            <SeverityIcon s={issue.severity} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge variant="outline" className="text-[9px] shrink-0">{issue.entityType}</Badge>
                                {issue.entityName && (
                                  <span className="font-semibold truncate">{issue.entityName}</span>
                                )}
                                {issue.field && (
                                  <span className="text-muted-foreground font-mono">.{issue.field}</span>
                                )}
                              </div>
                              <p className="text-muted-foreground mt-0.5">{issue.message}</p>
                              {issue.fix && (
                                <p className="text-primary/80 mt-0.5 italic">→ {issue.fix}</p>
                              )}
                            </div>
                            {issue.entityId && (
                              <span className="text-[9px] text-muted-foreground font-mono shrink-0">{issue.entityId.slice(0, 8)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Fix button */}
      {groups.length > 0 && hasFixable && (
        <Button onClick={fixSafe} disabled={fixing || running} variant="outline" className="w-full h-10 gap-2">
          {fixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {fixing ? "Opravuji..." : "🔧 Opravit bezpečné problémy (placeholder rodiče)"}
        </Button>
      )}
    </div>
  );
};

export default QATestSection;
