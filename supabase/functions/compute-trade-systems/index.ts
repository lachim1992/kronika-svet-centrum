// compute-trade-systems
// Node-Trade v1 — Stage 4
//
// Pipeline:
//  1) Load province_nodes (active) and province_routes (construction_state='complete'
//     AND control_state IN ('open') — contested propagates only with penalty in flow solver, not here).
//  2) Union-Find over routes → connected components (trade systems).
//  3) Deterministic system_key = sha256(sorted(node_ids).join(',')).slice(0,16).
//  4) Diff against trade_system_node_snapshot → emit world_events: trade_system_formed/dissolved/merged/split.
//  5) Upsert trade_systems, link province_nodes.trade_system_id, snapshot.
//  6) Project player_trade_system_access from:
//       - direct ownership of any node in system (level=direct, tariff=1.0, source=ownership)
//       - active diplomatic_treaties (open_borders / trade_access) where treaty partner owns a node
//         (level=treaty/open, tariff per metadata, source=treaty:<id>)
//       - discovery (discovered=true on any neutral node) → level=visible (no trade, just intel)
//
// Architecture: Diplomacy writes treaties → THIS function projects access → compute-trade-flows consumes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface UF {
  parent: Map<string, string>;
  rank: Map<string, number>;
}

function ufMake(): UF {
  return { parent: new Map(), rank: new Map() };
}
function ufFind(uf: UF, x: string): string {
  if (!uf.parent.has(x)) {
    uf.parent.set(x, x);
    uf.rank.set(x, 0);
    return x;
  }
  let p = uf.parent.get(x)!;
  if (p !== x) {
    p = ufFind(uf, p);
    uf.parent.set(x, p);
  }
  return p;
}
function ufUnion(uf: UF, a: string, b: string) {
  const ra = ufFind(uf, a);
  const rb = ufFind(uf, b);
  if (ra === rb) return;
  const rrA = uf.rank.get(ra) ?? 0;
  const rrB = uf.rank.get(rb) ?? 0;
  if (rrA < rrB) uf.parent.set(ra, rb);
  else if (rrA > rrB) uf.parent.set(rb, ra);
  else {
    uf.parent.set(rb, ra);
    uf.rank.set(ra, rrA + 1);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const session_id: string | undefined = body.session_id;
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Current turn (best-effort)
    const { data: sessionRow } = await sb
      .from("game_sessions")
      .select("current_turn")
      .eq("id", session_id)
      .maybeSingle();
    const currentTurn: number = (sessionRow as any)?.current_turn ?? 0;

    // 1) Load nodes & routes
    const [nodeRes, routeRes, prevSnapRes, treatyRes] = await Promise.all([
      sb
        .from("province_nodes")
        .select("id, controlled_by, is_neutral, discovered, discovered_by, is_active")
        .eq("session_id", session_id),
      sb
        .from("province_routes")
        .select("id, node_a, node_b, construction_state, control_state")
        .eq("session_id", session_id),
      sb
        .from("trade_system_node_snapshot")
        .select("node_id, system_key")
        .eq("session_id", session_id),
      sb
        .from("diplomatic_treaties")
        .select("id, treaty_type, player_a, player_b, status, metadata")
        .eq("session_id", session_id)
        .eq("status", "active"),
    ]);
    if (nodeRes.error) throw nodeRes.error;
    if (routeRes.error) throw routeRes.error;

    const nodes = (nodeRes.data || []).filter((n: any) => n.is_active !== false);
    const nodeById = new Map<string, any>(nodes.map((n: any) => [n.id, n]));
    const routes = routeRes.data || [];
    const treaties = treatyRes.data || [];
    const prevSnap = new Map<string, string>(
      (prevSnapRes.data || []).map((s: any) => [s.node_id, s.system_key as string])
    );

    // 2) Union-Find — only complete + open routes
    const uf = ufMake();
    for (const n of nodes) ufFind(uf, n.id); // ensure singletons exist
    let usedRoutes = 0;
    for (const r of routes) {
      const cs = String((r as any).construction_state ?? "complete");
      const ctrl = String((r as any).control_state ?? "open");
      if (cs !== "complete") continue;
      if (ctrl !== "open") continue; // contested handled in flow solver with penalty
      if (!nodeById.has((r as any).node_a) || !nodeById.has((r as any).node_b)) continue;
      ufUnion(uf, (r as any).node_a, (r as any).node_b);
      usedRoutes++;
    }

    // 3) Group nodes by component root
    const compNodes = new Map<string, string[]>();
    for (const n of nodes) {
      const root = ufFind(uf, n.id);
      const arr = compNodes.get(root) ?? [];
      arr.push(n.id);
      compNodes.set(root, arr);
    }

    // Compute system_key + members per component
    type Comp = {
      root: string;
      nodeIds: string[];
      systemKey: string;
      members: string[];
    };
    const components: Comp[] = [];
    for (const [root, ids] of compNodes.entries()) {
      const sortedIds = [...ids].sort();
      const keyHash = await sha256Hex(sortedIds.join(","));
      const systemKey = keyHash.slice(0, 16);
      const memberSet = new Set<string>();
      for (const id of ids) {
        const owner = nodeById.get(id)?.controlled_by;
        if (owner) memberSet.add(owner);
      }
      components.push({
        root,
        nodeIds: sortedIds,
        systemKey,
        members: Array.from(memberSet).sort(),
      });
    }

    // 4) Diff vs snapshot → events
    const newKeyByNode = new Map<string, string>();
    for (const c of components) for (const id of c.nodeIds) newKeyByNode.set(id, c.systemKey);

    // For each new system, find which old keys its nodes used to belong to
    const eventsToInsert: any[] = [];
    for (const c of components) {
      const oldKeys = new Set<string>();
      let hadPrev = 0;
      for (const id of c.nodeIds) {
        const ok = prevSnap.get(id);
        if (ok) {
          oldKeys.add(ok);
          hadPrev++;
        }
      }
      if (hadPrev === 0) {
        eventsToInsert.push({
          session_id,
          turn_number: currentTurn,
          event_type: "trade_system_formed",
          payload: { system_key: c.systemKey, node_count: c.nodeIds.length, members: c.members },
        });
      } else if (oldKeys.size > 1) {
        eventsToInsert.push({
          session_id,
          turn_number: currentTurn,
          event_type: "trade_system_merged",
          payload: { system_key: c.systemKey, merged_from: Array.from(oldKeys), node_count: c.nodeIds.length },
        });
      }
    }
    // Old systems that no longer appear → dissolved; old systems whose nodes split into >1 new system → split
    const oldKeyToNodes = new Map<string, string[]>();
    for (const [nodeId, oldKey] of prevSnap.entries()) {
      if (!oldKey) continue;
      const arr = oldKeyToNodes.get(oldKey) ?? [];
      arr.push(nodeId);
      oldKeyToNodes.set(oldKey, arr);
    }
    const newKeysSet = new Set(components.map((c) => c.systemKey));
    for (const [oldKey, nodeIds] of oldKeyToNodes.entries()) {
      if (newKeysSet.has(oldKey)) continue;
      const targetKeys = new Set<string>();
      for (const id of nodeIds) {
        const nk = newKeyByNode.get(id);
        if (nk) targetKeys.add(nk);
      }
      if (targetKeys.size === 0) {
        eventsToInsert.push({
          session_id,
          turn_number: currentTurn,
          event_type: "trade_system_dissolved",
          payload: { old_system_key: oldKey, node_count: nodeIds.length },
        });
      } else if (targetKeys.size > 1) {
        eventsToInsert.push({
          session_id,
          turn_number: currentTurn,
          event_type: "trade_system_split",
          payload: { old_system_key: oldKey, new_system_keys: Array.from(targetKeys) },
        });
      }
    }

    if (eventsToInsert.length > 0) {
      const { error: evErr } = await sb.from("world_events").insert(eventsToInsert);
      if (evErr) console.warn("world_events insert failed:", evErr.message);
    }

    // 5) Upsert trade_systems and link province_nodes
    // Wipe systems not present any more (cascade clears basket_supply + access)
    const newKeysArr = Array.from(newKeysSet);
    if (newKeysArr.length > 0) {
      await sb
        .from("trade_systems")
        .delete()
        .eq("session_id", session_id)
        .not("system_key", "in", `(${newKeysArr.map((k) => `"${k}"`).join(",")})`);
    } else {
      await sb.from("trade_systems").delete().eq("session_id", session_id);
    }

    const upserts = components.map((c) => ({
      session_id,
      system_key: c.systemKey,
      node_count: c.nodeIds.length,
      route_count: 0, // filled below
      total_capacity: 0,
      member_players: c.members,
      computed_turn: currentTurn,
      updated_at: new Date().toISOString(),
    }));

    // Count routes per system
    const routeCount = new Map<string, number>();
    for (const r of routes) {
      const cs = String((r as any).construction_state ?? "complete");
      const ctrl = String((r as any).control_state ?? "open");
      if (cs !== "complete" || ctrl !== "open") continue;
      const nk = newKeyByNode.get((r as any).node_a);
      if (nk && nk === newKeyByNode.get((r as any).node_b)) {
        routeCount.set(nk, (routeCount.get(nk) ?? 0) + 1);
      }
    }
    for (const u of upserts) u.route_count = routeCount.get(u.system_key) ?? 0;

    let systemIdByKey = new Map<string, string>();
    if (upserts.length > 0) {
      const { data: upserted, error: upErr } = await sb
        .from("trade_systems")
        .upsert(upserts, { onConflict: "session_id,system_key" })
        .select("id, system_key");
      if (upErr) throw upErr;
      systemIdByKey = new Map((upserted || []).map((s: any) => [s.system_key, s.id]));
    }

    // Link province_nodes.trade_system_id (batched updates per system)
    for (const c of components) {
      const sysId = systemIdByKey.get(c.systemKey);
      if (!sysId) continue;
      await sb
        .from("province_nodes")
        .update({ trade_system_id: sysId })
        .eq("session_id", session_id)
        .in("id", c.nodeIds);
    }

    // 6) Refresh snapshot
    await sb.from("trade_system_node_snapshot").delete().eq("session_id", session_id);
    const snapRows = components.flatMap((c) => {
      const sysId = systemIdByKey.get(c.systemKey);
      return c.nodeIds.map((nid) => ({
        session_id,
        node_id: nid,
        trade_system_id: sysId ?? null,
        system_key: c.systemKey,
        snapshot_turn: currentTurn,
      }));
    });
    if (snapRows.length > 0) {
      // Chunk to avoid payload limits
      const CHUNK = 500;
      for (let i = 0; i < snapRows.length; i += CHUNK) {
        const { error } = await sb
          .from("trade_system_node_snapshot")
          .insert(snapRows.slice(i, i + CHUNK));
        if (error) console.warn("snapshot insert failed:", error.message);
      }
    }

    // 7) Project player_trade_system_access
    await sb.from("player_trade_system_access").delete().eq("session_id", session_id);

    type AccessRow = {
      session_id: string;
      player_name: string;
      trade_system_id: string;
      access_level: string;
      tariff_factor: number;
      access_source: string;
    };
    const accessByPair = new Map<string, AccessRow>(); // key: player|systemId

    const upgrade = (
      player: string,
      sysId: string,
      level: string,
      tariff: number,
      source: string
    ) => {
      const key = `${player}|${sysId}`;
      const rank: Record<string, number> = { visible: 1, treaty: 2, open: 3, direct: 4 };
      const existing = accessByPair.get(key);
      if (!existing || (rank[level] ?? 0) > (rank[existing.access_level] ?? 0)) {
        accessByPair.set(key, {
          session_id,
          player_name: player,
          trade_system_id: sysId,
          access_level: level,
          tariff_factor: tariff,
          access_source: source,
        });
      }
    };

    for (const c of components) {
      const sysId = systemIdByKey.get(c.systemKey);
      if (!sysId) continue;

      // Direct ownership
      for (const m of c.members) upgrade(m, sysId, "direct", 1.0, "ownership");

      // Discovery → visible (covers neutral-only systems too)
      const discoverers = new Set<string>();
      for (const id of c.nodeIds) {
        const n = nodeById.get(id);
        if (n?.discovered && n?.discovered_by) discoverers.add(String(n.discovered_by));
      }
      for (const d of discoverers) upgrade(d, sysId, "visible", 1.5, "discovery");

      // Treaty projection: any active treaty between (member ↔ otherPlayer)
      // grants otherPlayer treaty/open access to this system.
      for (const t of treaties) {
        const tt = String((t as any).treaty_type ?? "");
        const a = String((t as any).player_a ?? "");
        const b = String((t as any).player_b ?? "");
        const meta = (t as any).metadata ?? {};
        const tariff = typeof meta.tariff_factor === "number" ? meta.tariff_factor : 1.2;
        const level = tt === "open_borders" ? "open" : tt === "trade_access" ? "treaty" : null;
        if (!level) continue;
        if (c.members.includes(a) && b) upgrade(b, sysId, level, level === "open" ? 1.0 : tariff, `treaty:${(t as any).id}`);
        if (c.members.includes(b) && a) upgrade(a, sysId, level, level === "open" ? 1.0 : tariff, `treaty:${(t as any).id}`);
      }
    }

    const accessRows = Array.from(accessByPair.values());
    if (accessRows.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < accessRows.length; i += CHUNK) {
        const { error } = await sb
          .from("player_trade_system_access")
          .insert(accessRows.slice(i, i + CHUNK));
        if (error) console.warn("access insert failed:", error.message);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        systems: components.length,
        nodes: nodes.length,
        routes_used: usedRoutes,
        events: eventsToInsert.length,
        access_rows: accessRows.length,
        turn: currentTurn,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("compute-trade-systems error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
