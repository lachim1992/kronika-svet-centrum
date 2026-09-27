// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {loadEdgeFunction} from './loadEdgeFunction';
import {planFiscalWrites} from '../../../supabase/functions/_shared/atomicWrites';

describe('durable turn continuation',()=>{
  it('resumes fiscal failure without rerunning world/production or advancing the calendar early',async()=>{
    let turn=4, failFiscal=true;
    const calls:string[]=[];
    const phases=new Map<string,any>([
      ['physical',{worldTick:{populationLedger:[]},constructionCompletion:{effectiveTurn:5}}],
      ['goods',{tradeFlows:{ok:true}}],['world_layer',{ok:true}],
    ]);
    const db:any={
      rpc:async(name:string,args:any)=>{
        calls.push(name);
        if(name==='begin_turn_resolution')return {data:'token',error:null};
        if(name==='complete_turn_phase')phases.set(args.p_phase,args.p_result);
        if(name==='finish_turn_resolution'){
          expect([...phases.keys()]).toEqual(expect.arrayContaining(['physical','goods','world_layer','fiscal','snapshot']));
          turn=5;
        }
        return {data:null,error:null};
      },
      functions:{invoke:async(name:string)=>{
        calls.push(name);
        if(name==='process-turn'&&failFiscal)return {data:{ok:false,error:'Injected fiscal outage'},error:null};
        return {data:{ok:true},error:null};
      }},
      from(table:string){
        const filters:Record<string,any>={};let one=false;
        const q:any=new Proxy({}, {get(_,method){
          if(method==='then')return (resolve:any)=>{
            let data:any=one?null:[];
            if(table==='game_sessions')data={id:'s',current_turn:turn,resolving_turn:5,game_mode:'tb_single_manual'};
            if(table==='game_players')data=[{player_name:'p'}];
            if(table==='turn_phase_journal')data=phases.has(filters.phase)?{result:phases.get(filters.phase)}:null;
            if(table==='economy_turn_ledgers')data={committed:true,result:{snapshot:{}}};
            return Promise.resolve({data,error:null,count:0}).then(resolve);
          };
          return (...args:any[])=>{if(method==='eq')filters[args[0]]=args[1];if(method==='single'||method==='maybeSingle')one=true;return q;};
        }});return q;
      },
    };
    const handler=loadEdgeFunction('commit-turn',{createClient:()=>db});
    const request=()=>new Request('https://local',{method:'POST',body:JSON.stringify({sessionId:'s',playerName:'p',expectedTurn:4,skipNarrative:true})});
    const failed=await handler(request());
    expect(failed.status).toBe(500);
    expect(turn).toBe(4);
    expect(calls).not.toContain('finish_turn_resolution');
    failFiscal=false;
    const retried=await handler(request());
    expect(retried.status).toBe(200);
    expect((await retried.json()).ok).toBe(true);
    expect(turn).toBe(5);
    expect(calls).not.toContain('compute-trade-flows');
    expect(calls).not.toContain('apply_atomic_turn_phase');
    expect(calls.filter(x=>x==='finish_turn_resolution')).toHaveLength(1);
  });
});

describe('transactional projection planner',()=>{
  it('buffers writes and overlays two updates to the same node without touching storage',async()=>{
    const stored={economic_value:10,infrastructure_level:1};let directWrites=0;
    const db={from(){const q:any=new Proxy({}, {get(_,key){
      if(key==='then')return (resolve:any)=>Promise.resolve({data:{...stored},error:null}).then(resolve);
      return ()=>{if(key==='update')directWrites++;return q;};
    }});return q;}};
    const p=planFiscalWrites(db);
    await p.client.from('province_nodes').update({economic_value:15}).eq('id','n');
    const {data:read}=await p.client.from('province_nodes').select('economic_value,infrastructure_level').eq('id','n').maybeSingle();
    expect(read.economic_value).toBe(15);
    await p.client.from('province_nodes').update({economic_value:read.economic_value+5}).eq('id','n');
    expect(p.writes[1].values.economic_value).toBe(20);
    expect(directWrites).toBe(0);
    expect(stored.economic_value).toBe(10);
  });
});
