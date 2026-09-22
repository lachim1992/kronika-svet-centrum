// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { loadEdgeFunction } from './loadEdgeFunction';

describe('failed mandatory turn phases', () => {
  it('does not treat an existing failed world tick as completed or advance the session', async () => {
    const updates: {table:string;patch:any}[]=[];
    const db={rpc:async()=>({data:true,error:null}),from(table:string){
      const q:any=new Proxy({}, {get(_,key){
        if(key==='then')return (resolve:any)=>Promise.resolve({data:table==='game_sessions'
          ? {id:'s',current_turn:4,game_mode:'tb_single_manual'}
          : table==='world_tick_log'?{id:'tick',status:'failed',results:{error:'partial projection'}}:null,error:null}).then(resolve);
        return (...args:any[])=>{if(key==='update')updates.push({table,patch:args[0]});return q;};
      }});return q;
    }};
    const handler=loadEdgeFunction('commit-turn',{createClient:()=>db});
    const response=await handler(new Request('https://local',{method:'POST',body:JSON.stringify({sessionId:'s',playerName:'p'})}));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('partial effects must be reconciled');
    expect(updates.some(u=>u.table==='game_sessions')).toBe(false);
    expect(updates.find(u=>u.table==='turn_execution_guards')?.patch.status).toBe('failed');
  });
});
