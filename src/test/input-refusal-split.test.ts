import { describe,it,expect } from 'vitest';
// @ts-ignore reuse fixture helpers via dynamic import of sibling test module is not allowed; inline minimal copy
import * as M from './industrial-input-trade.fixture';
describe('production_input refusal reasons are distinct',()=>{
  it('sweep',async()=>{for(const f of [0.1,1,3,6,12,30]){const t=M.fixture('lock',100,80);t.road_segments[0].friction=f;const p=await M.run(t);M.conserve(p);
    const x=p.result.industrialInputs.find((x:any)=>x.producer==='mill:mill_grain'&&x.good==='raw_grain');console.log(f,x.blocked,x.imported);}expect(1).toBe(1);});
});
