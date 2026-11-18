// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const S = "00000000-0000-0000-0000-000000000001";
const CITY = "00000000-0000-0000-0000-000000000002";
const PARCEL = "00000000-0000-0000-0000-000000000003";
const HEX = "00000000-0000-0000-0000-000000000004";
const REALM = "00000000-0000-0000-0000-000000000005";
const DEF = { label: "Produkční dvůr", nodeType: "resource_node", group: "production", resource: { supplies: 4, production: 2 }, capabilities: ["farming"], role: "source" };

async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE game_sessions(id uuid,current_turn integer,resolving_turn integer,init_status text);
    CREATE TABLE tile_parcels(id uuid,session_id uuid,city_id uuid,owner_player text,grid_x integer,grid_y integer,parcel_index integer,buildable boolean,capacity_slots integer,claim_kind text,status text,land_use text);
    CREATE TABLE province_hexes(id uuid,session_id uuid,grid_x integer,grid_y integer,biome_family text,is_passable boolean,owner_player text);
    CREATE TABLE cities(id uuid,session_id uuid,owner_player text);
    CREATE TABLE realm_resources(id uuid,session_id uuid,player_name text,gold_reserve numeric,production_reserve numeric);
    CREATE TABLE province_nodes(id uuid default gen_random_uuid(),session_id uuid,province_id uuid,city_id uuid,name text,node_type text,node_tier text,node_subtype text,node_class text,hex_q integer,hex_r integer,grid_x integer,grid_y integer,parcel_index integer,controlled_by text,built_by text,built_turn integer,biome_at_build text,production_output numeric,wealth_output numeric,food_value numeric,resource_output jsonb,capability_tags text[],production_role text,flow_role text,fortification_level integer,is_active boolean,upgrade_level integer,max_upgrade_level integer);
    CREATE TABLE tile_parcel_contents(id uuid default gen_random_uuid(),session_id uuid,parcel_id uuid,entity_type text,entity_id uuid,slots_used integer);
    INSERT INTO game_sessions VALUES('${S}',1,NULL,'ready');
    INSERT INTO tile_parcels VALUES('${PARCEL}','${S}','${CITY}','p',0,0,0,true,1,'urban','claimed','open');
    INSERT INTO province_hexes VALUES('${HEX}','${S}',0,0,'plains',true,'p');
    INSERT INTO cities VALUES('${CITY}','${S}','p');
    INSERT INTO realm_resources VALUES('${REALM}','${S}','p',100,100);`);
  await db.exec(readFileSync("drizzle/migrations/0037_atomic_build_subnode.sql", "utf8"));
  return db;
}

const call = (db: PGlite, player = "p", gold = 35, production = 45) => db.query(
  "SELECT build_subnode_atomic($1,$2,$3,$4,NULL,1,'Dvůr','farmstead',$5,$6,$7) AS result",
  [S, player, PARCEL, CITY, JSON.stringify(DEF), gold, production],
);

describe("atomic BUILD_SUBNODE transaction", () => {
  it("serializes competing builds: exactly one node, one slot and one payment", async () => {
    const db = await database();
    try {
      const attempts = await Promise.allSettled([call(db), call(db)]);
      expect(attempts.filter(a => a.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter(a => a.status === "rejected")).toHaveLength(1);
      expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM province_nodes")).rows[0].n).toBe(1);
      expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM tile_parcel_contents")).rows[0].n).toBe(1);
      const realm = (await db.query<{ gold_reserve: string; production_reserve: string }>("SELECT gold_reserve,production_reserve FROM realm_resources")).rows[0];
      expect(Number(realm.gold_reserve)).toBe(65); expect(Number(realm.production_reserve)).toBe(55);
    } finally { await db.close(); }
  }, 20000);

  it("rejects a foreign actor and negative price without unpaid nodes or debits", async () => {
    const db = await database();
    try {
      await expect(call(db, "intruder")).rejects.toThrow();
      await expect(call(db, "p", -1, 45)).rejects.toThrow("Neplatná cena");
      expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM province_nodes")).rows[0].n).toBe(0);
      const realm = (await db.query<{ gold_reserve: string; production_reserve: string }>("SELECT gold_reserve,production_reserve FROM realm_resources")).rows[0];
      expect(Number(realm.gold_reserve)).toBe(100); expect(Number(realm.production_reserve)).toBe(100);
    } finally { await db.close(); }
  }, 20000);
});
