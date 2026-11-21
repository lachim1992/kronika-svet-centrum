// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { loadEdgeFunction } from './engine/loadEdgeFunction';

const S = '00000000-0000-0000-0000-000000000001', T = '00000000-0000-0000-0000-000000000002';
const U = '00000000-0000-0000-0000-000000000011', V = '00000000-0000-0000-0000-000000000012';
const A = '00000000-0000-0000-0000-000000000021', B = '00000000-0000-0000-0000-000000000022';
const C = '00000000-0000-0000-0000-000000000023', CITY = '00000000-0000-0000-0000-000000000031';
const K = '00000000-0000-0000-0000-000000000041', L = '00000000-0000-0000-0000-000000000042';
interface TestDB { exec(sql: string): Promise<unknown>; query<T = Record<string, unknown>>(sql: string, args?: any[]): Promise<{ rows: T[] }>; close(): Promise<unknown> }
let db: TestDB;

async function database(): Promise<TestDB> {
  const url = process.env.FINANCE_TEST_DATABASE_URL;
  if (!url) return new PGlite();
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/finance_stage1_test') throw new Error('Tests require an isolated local finance_stage1_test database');
  const sql = postgres(url, { max: 4, onnotice: () => {} });
  return { exec: async s => {
    const connection = await sql.reserve();
    try { return await connection.unsafe(s); }
    catch (error) { await connection.unsafe('ROLLBACK'); throw error; }
    finally { connection.release(); }
  }, query: async <T>(s: string, args: any[] = []) => ({ rows: Array.from(await sql.unsafe(s, args)) as T[] }), close: () => sql.end() };
}

const command = (type: string, args: object, key = K, actor = U, session = S) =>
  db.query<{ result: any }>('SELECT execute_financial_command($1,$2,$3,$4,$5::text::jsonb) AS result', [session, actor, key, type, JSON.stringify(args)]).then(r => r.rows[0].result);
const transfer = (amount = 30, key = K, source = A, target = B, actor = U, session = S) =>
  command('TRANSFER_FINANCIAL_FUNDS', { source_account_id: source, destination_account_id: target, amount }, key, actor, session);
