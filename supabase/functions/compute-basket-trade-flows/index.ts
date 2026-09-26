import { createClient } from "npm:@supabase/supabase-js@2";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
// Compatibility endpoint: baskets are projected atomically from the concrete ledger.
// It must never clear a second market, move goods or re-add household output.
Deno.serve(async req => {
  if(req.method === "OPTIONS") return new Response(null,{headers});
  try {
    const {session_id}=await req.json();if(!session_id)throw Error("session_id required");
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const s=await sb.from("game_sessions").select("current_turn").eq("id",session_id).single();if(s.error)throw s.error;
    const r=await sb.from("economy_turn_ledgers").select("turn_number").eq("session_id",session_id).eq("turn_number",s.data.current_turn).maybeSingle();
    if(r.error)throw r.error;
    // No projection yet for this turn: nothing to project, not a failure.
    if(!r.data)return new Response(JSON.stringify({ok:true,derived:true,skipped:"no_goods_projection",fiscal_writes:0}),{headers});
    return new Response(JSON.stringify({ok:true,derived:true,fiscal_writes:0}),{headers});
  }catch(e){return new Response(JSON.stringify({error:String(e)}),{status:500,headers});}
});
