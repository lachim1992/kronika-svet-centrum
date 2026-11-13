import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const read = (p: string) => readFileSync(`supabase/functions/${p}`, "utf8");
describe("legacy territory endpoints", () => {
  it("expand-province is retired: no skip_cost and no province writes", () => {
    const s = read("expand-province/index.ts");
    expect(s).not.toMatch(/skip_cost\s*[,}=]/); expect(s).not.toMatch(/province_hexes/); expect(s).toMatch(/410/);
  });
  it("explore-hex takes identity from the JWT and has no (0,0) bootstrap", () => {
    const s = read("explore-hex/index.ts");
    expect(s).toMatch(/authorizeSessionCaller\(req/); expect(s).toMatch(/seat\.player_name !== player_name/);
    expect(s).not.toMatch(/q !== 0 \|\| r !== 0/);
  });
  it("macro claim RPCs are not callable by players directly", () => {
    const sql = readFileSync("drizzle/migrations/0016_macro_survey_claim_province.sql", "utf8");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.claim_macro_tile\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/owner_player IS NOT NULL THEN RAISE EXCEPTION 'Pole patří jiné říši'/);
  });
});
