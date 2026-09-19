import { strictDatabase } from '../_shared/strictDatabase.ts';
import { createClient } from "npm:@supabase/supabase-js@2";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
// Compatibility projection only. Concrete goods own physical output and value.
// Rated production_output is an input, never incoming trade or a wealth multiplier.
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{headers});
  try{
    const {session_id}=await req.json();if(!session_id)throw Error("session_id required");
    const sb=strictDatabase(createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!));
    const {data:session,error:se}=await sb.from("game_sessions").select("current_turn").eq("id",session_id).single();if(se)throw se;
    const {data:ledger,error:le}=await sb.from("economy_turn_ledgers").select("result").eq("session_id",session_id).eq("turn_number",session.current_turn).single();if(le)throw le;
    const {data:nodes,error:ne}=await sb.from("province_nodes").select("id,city_id").eq("session_id",session_id).order("id");if(ne)throw ne;
    const assigned=new Set<string>();
    for(const node of nodes||[]){
      const metric=(ledger.result.metrics||[]).find((m:any)=>m.city===node.city_id);
      const first=metric&&!assigned.has(node.city_id);if(first)assigned.add(node.city_id);
      const {error}=await sb.from("province_nodes").update({wealth_output:0,
        importance_score:first?metric.production_importance+metric.aggregation_importance+metric.transit_importance:0,
        incoming_production:0}).eq("id",node.id).eq("session_id",session_id);if(error)throw error;
    }
    return new Response(JSON.stringify({ok:true,nodes_computed:nodes?.length||0}),{headers});
  }catch(e){return new Response(JSON.stringify({error:String(e)}),{headers,status:500});}
});
