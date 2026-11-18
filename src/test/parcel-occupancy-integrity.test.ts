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
    CREATE TABLE game_sessions(id uuid,init_status text,resolving_turn integer,current_turn integer);
    CREATE TABLE cities(id uuid,session_id uuid,owner_player text);
    CREATE TABLE realm_resources(id uuid,session_id uuid,player_name text,gold_reserve numeric,production_reserve numeric);
    CREATE TABLE province_hexes(id uuid,session_id uuid,grid_x integer,grid_y integer,biome_family text,is_passable boolean,owner_player text);
    CREATE TABLE tile_parcels(id uuid,session_id uuid,owner_player text,capacity_slots integer,claim_kind text,status text,land_use text,building_id uuid,district_id uuid,buildable boolean,grid_x integer,grid_y integer,parcel_index integer,city_id uuid);
    CREATE TABLE city_buildings(id uuid,session_id uuid,city_id uuid,parcel_id uuid);
    CREATE TABLE city_districts(id uuid,session_id uuid,city_id uuid,parcel_id uuid);
    CREATE TABLE tile_parcel_contents(id uuid default gen_random_uuid(),session_id uuid,parcel_id uuid,entity_type text,entity_id uuid,slots_used integer);
    CREATE TABLE province_nodes(id uuid default gen_random_uuid(),session_id uuid,province_id uuid,city_id uuid,name text,node_type text,node_tier text,node_subtype text,node_class text,hex_q integer,hex_r integer,grid_x integer,grid_y integer,parcel_index integer,controlled_by text,built_by text,built_turn integer,biome_at_build text,production_output numeric,wealth_output numeric,food_value numeric,resource_output jsonb,capability_tags text[],production_role text,flow_role text,fortification_level integer,is_active boolean,upgrade_level integer,max_upgrade_level integer);
    INSERT INTO game_sessions VALUES('${S}','ready',NULL,1);
    INSERT INTO cities VALUES('${CITY}','${S}','p');
    INSERT INTO realm_resources VALUES('00000000-0000-0000-0000-000000000006','${S}','p',1000,1000);
    INSERT INTO province_hexes VALUES('00000000-0000-0000-0000-000000000007','${S}',0,0,'plains',true,'p');
    INSERT INTO tile_parcels VALUES('${PARCEL}','${S}','p',1,'urban','claimed','open',NULL,NULL,true,0,0,0,'${CITY}');
    INSERT INTO city_buildings VALUES('${B1}','${S}','${CITY}',NULL),('${B2}','${S}','${CITY}',NULL);`);
  await db.exec(readFileSync("supabase/reconciliation/0038_atomic_parcel_occupancy.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0037_atomic_build_subnode.sql", "utf8"));
  return db;
}

const occupy = (db: PGlite, building = B1, player = "p", session = S) => db.query(
  "SELECT occupy_city_parcel_atomic($1,$2,$3,'building',$4,'civic',false) AS result",
  [session, player, PARCEL, building],
);

const subnode = (db: PGlite) => db.query(
  "SELECT build_subnode_atomic($1,'p',$2,$3,NULL,1,'Studna','well',$4::jsonb,35,45) AS result",
  [S, PARCEL, CITY, JSON.stringify({ nodeType: "micro", group: "civic", resource: {}, capabilities: [], role: "civic", label: "Studna" })],
);

describe("atomic parcel occupancy and building linkage", () => {
  it("uses one named capacity trigger, shared by buildings and subnodes", () => {
    const reconciliation = readFileSync("supabase/reconciliation/0038_atomic_parcel_occupancy.sql", "utf8");
    expect(reconciliation.match(/CREATE TRIGGER validate_tile_parcel_content_capacity/g)).toHaveLength(1);
    expect(readFileSync("drizzle/migrations/0037_atomic_build_subnode.sql", "utf8")).not.toContain("CREATE TRIGGER validate_tile_parcel_content_capacity");
  });

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

  it("allows only one occupant when a building and subnode race on the same parcel", async () => {
    const db = await database();
    try {
      const attempts = await Promise.allSettled([occupy(db, B1), subnode(db)]);
      expect(attempts.filter(a => a.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter(a => a.status === "rejected")).toHaveLength(1);
      expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM tile_parcel_contents")).rows[0].n).toBe(1);
      const buildings = (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM city_buildings WHERE parcel_id IS NOT NULL")).rows[0].n;
      const nodes = (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM province_nodes")).rows[0].n;
      expect(buildings + nodes).toBe(1);
      const gold = (await db.query<{ gold: number }>("SELECT gold_reserve::int AS gold FROM realm_resources")).rows[0].gold;
      expect(gold).toBe(nodes === 1 ? 965 : 1000);
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
