// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';
import {missingFixtureRounds, nominationIds, batchRoundCount, roundsPerTurn, lowerTierStartBlocker, ROUNDS_PER_TURN} from '../../../supabase/functions/_shared/sports';
import {loadEdgeFunction} from './loadEdgeFunction';

const request = (body: unknown, authenticated = true) => new Request('https://local/sports', {
  method: 'POST', headers: authenticated ? {Authorization: 'Bearer test-value'} : {}, body: JSON.stringify(body),
});
function database(rows: Record<string, any>, calls: string[] = []) {
  return {from(table: string) {
    let operation = 'select';
    const query: any = new Proxy({}, {get(_, key) {
      if (key === 'then') return (resolve: any) => {
        calls.push(`${table}:${operation}`);
        return Promise.resolve(rows[`${table}:${operation}`] ?? rows[table] ?? {data: [], error: null}).then(resolve);
      };
      return (..._args: any[]) => { if (['insert','update','delete','upsert'].includes(String(key))) operation = String(key); return query; };
    }});
    return query;
  }};
}

describe('Sphaera schedule repair', () => {
  it('stops when both legs have been played', () => {
    expect(missingFixtureRounds(['a','b'], [{home_team_id:'a',away_team_id:'b'},{home_team_id:'b',away_team_id:'a'}])).toEqual([]);
  });
  it('restores the missing first leg, not just the reverse leg', () => {
    expect(missingFixtureRounds(['a','b'], [{home_team_id:'b',away_team_id:'a'}])).toEqual([[['a','b']]]);
  });
  it.each([3,4,5,8])('schedules every pairing exactly once with %i clubs', n => {
    const ids=Array.from({length:n},(_,i)=>String(i));
    const rounds=missingFixtureRounds(ids,[]);
    expect(rounds.flat().length).toBe(n*(n-1));
    expect(new Set(rounds.flat().map(m=>m.join(':'))).size).toBe(n*(n-1));
    for(const r of rounds) expect(new Set(r.flat()).size).toBe(r.length*2);
  });
});

describe('sports input and command boundaries', () => {
  it.each([[], ['a','a'], ['a','b','c','d'], [null], 'a'])('rejects invalid nomination %j', value => {
    expect(()=>nominationIds(value)).toThrow();
  });
  it.each([0, -1, 1.2, '5', null, 11, NaN])('rejects invalid round count %j', value=>{
    expect(()=>batchRoundCount(value)).toThrow();
  });
  it('does not erase a nomination when any replacement athlete is invalid', async()=>{
    const calls: string[]=[];
    const db=database({games_festivals:{data:{id:'f',status:'nomination'}},academy_students:{data:[{id:'a'}]}},calls);
    const handler=loadEdgeFunction('games-qualify',{createClient:()=>db});
    const response=await handler(request({session_id:'s',festival_id:'f',player_name:'p',action:'select',selected_student_ids:['a','foreign']}));
    expect(response.status).toBe(400);
    expect(calls.some(c=>/:delete|:update|:insert/.test(c))).toBe(false);
  });
  it('reports a partial batch and stops after the first failed round', async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({ok:true,round:1,matches:[]}))
      .mockResolvedValueOnce(Response.json({error:'failed'}, {status:500}));
    const handler=loadEdgeFunction('league-play-batch',{createClient:()=>({}),fetch:fetcher});
    const response=await handler(request({session_id:'s',rounds:5}));
    expect(await response.json()).toMatchObject({ok:false,partial:true,roundsPlayed:1});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects unauthenticated league execution before making any request', async()=>{
    const fetcher=vi.fn();
    const handler=loadEdgeFunction('league-play-batch',{createClient:()=>({}),fetch:fetcher});
    expect((await handler(request({session_id:'s'},false))).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns the saved discipline instead of rolling new results on retry', async()=>{
    const calls:string[]=[];
    const handler=loadEdgeFunction('games-resolve-discipline',{createClient:()=>database({
      games_festivals:{data:{status:'finals'}},
      games_discipline_reveals:{data:{id:'r',status:'resolved',reveal_script:[{text:'saved'}],medal_snapshot:{p:{gold:1}}}},
    },calls)});
    const response=await handler(request({session_id:'s',festival_id:'f',discipline_id:'d'}));
    expect(await response.json()).toMatchObject({ok:true,reveal_script:[{text:'saved'}]});
    expect(calls.some(c=>/:update|:insert|:upsert/.test(c))).toBe(false);
  });
  it('does not claim a discipline when fewer than two athletes exist', async()=>{
    const calls:string[]=[];
    const handler=loadEdgeFunction('games-resolve-discipline',{createClient:()=>database({
      games_festivals:{data:{status:'finals'}},games_discipline_reveals:{data:null},
      games_participants:{data:[]},games_disciplines:{data:{id:'d'}},
    },calls)});
    expect((await handler(request({session_id:'s',festival_id:'f',discipline_id:'d'}))).status).toBe(400);
    expect(calls.some(c=>/:update|:insert/.test(c))).toBe(false);
  });
});

describe('Sphaera season pacing and league order', () => {
  it('resolves several rounds inside one game turn', () => {
    expect(ROUNDS_PER_TURN).toBeGreaterThanOrEqual(3);
    expect(roundsPerTurn(undefined)).toBe(ROUNDS_PER_TURN);
    expect(roundsPerTurn(5)).toBe(5);
  });
  it.each([0, -1, 2.5, '3', 11])('rejects an impossible rounds-per-turn %j', value => {
    expect(() => roundsPerTurn(value)).toThrow();
  });
  it('holds the second league back while the first league table is still open', () => {
    const blocker = lowerTierStartBlocker(2, [{league_tier: 1, status: 'active', playoff_status: 'none'}]);
    expect(blocker).toMatchObject({tier: 1, phase: 'table'});
  });
  it('holds the second league back while the cup is still running', () => {
    const blocker = lowerTierStartBlocker(2, [{league_tier: 1, status: 'active', playoff_status: 'semifinals'}]);
    expect(blocker).toMatchObject({tier: 1, phase: 'cup'});
  });
  it('lets the second league start once the table and the cup are decided', () => {
    expect(lowerTierStartBlocker(2, [{league_tier: 1, status: 'concluded', playoff_status: 'completed'}])).toBeNull();
    expect(lowerTierStartBlocker(1, [{league_tier: 1, status: 'active', playoff_status: 'none'}])).toBeNull();
  });
  it('makes a third league wait for every league above it', () => {
    expect(lowerTierStartBlocker(3, [
      {league_tier: 1, status: 'concluded', playoff_status: 'completed'},
      {league_tier: 2, status: 'active', playoff_status: 'none'},
    ])).toMatchObject({tier: 2});
  });
});
