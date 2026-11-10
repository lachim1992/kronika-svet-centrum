import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { authorizeSessionCaller, AuthError } from '../_shared/sessionAuth.ts';
import { applyParcelRollout, prepareParcelRollout } from '../_shared/parcelRollout.ts';
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
    const result=body.dryRun ? await prepareParcelRollout(db,body.session_id) : await applyParcelRollout(db,body.session_id);
    return json({success:true,dry_run:body.dryRun,result});
  } catch(e) {return json({error:e instanceof Error?e.message:String(e)},e instanceof AuthError?e.status:400);}
});