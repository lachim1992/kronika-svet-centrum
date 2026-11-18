// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const S = "00000000-0000-0000-0000-000000000001";
const CITY = "00000000-0000-0000-0000-000000000002";
const PARCEL = "00000000-0000-0000-0000-000000000003";
const B1 = "00000000-0000-0000-0000-000000000004";
const B2 = "00000000-0000-0000-0000-000000000005";

async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE cities(id uuid,session_id uuid,owner_player text);
    CREATE TABLE tile_parcels(id uuid,session_id uuid,owner_player text,capacity_slots integer,claim_kind text,status text,land_use text,building_id uuid,district_id uuid);
    CREATE TABLE city_buildings(id uuid,session_id uuid,city_id uuid,parcel_id uuid);
    CREATE TABLE city_districts(id uuid,session_id uuid,city_id uuid,parcel_id uuid);
    CREATE TABLE tile_parcel_contents(id uuid default gen_random_uuid(),session_id uuid,parcel_id uuid,entity_type text,entity_id uuid,slots_used integer);
    INSERT INTO cities VALUES('${CITY}','${S}','p');
    INSERT INTO tile_parcels VALUES('${PARCEL}','${S}','p',1,'urban','claimed','open',NULL,NULL);
    INSERT INTO city_buildings VALUES('${B1}','${S}','${CITY}',NULL),('${B2}','${S}','${CITY}',NULL);`);
  await db.exec(readFileSync("supabase/reconciliation/0038_atomic_parcel_occupancy.sql", "utf8"));
  return db;
}

const occupy = (db: PGlite, building = B1, player = "p", session = S) => db.query(
  "SELECT occupy_city_parcel_atomic($1,$2,$3,'building',$4,'civic',false) AS result",
  [session, player, PARCEL, building],
);

describe("atomic parcel occupancy and building linkage", () => {
  it("allows only one of two competing buildings on a one-slot parcel", async () => {
    const db = await database();
    try {
      const attempts = await Promise.allSettled([occupy(db, B1), occupy(db, B2)]);
      expect(attempts.filter(a => a.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter(a => a.status === "rejected")).toHaveLength(1);
      expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM tile_parcel_contents")).rows[0].n).toBe(1);
      expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM city_buildings WHERE parcel_id IS NOT NULL")).rows[0].n).toBe(1);
      expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM tile_parcels WHERE status='occupied'")).rows[0].n).toBe(1);
    } finally { await db.close(); }
  }, 20000);

  it("rejects mismatched, orphaned and later detached building links", async () => {
    const db = await database();
    try {
      await expect(db.query("INSERT INTO tile_parcel_contents(session_id,parcel_id,entity_type,entity_id,slots_used) VALUES($1,$2,'building',$3,1)", [S, PARCEL, B1]))
        .rejects.toThrow("stejnou parcelu");
      await expect(db.query("UPDATE city_buildings SET parcel_id=$1 WHERE id=$2", [PARCEL, B1]))
        .rejects.toThrow("vyžaduje odpovídající obsazení");
      await occupy(db, B1);
      await expect(db.query("UPDATE city_buildings SET parcel_id=NULL WHERE id=$1", [B1]))
        .rejects.toThrow("nelze přepnout");
      expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM tile_parcel_contents")).rows[0].n).toBe(1);
    } finally { await db.close(); }
  }, 20000);

  it("rejects a foreign owner or another session without occupying anything", async () => {
    const db = await database();
    try {
      await expect(occupy(db, B1, "intruder")).rejects.toThrow("Parcelu drží jiná říše");
      await expect(occupy(db, B1, "p", crypto.randomUUID())).rejects.toThrow("neexistuje");
      expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM tile_parcel_contents")).rows[0].n).toBe(0);
      expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM city_buildings WHERE parcel_id IS NOT NULL")).rows[0].n).toBe(0);
    } finally { await db.close(); }
  }, 20000);
});
