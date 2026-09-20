import { createClient } from "npm:@supabase/supabase-js@2";
import { computeCanonicalEconomy } from "../_shared/economyAdapter.ts";
/** Canonical physical economy projection (headcount model: 100 jobs at level 1, doubling per level). */
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };

Deno.serve(async req => {
  if(req.method === "OPTIONS") return new Response(null,{headers});
  try {
    const {session_id}=await req.json();if(!session_id)throw Error("session_id required");
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    return new Response(JSON.stringify(await computeCanonicalEconomy(sb,session_id)),{headers});
  } catch(e) {
    const error=e instanceof Error?e.message:typeof e==='object'&&e!==null?JSON.stringify(e):String(e);
    console.error('compute-trade-flows failed',error);
    return new Response(JSON.stringify({error}),{status:500,headers});
  }
});
