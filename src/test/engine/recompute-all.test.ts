// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadEdgeFunction } from './loadEdgeFunction';

describe('legacy recompute boundary', () => {
  it('delegates once to refresh and never resolves a fiscal turn', async () => {
    const fetcher = vi.fn(async () => Response.json({ok:true,steps:[{name:'goods',ok:true,durationMs:4}],warnings:['note']}));
    const handler = loadEdgeFunction('recompute-all',{fetch:fetcher as typeof fetch});
    const response = await handler(new Request('https://local/recompute-all',{method:'POST',body:JSON.stringify({sessionId:'world',playerName:'Alice'})}));
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toMatch(/\/refresh-economy$/);
    expect(JSON.parse(String(options.body))).toEqual({session_id:'world'});
    expect((await response.json()).ok).toBe(true);
  });
  it.each([
    {ok:true,steps:[{name:'goods',ok:false}],warnings:['all fine']},
    {steps:[{name:'goods',ok:true}]},
    {ok:true,steps:[]},
    {ok:true},
  ])('rejects incomplete or failed projections: %j',async payload=>{
    const handler=loadEdgeFunction('recompute-all',{fetch:(async()=>Response.json(payload)) as typeof fetch});
    const response=await handler(new Request('https://local/recompute-all',{method:'POST',body:JSON.stringify({sessionId:'world'})}));
    expect(response.status).toBe(500);
    expect((await response.json()).ok).toBe(false);
  });
});
