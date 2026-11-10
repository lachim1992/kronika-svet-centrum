import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { authorizeSessionCaller, AuthError } from '../_shared/sessionAuth.ts';
import { applyParcelRollout, prepareParcelRollout } from '../_shared/parcelRollout.ts';
import { computeCanonicalEconomy } from '../_shared/economyAdapter.ts';
import { parcelSubsistencePreflight } from '../_shared/parcelPreflight.ts';
const schema=z.object({session_id:z.string().uuid(),dryRun:z.boolean().default(true)});
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
  try {
    // Authorization is checked even for dry-run; no body identity or anonymous writes.
    const body=schema.parse(await req.json());
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!key) throw new Error('Missing server configuration');
    const db=createClient(url,key),caller=await authorizeSessionCaller(req,db,body.session_id);
    if(!caller.admin&&!caller.service) throw new AuthError('Admin role required',403);
    const prepared=await prepareParcelRollout(db,body.session_id);
    // Even an already-applied save needs a real read-only dry-run, not an empty success.
    if(body.dryRun || !prepared.already_applied){
      const parcels=prepared.parcels.map((p:any)=>({...p,id:p.id??`preview:${p.grid_x}:${p.grid_y}:${p.parcel_index}`}));
      const existing=await db.from('tile_parcels').select('*').eq('session_id',body.session_id).range(0,9999);
      if(existing.error)throw existing.error;
      const proposed=new Map((existing.data||[]).map((p:any)=>[`${p.grid_x}:${p.grid_y}:${p.parcel_index}`,p]));
      for(const p of parcels)proposed.set(`${p.grid_x}:${p.grid_y}:${p.parcel_index}`,p);
      const allParcels=[...proposed.values()];
      const preview=await computeCanonicalEconomy(db,body.session_id,{parcelPreview:allParcels,readOnly:true});
      if(!('result' in preview))throw new Error('Read-only economy snapshot unavailable');
      const coverage=preview.marketBaskets.filter((b:any)=>['staple_food','drinking_water','fuel'].includes(b.basket_key));
      // Refuse a live rollout that would worsen the current city's subsistence. No magic compensation.
      const old=await db.from('city_market_baskets').select('city_id,basket_key,domestic_satisfaction').eq('session_id',body.session_id).eq('turn_number',prepared.turn);
      if(old.error)throw old.error;
      const unsafe=coverage.filter((b:any)=>b.domestic_satisfaction+1e-6<Math.min(b.basket_key==='fuel'?0.8:1,Number((old.data||[]).find((o:any)=>o.city_id===b.city_id&&o.basket_key===b.basket_key)?.domestic_satisfaction??1)));
      const hex=await db.from('province_hexes').select('q,r,grid_x,grid_y,biome_family,has_river,coastal,is_passable,forest_density').eq('session_id',body.session_id).range(0,9999);
      const catalog=await db.from('production_recipes').select('*');
      if(hex.error||catalog.error)throw hex.error||catalog.error;
      const recipeMap=new Map((catalog.data||[]).map((r:any)=>[r.recipe_key,r]));
      const baseline=preview.result.snapshot;
      const replay=parcelSubsistencePreflight(baseline,allParcels,hex.data,recipeMap);
      unsafe.push(...replay.unsafe);
      if(body.dryRun)return json({success:true,dry_run:true,result:{...prepared,allParcels,coverage,unsafe,fifth:replay.fifth,replayCoverage:replay.coverage,terrain:hex.data,snapshot:baseline,diagnostics:preview.result.diagnostics,labor:preview.result.labor}});
      if(unsafe.length)throw new Error(`Unsafe subsistence rollout: ${unsafe.map((b:any)=>`${b.city_id??b.city}:${b.basket_key??b.basket}=${b.domestic_satisfaction??b.coverage}`).join(',')}`);
    }
    const result=body.dryRun ? prepared : await applyParcelRollout(db,body.session_id);
    return json({success:true,dry_run:body.dryRun,result});
  } catch(e) {return json({error:e instanceof Error?e.message:String(e)},e instanceof AuthError?e.status:400);}
});