const balance = async (id: string) => Number((await db.query<{ balance: string }>('SELECT balance FROM financial_accounts WHERE id=$1', [id])).rows[0].balance);
const count = async (table: string) => Number((await db.query<{ n: number }>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n);

beforeAll(async () => {
  db = await database();
  // Re-runnable only in the guarded, explicitly named local scratch database.
  if (process.env.FINANCE_TEST_DATABASE_URL) await db.exec('DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS app_private CASCADE; CREATE SCHEMA public;');
  await db.exec(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    CREATE SCHEMA auth; CREATE SCHEMA app_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE game_sessions(id uuid PRIMARY KEY,current_turn integer,resolving_turn integer);
    CREATE TABLE game_players(session_id uuid,user_id uuid,player_name text);
    CREATE TABLE cities(id uuid PRIMARY KEY,session_id uuid,owner_player text,name text DEFAULT 'Test city');
    CREATE TABLE realm_resources(session_id uuid,player_name text,gold_reserve integer,total_wealth numeric);
    CREATE TABLE city_capital_stock(city_id uuid,stock numeric,session_id uuid,last_turn integer DEFAULT 21);
    CREATE TABLE game_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid,command_id uuid UNIQUE,event_type text,player text,actor_type text,turn_number integer,confirmed boolean,truth_state text,reference jsonb,processed_at timestamptz);
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION app_private.is_session_member(s uuid,u uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM game_players WHERE session_id=s AND user_id=u) $$;
    GRANT USAGE ON SCHEMA public,auth,app_private TO anon,authenticated,service_role;
    INSERT INTO game_sessions VALUES('${S}',21,NULL),('${T}',8,NULL);
    INSERT INTO game_players VALUES('${S}','${U}','Alice'),('${S}','${V}','Bob'),('${T}','${U}','Alice');
    INSERT INTO cities(id,session_id,owner_player) VALUES('${CITY}','${S}','Alice');
    INSERT INTO realm_resources VALUES('${S}','Alice',100,5);
    INSERT INTO city_capital_stock(city_id,stock,session_id) VALUES('${CITY}',17,'${S}');`);
  await db.exec(readFileSync('drizzle/migrations/0038_financial_sectors_stage1.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0039_financial_event_session_keys.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0040_financial_capital_read_boundary.sql', 'utf8'));
  // Reproduce the hosted environment's broad inherited grants, then verify the forward hardening.
  await db.exec('GRANT ALL ON financial_accounts,financial_commands,financial_transfers,financial_entries TO anon,authenticated;');
  await db.exec(readFileSync('drizzle/migrations/0041_financial_explicit_client_grants.sql', 'utf8'));
}, 30000);

beforeEach(async () => {
  // Explicit synthetic opening funds exist ONLY in this isolated test fixture, never in live games.
  await db.exec(`TRUNCATE financial_entries,financial_transfers,financial_commands,financial_accounts,game_events;
    UPDATE game_sessions SET resolving_turn=NULL;
    UPDATE cities SET owner_player='Alice';
    INSERT INTO financial_accounts(id,session_id,sector,owner_kind,controller_user_id,label,balance) VALUES
      ('${A}','${S}','PRIVATE','BUSINESS','${U}','Producer',100),
      ('${B}','${S}','PRIVATE','HOUSEHOLD','${V}','Households',0),
      ('${C}','${T}','ORGANIZATION','ORGANIZATION','${U}','Guild',0);`);
});
afterAll(async () => { await db?.close(); });

describe('four-sector accounting: real SQL', () => {
  it('creates municipal, household, business and organization accounts at zero; STATE is excluded', async () => {
    for (const [i, sector, owner_kind] of [[1,'MUNICIPAL','CITY'],[2,'PRIVATE','HOUSEHOLD'],[3,'PRIVATE','BUSINESS'],[4,'ORGANIZATION','ORGANIZATION']] as const) {
      const key = `00000000-0000-0000-0000-00000000005${i}`;
      const result = await command('CREATE_FINANCIAL_ACCOUNT', { sector, owner_kind, label: 'Account', ...(sector === 'MUNICIPAL' ? {city_id: CITY} : {}) }, key);
      expect(Number(result.balance)).toBe(0);
    }
    await expect(command('CREATE_FINANCIAL_ACCOUNT', {sector:'STATE',owner_kind:'CITY',label:'Fake state',city_id:CITY})).rejects.toThrow();
    expect((await db.query('SELECT gold_reserve FROM realm_resources')).rows[0].gold_reserve).toBe(100);
    expect(Number((await db.query('SELECT stock FROM city_capital_stock')).rows[0].stock)).toBe(17);
  });

  it('records exactly one debit and credit with zero net and conserves cash', async () => {
    await transfer(30);
    expect(await balance(A)).toBe(70); expect(await balance(B)).toBe(30);
    const rows = (await db.query<{ delta: string; balance_after: string }>('SELECT delta,balance_after FROM financial_entries ORDER BY delta')).rows;
    expect(rows.map(r => Number(r.delta))).toEqual([-30,30]);
    expect(rows.map(r => Number(r.balance_after))).toEqual([70,30]);
    expect(rows.reduce((sum,r) => sum + Number(r.delta),0)).toBe(0);
    expect(await count('financial_transfers')).toBe(1);
  });

  it('identical replay is a no-op including event and full journal', async () => {
    const first = await transfer(); const replay = await transfer();
    expect(replay.idempotent).toBe(true); expect(replay.transfer_id).toBe(first.transfer_id);
    expect(await balance(A)).toBe(70); expect(await count('financial_entries')).toBe(2); expect(await count('game_events')).toBe(1);
  });

  it('rejects altered replay and different actor, before further effects', async () => {
    await transfer();
    await expect(transfer(31)).rejects.toThrow('replay conflict');
    await expect(transfer(30,K,A,B,V)).rejects.toThrow('replay conflict');
    expect(await balance(A)).toBe(70); expect(await count('financial_transfers')).toBe(1);
  });

  it('isolates sessions, including identical command keys and event uniqueness', async () => {
    await expect(transfer(1,K,A,C)).rejects.toThrow('unavailable');
    const args = {sector:'PRIVATE',owner_kind:'HOUSEHOLD',label:'Zero'};
    const first = await command('CREATE_FINANCIAL_ACCOUNT',args,K,U,S);
    const other = await command('CREATE_FINANCIAL_ACCOUNT',args,K,U,T);
    expect(first.account_id).not.toBe(other.account_id);
    expect(await count('financial_commands')).toBe(2); expect(await count('game_events')).toBe(2);
    expect(await balance(A)).toBe(100);
  });

  it('rejects overdraft, zero, negative, nonfinite and overprecision amounts with no journal', async () => {
    await expect(transfer(101)).rejects.toThrow('Insufficient funds');
    for (const amount of [0,-1,0.0001]) await expect(transfer(amount)).rejects.toThrow('Invalid amount');
    for (const amount of ['NaN','Infinity']) await expect(command('TRANSFER_FINANCIAL_FUNDS',{source_account_id:A,destination_account_id:B,amount})).rejects.toThrow('Invalid amount');
    expect(await balance(A)).toBe(100); expect(await balance(B)).toBe(0); expect(await count('financial_commands')).toBe(0);
  });

  it('rejects spoofed owner, foreign municipality and lost city control', async () => {
    await expect(transfer(1,K,A,B,V)).rejects.toThrow('unauthorized');
    await expect(command('CREATE_FINANCIAL_ACCOUNT',{sector:'MUNICIPAL',owner_kind:'CITY',city_id:CITY,label:'Foreign'},K,V)).rejects.toThrow('City not controlled');
    await expect(command('CREATE_FINANCIAL_ACCOUNT',{sector:'PRIVATE',owner_kind:'BUSINESS',label:'Spoof',owner_player:'Alice'})).rejects.toThrow('Invalid account arguments');
    const result = await command('CREATE_FINANCIAL_ACCOUNT',{sector:'MUNICIPAL',owner_kind:'CITY',city_id:CITY,label:'City cash'});
    await db.query('UPDATE financial_accounts SET balance=5 WHERE id=$1',[result.account_id]);
    await db.exec("UPDATE cities SET owner_player='Bob'");
    await expect(transfer(1,L,result.account_id,B)).rejects.toThrow('City no longer controlled');
  });

  it('concurrent distinct commands cannot spend the same funds twice', async () => {
    const attempts = await Promise.allSettled([transfer(70,K),transfer(70,L)]);
    expect(attempts.filter(a => a.status==='fulfilled')).toHaveLength(1);
    expect(await balance(A)).toBe(30); expect(await balance(B)).toBe(70); expect(await count('financial_transfers')).toBe(1);
  });

  it('concurrent identical commands settle once', async () => {
    const results = await Promise.all([transfer(40),transfer(40)]);
    expect(results.filter(r=>r.idempotent)).toHaveLength(1);
    expect(await balance(A)).toBe(60); expect(await count('financial_entries')).toBe(2);
  });

  it('rolls back balances if the canonical event cannot be recorded', async () => {
    await db.exec(`CREATE FUNCTION reject_test_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test event failure'; END $$;
      CREATE TRIGGER test_event_failure BEFORE INSERT ON game_events FOR EACH ROW EXECUTE FUNCTION reject_test_event();`);
    try {
      await expect(transfer()).rejects.toThrow('Test event failure');
      expect(await balance(A)).toBe(100); expect(await balance(B)).toBe(0); expect(await count('financial_entries')).toBe(0); expect(await count('financial_commands')).toBe(0);
    } finally { await db.exec('DROP TRIGGER test_event_failure ON game_events; DROP FUNCTION reject_test_event();'); }
  });

  it('deferred balance guard rejects incomplete journal', async () => {
    await expect(db.exec(`INSERT INTO financial_transfers(session_id,command_id,source_account_id,destination_account_id,amount,actor_user_id) VALUES('${S}','${K}','${A}','${B}',1,'${U}')`)).rejects.toThrow('Unbalanced financial transfer');
    expect(await count('financial_transfers')).toBe(0);
  });

  it('RLS hides foreign cash and journals; clients cannot mutate or spoof RPC identity', async () => {
    await transfer();
    // Role checks use a dedicated connection transaction so SET LOCAL cannot leak to another test.
    const results = await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${V}',true);
      DO $$ BEGIN
        IF (SELECT count(*) FROM financial_accounts)<>1 THEN RAISE EXCEPTION 'Foreign accounts visible'; END IF;
        IF (SELECT count(*) FROM financial_entries)<>1 THEN RAISE EXCEPTION 'Foreign journal visible'; END IF;
        IF (SELECT count(*) FROM financial_transfers)<>1 THEN RAISE EXCEPTION 'Own transfer missing'; END IF;
      END $$; COMMIT;`);
    expect(results).toBeDefined();
    for (const sql of ['UPDATE financial_accounts SET balance=999', 'INSERT INTO financial_accounts(session_id,sector,owner_kind,controller_user_id,label) VALUES(\''+S+'\',\'PRIVATE\',\'BUSINESS\',\''+V+'\',\'x\')', 'SELECT * FROM financial_commands', `SELECT execute_financial_command('${S}','${U}','${L}','TRANSFER_FINANCIAL_FUNDS','{}')`]) {
      await expect(db.exec(`BEGIN; SET LOCAL ROLE authenticated; ${sql}; COMMIT;`)).rejects.toThrow('permission denied');
      await db.exec('ROLLBACK');
    }
    await expect(db.exec('BEGIN; SET LOCAL ROLE anon; SELECT * FROM financial_accounts; COMMIT;')).rejects.toThrow('permission denied');
    await db.exec('ROLLBACK');
    expect(await balance(A)).toBe(70);
  });

  it('fails closed during turn settlement', async () => {
    await db.exec(`UPDATE game_sessions SET resolving_turn=22 WHERE id='${S}'`);
    await expect(transfer()).rejects.toThrow('resolving');
    expect(await balance(A)).toBe(100);
  });

  it('capital report reads only verified owner cities without opening table access', async () => {
    for (const [user,n] of [[U,1],[V,0]] as const) {
      await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',true);
        DO $$ BEGIN IF (SELECT count(*) FROM read_financial_capital('${S}'))<>${n} THEN RAISE EXCEPTION 'Capital isolation failed'; END IF; END $$; COMMIT;`);
    }
    await expect(db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${V}',true); SELECT * FROM read_financial_capital('${T}'); COMMIT;`)).rejects.toThrow();
    await db.exec('ROLLBACK');
    await expect(db.exec('BEGIN; SET LOCAL ROLE authenticated; SELECT * FROM city_capital_stock; COMMIT;')).rejects.toThrow('permission denied');
    await db.exec('ROLLBACK');
  });

  it('clients cannot insert financial events disguised as narratives', async () => {
    await db.exec('GRANT INSERT ON game_events TO authenticated');
    await expect(db.exec(`BEGIN; SET LOCAL ROLE authenticated; INSERT INTO game_events(session_id,event_type,reference) VALUES('${S}','TRANSFER_FINANCIAL_FUNDS','{}'); COMMIT;`)).rejects.toThrow('Financial events are server-written');
    await db.exec('ROLLBACK');
    expect(await count('game_events')).toBe(0);
  });
});

