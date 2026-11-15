// Field battle commands. Rules live only in _shared/fieldBattle.ts; this file loads state, authorises, and writes with rev CAS.
import {
  battleInRange, validateBattlefield, buildUnits, autoDeploy, inDeployZone, orderProblem, resolveRound, settlementPlan, planAiOrders,
  commandPoints, cpUsed, seededRandom, terrainOfSubBiome, upgradeUnit, normalizeFormation, unitFormation,
  type FBUnit, type FBOrder, type Side, type BattleMeta, type Cell, type OrderKind, type TerrainAt,
} from "../_shared/fieldBattle.ts";
import { UNIT_POWER_FACTOR } from "../_shared/unitTypes.ts";

type Res = { events: any[]; error?: string; result?: any; status?: number };
const STACK_COLS = "id, name, player_name, controller_player, grid_x, grid_y, hex_q, hex_r, is_active, is_deployed, soldiers, morale, power, general_id, battle_formation";
const cellOf = (st: any): Cell => ({ x: st.grid_x ?? st.hex_q, y: st.grid_y ?? st.hex_r });
const LEGACY_KIND: Record<string, OrderKind> = { move: "MOVE", attack: "ATTACK", charge: "CHARGE", hold: "HOLD", volley: "VOLLEY", fortify: "FORTIFY", rally: "RALLY", reserve: "RESERVE" };

async function aiNames(supabase: any, sessionId: string): Promise<Set<string>> {
  const { data } = await supabase.from("ai_factions").select("faction_name").eq("session_id", sessionId).eq("is_active", true);
  return new Set((data || []).map((r: any) => r.faction_name));
}
const commander = (st: any) => st.controller_player || st.player_name;

async function loadTerrain(supabase: any, sessionId: string, field: Cell[]): Promise<TerrainAt> {
  const gx = field.map(c => c.x), gy = field.map(c => c.y);
  const { data } = await supabase.from("tile_parcels").select("grid_x, grid_y, parcel_x, parcel_y, sub_biome").eq("session_id", sessionId)
    .gte("grid_x", Math.min(...gx)).lte("grid_x", Math.max(...gx)).gte("grid_y", Math.min(...gy)).lte("grid_y", Math.max(...gy)).limit(5000);
  const m = new Map<string, string>();
  for (const p of data || []) m.set(`${p.grid_x * 6 + p.parcel_x},${p.grid_y * 6 + p.parcel_y}`, p.sub_biome);
  return (x, y) => terrainOfSubBiome(m.get(`${x},${y}`));
}

