// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

describe("SQL rural parcel guard — actual PostgreSQL trigger", () => {
  it("accepts gold extraction, rejects mixed/urban/duplicate placements and wrong sessions", async () => {
    const db = new PGlite();
    const session = uuid(1), otherSession = uuid(2);
    const worked = uuid(3), urban = uuid(4), otherWorked = uuid(5);
    try {
      await db.exec(`
        CREATE TABLE public.tile_parcels (
          id uuid PRIMARY KEY, session_id uuid NOT NULL,
          claim_kind text, status text NOT NULL
        );
        CREATE TABLE public.building_templates (
          id uuid PRIMARY KEY, effects jsonb
        );
        CREATE TABLE public.city_buildings (
          id uuid PRIMARY KEY, session_id uuid NOT NULL,
          template_id uuid, effects jsonb
        );
        CREATE TABLE public.tile_parcel_contents (
          id uuid PRIMARY KEY, session_id uuid NOT NULL,
          parcel_id uuid NOT NULL, entity_type text NOT NULL, entity_id uuid
        );

      `);
      await db.exec(readFileSync("drizzle/migrations/0023_fix_rural_site_recipe_guard.sql", "utf8"));
      await db.exec(`
        CREATE TRIGGER guard_worked_parcel_content
          BEFORE INSERT OR UPDATE ON public.tile_parcel_contents
          FOR EACH ROW EXECUTE FUNCTION public.guard_worked_parcel_content();
      `);
      for (const [id, kind, status] of [
        [worked, "worked", "claimed"], [urban, "urban", "claimed"], [otherWorked, "worked", "claimed"]
      ]) {
        await db.query("INSERT INTO tile_parcels VALUES($1,$2,$3,$4)", [id, session, kind, status]);
      }
      const template = async (n: number, recipes: string[]) => {
        await db.query("INSERT INTO building_templates VALUES($1,$2)", [uuid(n), JSON.stringify({ recipe_keys: recipes })]);
      };
      const building = async (n: number, templateN: number, overrides: string[] | null = null) => {
        await db.query("INSERT INTO city_buildings VALUES($1,$2,$3,$4)", [
          uuid(n), session, uuid(templateN),
          overrides ? JSON.stringify({ recipe_keys: overrides }) : JSON.stringify({})
        ]);
      };
      const place = (contentN: number, parcelId: string, buildingId: number, sessionId = session) =>
        db.query("INSERT INTO tile_parcel_contents VALUES($1,$2,$3,'building',$4)",
          [uuid(contentN), sessionId, parcelId, uuid(buildingId)]);

      await template(10, ["mine_gold"]);
      await template(11, ["mine_gold", "refine_gold"]);
      await template(12, ["refine_gold"]);
      await template(13, []);
      await template(14, ["fell_timber"]);
      await building(20, 10);
      await building(21, 11);
      await building(22, 12);
      await building(23, 10);
      await building(24, 13, ["fell_timber"]); // building-level override
      await building(25, 12);

      await place(30, worked, 20); // valid gold mine, previously broken by jsonb -> text[]
      await expect(place(31, otherWorked, 21)).rejects.toThrow(/kombinovan/);
      await expect(place(32, otherWorked, 22)).rejects.toThrow(/městské/);
      await expect(place(33, otherWorked, 23, otherSession)).rejects.toThrow(/této hře/);
      await expect(place(34, worked, 24)).rejects.toThrow(/jednu venkovskou/);
      await expect(place(35, urban, 23)).rejects.toThrow(/využívanou parcelu/);
      await place(36, urban, 25); // processor on an urban parcel is allowed
      await place(37, otherWorked, 24); // override is correctly recognized as rural
      await expect(db.query("INSERT INTO tile_parcel_contents VALUES($1,$2,$3,'district',$4)",
        [uuid(38), session, otherWorked, uuid(13)])).rejects.toThrow(/Čtvrť/);
      const rows = await db.query<{ id: string }>("SELECT id FROM tile_parcel_contents ORDER BY id");
      expect(rows.rows.map(r => r.id)).toEqual([30, 36, 37].map(uuid));
    } finally {
      await db.close();
    }
  }, 20000);
});