describe('gateway → SQL integration (no live network)', () => {
  it('real refresh handler repeats derived steps without changing financial or fiscal state', async () => {
    const calls: string[] = [];
    const writes: string[] = [];
    const client = {
      rpc: async (name:string) => {
        if (name !== 'acquire_economy_refresh_lock') throw new Error('Unexpected RPC '+name);
        return {data:true};
      },
      from: (table:string) => {
        const builder:any = {
          select: () => builder, eq: () => builder,
          delete: () => { if (table !== 'economy_recompute_locks') throw new Error('Forbidden delete '+table); writes.push(table); return builder; },
          then: (resolve:any) => {
            if (!['cities','province_nodes','realm_resources','economy_recompute_locks'].includes(table)) throw new Error('Unexpected table '+table);
            return (table === 'realm_resources' ? db.query('SELECT * FROM realm_resources') : Promise.resolve({rows:[]}))
              .then(r=>resolve({data:r.rows,error:null}));
          },
        };
        return builder;
      },
    };
    const handler = loadEdgeFunction('refresh-economy',{createClient:()=>client,fetch:(async(input)=>{
      calls.push(String(input)); return Response.json({ok:true});
    }) as typeof fetch});
    const original = JSON.stringify((await db.query('SELECT * FROM realm_resources')).rows);
    for(let i=0;i<2;i++) {
      const result=await handler(new Request('http://local.test/refresh',{method:'POST',headers:{authorization:'Bearer test-value'},body:JSON.stringify({session_id:S})}));
      expect(result.status).toBe(200); expect((await result.json()).fiscal_unchanged).toBe(true);
    }
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(c=>!c.endsWith('/process-turn') && !c.endsWith('/command-dispatch'))).toBe(true);
    expect(writes).toEqual(['economy_recompute_locks','economy_recompute_locks']);
    expect(JSON.stringify((await db.query('SELECT * FROM realm_resources')).rows)).toBe(original);
    expect(await balance(A)).toBe(100); expect(await balance(B)).toBe(0); expect(await count('financial_commands')).toBe(0);
  },20000);

  it('verified JWT beats body owner; sandbox cannot fund treasury; replay reads back', async () => {
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: U } } }) },
      from: (table: string) => {
        if (!['game_sessions','game_players'].includes(table)) throw new Error('Unexpected write/read '+table);
        const filter: Record<string,unknown> = {};
        const builder: any = { select: () => builder, eq: (key:string,value:unknown) => {filter[key]=value;return builder;},
          single: async () => ({data:(await db.query('SELECT * FROM game_sessions WHERE id=$1',[filter.id])).rows[0]}),
          maybeSingle: async () => ({data:(await db.query('SELECT player_name FROM game_players WHERE session_id=$1 AND user_id=$2',[filter.session_id,filter.user_id])).rows[0]}) };
        return builder;
      },
      rpc: async (_name:string,args:any) => { try { return { data: await command(args.p_type,args.p_args,args.p_command,args.p_actor,args.p_session) }; } catch(error) { return {error}; } },
    };
    const handler = loadEdgeFunction('command-dispatch',{createClient:()=>client});
    const request = () => new Request('http://local.test/command-dispatch',{method:'POST',headers:{authorization:'Bearer test-user'},body:JSON.stringify({sessionId:S,turnNumber:21,actor:{name:'Bob',id:V,type:'player'},commandType:'TRANSFER_FINANCIAL_FUNDS',commandId:K,commandPayload:{source_account_id:A,destination_account_id:B,amount:25},sandbox:true})});
    const first = await handler(request()); expect(first.status).toBe(200); expect((await first.json()).ok).toBe(true);
    const retry = await handler(request()); expect((await retry.json()).idempotent).toBe(true);
    expect(await balance(A)).toBe(75); expect(await balance(B)).toBe(25);
    expect((await db.query('SELECT player FROM game_events')).rows[0].player).toBe('Alice');
    expect((await db.query('SELECT gold_reserve FROM realm_resources')).rows[0].gold_reserve).toBe(100);
  },20000);

  it('refresh and process-turn do not acquire a new financial account writer', () => {
    for (const name of ['refresh-economy','process-turn']) {
      const source = readFileSync(`supabase/functions/${name}/index.ts`,'utf8');
      expect(source).not.toMatch(/financial_accounts|execute_financial_command|financial_transfers/);
    }
  });
});