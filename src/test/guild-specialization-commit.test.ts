// @vitest-environment node
import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { accrueGuildSpecialization } from '../../supabase/functions/_shared/guildSpecialization';
import { resolveGoodsEconomy, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { planFiscalWrites } from '../../supabase/functions/_shared/atomicWrites';
import fixture from './fixtures/parcel-jv72o7-preflight.json';

it('real physical guild output + buffered SQL fiscal commit applies scores once and rolls back failed transactions', async () => {
  const db = new PGlite();
  try {
    const s = '00000000-0000-0000-0000-000000000001', n = '00000000-0000-0000-0000-000000000002';
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE realm_resources(id uuid,session_id uuid,player_name text,gold_reserve numeric,production_reserve numeric,last_processed_turn integer);
      CREATE TABLE game_sessions(id uuid,current_turn integer,resolving_turn integer);
      CREATE TABLE cities(id uuid,owner_player text);
      CREATE TABLE economy_turn_ledgers(session_id uuid,turn_number integer,committed boolean);
      CREATE TABLE city_good_balances(session_id uuid,turn_number integer,city_id uuid,balance jsonb);
      CREATE TABLE province_nodes(id uuid,session_id uuid,controlled_by text,production_role text,guild_level integer,specialization_scores jsonb);
      INSERT INTO realm_resources VALUES('${n}','${s}','p',75,50,0);
      INSERT INTO game_sessions VALUES('${s}',1,NULL);
      INSERT INTO cities VALUES('${n}','p');
      INSERT INTO economy_turn_ledgers VALUES('${s}',1,false);
      INSERT INTO province_nodes VALUES('${n}','${s}','p','guild',1,'{}');`);
    await db.exec(readFileSync('drizzle/migrations/0014_guild_specialization_commit_marker.sql', 'utf8'));
    await db.exec(readFileSync('drizzle/migrations/0012_validate_normalized_construction_points.sql', 'utf8'));
    const atomic = readFileSync('drizzle/migrations/0000_apply_reviewed_turn_atomicity_20260926.sql', 'utf8');
    await db.exec(atomic.slice(0, atomic.indexOf('ALTER TABLE public.game_sessions')));
    const city = { ...fixture.snapshot.cities[0], id: n, owner: 'p', population: 100, classes: { burghers: 100 }, cell: '0,0', guild: 1 };
    const snap: Snapshot = { ...fixture.snapshot as unknown as Snapshot, cities: [city], edges: [], fame: [],
      opening: [{ city: n, good: 'raw_grapes', qty: 10, quality: 1 }], producers: [{ id: `${n}:make_wine`, node: n, city: n,
        channel: 'node', capacity: 3, jobs: 3, allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: false, distinctive: true,
        recipe: { key: 'make_wine', good: 'wine_standard', qty: 1, inputs: [{ good: 'raw_grapes', qty: 1 }], labor: 1, quality: 0, minQuality: 0 } }] };
    const physical = resolveGoodsEconomy(snap);
    expect(physical.diagnostics[0].realized).toBeGreaterThan(0);
    const node = { id: n, controlled_by: 'p', production_role: 'guild', guild_level: 1, specialization_scores: {}, specialization_last_turn: 0 };
    const next = accrueGuildSpecialization(node, 'p', 1, snap.producers, physical.diagnostics);
    expect(next?.specialization_scores.wine_standard).toBeGreaterThan(0);
    const plan = planFiscalWrites({});
    // Minimal query facade: buffering must not require or execute a database write.
    const buffered = planFiscalWrites({ from: () => ({}) });
    await buffered.client.from('province_nodes').update(next).eq('id', n).eq('controlled_by', 'p');
    expect(plan.writes).toEqual([]);
    expect(buffered.writes).toHaveLength(1);
    const before = (await db.query('select specialization_scores from province_nodes')).rows;
    expect(before).toEqual([{ specialization_scores: {} }]);
    const commit = (writes: unknown) => db.query('select apply_goods_fiscal_plan($1,$2,1,$3,0,0,$4) applied', [s, 'p', '{}', JSON.stringify(writes)]);
    await expect(commit([...buffered.writes, { table: 'not_allowed', action: 'update', filters: [], values: {} }])).rejects.toThrow('Unsupported fiscal table');
    expect((await db.query('select last_processed_turn from realm_resources')).rows).toEqual([{ last_processed_turn: 0 }]);
    expect((await commit(buffered.writes)).rows).toEqual([{ applied: true }]);
    expect((await commit(buffered.writes)).rows).toEqual([{ applied: false }]);
    const saved = (await db.query('select specialization_scores, specialization_last_turn from province_nodes')).rows[0];
    expect(saved.specialization_scores).toEqual(next?.specialization_scores);
    expect(saved.specialization_last_turn).toBe(1);
    expect((await db.query('select gold_reserve,production_reserve from realm_resources')).rows).toEqual([{ gold_reserve: '75', production_reserve: '50' }]);
  } finally { await db.close(); }
}, 20000);