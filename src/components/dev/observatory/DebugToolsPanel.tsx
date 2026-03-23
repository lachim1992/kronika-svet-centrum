import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skull, Zap, Shield, GitBranch } from "lucide-react";
import { DB_TABLES, DB_TABLE_COLUMNS, DB_RELATIONS } from "./dbSchemaData";
import { DATA_FLOW_AUDIT } from "./dataFlowAuditData";

/* ── 1. Dead Data Detector ── */
// Columns that exist in the DB but are never referenced in code read/write audit
function DeadDataDetector() {
  const deadData = useMemo(() => {
    // Gather all columns mentioned in data flow audit
    const referencedCols = new Set<string>();
    for (const entry of DATA_FLOW_ENTRIES) {
      referencedCols.add(`${entry.table}.${entry.column}`);
    }

    const results: { table: string; column: string; reason: string }[] = [];
    for (const [tableName, cols] of Object.entries(DB_TABLE_COLUMNS)) {
      for (const col of cols) {
        const key = `${tableName}.${col}`;
        if (!referencedCols.has(key) && col !== "id" && col !== "created_at" && col !== "updated_at" && col !== "session_id") {
          // Check if it's an FK column
          const isFK = DB_RELATIONS.some(r => r.from === tableName && r.fromCol === col);
          results.push({
            table: tableName,
            column: col,
            reason: isFK ? "FK only — no direct read/write in code" : "No read/write detected in code",
          });
        }
      }
    }
    return results;
  }, []);

  const byTable = useMemo(() => {
    const map: Record<string, typeof deadData> = {};
    for (const d of deadData) {
      (map[d.table] = map[d.table] || []).push(d);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [deadData]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Sloupce bez detekovaného čtení/zápisu v kódu — {deadData.length} potenciálně mrtvých polí v {byTable.length} tabulkách.
      </p>
      <ScrollArea className="h-[500px]">
        <div className="space-y-3">
          {byTable.map(([table, cols]) => (
            <div key={table} className="border rounded-lg p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs font-bold">{table}</span>
                <Badge variant="destructive" className="text-[9px]">{cols.length} dead</Badge>
                <Badge variant="outline" className="text-[9px]">{DB_TABLE_COLUMNS[table]?.length || 0} total</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {cols.map(c => (
                  <Badge key={c.column} variant="outline" className="text-[9px] font-mono" title={c.reason}>
                    {c.column}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ── 2. Trigger & Function Map ── */
const DB_TRIGGERS = [
  { name: "auto_create_wiki_entry_for_city", table: "cities", event: "INSERT", fn: "auto_create_wiki_entry_for_city" },
  { name: "auto_create_wiki_entry_for_person", table: "great_persons", event: "INSERT", fn: "auto_create_wiki_entry_for_person" },
  { name: "auto_create_wiki_entry_for_country", table: "countries", event: "INSERT", fn: "auto_create_wiki_entry_for_country" },
  { name: "auto_create_wiki_entry_for_wonder", table: "wonders", event: "INSERT", fn: "auto_create_wiki_entry_for_wonder" },
  { name: "auto_create_wiki_entry_for_academy", table: "academies", event: "INSERT", fn: "auto_create_wiki_entry_for_academy" },
  { name: "auto_create_wiki_entry_for_building", table: "city_buildings", event: "UPDATE", fn: "auto_create_wiki_entry_for_building" },
  { name: "auto_create_wiki_entry_for_region", table: "regions", event: "INSERT", fn: "auto_create_wiki_entry_for_region" },
  { name: "auto_create_wiki_entry_for_province", table: "provinces", event: "INSERT", fn: "auto_create_wiki_entry_for_province" },
  { name: "mark_routes_dirty_for_node", table: "province_nodes", event: "UPDATE", fn: "mark_routes_dirty_for_node" },
  { name: "mark_routes_dirty_for_hex", table: "hex_tiles", event: "UPDATE", fn: "mark_routes_dirty_for_hex" },
  { name: "mark_routes_dirty_for_building", table: "city_buildings", event: "UPDATE", fn: "mark_routes_dirty_for_building" },
  { name: "check_team_city_cap", table: "league_teams", event: "INSERT/UPDATE", fn: "check_team_city_cap" },
  { name: "handle_new_user", table: "auth.users", event: "INSERT", fn: "handle_new_user" },
  { name: "update_updated_at", table: "multiple", event: "UPDATE", fn: "update_updated_at_column" },
];

const DB_FUNCTIONS = [
  { name: "has_role", params: "user_id, role", returns: "boolean", security: "DEFINER", description: "Kontrola uživatelské role" },
  { name: "handle_new_user", params: "—", returns: "trigger", security: "DEFINER", description: "Vytvoří profil při registraci" },
  { name: "auto_create_wiki_entry_for_city", params: "—", returns: "trigger", security: "INVOKER", description: "Wiki záznam pro nové město" },
  { name: "mark_routes_dirty_for_node", params: "—", returns: "trigger", security: "INVOKER", description: "Dirty flag na dotčených trasách" },
  { name: "mark_routes_dirty_for_hex", params: "—", returns: "trigger", security: "INVOKER", description: "Dirty flag při změně hexu" },
  { name: "mark_routes_dirty_for_building", params: "—", returns: "trigger", security: "INVOKER", description: "Dirty flag po dokončení infrastruktury" },
  { name: "check_team_city_cap", params: "—", returns: "trigger", security: "INVOKER", description: "Max 3 týmy na město" },
];

function TriggerFunctionMap() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground mb-2">Triggery — automatické reakce na databázové operace ({DB_TRIGGERS.length})</p>
        <ScrollArea className="h-[200px] border rounded-lg">
          <div className="p-2 space-y-1">
            {DB_TRIGGERS.map(t => (
              <div key={t.name} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20">
                <GitBranch className="h-3 w-3 text-primary shrink-0" />
                <span className="font-mono font-medium">{t.table}</span>
                <Badge variant="outline" className="text-[8px]">{t.event}</Badge>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono text-primary">{t.fn}()</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2">Funkce ({DB_FUNCTIONS.length})</p>
        <ScrollArea className="h-[200px] border rounded-lg">
          <div className="p-2 space-y-1">
            {DB_FUNCTIONS.map(f => (
              <div key={f.name} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20">
                <Zap className="h-3 w-3 text-yellow-500 shrink-0" />
                <span className="font-mono font-medium">{f.name}()</span>
                <Badge variant="outline" className="text-[8px]">{f.security}</Badge>
                <span className="text-muted-foreground text-[9px] ml-auto">{f.description}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

/* ── 3. Edge Function Monitor ── */
const EDGE_FUNCTIONS = [
  { name: "world-tick", tables: ["cities", "hex_tiles", "province_nodes", "game_events"], category: "simulation" },
  { name: "process-tick", tables: ["action_queue", "travel_orders"], category: "simulation" },
  { name: "process-turn", tables: ["cities", "game_players", "game_events"], category: "economy" },
  { name: "commit-turn", tables: ["game_sessions", "game_players"], category: "turn" },
  { name: "compute-economy-flow", tables: ["province_nodes", "flow_paths", "cities"], category: "economy" },
  { name: "compute-province-graph", tables: ["province_nodes", "province_routes"], category: "spatial" },
  { name: "compute-province-nodes", tables: ["hex_tiles", "province_nodes", "cities"], category: "spatial" },
  { name: "compute-province-routes", tables: ["province_nodes", "province_routes", "hex_tiles"], category: "spatial" },
  { name: "compute-hex-flows", tables: ["hex_tiles", "flow_paths"], category: "spatial" },
  { name: "resolve-battle", tables: ["battles", "military_stacks", "military_units"], category: "military" },
  { name: "ai-faction-turn", tables: ["ai_factions", "cities", "game_events"], category: "ai" },
  { name: "ai-lore-generate", tables: ["wiki_entries", "game_events"], category: "ai" },
  { name: "wiki-generate", tables: ["wiki_entries"], category: "narrative" },
  { name: "saga-generate", tables: ["sagas", "game_events"], category: "narrative" },
  { name: "chronicle", tables: ["chronicle_entries", "game_events"], category: "narrative" },
  { name: "council-session", tables: ["council_sessions", "council_votes"], category: "social" },
  { name: "law-process", tables: ["laws", "cities"], category: "social" },
  { name: "explore-hex", tables: ["hex_tiles", "discoveries"], category: "exploration" },
  { name: "world-generate-init", tables: ["hex_tiles", "cities", "game_sessions"], category: "setup" },
  { name: "check-victory", tables: ["game_sessions", "cities", "wonders"], category: "meta" },
  { name: "declaration-effects", tables: ["declarations", "diplomacy_relations"], category: "diplomacy" },
  { name: "diplomacy-reply", tables: ["diplomacy_messages", "diplomacy_relations"], category: "diplomacy" },
  { name: "games-resolve", tables: ["olympiad_games", "olympiad_participants"], category: "league" },
  { name: "league-play-round", tables: ["league_matches", "league_teams"], category: "league" },
  { name: "academy-tick", tables: ["academies", "academy_students"], category: "league" },
  { name: "city-rumors", tables: ["city_rumors", "cities"], category: "narrative" },
  { name: "world-crisis", tables: ["world_events", "cities"], category: "events" },
  { name: "generate-building", tables: ["city_buildings", "building_templates"], category: "construction" },
  { name: "expand-province", tables: ["provinces", "hex_tiles"], category: "spatial" },
  { name: "trade", tables: ["trade_routes", "province_nodes"], category: "economy" },
];

function EdgeFunctionMonitor() {
  const categories = useMemo(() => {
    const map: Record<string, typeof EDGE_FUNCTIONS> = {};
    for (const ef of EDGE_FUNCTIONS) {
      (map[ef.category] = map[ef.category] || []).push(ef);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {EDGE_FUNCTIONS.length} edge funkcí — závislosti na tabulkách, kategorizace
      </p>
      <ScrollArea className="h-[450px]">
        <div className="space-y-3">
          {categories.map(([cat, fns]) => (
            <div key={cat} className="border rounded-lg p-2">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-[10px]">{cat}</Badge>
                <span className="text-[10px] text-muted-foreground">{fns.length} functions</span>
              </div>
              <div className="space-y-1">
                {fns.map(fn => (
                  <div key={fn.name} className="flex items-start gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20">
                    <Zap className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                    <div>
                      <span className="font-mono font-medium">{fn.name}</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {fn.tables.map(t => (
                          <Badge key={t} variant="outline" className="text-[8px] font-mono">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ── 4. RLS Policy Audit ── */
function RLSPolicyAudit() {
  const audit = useMemo(() => {
    const withRLS = DB_TABLES.filter(t => t.hasRLS);
    const withoutRLS = DB_TABLES.filter(t => !t.hasRLS);
    return { withRLS, withoutRLS };
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {audit.withRLS.length} tabulek s RLS, {audit.withoutRLS.length} bez RLS ochrany.
      </p>

      {audit.withoutRLS.length > 0 && (
        <div>
          <p className="text-xs font-medium text-destructive mb-1">⚠️ Bez RLS ({audit.withoutRLS.length})</p>
          <div className="flex flex-wrap gap-1">
            {audit.withoutRLS.map(t => (
              <Badge key={t.name} variant="destructive" className="text-[9px] font-mono">{t.name}</Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-green-500 mb-1">✅ S RLS ({audit.withRLS.length})</p>
        <ScrollArea className="h-[350px] border rounded-lg">
          <div className="p-2 flex flex-wrap gap-1">
            {audit.withRLS.map(t => (
              <Badge key={t.name} variant="outline" className="text-[9px] font-mono border-green-500/50 text-green-500">{t.name}</Badge>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

/* ── Main Panel ── */
const DebugToolsPanel = () => {
  return (
    <Tabs defaultValue="dead-data" className="w-full">
      <TabsList className="grid w-full grid-cols-4 h-auto">
        <TabsTrigger value="dead-data" className="text-xs gap-1 py-2">
          <Skull className="h-3 w-3" /> Dead Data
        </TabsTrigger>
        <TabsTrigger value="triggers" className="text-xs gap-1 py-2">
          <GitBranch className="h-3 w-3" /> Triggers
        </TabsTrigger>
        <TabsTrigger value="edge-fns" className="text-xs gap-1 py-2">
          <Zap className="h-3 w-3" /> Edge Fns
        </TabsTrigger>
        <TabsTrigger value="rls" className="text-xs gap-1 py-2">
          <Shield className="h-3 w-3" /> RLS Audit
        </TabsTrigger>
      </TabsList>
      <TabsContent value="dead-data" className="mt-3"><DeadDataDetector /></TabsContent>
      <TabsContent value="triggers" className="mt-3"><TriggerFunctionMap /></TabsContent>
      <TabsContent value="edge-fns" className="mt-3"><EdgeFunctionMonitor /></TabsContent>
      <TabsContent value="rls" className="mt-3"><RLSPolicyAudit /></TabsContent>
    </Tabs>
  );
};

export default DebugToolsPanel;
