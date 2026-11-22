// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const S = "00000000-0000-0000-0000-000000000001", CITY = "00000000-0000-0000-0000-000000000002";
const P1 = "00000000-0000-0000-0000-000000000003", P2 = "00000000-0000-0000-0000-000000000004";

async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA app_private; CREATE FUNCTION app_private.is_session_member(uuid, uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION auth_uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE game_sessions(id uuid PRIMARY KEY,current_turn integer,resolving_turn integer);
    CREATE TABLE cities(id uuid PRIMARY KEY,session_id uuid,owner_player text,grid_x integer,grid_y integer);
    CREATE TABLE tile_parcels(id uuid PRIMARY KEY,session_id uuid,city_id uuid,owner_player text,grid_x integer,grid_y integer,claim_kind text);
    CREATE TABLE realm_resources(session_id uuid,player_name text,gold_reserve numeric);
    INSERT INTO game_sessions VALUES('${S}',5,NULL);
    INSERT INTO cities VALUES('${CITY}','${S}','p',0,0);
    INSERT INTO tile_parcels VALUES('${P1}','${S}','${CITY}','p',1,1,'worked'),('${P2}','${S}','${CITY}','p',2,0,'worked');
    INSERT INTO realm_resources VALUES('${S}','p',100),('${S}','q',100);`);
  await db.exec(readFileSync("supabase/migrations/20261122170000_rural_settlements.sql", "utf8"));
  return db;
}
const call = (db: PGlite, o: { cmd?: string; player?: string; parcel?: string; cost?: number; reach?: number; turn?: number } = {}) =>
  db.query("SELECT create_rural_settlement($1,$2,$3,$4,'Lhota',$5,$6,$7) AS r", [S, o.cmd ?? "c1", o.player ?? "p", o.parcel ?? P1, o.cost ?? 20, o.reach ?? 2, o.turn ?? 5]);
const gold = async (db: PGlite, p = "p") => Number((await db.query<{ g: string }>("SELECT gold_reserve g FROM realm_resources WHERE player_name=$1", [p])).rows[0].g);
const count = async (db: PGlite) => (await db.query<{ n: number }>("SELECT count(*)::int n FROM rural_settlements")).rows[0].n;

describe("create_rural_settlement SQL", () => {
  it("rejects a cost other than 20 and a reach other than 2 without debit", async () => {
    const db = await database();
    await expect(call(db, { cost: 0 })).rejects.toThrow();
    await expect(call(db, { reach: 999 })).rejects.toThrow();
    expect(await gold(db)).toBe(100); expect(await count(db)).toBe(0);
  });
  it("rejects a turn that is not the server's current turn", async () => {
    const db = await database();
    await expect(call(db, { turn: 4 })).rejects.toThrow();
    await expect(call(db, { turn: -1 })).rejects.toThrow();
    expect(await gold(db)).toBe(100);
  });
  it("debits once; a retry of the same command returns the same row without a second debit", async () => {
    const db = await database();
    const a = (await call(db)).rows[0] as any, b = (await call(db)).rows[0] as any;
    expect(b.r.id).toBe(a.r.id); expect(b.r.duplicate).toBe(true);
    expect(await gold(db)).toBe(80); expect(await count(db)).toBe(1);
  });
  it("a command id cannot return another player's or parcel's record", async () => {
    const db = await database();
    await call(db);
    await expect(call(db, { player: "q" })).rejects.toThrow();
    await expect(call(db, { parcel: P2 })).rejects.toThrow();
    expect(await gold(db, "q")).toBe(100);
  });
  it("concurrent identical commands create one village and one payment", async () => {
    const db = await database();
    await Promise.allSettled([call(db), call(db)]);
    expect(await count(db)).toBe(1); expect(await gold(db)).toBe(80);
  });
});
