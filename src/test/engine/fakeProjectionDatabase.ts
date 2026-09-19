type Row = Record<string, unknown>;
export function database() {
  const tables: Record<string, Row[]> = {
    game_sessions: [{ id: "world", current_turn: 2 }],
    province_nodes: [{ id: "node", session_id: "world", city_id: "city", capability_tags: [] }],
    cities: [{ id: "city", session_id: "world", owner_player: "A", population_total: 100, population_peasants: 100 }],
    realm_resources: [{ session_id: "world", player_name: "A", goods_production_value: 99, goods_supply_volume: 99, goods_wealth_fiscal: 42 }],
    node_inventory: [{ node_id: "node", good_key: "tools", quantity: 99 }, { node_id: "foreign", quantity: 10 }],
  };
  const operations: { table: string; operation: string }[] = [];
  const failures = new Set<string>();
  return { tables, operations, failures,
    from(table: string) {
      let operation = "select", single = false;
      let columns = "*", start = 0, end = Infinity;
      let values: Row | Row[] = {};
      const filters: ((row: Row) => boolean)[] = [];
      const query = {
        select: (value = "*") => { columns = value; return query; },
        maybeSingle: () => { single = true; return query; },
        order: () => query,
        range: (from: number, to: number) => { start = from; end = to; return query; },
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return query; },
        not: (key: string, operator: string, value: unknown) => {
          const excluded = operator === "in" ? JSON.parse(`[${String(value).slice(1, -1)}]`) as unknown[] : [];
          filters.push(row => operator === "in" ? !excluded.includes(row[key]) : row[key] !== value);
          return query;
        },
        in: (key: string, value: unknown[]) => { filters.push(row => value.includes(row[key])); return query; },
        delete: () => { operation = "delete"; return query; },
        insert: (value: Row | Row[]) => { operation = "insert"; values = value; return query; },
        upsert: (value: Row | Row[]) => { operation = "upsert"; values = value; return query; },
        update: (value: Row) => { operation = "update"; values = value; return query; },
        then(resolve: (result: { data: Row | Row[] | null; error: { message: string } | null }) => unknown) {
          operations.push({ table, operation });
          if (failures.has(`${table}:${operation}`)) return Promise.resolve(resolve({ data: null, error: { message: `${table} ${operation} failed` } }));
          const rows = tables[table] || [];
          const matches = (row: Row) => filters.every(filter => filter(row));
          if (operation === "delete") tables[table] = rows.filter(row => !matches(row));
          const inserted = structuredClone(Array.isArray(values) ? values : [values]).map((row, index) => ({ id: `${table}-${index}`, ...row }));
          if (operation === "insert" || operation === "upsert") tables[table] = [...rows, ...inserted];
          if (operation === "update") for (const row of rows.filter(matches)) Object.assign(row, structuredClone(values));
          const source = operation === "upsert" || operation === "insert" ? inserted : rows.filter(matches);
          const selected = source.slice(start, end + 1).map(row => columns === "*" || columns.includes("(") ? row : Object.fromEntries(columns.split(",").map(column => [column.trim(), row[column.trim()]])));
          return Promise.resolve(resolve({ data: structuredClone(single ? selected[0] ?? null : selected), error: null }));
        },
      };
      return query;
    },
  };
}
