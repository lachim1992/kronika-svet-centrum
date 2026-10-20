// economy-dev-snapshot: admin-only, read-only diagnostic projection of one
// session's canonical goods ledger. Uses the service role only after JWT +
// admin-role + session validation. Performs no writes of any kind.
import { createClient } from "npm:@supabase/supabase-js@2";
import { AuthError } from "../_shared/sessionAuth.ts";
import { authorizeAdmin, parseRequest } from "./auth.ts";
import { buildSnapshot, ROW_LIMIT, SCHEMA_VERSION, type CityAccountRow, type LedgerResult, type VariantCatalogueRow } from "./build.ts";
import { RECIPES } from "../_shared/productionCatalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const cap = <T>(rows: T[]) => ({ rows: rows.slice(0, ROW_LIMIT), total: rows.length, truncated: rows.length > ROW_LIMIT });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    await authorizeAdmin(req, db);
    const parsed = parseRequest(await req.json().catch(() => null));
    if (!parsed) return json({ error: "Invalid request: sessionId (uuid) and optional integer turn" }, 400);
    const { sessionId } = parsed;

    const { data: session, error: sErr } = await db.from("game_sessions")
      .select("id, room_code, current_turn, resolving_turn, init_status").eq("id", sessionId).maybeSingle();
    if (sErr) throw sErr;
    if (!session) return json({ error: "Unknown session" }, 404);

    const { data: turnsRaw, error: tErr } = await db.from("economy_turn_ledgers")
      .select("turn_number, committed, created_at").eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(200);
    if (tErr) throw tErr;
    const turns = (turnsRaw || []) as { turn_number: number; committed: boolean; created_at: string }[];
    const lastCommitted = turns.find((t) => t.committed)?.turn_number ?? null;
    const turn = parsed.turn ?? turns[0]?.turn_number ?? null;

    const meta = { schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), sessionId, roomCode: session.room_code,
      currentTurn: session.current_turn, resolvingTurn: session.resolving_turn, initStatus: session.init_status,
      lastCommittedTurn: lastCommitted, selectedTurn: turn, availableTurns: turns };
    if (turn == null) return json({ meta, ledger: null, reason: "Session nemá žádný goods ledger" });

    const [ledgerRes, prevRes, guardRes, journalRes, lockRes, realmRes, legacyRes, capRes, variantRes] = await Promise.all([
      db.from("economy_turn_ledgers").select("turn_number, committed, created_at, result").eq("session_id", sessionId).eq("turn_number", turn).maybeSingle(),
      db.from("economy_turn_ledgers").select("turn_number, result->cityAccounts").eq("session_id", sessionId).eq("committed", true).lt("turn_number", turn).order("turn_number", { ascending: false }).limit(1).maybeSingle(),
      db.from("turn_execution_guards").select("turn_number, status, started_at, finished_at, error, resumable").eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(5),
      db.from("turn_phase_journal").select("turn_number, phase, completed_at").eq("session_id", sessionId).in("turn_number", [turn - 1, turn]).order("completed_at"),
      db.from("economy_recompute_locks").select("locked_at, locked_by, updated_at").eq("session_id", sessionId).maybeSingle(),
      db.from("realm_resources").select("player_name, gold_reserve, last_processed_turn, legitimacy, total_wealth, goods_wealth_fiscal, wealth_pop_tax, wealth_domestic_market, military_gold_upkeep, total_gdp, value_added_gdp, tax_rate_poll, tax_rate_market").eq("session_id", sessionId),
      db.from("trade_routes").select("status, amount_per_turn, gold_per_turn").eq("session_id", sessionId),
      db.from("city_capital_stock").select("city_id, stock, last_delta, last_turn").eq("session_id", sessionId),
      db.from("good_variants").select("id, parent_good_key, variant_key, display_name, quality_modifier, prestige_modifier, cultural_origin").order("parent_good_key"),
    ]);
    for (const r of [ledgerRes, prevRes, guardRes, journalRes, lockRes, realmRes, legacyRes, capRes, variantRes]) if (r.error) throw r.error;
    if (!ledgerRes.data) return json({ meta, ledger: null, reason: `Ledger pro tah ${turn} neexistuje` });

    const result = (ledgerRes.data.result || {}) as LedgerResult;
    const prevAccounts = ((prevRes.data as { cityAccounts?: CityAccountRow[] } | null)?.cityAccounts) ?? null;
    const built = buildSnapshot(result, prevAccounts, (variantRes.data || []) as VariantCatalogueRow[]);
    const legacy = (legacyRes.data || []) as { status: string; amount_per_turn: number | null; gold_per_turn: number | null }[];
    const active = legacy.filter((l) => l.status === "active");

    return json({
      meta: { ...meta, ledgerCreatedAt: ledgerRes.data.created_at, ledgerCommitted: ledgerRes.data.committed,
        budgetMode: result.budgetMode ?? null, previousAccountsTurn: (prevRes.data as { turn_number?: number } | null)?.turn_number ?? null,
        rowLimit: ROW_LIMIT },
      state: { guards: guardRes.data || [], journal: journalRes.data || [], refreshLock: lockRes.data || null },
      industrial_inputs: built.industrial_inputs, import_blockers: built.import_blockers,
      fuel_guidance: built.fuel_guidance, costs: cap(built.costs), specific: built.specific,
      catalogueRecipes: RECIPES.map((r) => ({ key: r.key, role: r.role, output: r.output, qty: r.qty, inputs: r.inputs })),
      cities: built.cities, world: built.world, goods: built.goods,
      producers: cap(built.producers), demand: cap(built.demand), flows: cap(built.flows), edges: cap(built.edges),
      prices: cap(result.prices || []), balances: cap(result.balances || []),
      famous: result.famous || [], anomalies: built.anomalies,
      fiscal: { source: "realm_resources (zapisuje pouze process-turn)", realms: realmRes.data || [], capitalStock: capRes.data || [] },
      legacy: { source: "trade_routes (legacy smluvní vypořádání, mimo Goods ledger)", total: legacy.length, active: active.length,
        amountPerTurn: active.reduce((s, l) => s + (Number(l.amount_per_turn) || 0), 0),
        goldPerTurn: active.reduce((s, l) => s + (Number(l.gold_per_turn) || 0), 0) },
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: (e as Error).message }, 500);
  }
});
