// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {strictDatabase} from '../../../supabase/functions/_shared/strictDatabase';
import {database} from './fakeProjectionDatabase';
describe('mandatory database boundaries',()=>{
  it('preserves query filters and successful results',async()=>{
    const source=database(),client=strictDatabase(source);
    const result=await client.from('cities').select('id').eq('owner_player','A').range(0,1);
    expect(result.data).toEqual([{id:'city'}]);
  });
  it.each(['select','update','delete'] as const)('rejects resolved %s errors',async operation=>{
    const source=database();source.failures.add(`cities:${operation}`);const client=strictDatabase(source);
    const query=operation==='select'?client.from('cities').select():operation==='update'?client.from('cities').update({population_total:0}):client.from('cities').delete();
    await expect(Promise.resolve(query)).rejects.toThrow(`cities ${operation} failed`);
    expect(source.tables.cities[0].population_total).toBe(100);
  });
});