export async function executeFieldBattleCommand(supabase: any, base: any, actor: { name: string }, commandType: string, payload: any,
  commandId: string, sessionId: string, turnNumber: number, insertEvents: (...a: any[]) => Promise<any>): Promise<Res> {
  const controls = (st: any) => st.player_name === actor.name || st.controller_player === actor.name;

  if (commandType === "START_FIELD_BATTLE") {
    const { stackId, targetStackId, battlefield } = payload;
    const { data: st } = await supabase.from("military_stacks").select(STACK_COLS).eq("id", stackId).eq("session_id", sessionId).maybeSingle();
    const { data: en } = await supabase.from("military_stacks").select(STACK_COLS).eq("id", targetStackId).eq("session_id", sessionId).maybeSingle();
    if (!st || !st.is_active || !st.is_deployed) return { events: [], error: "Armáda není v poli" };
    if (!controls(st)) return { events: [], error: "Tato armáda není tvoje" };
    if (!en || !en.is_active || !en.is_deployed) return { events: [], error: "Nepřátelská armáda není v poli" };
    if (en.player_name === st.player_name) return { events: [], error: "Nelze napadnout vlastní armádu" };
    const a = cellOf(st), d = cellOf(en);
    if (!battleInRange(a, d)) return { events: [], error: "Nepřátelská armáda není na dosah" };
    const bad = validateBattlefield(battlefield, a, d, (st.soldiers || 0) + (en.soldiers || 0));
    if (bad) return { events: [], error: bad };
    const { data: war } = await supabase.from("war_declarations").select("id").eq("session_id", sessionId).eq("status", "active")
      .or(`and(declaring_player.eq."${st.player_name}",target_player.eq."${en.player_name}"),and(declaring_player.eq."${en.player_name}",target_player.eq."${st.player_name}")`).limit(1);
    if (!war?.length) return { events: [], error: "Bitvu lze vyvolat jen s nepřítelem, se kterým jsi ve válce" };
    const field: Cell[] = battlefield.map((c: any) => ({ x: c.x, y: c.y }));
    const { data: comp } = await supabase.from("military_stack_composition").select("id, stack_id, unit_type, manpower").in("stack_id", [st.id, en.id]).order("created_at").order("id");
    const genIds = [st.general_id, en.general_id].filter(Boolean);
    const { data: gens } = genIds.length ? await supabase.from("generals").select("id, skill").in("id", genIds) : { data: [] };
    const skill = (g: string | null) => g ? ((gens || []).find((x: any) => x.id === g)?.skill ?? 0) : null;
    const ai = await aiNames(supabase, sessionId);
    const meta: BattleMeta = {
      hasGeneral: { attacker: !!st.general_id, defender: !!en.general_id },
      generalSkill: { attacker: skill(st.general_id), defender: skill(en.general_id) },
      ai: { attacker: ai.has(commander(st)), defender: ai.has(commander(en)) },
      rallyReadyRound: {}, fortified: [],
    };
    let units: FBUnit[] = [
      ...buildUnits("attacker", st.id, st.soldiers, (comp || []).filter((c: any) => c.stack_id === st.id), st.morale ?? 70, st.battle_formation),
      ...buildUnits("defender", en.id, en.soldiers, (comp || []).filter((c: any) => c.stack_id === en.id), en.morale ?? 70, en.battle_formation),
    ];
    const ready: Record<string, boolean> = {};
    if (meta.ai?.defender || meta.ai?.attacker) {
      const terrainAt = await loadTerrain(supabase, sessionId, field);
      if (meta.ai.defender) { units = autoDeploy(units, "defender", field, d, a, terrainAt); ready.defender = true; }
      if (meta.ai.attacker) { units = autoDeploy(units, "attacker", field, a, d, terrainAt); ready.attacker = true; }
    }
    const { data: fb, error: fErr } = await supabase.from("field_battles").insert({ session_id: sessionId, attacker_player: st.player_name, defender_player: en.player_name,
      attacker_stack_id: st.id, defender_stack_id: en.id, started_turn: turnNumber, battlefield: field, units, ready, meta }).select("id").single();
    if (fErr) return { events: [], error: fErr.code === "23505" ? "Některá z armád už bojuje" : fErr.message };
    return insertEvents(supabase, commandId, sessionId, turnNumber, [{
      ...base, event_type: "military", player: st.player_name, note: `${st.name} vyvolala bitvu s armádou ${en.name}.`, importance: "critical",
      reference: { fieldBattleId: fb.id, stackId: st.id, targetStackId: en.id },
    }], payload.chronicleText);
  }

  const { battleId } = payload;
  const { data: fb } = await supabase.from("field_battles").select("*").eq("id", battleId).eq("session_id", sessionId).neq("status", "finished").maybeSingle();
  if (!fb) return { events: [], error: "Bitva neběží" };
  const { data: stacks } = await supabase.from("military_stacks").select(STACK_COLS).in("id", [fb.attacker_stack_id, fb.defender_stack_id]);
  const att = stacks?.find((x: any) => x.id === fb.attacker_stack_id), def = stacks?.find((x: any) => x.id === fb.defender_stack_id);
  if (!att || !def) return { events: [], error: "Armáda bitvy chybí" };
  const stackOf = (s: Side) => s === "attacker" ? att : def;
  const field: Cell[] = fb.battlefield;
  const meta: BattleMeta = fb.meta ?? {};
  let units: FBUnit[];
  if (fb.units) units = (fb.units as any[]).map(upgradeUnit);
  else {
    const { data: comp } = await supabase.from("military_stack_composition").select("id, stack_id, unit_type, manpower").in("stack_id", [att.id, def.id]).order("created_at").order("id");
    units = [...buildUnits("attacker", att.id, att.soldiers, (comp || []).filter((c: any) => c.stack_id === att.id), att.morale ?? 70, att.battle_formation),
             ...buildUnits("defender", def.id, def.soldiers, (comp || []).filter((c: any) => c.stack_id === def.id), def.morale ?? 70, def.battle_formation)];
  }
  // v0 rows: snapshot formation once.
  for (const u of units) if (!(fb.units as any[] | null)?.find((x: any) => x.key === u.key)?.formation) u.formation = unitFormation(stackOf(u.side).battle_formation, u.type);
  const terrainAt = await loadTerrain(supabase, sessionId, field);
  const zoneOf = (s: Side) => (x: number, y: number) => inDeployZone(field, cellOf(stackOf(s)), cellOf(stackOf(s === "attacker" ? "defender" : "attacker")), x, y);
  const save = async (patch: any) => {
    const { data, error } = await supabase.from("field_battles").update({ ...patch, rev: fb.rev + 1 }).eq("id", fb.id).eq("rev", fb.rev).neq("status", "finished").select("id");
    if (error) return error.message; if (!data?.length) return "Bitva se mezitím změnila, zkus to znovu"; return null;
  };
  const side: Side | undefined = payload.side === "attacker" || payload.side === "defender" ? payload.side : undefined;
  const cpOf = (s: Side) => commandPoints(meta.generalSkill?.[s] ?? null);

  if (commandType === "FIELD_BATTLE_DEPLOY") {
    if (fb.status !== "deploying") return { events: [], error: "Rozmístění už skončilo, zálohu přivolej rozkazem" };
    if (!side) return { events: [], error: "Chybí strana" };
    if (!controls(stackOf(side))) return { events: [], error: "Tuto stranu neovládáš" };
    if (fb.ready?.[side]) return { events: [], error: "Strana už je připravena" };
    const own = cellOf(stackOf(side)), foe = cellOf(stackOf(side === "attacker" ? "defender" : "attacker"));
    if (payload.auto) units = autoDeploy(units.map(u => u.side === side ? { ...u, x: null, y: null, status: "ready" as const } : u), side, field, own, foe, terrainAt);
    else {
      const { key, x, y } = payload; const u = units.find(v => v.key === key);
      if (!u || u.side !== side) return { events: [], error: "Oddíl nepatří této straně" };
      if (x === null || x === undefined) { u.x = null; u.y = null; u.status = "reserve"; }
      else {
        if (!Number.isInteger(x) || !Number.isInteger(y) || !inDeployZone(field, own, foe, x, y)) return { events: [], error: "Sem lze rozmístit jen na své polovině bojiště" };
        if (terrainAt(x, y) === "water") return { events: [], error: "Do vody nelze rozmístit" };
        if (units.some(v => v.key !== key && v.x === x && v.y === y)) return { events: [], error: "Políčko je obsazené" };
        u.x = x; u.y = y; u.status = "ready"; u.facing = Math.abs(foe.x - own.x) >= Math.abs(foe.y - own.y) ? (foe.x >= own.x ? "e" : "w") : (foe.y >= own.y ? "s" : "n");
      }
    }
    const err = await save({ units }); return err ? { events: [], error: err } : { events: [] };
  }

  if (commandType === "FIELD_BATTLE_ORDER") {
    if (fb.status !== "fighting") return { events: [], error: "Bitva ještě nezačala" };
    const keys: string[] = Array.isArray(payload.keys) ? payload.keys.map(String) : payload.key ? [String(payload.key)] : [];
    if (!keys.length || keys.length > 60) return { events: [], error: "Vyber oddíly" };
    const sides = new Set(keys.map(k => units.find(u => u.key === k)?.side));
    if (sides.size !== 1 || sides.has(undefined)) return { events: [], error: "Rozkaz musí být pro oddíly jedné strany" };
    const sd = [...sides][0] as Side;
    if (!controls(stackOf(sd))) return { events: [], error: "Tyto oddíly neovládáš" };
    if (fb.ready?.[sd]) return { events: [], error: "Tato strana už kolo ukončila" };
    let orders: FBOrder[] = (fb.orders || []).filter((o: FBOrder) => !keys.includes(o.key));
    const rawKind = String(payload.order?.kind || ""); 
    if (rawKind.toLowerCase() === "cancel") { const err = await save({ orders }); return err ? { events: [], error: err } : { events: [] }; }
    const kind = (LEGACY_KIND[rawKind] ?? rawKind.toUpperCase()) as OrderKind;
    if (!["MOVE", "ATTACK", "CHARGE", "HOLD", "VOLLEY", "FORTIFY", "RALLY", "RESERVE"].includes(kind)) return { events: [], error: "Neznámý rozkaz" };
    if (kind === "RALLY" && keys.length > 1) return { events: [], error: "Shromáždění vydává jeden oddíl s generálem" };
    const to = payload.order?.to; const target = payload.order?.target ? String(payload.order.target) : undefined;
    const lead = units.find(u => u.key === keys[0])!;
    const seq0 = (fb.orders || []).reduce((m: number, o: FBOrder) => Math.max(m, o.seq), 0);
    const cmd = (fb.orders || []).reduce((m: number, o: FBOrder) => Math.max(m, o.cmd ?? o.seq), 0) + 1;
    const accepted: string[] = []; const rejected: { key: string; reason: string }[] = []; const plannedCells = new Set<string>();
    keys.forEach((key, i) => {
      const u = units.find(v => v.key === key)!;
      let dest = to;
      if ((kind === "MOVE" || kind === "RESERVE") && to && keys.length > 1 && kind === "MOVE" && lead.x !== null && u.x !== null) dest = { x: u.x + (to.x - lead.x!), y: u.y! + (to.y - lead.y!) };
      const problem = orderProblem(units, field, key, { kind, to: dest, target }, terrainAt, { round: fb.round, meta, zone: zoneOf(sd) })
        ?? (dest && plannedCells.has(`${dest.x},${dest.y}`) ? "Stejné cílové políčko má jiný oddíl" : null);
      if (problem) { rejected.push({ key, reason: problem }); return; }
      if (dest) plannedCells.add(`${dest.x},${dest.y}`);
      orders.push({ seq: seq0 + i + 1, cmd, key, kind, ...(dest ? { to: { x: dest.x, y: dest.y } } : {}), ...(target ? { target } : {}) });
      accepted.push(key);
    });
    if (!accepted.length) return { events: [], error: rejected[0]?.reason ?? "Rozkaz nelze" };
    const used = cpUsed(orders, units, sd), cp = cpOf(sd);
    if (used > cp) return { events: [], error: `Nedostatek velitelských bodů (${cp} za kolo)` };
    // Drop now-empty command groups automatically via the filter above.
    orders = orders.sort((a, b) => a.seq - b.seq);
    const err = await save({ orders, units });
    return err ? { events: [], error: err } : { events: [], result: { accepted, rejected, cpUsed: used, cp } };
  }

  // FIELD_BATTLE_READY
  if (!side) return { events: [], error: "Chybí strana" };
  if (!controls(stackOf(side))) return { events: [], error: "Tuto stranu neovládáš" };
  if (fb.status === "deploying" && !units.some(u => u.side === side && u.x !== null)) return { events: [], error: "Nejdřív rozmísti aspoň jeden oddíl" };
  const ready: Record<string, boolean> = { ...(fb.ready || {}), [side]: true };
  let orders: FBOrder[] = fb.orders || [];
  // Deterministic AI answers immediately so the battle never waits for a non-existent player.
  for (const s of ["attacker", "defender"] as Side[]) {
    if (!meta.ai?.[s] || ready[s]) continue;
    if (fb.status === "deploying") units = autoDeploy(units, s, field, cellOf(stackOf(s)), cellOf(stackOf(s === "attacker" ? "defender" : "attacker")), terrainAt);
    else orders = [...orders, ...planAiOrders(units, s, field, terrainAt, cpOf(s), orders.reduce((m, o) => Math.max(m, o.seq, o.cmd ?? 0), 0) + 1)];
    ready[s] = true;
  }
  if (!(ready.attacker && ready.defender)) { const err = await save({ ready, units, orders }); return err ? { events: [], error: err } : { events: [] }; }
  if (fb.status === "deploying") {
    // Units left off the field stay as a real reserve (not routed, not lost).
    const err = await save({ status: "fighting", round: 1, ready: {}, orders: [], units: units.map(u => u.x === null && u.status === "ready" ? { ...u, status: "reserve" as const } : u) });
    return err ? { events: [], error: err } : { events: [] };
  }
  const r = resolveRound(units, orders, field, terrainAt, seededRandom(`${fb.id}:${fb.round}`), fb.round, meta, zoneOf);
  const report = { round: fb.round, events: r.events, winner: r.winner };
  if (!r.winner) {
    let next = { units: r.units, orders: [] as FBOrder[], ready: {} as Record<string, boolean>, round: fb.round + 1, last_report: report, meta: r.meta };
    const err = await save(next); return err ? { events: [], error: err } : { events: [] };
  }
  // Final settlement: battle state + stack losses + typed composition losses in ONE transaction, guarded by rev.
  const { data: comps } = await supabase.from("military_stack_composition").select("id, stack_id, unit_type, manpower").in("stack_id", [att.id, def.id]);
  const plan = settlementPlan(r.units, [att, def].map((s: any) => ({ id: s.id, soldiers: s.soldiers, power: s.power ?? 0, morale: s.morale ?? 70 })), comps || [], UNIT_POWER_FACTOR);
  const summary = { ...report, losses: Object.fromEntries(plan.stackUpdates.map(s => [s.id, { lost: s.lost, byType: s.lostByType, soldiers: s.soldiers, morale: s.morale }])) };
  const { data: settled, error: sErr } = await supabase.rpc("settle_field_battle", { p_battle: fb.id, p_rev: fb.rev,
    p_patch: { units: r.units, last_report: summary, meta: r.meta, round: fb.round },
    p_stacks: plan.stackUpdates.map(({ lost: _l, lostByType: _t, ...s }) => s), p_comps: plan.compUpdates });
  if (sErr) return { events: [], error: sErr.message };
  if (!settled) return { events: [], error: "Bitva se mezitím změnila, zkus to znovu" };
  const win = r.winner === "attacker" ? att.name : r.winner === "defender" ? def.name : null;
  const lost = (id: string) => plan.stackUpdates.find(s => s.id === id)?.lost ?? 0;
  return insertEvents(supabase, commandId, sessionId, turnNumber, [{
    ...base, event_type: "military", player: att.player_name, importance: "critical",
    note: `Bitva ${att.name} × ${def.name} skončila po ${fb.round} kolech${win ? `, vítězí ${win}` : " nerozhodně"}. Ztráty: ${att.name} ${lost(att.id)}, ${def.name} ${lost(def.id)}.`,
    reference: { fieldBattleId: fb.id, winner: r.winner },
  }], payload.chronicleText);
}
export { normalizeFormation };
