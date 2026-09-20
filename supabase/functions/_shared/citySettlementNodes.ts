// Every city is a settlement node in the physical graph. The capital is only a
// PRIORITY node (higher strategic/economic weight) — structurally it is the same
// kind of node as any other city. Without this, cities without a province_nodes
// row silently drop out of trade flows, demand baskets and market summaries.

const SETTLEMENT_TAGS = [
  "farming",
  "herding",
  "construction",
  "baking",
  "crafting",
];

export interface EnsureSettlementNodesResult {
  cities: number;
  created: number;
  promoted: number;
  updated: number;
}

/** Idempotent: guarantees one settlement node per owned city, anchored on the city cell. */
export async function ensureCitySettlementNodes(
  sb: any,
  sessionId: string,
): Promise<EnsureSettlementNodesResult> {
  const { data: cityRows, error: cityErr } = await sb.from("cities")
    .select("id, name, owner_player, province_id, province_q, province_r, grid_x, grid_y, is_capital, population_total, settlement_level")
    .eq("session_id", sessionId);
  if (cityErr) throw cityErr;
  const cities = (cityRows || []).filter((c: any) => c.owner_player);

  const { data: nodeRows, error: nodeErr } = await sb.from("province_nodes")
    .select("id, city_id, hex_q, hex_r, grid_x, grid_y, node_tier, node_subtype, node_type, name, controlled_by, capability_tags, province_id, is_major, flow_role, production_role, strategic_value, economic_value")
    .eq("session_id", sessionId);
  if (nodeErr) throw nodeErr;
  const nodes = nodeRows || [];

  const result: EnsureSettlementNodesResult = { cities: cities.length, created: 0, promoted: 0, updated: 0 };
  const inserts: any[] = [];

  for (const city of cities) {
    const x = city.grid_x ?? city.province_q ?? 0;
    const y = city.grid_y ?? city.province_r ?? 0;
    const capital = city.is_capital === true;
    const settlementFields = {
      city_id: city.id,
      controlled_by: city.owner_player,
      province_id: city.province_id || null,
      node_type: capital ? "primary_city" : "secondary_city",
      node_tier: "major",
      node_subtype: "city",
      node_class: "major",
      name: city.name,
      is_major: true,
      flow_role: "hub",
      production_role: "urban",
      // Capital is only a priority node: same structure, higher weights.
      strategic_value: capital ? 10 : 7,
      economic_value: capital ? 8 : 6,
      defense_value: capital ? 5 : 4,
      mobility_relevance: capital ? 7 : 6,
      supply_relevance: capital ? 9 : 7,
      population: Math.max(0, Math.floor(Number(city.population_total) || 0)),
      metadata: { settlement_level: city.settlement_level, population: city.population_total, capital },
    };

    const existing = nodes.find((n: any) => n.city_id === city.id && n.node_subtype === "city");
    if (existing) {
      // Keep it in sync with the city (owner, name, capital priority).
      const drift = existing.controlled_by !== city.owner_player
        || existing.name !== city.name
        || existing.node_type !== settlementFields.node_type
        || existing.node_tier !== "major"
        || existing.strategic_value !== settlementFields.strategic_value;
      if (drift) {
        const { error } = await sb.from("province_nodes").update(settlementFields).eq("id", existing.id);
        if (error) throw error;
        result.updated++;
      }
      continue;
    }

    // A node already sitting on the city cell becomes the settlement node instead
    // of creating a duplicate on the same tile.
    const onCell = nodes.find((n: any) =>
      (n.grid_x ?? n.hex_q) === x && (n.grid_y ?? n.hex_r) === y
      && (!n.city_id || n.city_id === city.id)
    );
    if (onCell) {
      const tags = [...new Set([...(onCell.capability_tags || []), ...SETTLEMENT_TAGS])];
      const { error } = await sb.from("province_nodes")
        .update({ ...settlementFields, capability_tags: tags })
        .eq("id", onCell.id);
      if (error) throw error;
      onCell.city_id = city.id;
      onCell.node_subtype = "city";
      result.promoted++;
      continue;
    }

    inserts.push({
      session_id: sessionId,
      hex_q: city.province_q ?? x,
      hex_r: city.province_r ?? y,
      grid_x: x,
      grid_y: y,
      capability_tags: SETTLEMENT_TAGS,
      throughput_military: 1.0,
      toll_rate: 0,
      resource_output: {},
      ...settlementFields,
    });
  }

  if (inserts.length) {
    const { data, error } = await sb.from("province_nodes").insert(inserts).select("id, city_id, hex_q, hex_r, grid_x, grid_y, node_subtype");
    if (error) throw error;
    nodes.push(...(data || []));
    result.created += inserts.length;
  }
  return result;
}
