import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FORMATIONS } from "../../supabase/functions/_shared/fieldBattle";

const source = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("battle formation storage and command handling", () => {
  it("accepts every canonical formation in the applied database contract", () => {
    const migration = source("drizzle/migrations/0034_battle_system_v1_formations_settlement.sql");
    for (const formation of FORMATIONS) {
      expect(migration).toContain(`'${formation}'`);
    }
    expect(migration).toContain("'column'");
  });

  it("returns formation refusals as ordinary gameplay answers, not HTTP crashes", () => {
    const dispatch = source("supabase/functions/command-dispatch/index.ts");
    expect(dispatch).toContain("/FIELD_BATTLE|SET_BATTLE_FORMATION/.test(String(commandType))");
    expect(dispatch).toContain("isBattleRule ? 200 : (result.status || 400)");
  });
});
