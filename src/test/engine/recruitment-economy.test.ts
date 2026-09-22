// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {loadEdgeFunction} from './loadEdgeFunction';

function fixture(production:number,grain:number,refreshFails=false){
  const refreshes:string[]=[];
  const realm={id:'realm',session_id:'s',player_name:'p',gold_reserve:1000,production_reserve:production,grain_reserve:grain,faith:0};
  const tables:Record<string,any[]>={game_sessions:[{id:'s',current_turn:1}],realm_resources:[realm],
    cities:[{id:'city',session_id:'s',owner_player:'p',population_total:1000,population_peasants:1000}],military_stacks:[],laws:[],game_events:[]};
  const db={functions:{invoke:async(name:string)=>{refreshes.push(name);return {data:{ok:!refreshFails},error:refreshFails?{message:'refresh failed'}:null};}},from(table:string){
    const rows=tables[table]??(tables[table]=[]);let op='select',payload:any,single=false;const filters:((r:any)=>boolean)[]=[];
    const query:any=new Proxy({}, {get(_,key){
      if(key==='then')return (resolve:any)=>{
        let selected=rows.filter(r=>filters.every(f=>f(r)));
        if(op==='insert'){selected=(Array.isArray(payload)?payload:[payload]).map((r:any)=>({id:`${table}-${rows.length}`, ...r}));rows.push(...selected);}
        if(op==='update')selected.forEach(r=>Object.assign(r,payload));
        return Promise.resolve({data:single?selected[0]??null:selected,error:null}).then(resolve);
      };
      return (...args:any[])=>{
        if(key==='eq')filters.push(r=>r[args[0]]===args[1]);
        if(key==='single'||key==='maybeSingle')single=true;
        if(key==='insert'||key==='update'){op=String(key);payload=args[0];}
        return query;
      };
    }});return query;
  }};
  const handler=loadEdgeFunction('command-dispatch',{createClient:()=>db});
  const recruit=()=>handler(new Request('https://local/command',{method:'POST',body:JSON.stringify({
    sessionId:'s',turnNumber:1,actor:{name:'p',type:'ai_faction'},commandType:'RECRUIT_STACK',commandId:'one',
    commandPayload:{stackName:'Militia',presetKey:'militia',manpower:100}})}));
  return {realm,tables,recruit,refreshes};
}
describe('recruitment uses the persistent capital account',()=>{
  it('can recruit with capital and no stored food, without rewriting projected food',async()=>{
    const f=fixture(200,0),response=await f.recruit();expect(response.status).toBe(200);
    expect((await response.json()).sideEffects.economy.status).toBe('fresh');
    expect(f.realm.production_reserve).toBe(175);expect(f.realm.gold_reserve).toBe(960);expect(f.realm.grain_reserve).toBe(0);
    expect(f.tables.military_stacks[0].soldiers).toBe(100);
    await f.recruit();expect(f.tables.military_stacks).toHaveLength(1);expect(f.realm.production_reserve).toBe(175);
    expect(f.refreshes).toEqual(['refresh-economy']);
  });
  it('does not create an army using food as a substitute for missing capital',async()=>{
    const f=fixture(0,1000),response=await f.recruit();expect(response.status).toBe(400);
    expect(f.realm.grain_reserve).toBe(1000);expect(f.realm.gold_reserve).toBe(1000);expect(f.tables.military_stacks).toHaveLength(0);
  });
  it('reports stale economy without inviting a duplicate command after a refresh failure',async()=>{
    const f=fixture(200,0,true),response=await f.recruit();
    expect(response.status).toBe(200);expect((await response.json()).sideEffects.economy.status).toBe('stale');
    await f.recruit();expect(f.tables.military_stacks).toHaveLength(1);expect(f.refreshes).toHaveLength(1);
  });
});
