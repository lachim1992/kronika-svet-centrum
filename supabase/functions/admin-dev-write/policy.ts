// Pure validation for admin-dev-write (unit-tested in src/test/admin-dev-write-policy.test.ts).

export type FilterOp = "eq" | "neq" | "ilike" | "in" | "is";
export interface Filter { op: FilterOp; column: string; value: unknown }
export type Action = "insert" | "upsert" | "update" | "delete";
type Row = Record<string, unknown>;
export interface AdminOp {
  sessionId: string;
  table: string;
  action: Action;
  values?: Row | Row[];
  filters: Filter[];
  select?: string;
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

type Scope = "session" | "composition" | "user" | "session_row";
export const ADMIN_TABLES: Record<string, Scope> = {
  provinces: "session", regions: "session", cities: "session", wonders: "session",
  great_persons: "session", countries: "session", wiki_entries: "session", simulation_log: "session",
  game_players: "session", player_resources: "session", city_states: "session", civilizations: "session",
  province_hexes: "session", world_foundations: "session", map_gen_feedback: "session",
  province_nodes: "session", province_routes: "session", flow_paths: "session",
  economy_overrides: "session", realm_resources: "session", military_stacks: "session",
  ai_factions: "session", realm_infrastructure: "session",
  military_stack_composition: "composition",
  map_gen_preferences: "user",
  game_sessions: "session_row",
};

/** Authoritative turn / victory / lifecycle state: never writable through admin tooling. */
export const FORBIDDEN_COLUMNS = new Set([
  "current_turn", "resolving_turn", "turn_closed_p1", "turn_closed_p2",
  "victory_status", "victory_winner", "victory_data", "current_era", "tier", "game_mode",
  "init_status", "init_step", "created_by", "user_id", "session_id_override",
]);
export const SESSION_ROW_COLUMNS = new Set(["world_seed", "player1_name", "player2_name", "max_players", "epoch_style"]);

const IDENT = /^[a-z_][a-z0-9_]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = /^[a-z0-9_,* ]{1,300}$/i;
const OPS = new Set<FilterOp>(["eq", "neq", "ilike", "in", "is"]);
const ACTIONS = new Set<Action>(["insert", "upsert", "update", "delete"]);

type Result = { ok: true; op: AdminOp } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

export function validateAdminOp(body: unknown, userId: string): Result {
  if (!body || typeof body !== "object") return fail("Invalid body");
  const b = body as Record<string, unknown>;
  const sessionId = String(b.sessionId ?? "");
  if (!UUID.test(sessionId)) return fail("sessionId must be a uuid");
  const table = String(b.table ?? "");
  const scope = ADMIN_TABLES[table];
  if (!scope) return fail(`Table not allowed: ${table}`);
  const action = b.action as Action;
  if (!ACTIONS.has(action)) return fail("Invalid action");
  if (b.select !== undefined && (typeof b.select !== "string" || !SELECT.test(b.select))) return fail("Invalid select");
  if (b.onConflict !== undefined && (typeof b.onConflict !== "string" || !/^[a-z0-9_,]+$/.test(b.onConflict))) return fail("Invalid onConflict");

  const rawFilters = Array.isArray(b.filters) ? b.filters : [];
  const filters: Filter[] = [];
  for (const f of rawFilters as Filter[]) {
    if (!f || !OPS.has(f.op) || typeof f.column !== "string" || !IDENT.test(f.column)) return fail("Invalid filter");
    if (f.op === "in" && !Array.isArray(f.value)) return fail("'in' filter needs an array");
    if (["session_id", "user_id"].includes(f.column) && !(f.op === "eq" && f.value === (f.column === "user_id" ? userId : sessionId))) {
      return fail("Scope filter mismatch");
    }
    if (scope === "session_row" && f.column === "id" && !(f.op === "eq" && f.value === sessionId)) return fail("Scope filter mismatch");
    filters.push({ op: f.op, column: f.column, value: f.value });
  }

  let values: Row | Row[] | undefined;
  if (action !== "delete") {
    if (!b.values || typeof b.values !== "object") return fail("values required");
    const rows = (Array.isArray(b.values) ? b.values : [b.values]) as Row[];
    if (rows.length === 0 || rows.length > 500) return fail("1–500 rows per call");
    const out: Row[] = [];
    for (const r of rows) {
      if (!r || typeof r !== "object" || Array.isArray(r)) return fail("Invalid row");
      for (const k of Object.keys(r)) {
        if (!IDENT.test(k)) return fail(`Invalid column ${k}`);
        if (k === "session_id" && r[k] !== sessionId) return fail("Row outside session scope");
        if (k === "user_id" && scope === "user") continue;
        if (FORBIDDEN_COLUMNS.has(k)) return fail(`Column not writable: ${k}`);
        if (scope === "session_row" && !SESSION_ROW_COLUMNS.has(k)) return fail(`Column not writable: ${k}`);
      }
      if (scope === "session") out.push({ ...r, session_id: sessionId });
      else if (scope === "user") out.push({ ...r, user_id: userId });
      else out.push({ ...r });
    }
    values = Array.isArray(b.values) ? out : out[0];
  }

  if (scope === "session_row") {
    if (action !== "update") return fail("game_sessions supports update only");
    filters.push({ op: "eq", column: "id", value: sessionId });
  } else if (scope === "composition") {
    if (action === "insert" || action === "upsert") return fail("composition supports update/delete only");
    if (!filters.some((f) => f.column === "id" || f.column === "stack_id")) return fail("composition requires id/stack_id filter");
  } else if (action === "update" || action === "delete") {
    const col = scope === "user" ? "user_id" : "session_id";
    if (!filters.some((f) => f.column === col)) filters.push({ op: "eq", column: col, value: scope === "user" ? userId : sessionId });
  }

  return { ok: true, op: { sessionId, table, action, values, filters, select: b.select as string | undefined, onConflict: b.onConflict as string | undefined, ignoreDuplicates: b.ignoreDuplicates === true } };
}
