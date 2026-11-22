/**
 * Real neutral investments, executed AFTER a successful completed game turn.
 * No AI credits, no direct money/stock/parcel updates. All physical state and reserve
 * debits go through command-dispatch's existing validated service-authorized commands.
 * The planner only emits intentions; this executor executes at most two per closed turn.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTrustedInternalRequest } from "../_shared/internalActor.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const reply = (o: unknown, status=200) =>
  new Response(JSON.stringify(o),{status,headers:{...headers,"Content-Type":"application/json"}});

function number(v:unknown) { const n=Number(v);return Number.isFinite(n)?Math.max(0,n):0; }
function sufficient(realm:{gold_reserve:unknown;production_reserve:unknown},
  quote:{quote_gold:unknown;quote_production:unknown}) {
  return number(realm.gold_reserve)>=number(quote.quote_gold)+10
    && number(realm.production_reserve)>=number(quote.quote_production)+5;
}
interface NeutralPlan {
  session_id:string;turn_number:number;city_id:string;owner_player:string;
  action:string;template_id:string;parcel_id:string;requires_claim:boolean;
  quote_gold:number;quote_production:number;status:string;
  command_id_claim:string|null;command_id_build:string|null;
}
Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers});
  if(req.method!=="POST")return reply({ok:false,error:"POST required"},405);
  if(!isTrustedInternalRequest(req))return reply({ok:false,error:"service role required"},403);
  const {sessionId,closedTurn}=await req.json().catch(()=>({}));
  if(typeof sessionId!=="string"||!Number.isInteger(closedTurn)||closedTurn<1)
    return reply({ok:false,error:"sessionId and closedTurn required"},400);

  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data:session,error:sessionError}=await db.from("game_sessions")
    .select("current_turn,resolving_turn").eq("id",sessionId).maybeSingle();
  if(sessionError||!session)return reply({ok:false,error:"Session not found"},404);
  if(session.resolving_turn!==null||session.current_turn!==closedTurn+1)
    return reply({ok:false,error:"Neutral investments only after a closed turn"},409);

  const {data:plans,error:plansError}=await db.from("neutral_city_investment_plans").select("*")
    .eq("session_id",sessionId).eq("turn_number",closedTurn)
    .in("status",["ready","saving"]).order("city_id").limit(100);
  if(plansError) return reply({ok:false,error:plansError.message},500);
  const results:Array<{cityId:string;owner:string;status:string;reason?:string}>=[];
  let actions=0;
  // Fair round-robin: without turn rotation, the two alphabetically smallest IDs
  // consume every year's cap and all remaining neutral settlements starve forever.
  const ordered=[...(plans||[]) as NeutralPlan[]].sort((a,b)=>a.city_id.localeCompare(b.city_id));
  const shift=ordered.length?(closedTurn*2)%ordered.length:0;
  const rotating=[...ordered.slice(shift),...ordered.slice(0,shift)];
  // Every third turn reserve one of the two canonical command action slots for
  // actual territorial expansion. Buildings still receive at least one slot.
  const buildingLimit=closedTurn%3===0?1:2;
  for(const p of rotating) {
    if(actions>=buildingLimit)break;
    // Re-check owner, city, template and cash NOW. The plan quote is only informational;
    // command-dispatch makes the authoritative cost and permission decision.
    const [cityResult,realmResult,buildingResult,parcelResult] = await Promise.all([
      db.from("cities").select("id,name,owner_player,status,grid_x,grid_y").eq("id",p.city_id)
        .eq("session_id",sessionId).maybeSingle(),
      db.from("realm_resources").select("gold_reserve,production_reserve")
        .eq("session_id",sessionId).eq("player_name",p.owner_player).maybeSingle(),
      db.from("city_buildings").select("id,status,template_id")
        .eq("session_id",sessionId).eq("city_id",p.city_id).eq("template_id",p.template_id),
      db.from("tile_parcels").select("id,grid_x,grid_y,parcel_index,status,owner_player,city_id")
        .eq("id",p.parcel_id).eq("session_id",sessionId).maybeSingle(),
    ]);
    const city=cityResult.data,realm=realmResult.data,parcel=parcelResult.data;
    if(cityResult.error||realmResult.error||buildingResult.error||parcelResult.error){
      results.push({cityId:p.city_id,owner:p.owner_player,status:"read_failed"});continue;
    }
    if(!city||!city.owner_player.startsWith("Neutral:")||city.owner_player!==p.owner_player||
       city.status!=="ok"||!["build_well","build_structure"].includes(p.action)||!realm||!parcel) {
      results.push({cityId:p.city_id,owner:p.owner_player,status:"invalid_plan"});continue;
    }
    if((buildingResult.data||[]).some(b=>["building","completed"].includes(b.status))){
      await db.from("neutral_city_investment_plans").update({status:"completed",updated_at:new Date().toISOString()})
        .eq("session_id",sessionId).eq("turn_number",closedTurn).eq("city_id",p.city_id).eq("action",p.action);
      results.push({cityId:p.city_id,owner:p.owner_player,status:"already_built"});continue;
    }
    if(!sufficient(realm,p)){results.push({cityId:p.city_id,owner:p.owner_player,status:"saving"});continue;}

    // Compare-and-swap prevents duplicate execution if a retry/parallel worker sees the same plan.
    const {data:locked,error:lockError}=await db.from("neutral_city_investment_plans")
      .update({status:"executing",updated_at:new Date().toISOString()})
      .eq("session_id",sessionId).eq("turn_number",closedTurn).eq("city_id",p.city_id)
      .eq("action",p.action).in("status",["ready","saving"]).select("city_id");
    if(lockError||!locked?.length)continue;
    actions++;
    const actor={name:p.owner_player,type:"ai_faction"};
    let why="";
    try {
      if(parcel.status==="wild"){
        if(!p.requires_claim||parcel.city_id||parcel.owner_player) throw Error("Cannot claim foreign parcel");
        const {data,error}=await db.functions.invoke("command-dispatch",{body:{
          sessionId,turnNumber:closedTurn+1,actor,commandType:"CLAIM_TILE_PARCEL",
          commandPayload:{cityId:p.city_id,gridX:parcel.grid_x,gridY:parcel.grid_y,parcelIndex:parcel.parcel_index},
          commandId:p.command_id_claim,
        }});
        if(error||data?.ok!==true)throw Error("CLAIM_TILE_PARCEL: "+(error?.message||data?.error||"refused"));
      } else if(parcel.city_id!==p.city_id||parcel.owner_player!==p.owner_player){
        throw Error("Parcel no longer owned by plan city");
      }

      const {data,error}=await db.functions.invoke("command-dispatch",{body:{
        sessionId,turnNumber:closedTurn+1,actor,commandType:"BUILD_BUILDING",
        commandPayload:{cityId:p.city_id,cityName:city.name,templateId:p.template_id,parcelId:p.parcel_id},
        commandId:p.command_id_build,
      }});
      if(error||data?.ok!==true)throw Error("BUILD_BUILDING: "+(error?.message||data?.error||"refused"));
      await db.from("neutral_city_investment_plans")
        .update({status:"completed",updated_at:new Date().toISOString(),
          reason:{...((p as any).reason||{}),execution:"validated_command_dispatch",actual_gold_paid_via_command:true}})
        .eq("session_id",sessionId).eq("turn_number",closedTurn).eq("city_id",p.city_id).eq("action",p.action);
      results.push({cityId:p.city_id,owner:p.owner_player,status:"building_started"});
    } catch(e) {
      why=e instanceof Error?e.message:String(e);
      await db.from("neutral_city_investment_plans")
        .update({status:"refused",updated_at:new Date().toISOString(),
          reason:{...((p as any).reason||{}),execution_error:why,
            claim_may_remain_owned:true}})
        .eq("session_id",sessionId).eq("turn_number",closedTurn).eq("city_id",p.city_id).eq("action",p.action);
      results.push({cityId:p.city_id,owner:p.owner_player,status:"refused",reason:why});
    }
  }

  // Territorial growth uses exactly the same paid survey + macro-claim commands as the
  // human player, after the municipal investments and within the common 2-action cap.
  // No direct UPDATE of province_hexes and no inferred hidden ore rewards.
  if(actions<2) {
    const {data:expansions,error:expError}=await db.from("neutral_city_expansion_plans")
      .select("*").eq("session_id",sessionId).eq("turn_number",closedTurn)
.in("status",["ready","saving"]).order("city_id").limit(20);
    if(expError)results.push({cityId:"",owner:"",status:"expansion_read_failed",reason:expError.message});
    else {
    const available=[...(expansions||[])].sort((a,b)=>a.city_id.localeCompare(b.city_id));
    const offset=available.length?closedTurn%available.length:0;
    for(const e of [...available.slice(offset),...available.slice(0,offset)]) {
      if(actions>=2||closedTurn%3!==0)break;
      const [cityResult,realmResult,hexResult]=await Promise.all([
        db.from("cities").select("id,owner_player,status").eq("id",e.city_id)
          .eq("session_id",sessionId).maybeSingle(),
        db.from("realm_resources").select("gold_reserve").eq("session_id",sessionId)
          .eq("player_name",e.owner_player).maybeSingle(),
        db.from("province_hexes").select("owner_player,is_passable,biome_family,grid_x,grid_y")
          .eq("session_id",sessionId).eq("grid_x",e.grid_x).eq("grid_y",e.grid_y).maybeSingle(),
      ]);
      const city=cityResult.data,rr=realmResult.data,hex=hexResult.data;
      if(cityResult.error||realmResult.error||hexResult.error||!city||!rr||!hex||
          !city.owner_player.startsWith("Neutral:")||city.owner_player!==e.owner_player||
          city.status!=="ok"||hex.owner_player!==null||!hex.is_passable||
          /sea|ocean|lake|water/.test(hex.biome_family||""))continue;
      if(number(rr.gold_reserve)<number(e.quote_gold)+40)continue;
      const {data:locked,error:lockError}=await db.from("neutral_city_expansion_plans")
        .update({status:"executing"})
        .eq("session_id",sessionId).eq("turn_number",closedTurn).eq("city_id",e.city_id)
        .in("status",["ready","saving"]).select("city_id");
      if(lockError||!locked?.length)continue;
      actions++;
      try {
        const actor={name:e.owner_player,type:"ai_faction"};
        const {data:survey, error:surveyErr}=await db.functions.invoke("command-dispatch",{body:{
          sessionId,turnNumber:closedTurn+1,actor,commandType:"SURVEY_MACRO",
          commandPayload:{gridX:e.grid_x,gridY:e.grid_y,level:1},commandId:e.command_id_survey
        }});
        if(surveyErr||survey?.ok!==true)throw Error("SURVEY_MACRO: "+(surveyErr?.message||survey?.error||"refused"));
        const {data:claim,error:claimErr}=await db.functions.invoke("command-dispatch",{body:{
          sessionId,turnNumber:closedTurn+1,actor,commandType:"CLAIM_MACRO_TILE",
          commandPayload:{gridX:e.grid_x,gridY:e.grid_y},commandId:e.command_id_claim
        }});
        if(claimErr||claim?.ok!==true)throw Error("CLAIM_MACRO_TILE: "+(claimErr?.message||claim?.error||"refused"));
        await db.from("neutral_city_expansion_plans").update({status:"completed",
          reason:{...e.reason,execution:"paid_canonical_survey_then_macro_claim"}})
          .eq("session_id",sessionId).eq("turn_number",closedTurn).eq("city_id",e.city_id);
        results.push({cityId:e.city_id,owner:e.owner_player,status:"territory_claimed"});
      }catch(ex){
        const why=ex instanceof Error?ex.message:String(ex);
        await db.from("neutral_city_expansion_plans").update({status:"refused",
          reason:{...e.reason,execution_error:why,survey_may_be_paid:true}})
          .eq("session_id",sessionId).eq("turn_number",closedTurn).eq("city_id",e.city_id);
        results.push({cityId:e.city_id,owner:e.owner_player,status:"expansion_refused",reason:why});
      }
    }
    }
  }
  return reply({ok:true,closedTurn,attempted:actions,results,fiscalWriter:"command-dispatch",modelCalls:0});
});
