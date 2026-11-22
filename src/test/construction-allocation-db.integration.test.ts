/**
 * DB integration: run only against a disposable database with migration 20261123100000 applied.
 * Requires CHRONICLE_IT_DB_URL (service-level SQL) and CHRONICLE_IT_SESSION/PLAYER/CITY of a test seat.
 * Skipped otherwise — never point this at JV72O7.
 */
import { describe, it, expect } from 'vitest';
const url = process.env.CHRONICLE_IT_DB_URL, session = process.env.CHRONICLE_IT_SESSION, player = process.env.CHRONICLE_IT_PLAYER, city = process.env.CHRONICLE_IT_CITY;
const run = url && session && player && city ? describe : describe.skip;

run('allocate_construction_reserve (live SQL)', () => {
  it('debits once, retry is idempotent, release refunds exactly into the same buckets', async () => {
    // @ts-ignore optional dev dependency for integration runs only
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: url }); await c.connect();
    try {
      await c.query('BEGIN');
      const turn = (await c.query('select current_turn from game_sessions where id=$1', [session])).rows[0].current_turn;
      await c.query(`update realm_resources set gold_reserve=100, production_reserve=40,
        construction_reserve_composition='{"wood":20,"stone":10,"mixed":0,"unattributed":10}' where session_id=$1 and player_name=$2`, [session, player]);
      const call = () => c.query('select allocate_construction_reserve($1,$2,$3,$4,$5,10,15,5,2) r', [session, 'it-cmd-00000001', player, city, turn]);
      const a = (await call()).rows[0].r; expect(a.ok).toBe(true);
      const b = (await call()).rows[0].r; expect(b.idempotent).toBe(true);
      let rr = (await c.query('select gold_reserve, production_reserve, construction_reserve_composition c from realm_resources where session_id=$1 and player_name=$2', [session, player])).rows[0];
      expect(Number(rr.gold_reserve)).toBe(90); expect(Number(rr.production_reserve)).toBe(18);
      const stale = (await c.query('select allocate_construction_reserve($1,$2,$3,$4,$5,0,1,0,0) r', [session, 'it-cmd-00000002', player, city, turn - 1])).rows[0].r;
      expect(stale.ok).toBe(false);
      const short = (await c.query('select allocate_construction_reserve($1,$2,$3,$4,$5,0,0,15,0) r', [session, 'it-cmd-00000003', player, city, turn])).rows[0].r;
      expect(short.ok).toBe(false);
      expect((await c.query('select release_construction_allocation($1,$2) r', [session, 'it-cmd-00000001'])).rows[0].r.ok).toBe(true);
      expect((await c.query('select release_construction_allocation($1,$2) r', [session, 'it-cmd-00000001'])).rows[0].r.idempotent).toBe(true);
      rr = (await c.query('select gold_reserve, production_reserve, construction_reserve_composition c from realm_resources where session_id=$1 and player_name=$2', [session, player])).rows[0];
      expect(Number(rr.gold_reserve)).toBe(100); expect(Number(rr.production_reserve)).toBe(40);
      expect(Number(rr.c.wood)).toBe(20); expect(Number(rr.c.stone)).toBe(10);
    } finally { await c.query('ROLLBACK'); await c.end(); }
  });
});
